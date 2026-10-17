import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Item, ItemReport } from "../../../../shared/types";
import { ddb, TABLE_NAME } from "../db";
import { putItem } from "../items";

// 正答率による見直し（仮の値。生徒数が少ないうちは誤差が大きいので、解答数が一定以上になってから判定する）
export const USAGE_MIN_ATTEMPTS = 8;
export const USAGE_TOO_EASY_RATE = 0.95;
export const USAGE_TOO_HARD_RATE = 0.3;

export function usageFlag(attempts: number, correct: number): string | null {
  if (attempts < USAGE_MIN_ATTEMPTS) return null;
  const rate = correct / attempts;
  const pct = Math.round(rate * 100);
  if (rate >= USAGE_TOO_EASY_RATE) return `正答率 ${pct}%（${attempts}回）: 易しすぎる可能性`;
  if (rate < USAGE_TOO_HARD_RATE) return `正答率 ${pct}%（${attempts}回）: 難しすぎる、または問題に誤りがある可能性`;
  return null;
}

// 復習以外の解答で問題ごとの正答率を集計し、極端なら一度だけ講師の確認待ちに回す
export async function recordItemUsage(item: Item, correct: boolean): Promise<void> {
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `ITEM#${item.id}`, sk: "STATS" },
      UpdateExpression: "ADD attempts :one, correct :c",
      ExpressionAttributeValues: { ":one": 1, ":c": correct ? 1 : 0 },
      ReturnValues: "ALL_NEW",
    }),
  );
  const stats = res.Attributes ?? {};
  const note = usageFlag(stats.attempts as number, stats.correct as number);
  if (!note || stats.flaggedAt || item.status !== "approved") return;

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `ITEM#${item.id}`, sk: "STATS" },
      UpdateExpression: "SET flaggedAt = :now",
      ExpressionAttributeValues: { ":now": new Date().toISOString() },
    }),
  );
  await putItem({ ...item, status: "review", usageNote: note, updatedAt: new Date().toISOString() });
}

// 生徒からの報告。講師が確認するまで出題を止める
export async function addReport(item: Item, report: ItemReport): Promise<void> {
  await putItem({
    ...item,
    status: item.status === "disabled" ? "disabled" : "reported",
    reports: [...(item.reports ?? []), report],
    updatedAt: report.at,
  });
}
