import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Grade, Item, ItemStatus, PassageGenre, QuestionType } from "../../../shared/types";
import { ddb, keys, TABLE_NAME } from "./db";

export const ITEM_STATUSES: readonly ItemStatus[] = ["pending", "approved", "review", "reported", "disabled"];
// 生徒に出題する状態（review は出題しつつ講師の確認待ちにも出す）
export const DELIVERABLE_STATUSES: readonly ItemStatus[] = ["approved", "review"];

// 講師がこの数を承認するまでは、AI 検証に合格した問題をすべて講師の確認待ちに回す（難しさの基準合わせ）
export const CALIBRATION_TARGET: Record<QuestionType, number> = { vocab: 30, conversation: 10, cloze: 5, reading: 5 };

const itemsIndexKey = (grade: Grade, type: QuestionType, status: ItemStatus) => `ITEMS#${grade}#${type}#${status}`;
const approvedCounterKey = (grade: Grade, type: QuestionType) => ({ pk: "STATS", sk: `TEACHER_APPROVED#${grade}#${type}` });
const exemplarKey = (grade: Grade, type: QuestionType, itemId: string) => ({ pk: `EXEMPLAR#${grade}#${type}`, sk: itemId });

export async function getItem(id: string): Promise<Item | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: keys.item(id) }));
  if (!res.Item) return undefined;
  const { pk: _pk, sk: _sk, gsi1pk: _g1, gsi1sk: _g2, ...item } = res.Item;
  return item as Item;
}

export async function getTeacherApprovedCount(grade: Grade, type: QuestionType): Promise<number> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: approvedCounterKey(grade, type) }));
  return (res.Item?.count as number | undefined) ?? 0;
}

export async function incrementTeacherApproved(grade: Grade, type: QuestionType): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: approvedCounterKey(grade, type),
      UpdateExpression: "ADD #c :one",
      ExpressionAttributeNames: { "#c": "count" },
      ExpressionAttributeValues: { ":one": 1 },
    }),
  );
}

export async function setExemplar(item: Item, on: boolean): Promise<void> {
  const key = exemplarKey(item.grade, item.type, item.id);
  if (on) {
    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: { ...key, item } }));
  } else {
    await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: key }));
  }
}

export async function listExemplars(grade: Grade, type: QuestionType): Promise<Item[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `EXEMPLAR#${grade}#${type}` },
    }),
  );
  return (res.Items ?? []).map((r) => r.item as Item);
}

export async function putItem(item: Item): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...keys.item(item.id),
        gsi1pk: itemsIndexKey(item.grade, item.type, item.status),
        gsi1sk: item.createdAt,
        ...item,
      },
    }),
  );
}

export async function listItems(
  grade: Grade,
  type: QuestionType,
  status: ItemStatus,
  limit = 100,
): Promise<Item[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": itemsIndexKey(grade, type, status) },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []).map(({ pk: _pk, sk: _sk, gsi1pk: _g1, gsi1sk: _g2, ...item }) => item as Item);
}

export async function countItems(grade: Grade, type: QuestionType, status: ItemStatus): Promise<number> {
  let count = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": itemsIndexKey(grade, type, status) },
        Select: "COUNT",
        ExclusiveStartKey: startKey,
      }),
    );
    count += res.Count ?? 0;
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return count;
}

// 会話文の長い会話のように、同じ形式の中でジャンルを絞って数える
export async function countItemsWithGenre(grade: Grade, type: QuestionType, status: ItemStatus, genre: PassageGenre): Promise<number> {
  let count = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        FilterExpression: "genre = :genre",
        ExpressionAttributeValues: { ":pk": itemsIndexKey(grade, type, status), ":genre": genre },
        Select: "COUNT",
        ExclusiveStartKey: startKey,
      }),
    );
    count += res.Count ?? 0;
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return count;
}

// 生成時に重複を避けるため、既存問題（無効にしたものも含む）を新しい順に集める
export async function recentItemsForDedup(grade: Grade, type: QuestionType, limit: number): Promise<Item[]> {
  const statuses: ItemStatus[] = ["approved", "review", "reported", "disabled"];
  const lists = await Promise.all(statuses.map((s) => listItems(grade, type, s, limit)));
  return lists
    .flat()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
