import { BatchGetCommand, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Assignment, AssignmentProgress } from "../../../shared/types";
import { ddb, TABLE_NAME } from "./db";

const assignKey = (id: string) => ({ pk: `ASSIGN#${id}`, sk: "META" });
const progressKey = (sub: string, id: string) => ({ pk: `USER#${sub}`, sk: `ASSIGN#${id}` });

interface ProgressRecord {
  answered?: Record<string, boolean>;
  completedAt?: string;
}

export async function createAssignment(a: Assignment): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: { ...assignKey(a.id), gsi1pk: "ASSIGNS", gsi1sk: a.createdAt, ...a } }));
}

export async function getAssignment(id: string): Promise<Assignment | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: assignKey(id) }));
  if (!res.Item) return undefined;
  const { pk: _pk, sk: _sk, gsi1pk: _g1, gsi1sk: _g2, ...a } = res.Item;
  return a as Assignment;
}

export async function listAssignments(): Promise<Assignment[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": "ASSIGNS" },
      ScanIndexForward: false,
      Limit: 100,
    }),
  );
  return (res.Items ?? []).map(({ pk: _pk, sk: _sk, gsi1pk: _g1, gsi1sk: _g2, ...a }) => a as Assignment);
}

export async function deleteAssignment(a: Assignment): Promise<void> {
  await Promise.all(a.targets.map((sub) => ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: progressKey(sub, a.id) }))));
  await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: assignKey(a.id) }));
}

export async function getAnswered(sub: string, id: string): Promise<Record<string, boolean>> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: progressKey(sub, id) }));
  return ((res.Item as ProgressRecord | undefined)?.answered ?? {}) as Record<string, boolean>;
}

export function summarizeProgress(sub: string, record: ProgressRecord | undefined): AssignmentProgress {
  const answered = Object.values(record?.answered ?? {});
  return { sub, answered: answered.length, correct: answered.filter(Boolean).length, completedAt: record?.completedAt };
}

// 複数の生徒・課題の進み具合をまとめて読む
export async function getProgresses(pairs: { sub: string; id: string }[]): Promise<Map<string, ProgressRecord>> {
  const out = new Map<string, ProgressRecord>();
  for (let i = 0; i < pairs.length; i += 100) {
    let request: Record<string, { Keys: Record<string, string>[] }> | undefined = {
      [TABLE_NAME]: { Keys: pairs.slice(i, i + 100).map((p) => progressKey(p.sub, p.id)) },
    };
    while (request && Object.keys(request).length > 0) {
      const res = await ddb.send(new BatchGetCommand({ RequestItems: request }));
      for (const row of res.Responses?.[TABLE_NAME] ?? []) {
        out.set(`${(row.pk as string).slice(5)}|${(row.sk as string).slice(7)}`, row as ProgressRecord);
      }
      request = res.UnprocessedKeys as typeof request;
    }
  }
  return out;
}

// 解答を記録し、すべて解き終えたら完了日時を付ける。完了したら true
export async function recordAssignmentAnswer(sub: string, a: Assignment, questionId: string, correct: boolean): Promise<boolean> {
  // answered のマップがないと入れ子の SET ができないため、先に作る
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: progressKey(sub, a.id),
      UpdateExpression: "SET answered = if_not_exists(answered, :empty)",
      ExpressionAttributeValues: { ":empty": {} },
    }),
  );
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: progressKey(sub, a.id),
      UpdateExpression: "SET answered.#q = if_not_exists(answered.#q, :c)",
      ExpressionAttributeNames: { "#q": questionId },
      ExpressionAttributeValues: { ":c": correct },
      ReturnValues: "ALL_NEW",
    }),
  );
  const record = res.Attributes as ProgressRecord;
  if (record.completedAt || Object.keys(record.answered ?? {}).length < a.questionCount) return false;
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: progressKey(sub, a.id),
      UpdateExpression: "SET completedAt = :now",
      ExpressionAttributeValues: { ":now": new Date().toISOString() },
    }),
  );
  return true;
}
