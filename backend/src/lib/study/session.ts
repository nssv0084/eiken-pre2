import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDayPlan } from "../../../../shared/curriculum";
import {
  QUESTION_TYPE_LABELS,
  type Item,
  type PassageGenre,
  type PublicItem,
  type QuestionType,
  type SessionView,
  type StudyEntry,
  type StudySet,
  type UserProfile,
} from "../../../../shared/types";
import { ddb, TABLE_NAME } from "../db";
import { poolForSlot } from "./pool";
import { selectItems } from "./select";
import { batchGetItems, dueReviews, listDeliverableItems, loadQuestionStates } from "./store";

const GENRE_SUFFIX: Partial<Record<PassageGenre, string>> = { email: "（Eメール）", explanation: "（説明文）", dialogue: "（長い会話）" };

export interface SessionRecord {
  cycle: number;
  day: number;
  date: string;
  sets: StudySet[];
  answered: Record<string, boolean>;
  shortage: boolean;
  createdAt: string;
}

const sessionKey = (sub: string, cycle: number, day: number) => ({
  pk: `USER#${sub}`,
  sk: `SESSION#${String(cycle).padStart(3, "0")}#${String(day).padStart(2, "0")}`,
});

export function toPublicItem(item: Item): PublicItem {
  return {
    id: item.id,
    type: item.type,
    genre: item.genre,
    title: item.title,
    passage: item.passage,
    questions: item.questions.map(({ id, stem, choices }) => ({ id, stem, choices })),
  };
}

export const sessionQuestionIds = (sets: StudySet[]) => sets.flatMap((s) => s.entries.flatMap((e) => e.questionIds));

export async function getSession(sub: string, cycle: number, day: number): Promise<SessionRecord | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: sessionKey(sub, cycle, day) }));
  return res.Item as SessionRecord | undefined;
}

export async function createSession(profile: UserProfile, today: string): Promise<SessionRecord> {
  const { cycle, day } = profile.progress;
  const plan = getDayPlan(profile.grade, day);
  const states = await loadQuestionStates(profile.sub);
  const used = new Set<string>();
  const sets: StudySet[] = [];
  let shortage = false;
  const pools = new Map<QuestionType, Item[]>();

  for (const slot of plan.slots) {
    if (!pools.has(slot.type)) pools.set(slot.type, await listDeliverableItems(profile.grade, slot.type));
    const pool = poolForSlot(pools.get(slot.type)!, slot);
    const chosen = selectItems({ items: pool, states, cycle, count: slot.count, exclude: used });
    if (chosen.length < slot.count) shortage = true;
    if (chosen.length === 0) continue;
    chosen.forEach((i) => used.add(i.id));
    const label = QUESTION_TYPE_LABELS[slot.type] + (slot.genre ? (GENRE_SUFFIX[slot.genre] ?? "") : "");
    sets.push({
      kind: slot.type,
      label,
      entries: chosen.map((i) => ({ itemId: i.id, questionIds: i.questions.map((q) => q.id) })),
    });
  }

  if (plan.reviewMax > 0) {
    const due = (await dueReviews(profile.sub, today))
      .filter((s) => !used.has(s.itemId))
      .sort((a, b) => (a.nextReviewDate ?? "").localeCompare(b.nextReviewDate ?? ""))
      .slice(0, plan.reviewMax);
    if (due.length > 0) {
      const byItem = new Map<string, string[]>();
      for (const s of due) byItem.set(s.itemId, [...(byItem.get(s.itemId) ?? []), s.questionId]);
      const entries: StudyEntry[] = [...byItem].map(([itemId, questionIds]) => ({ itemId, questionIds }));
      sets.push({ kind: "review", label: "復習（前に間違えた問題）", entries });
    }
  }

  const record: SessionRecord = { cycle, day, date: today, sets, answered: {}, shortage, createdAt: new Date().toISOString() };
  // 同時に開いた場合でも先に作ったほうを使う
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...sessionKey(profile.sub, cycle, day), ...record },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return record;
  } catch (e) {
    if ((e as Error).name !== "ConditionalCheckFailedException") throw e;
    return (await getSession(profile.sub, cycle, day))!;
  }
}

export async function recordSessionAnswer(sub: string, cycle: number, day: number, questionId: string, correct: boolean) {
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: sessionKey(sub, cycle, day),
      UpdateExpression: "SET answered.#q = if_not_exists(answered.#q, :c)",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeNames: { "#q": questionId },
      ExpressionAttributeValues: { ":c": correct },
      ReturnValues: "ALL_NEW",
    }),
  );
  return res.Attributes as SessionRecord;
}

export async function toSessionView(profile: UserProfile, record: SessionRecord): Promise<SessionView> {
  const plan = getDayPlan(profile.grade, record.day);
  const items = await batchGetItems(record.sets.flatMap((s) => s.entries.map((e) => e.itemId)));
  return {
    cycle: record.cycle,
    day: record.day,
    phase: plan.phase,
    isMock: plan.isMock,
    sets: record.sets
      .map((s) => ({ ...s, entries: s.entries.filter((e) => items.has(e.itemId)) }))
      .filter((s) => s.entries.length > 0),
    items: Object.fromEntries([...items].map(([id, item]) => [id, toPublicItem(item)])),
    answered: record.answered,
    shortage: record.shortage,
  };
}
