import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Settings, UsageSummary } from "../../../shared/types";
import { ddb, keys, TABLE_NAME } from "./db";
import { costUsd, type TokenUsage } from "./pricing";

// 予算のこの割合に達したら生成を止める
export const BUDGET_STOP_RATIO = 0.9;

// 金額は浮動小数の誤差を避けるため、マイクロドル（100万分の1ドル）の整数で累計する
export async function recordUsage(
  model: string,
  usage: TokenUsage,
  purpose: string,
  jobId?: string,
): Promise<number> {
  const usd = costUsd(model, usage);
  const micro = Math.round(usd * 1_000_000);
  const now = new Date().toISOString();
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: keys.usageTotal(),
      UpdateExpression: "ADD microUsd :m, calls :one SET updatedAt = :now",
      ExpressionAttributeValues: { ":m": micro, ":one": 1, ":now": now },
    }),
  );
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: "USAGE",
        sk: `LOG#${now}#${Math.random().toString(36).slice(2, 8)}`,
        model,
        purpose,
        jobId,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        microUsd: micro,
        createdAt: now,
      },
    }),
  );
  return usd;
}

export async function getUsageSummary(settings: Settings): Promise<UsageSummary> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: keys.usageTotal() }));
  const totalUsd = ((res.Item?.microUsd as number | undefined) ?? 0) / 1_000_000;
  const totalJpy = Math.round(totalUsd * settings.usdJpy);
  const stopAtJpy = Math.round(settings.budgetJpy * BUDGET_STOP_RATIO);
  return { totalUsd, totalJpy, budgetJpy: settings.budgetJpy, stopAtJpy, canGenerate: totalJpy < stopAtJpy };
}
