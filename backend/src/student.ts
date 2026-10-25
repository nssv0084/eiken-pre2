import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { z } from "zod";
import { completedDays, delayDays, getDayPlan, nextProgress, projectProgress } from "../../shared/curriculum";
import { addDays, studyDate } from "../../shared/dates";
import {
  getAnswered,
  getAssignment,
  getProgresses,
  listAssignments,
  recordAssignmentAnswer,
  summarizeProgress,
} from "./lib/assignments";
import { isPassageType, QUESTION_TYPES, REPORT_REASONS, type AnswerResult, type UserProfile } from "../../shared/types";
import type { Caller } from "./lib/auth";
import { HttpError, parseBody } from "./lib/http";
import { getItem } from "./lib/items";
import { getOrCreateProfile, updateProfile } from "./lib/profiles";
import { addReport, recordItemUsage } from "./lib/study/feedback";
import { selectItems } from "./lib/study/select";
import { createSession, getSession, recordSessionAnswer, sessionQuestionIds, toPublicItem, toSessionView } from "./lib/study/session";
import { nextQuestionState } from "./lib/study/srs";
import {
  addAnswerStats,
  batchGetItems,
  countReviewQueue,
  getQuestionState,
  listDeliverableItems,
  loadQuestionStates,
  putAnswerLog,
  putQuestionState,
} from "./lib/study/store";
import { currentStreak, markStudied, STUDIED_DAY_MIN_ANSWERS } from "./lib/study/streak";
import { statsForProfile } from "./lib/study/summary";

export async function getMe(caller: Caller) {
  const { pushSubscriptions: _push, ...profile } = await getOrCreateProfile(caller);
  const today = studyDate();
  return {
    profile,
    today: getDayPlan(profile.grade, profile.progress.day),
    todayDate: today,
    completedToday: profile.progress.lastCompletedDate === today,
    completedDays: completedDays(profile.progress),
    streak: currentStreak(profile.streak, today),
    delayDays: delayDays(profile.progress, profile.startDate, today),
    projection: profile.examDate ? projectProgress(profile.progress, profile.startDate, today, profile.examDate) : undefined,
    reviewQueue: await countReviewQueue(profile.sub),
  };
}

export async function getTodaySession(caller: Caller) {
  const profile = await getOrCreateProfile(caller);
  const today = studyDate();
  if (profile.progress.lastCompletedDate === today) return { completedToday: true };
  const { cycle, day } = profile.progress;
  const record = (await getSession(profile.sub, cycle, day)) ?? (await createSession(profile, today));
  return { completedToday: false, session: await toSessionView(profile, record) };
}

const AnswerRequest = z.object({
  questionId: z.string().min(1),
  chosenIndex: z.number().int().min(0).max(3),
  context: z.enum(["curriculum", "review", "free", "assignment"]),
  assignmentId: z.string().optional(),
});

export async function getMyAssignments(caller: Caller) {
  const today = studyDate();
  const mine = (await listAssignments()).filter((a) => a.targets.includes(caller.sub));
  const progress = await getProgresses(mine.map((a) => ({ sub: caller.sub, id: a.id })));
  return {
    assignments: mine
      .map((a) => {
        const p = summarizeProgress(caller.sub, progress.get(`${caller.sub}|${a.id}`));
        return { id: a.id, title: a.title, type: a.type, dueDate: a.dueDate, questionCount: a.questionCount, ...p };
      })
      // 終わっていない課題と、完了してから1週間以内の課題を表示する
      .filter((a) => !a.completedAt || a.completedAt.slice(0, 10) >= addDays(today, -7))
      .sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || a.dueDate.localeCompare(b.dueDate)),
  };
}

async function requireMyAssignment(caller: Caller, id: string) {
  const a = await getAssignment(id);
  if (!a || !a.targets.includes(caller.sub)) throw new HttpError(404, "課題が見つかりません");
  return a;
}

export async function getMyAssignment(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const a = await requireMyAssignment(caller, event.pathParameters?.id ?? "");
  const [items, answered] = await Promise.all([batchGetItems(a.entries.map((e) => e.itemId)), getAnswered(caller.sub, a.id)]);
  return {
    assignment: { id: a.id, title: a.title, type: a.type, dueDate: a.dueDate, entries: a.entries },
    items: Object.fromEntries([...items].map(([id, item]) => [id, toPublicItem(item)])),
    answered,
  };
}

