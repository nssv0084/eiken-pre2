import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Grade, Item, ItemStatus, QuestionType } from "../../../shared/types";
import { ddb, keys, TABLE_NAME } from "./db";

export const ITEM_STATUSES: readonly ItemStatus[] = ["pending", "approved", "review", "reported", "disabled"];
// 生徒に出題する状態（review は出題しつつ講師の確認待ちにも出す）
export const DELIVERABLE_STATUSES: readonly ItemStatus[] = ["approved", "review"];

const itemsIndexKey = (grade: Grade, type: QuestionType, status: ItemStatus) => `ITEMS#${grade}#${type}#${status}`;

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
  return (res.Items ?? []) as Item[];
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

// 生成時に重複を避けるため、出題対象の既存問題を新しい順に集める
export async function recentDeliverableItems(grade: Grade, type: QuestionType, limit: number): Promise<Item[]> {
  const lists = await Promise.all(DELIVERABLE_STATUSES.map((s) => listItems(grade, type, s, limit)));
  return lists
    .flat()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
