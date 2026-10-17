import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { z } from "zod";
import { recordUsage } from "./usage";

let client: Anthropic | undefined;

async function getClient(): Promise<Anthropic> {
  if (client) return client;
  const sm = new SecretsManagerClient({});
  const secret = await sm.send(new GetSecretValueCommand({ SecretId: process.env.ANTHROPIC_SECRET_ID }));
  const apiKey = secret.SecretString?.trim();
  if (!apiKey?.startsWith("sk-ant-")) throw new Error("Anthropic API キーが Secrets Manager に登録されていません");
  client = new Anthropic({ apiKey, maxRetries: 3 });
  return client;
}

export class ClaudeOutputError extends Error {}

interface StructuredCall<S extends z.ZodType> {
  model: string;
  effort: "low" | "medium" | "high";
  system: string;
  user: string;
  schema: S;
  purpose: string;
  jobId?: string;
}

// 構造化出力で1回呼び出す。課金は応答の検証より前に記録する（失敗した応答も料金はかかるため）
export async function callStructured<S extends z.ZodType>(
  call: StructuredCall<S>,
): Promise<{ data: z.infer<S>; usd: number }> {
  const claude = await getClient();
  const res = await claude.beta.messages.create({
    model: call.model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: call.effort, format: betaZodOutputFormat(call.schema) },
    system: call.system,
    messages: [{ role: "user", content: call.user }],
  });
  const usd = await recordUsage(res.model, res.usage, call.purpose, call.jobId);

  if (res.stop_reason === "refusal") throw new ClaudeOutputError(`応答が拒否されました（${res.stop_details?.category ?? "不明"}）`);
  if (res.stop_reason === "max_tokens") throw new ClaudeOutputError("応答が長すぎて途中で切れました");

  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ClaudeOutputError("応答を JSON として読み取れませんでした");
  }
  const parsed = call.schema.safeParse(json);
  if (!parsed.success) throw new ClaudeOutputError(`応答の形式が想定と違います: ${parsed.error.message}`);
  return { data: parsed.data, usd };
}
