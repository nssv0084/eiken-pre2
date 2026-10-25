import { completedDays, delayDays, projectProgress, type Projection } from "../../../../shared/curriculum";
import { addDays, daysBetween } from "../../../../shared/dates";
import {
  QUESTION_TYPES,
  type CurriculumProgress,
  type DailyStat,
  type QuestionType,
  type Settings,
  type TypeStat,
  type UserProfile,
} from "../../../../shared/types";
import { batchGetItems, countReviewQueue, listCycleStats, listDailyStats, loadQuestionStates } from "./store";
import { currentStreak } from "./streak";

const emptyTypeStats = () =>
  Object.fromEntries(QUESTION_TYPES.map((t) => [t, { total: 0, correct: 0 }])) as Record<QuestionType, TypeStat>;

const toTypeStats = (row: Record<string, unknown>) => {
  const stats = emptyTypeStats();
  for (const t of QUESTION_TYPES) {
    stats[t] = { total: (row[`${t}_total`] as number) ?? 0, correct: (row[`${t}_correct`] as number) ?? 0 };
  }
  return stats;
};

export interface StudyStats {
  stats: Record<QuestionType, TypeStat>;
  cycles: { cycle: number; stats: Record<QuestionType, TypeStat> }[];
  daily: DailyStat[];
  reviewQueue: number;
  streak: number;
  progress: CurriculumProgress;
}

export async function statsForProfile(profile: UserProfile, today: string): Promise<StudyStats> {
  const from = addDays(today, -29);
  const [days, cycles, reviewQueue] = await Promise.all([
    listDailyStats(profile.sub, from),
    listCycleStats(profile.sub),
    countReviewQueue(profile.sub),
  ]);
  const byDate = new Map(days.map((d) => [d.date as string, d]));
  const daily: DailyStat[] = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(from, i);
    const d = byDate.get(date);
    return { date, total: (d?.total as number) ?? 0, correct: (d?.correct as number) ?? 0 };
  });
  return {
    stats: profile.stats,
    cycles: cycles.map((c) => ({ cycle: c.cycle as number, stats: toTypeStats(c) })),
    daily,
    reviewQueue,
    streak: currentStreak(profile.streak, today),
    progress: profile.progress,
  };
}

export interface StudentSummary {
  sub: string;
  username: string;
  nickname: string;
  progress: CurriculumProgress;
  completedDays: number;
  delayDays: number;
  lastStudiedDate?: string;
  inactiveDays?: number;
  streak: number;
  total: number;
  correct: number;
  examDate?: string;
  daysToExam?: number;
  projection?: Projection;
  pushEnabled: boolean;
  alerts: string[];
}

// 最後に学習した日（午前3時区切りの学習日）。lastStudiedAt は ISO 日時
const studyDateOf = (iso: string) => new Date(Date.parse(iso) + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function summarizeStudent(profile: UserProfile, settings: Settings, today: string): StudentSummary {
  const total = QUESTION_TYPES.reduce((n, t) => n + (profile.stats[t]?.total ?? 0), 0);
  const correct = QUESTION_TYPES.reduce((n, t) => n + (profile.stats[t]?.correct ?? 0), 0);
  const lastStudiedDate = profile.lastStudiedAt ? studyDateOf(profile.lastStudiedAt) : undefined;
  const inactiveDays = daysBetween(lastStudiedDate ?? profile.startDate, today);
  const projection = profile.examDate ? projectProgress(profile.progress, profile.startDate, today, profile.examDate) : undefined;

  const alerts: string[] = [];
  if (inactiveDays >= settings.inactiveAlertDays) {
    alerts.push(lastStudiedDate ? `${inactiveDays}日 学習していません` : "まだ一度も学習していません");
  }
  if (projection && !projection.reachesTwoCycles) alerts.push("受験日までに2周に届かない見込み");

  return {
    sub: profile.sub,
    username: profile.username,
    nickname: profile.nickname,
    progress: profile.progress,
    completedDays: completedDays(profile.progress),
    delayDays: delayDays(profile.progress, profile.startDate, today),
    lastStudiedDate,
    inactiveDays,
    streak: currentStreak(profile.streak, today),
    total,
    correct,
    examDate: profile.examDate,
    daysToExam: profile.examDate ? daysBetween(today, profile.examDate) : undefined,
    projection,
    pushEnabled: (profile.pushSubscriptions?.length ?? 0) > 0,
    alerts,
  };
}

export interface WeakQuestion {
  questionId: string;
  type: QuestionType;
  stem: string;
  answer: string;
  attempts: number;
  correctCount: number;
  inReview: boolean;
}

// 間違えたことのある設問を、間違えた回数の多い順に返す
export async function weakQuestions(sub: string, limit = 20): Promise<WeakQuestion[]> {
  const states = [...(await loadQuestionStates(sub)).values()]
    .filter((s) => s.wrongCycles.length > 0)
    .sort((a, b) => b.attempts - b.correctCount - (a.attempts - a.correctCount) || b.lastAnsweredAt.localeCompare(a.lastAnsweredAt))
    .slice(0, limit);
  const items = await batchGetItems(states.map((s) => s.itemId));
  return states.flatMap((s) => {
    const q = items.get(s.itemId)?.questions.find((x) => x.id === s.questionId);
    if (!q) return [];
    return [
      {
        questionId: s.questionId,
        type: s.type,
        stem: q.stem,
        answer: q.choices[q.answerIndex],
        attempts: s.attempts,
        correctCount: s.correctCount,
        inReview: s.nextReviewDate !== undefined,
      },
    ];
  });
}