export async function submitAnswer(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<AnswerResult> {
  const parsed = AnswerRequest.safeParse(parseBody(event.body, event.isBase64Encoded));
  if (!parsed.success) throw new HttpError(400, "入力が正しくありません");
  const { questionId, chosenIndex, context, assignmentId } = parsed.data;
  const assignment = context === "assignment" ? await requireMyAssignment(caller, assignmentId ?? "") : undefined;
  if (assignment && !assignment.entries.some((e) => e.questionIds.includes(questionId))) {
    throw new HttpError(400, "この課題の問題ではありません");
  }

  const item = await getItem(questionId.split(":")[0]);
  const question = item?.questions.find((q) => q.id === questionId);
  if (!item || !question) throw new HttpError(404, "問題が見つかりません");

  const profile = await getOrCreateProfile(caller);
  const now = new Date().toISOString();
  const today = studyDate();
  const { cycle, day } = profile.progress;
  const correct = chosenIndex === question.answerIndex;

  const prev = await getQuestionState(profile.sub, questionId);
  await putQuestionState(
    profile.sub,
    nextQuestionState(prev, { questionId, itemId: item.id, type: item.type, correct, today, cycle, now }),
  );
  await putAnswerLog(profile.sub, { questionId, itemId: item.id, type: item.type, chosenIndex, correct, context, cycle, day, now });
  const answersToday = await addAnswerStats(profile.sub, { date: today, cycle, type: item.type, correct, now });
  // 復習は間違えた問題ばかりなので、問題ごとの正答率の集計には入れない
  if (context !== "review") await recordItemUsage(item, correct);

  if (assignment) await recordAssignmentAnswer(profile.sub, assignment, questionId, correct);

  let dayCompleted = false;
  if ((context === "curriculum" || context === "review") && profile.progress.lastCompletedDate !== today) {
    dayCompleted = await recordCurriculumAnswer(profile, questionId, correct, today);
  }
  if (!dayCompleted && answersToday >= STUDIED_DAY_MIN_ANSWERS) {
    const streak = markStudied(profile.streak, today);
    if (streak !== profile.streak) await updateProfile(profile.sub, { streak });
  }

  return { correct, answerIndex: question.answerIndex, explanation: question.explanation, dayCompleted };
}

// 今日のセットの解答を記録し、すべて解き終えたら次の日へ進める
async function recordCurriculumAnswer(profile: UserProfile, questionId: string, correct: boolean, today: string) {
  const { cycle, day } = profile.progress;
  const session = await getSession(profile.sub, cycle, day);
  if (!session) return false;
  const required = sessionQuestionIds(session.sets);
  if (!required.includes(questionId)) return false;

  const updated = await recordSessionAnswer(profile.sub, cycle, day, questionId, correct);
  if (!required.every((id) => id in updated.answered)) return false;

  await updateProfile(profile.sub, {
    progress: { ...nextProgress(profile.progress), lastCompletedDate: today },
    streak: markStudied(profile.streak, today),
  });
  return true;
}

const PracticeQuery = z.object({
  type: z.enum(QUESTION_TYPES),
  count: z.coerce.number().int().min(1).max(20),
});

export async function getPractice(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const parsed = PracticeQuery.safeParse(event.queryStringParameters ?? {});
  if (!parsed.success) throw new HttpError(400, "形式と問題数を指定してください");
  const { type, count } = parsed.data;
  const profile = await getOrCreateProfile(caller);
  const [pool, states] = await Promise.all([listDeliverableItems(profile.grade, type), loadQuestionStates(profile.sub)]);
  // 長文は count を題数として扱う（1題に設問が2〜4問あるため）
  const itemCount = isPassageType(type) ? Math.min(count, 3) : count;
  const chosen = selectItems({ items: pool, states, cycle: profile.progress.cycle, count: itemCount });
  return {
    entries: chosen.map((i) => ({ itemId: i.id, questionIds: i.questions.map((q) => q.id) })),
    items: Object.fromEntries(chosen.map((i) => [i.id, toPublicItem(i)])),
  };
}

const ReportRequest = z.object({
  questionId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  comment: z.string().trim().max(300).optional(),
});

export async function submitReport(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const parsed = ReportRequest.safeParse(parseBody(event.body, event.isBase64Encoded));
  if (!parsed.success) throw new HttpError(400, "入力が正しくありません");
  const { questionId, reason, comment } = parsed.data;
  const item = await getItem(questionId.split(":")[0]);
  if (!item) throw new HttpError(404, "問題が見つかりません");
  await addReport(item, { by: caller.username, reason, comment: comment || undefined, questionId, at: new Date().toISOString() });
  return { ok: true };
}

export async function getMyStats(caller: Caller) {
  const profile = await getOrCreateProfile(caller);
  return statsForProfile(profile, studyDate());
}
