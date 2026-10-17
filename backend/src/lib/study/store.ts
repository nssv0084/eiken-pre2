import { BatchGetCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { AnswerContext, Grade, Item, QuestionType } from "../../../../shared/types";
import { ddb, keys, TABLE_NAME } from "../db";
import { DELIVERABLE_STATUSES, listItems } from "../items";
import type { QuestionState } from "./srs";

const qsKey = (sub: string, questionId: string) => ({ pk: `USER#${sub}`, sk: `QS#${questionId}` });

async function queryAll(input: ConstructorParameters<typeof QueryCommand>[0]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({ ...input, ExclusiveStartKey: startKey }));
    out.push(...(res.Items ?? []));
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return out;
}

export async function loadQuestionStates(sub: string): Promise<Map<string, QuestionState>> {
  const rows = await queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :qs)",
    ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":qs": "QS#" },
  });
  return new Map(rows.map((r) => [r.questionId as string, r as unknown as QuestionState]));
}

export async function getQuestionState(sub: string, questionId: string): Promise<QuestionState | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: qsKey(sub, questionId) }));
  return res.Item as QuestionState | undefined;
}

// 復習の予定がある間だけ GSI に載せ、日付で引けるようにする
export async function putQuestionState(sub: string, state: QuestionState): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...qsKey(sub, state.questionId),
        ...state,
        ...(state.nextReviewDate ? { gsi1pk: `REVIEW#${sub}`, gsi1sk: state.nextReviewDate } : {}),
      },
    }),
  );
}

export async function dueReviews(sub: string, today: string): Promise<QuestionState[]> {
  const rows = await queryAll({
    TableName: TABLE_NAME,
    IndexName: "gsi1",
    KeyConditionExpression: "gsi1pk = :pk AND gsi1sk <= :today",
    ExpressionAttributeValues: { ":pk": `REVIEW#${sub}`, ":today": today },
  });
  return rows as unknown as QuestionState[];
}

export async function countReviewQueue(sub: string): Promise<number> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": `REVIEW#${sub}` },
      Select: "COUNT",
    }),
  );
  return res.Count ?? 0;
}

export async function putAnswerLog(
  sub: string,
  log: { questionId: string; itemId: string; type: QuestionType; chosenIndex: number; correct: boolean; context: AnswerContext; cycle: number; day: number; now: string },
): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { pk: `USER#${sub}`, sk: `ANS#${log.now}#${log.questionId}`, ...log },
    }),
  );
}

// 日別・周回別・累計の集計を加算する。日別の解答数（加算後）を返す
export async function addAnswerStats(
  sub: string,
  p: { date: string; cycle: number; type: QuestionType; correct: boolean; now: string },
): Promise<number> {
  const c = p.correct ? 1 : 0;
  const day = await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${sub}`, sk: `DAY#${p.date}` },
      UpdateExpression: "ADD #total :one, #correct :c, #tt :one, #tc :c SET #date = :date",
      ExpressionAttributeNames: {
        "#total": "total",
        "#correct": "correct",
        "#tt": `${p.type}_total`,
        "#tc": `${p.type}_correct`,
        "#date": "date",
      },
      ExpressionAttributeValues: { ":one": 1, ":c": c, ":date": p.date },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${sub}`, sk: `CYCLE#${String(p.cycle).padStart(3, "0")}` },
      UpdateExpression: "ADD #tt :one, #tc :c SET #cycle = :cycle",
      ExpressionAttributeNames: { "#tt": `${p.type}_total`, "#tc": `${p.type}_correct`, "#cycle": "cycle" },
      ExpressionAttributeValues: { ":one": 1, ":c": c, ":cycle": p.cycle },
    }),
  );
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: keys.userProfile(sub),
      UpdateExpression: "ADD stats.#t.#total :one, stats.#t.#correct :c SET lastStudiedAt = :now",
      ExpressionAttributeNames: { "#t": p.type, "#total": "total", "#correct": "correct" },
      ExpressionAttributeValues: { ":one": 1, ":c": c, ":now": p.now },
    }),
  );
  return (day.Attributes?.total as number | undefined) ?? 1;
}

export async function listDailyStats(sub: string, fromDate: string): Promise<Record<string, unknown>[]> {
  return queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND sk BETWEEN :from AND :to",
    ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":from": `DAY#${fromDate}`, ":to": "DAY#9999" },
  });
}

export async function listCycleStats(sub: string): Promise<Record<string, unknown>[]> {
  return queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :c)",
    ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":c": "CYCLE#" },
  });
}

export async function listDeliverableItems(grade: Grade, type: QuestionType): Promise<Item[]> {
  const lists = await Promise.all(DELIVERABLE_STATUSES.map((s) => listItems(grade, type, s, 1000)));
  return lists.flat();
}

export async function batchGetItems(ids: string[]): Promise<Map<string, Item>> {
  const out = new Map<string, Item>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    let request: Record<string, { Keys: Record<string, string>[] }> | undefined = {
      [TABLE_NAME]: { Keys: unique.slice(i, i + 100).map((id) => keys.item(id)) },
    };
    while (request && Object.keys(request).length > 0) {
      const res = await ddb.send(new BatchGetCommand({ RequestItems: request }));
      for (const row of res.Responses?.[TABLE_NAME] ?? []) {
        const { pk: _pk, sk: _sk, gsi1pk: _g1, gsi1sk: _g2, ...item } = row;
        out.set(item.id as string, item as Item);
      }
      request = res.UnprocessedKeys as typeof request;
    }
  }
  return out;
}
