import { randomUUID } from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { z } from "zod";
import { buildForecast, deliverableCount, MAX_DIALOGUE_PER_JOB, MAX_PER_JOB, type ForecastKey } from "../../shared/stock";
import { QUESTION_TYPES, type ItemStatus, type QuestionType } from "../../shared/types";
import type { Caller } from "./lib/auth";
import { HttpError, parseBody } from "./lib/http";
import {
  CALIBRATION_TARGET,
  countItems,
  countItemsWithGenre,
  getItem,
  getTeacherApprovedCount,
  incrementTeacherApproved,
  ITEM_STATUSES,
  listItems,
  putItem,
  setExemplar,
} from "./lib/items";
import { createJob, listJobs, type GenerateJob } from "./lib/jobs";
import { ESTIMATED_USD_PER_ITEM } from "./lib/pricing";
import { listProfiles } from "./lib/profiles";
import { getSettings } from "./lib/settings";
import { getUsageSummary } from "./lib/usage";

const lambda = new LambdaClient({});

const GenerateRequest = z
  .object({
    type: z.enum(QUESTION_TYPES),
    count: z.number().int().min(1),
    genre: z.enum(["email", "explanation", "dialogue"]).optional(),
    topic: z.string().trim().max(50).optional(),
  })
  .refine((r) => r.count <= (r.type === "conversation" && r.genre === "dialogue" ? MAX_DIALOGUE_PER_JOB : MAX_PER_JOB[r.type]), {
    message: "1回に作れる数を超えています",
  })
  .refine((r) => r.type !== "reading" || r.genre === "email" || r.genre === "explanation", { message: "長文の内容一致はジャンルを選んでください" })
  .refine((r) => r.genre !== "dialogue" || r.type === "conversation", { message: "長い会話は会話文でだけ選べます" });

export async function getStock() {
  const entries = await Promise.all(
    QUESTION_TYPES.flatMap((type) =>
      ITEM_STATUSES.map(async (status) => ({ type, status, count: await countItems("pre2", type, status) })),
    ),
  );
  const stock = Object.fromEntries(QUESTION_TYPES.map((t) => [t, {} as Record<ItemStatus, number>]));
  for (const e of entries) stock[e.type][e.status] = e.count;
  const calibration = Object.fromEntries(
    await Promise.all(
      QUESTION_TYPES.map(async (t) => [
        t,
        { approved: await getTeacherApprovedCount("pre2", t), target: CALIBRATION_TARGET[t] },
      ]),
    ),
  );
  const [students, settings, dialogue] = await Promise.all([
    listProfiles("student"),
    getSettings(),
    countItemsWithGenre("pre2", "conversation", "approved", "dialogue"),
  ]);
  const deliverable = Object.fromEntries(QUESTION_TYPES.map((t) => [t, deliverableCount(stock[t])])) as Record<ForecastKey, number>;
  // 会話文の承認済みは短い会話と長い会話の合計なので、分けて見通す
  deliverable.dialogue = dialogue;
  deliverable.conversation -= dialogue;
  const forecast = buildForecast({
    grade: "pre2",
    deliverable,
    progresses: students.map((s) => s.progress),
    alertDays: settings.stockAlertDays,
  });
  return { stock, calibration, forecast };
}

const ReviewRequest = z.object({
  status: z.enum(["approved", "disabled"]).optional(),
  exemplar: z.boolean().optional(),
});

export async function reviewItem(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const id = event.pathParameters?.id ?? "";
  const parsed = ReviewRequest.safeParse(parseBody(event.body, event.isBase64Encoded));
  if (!parsed.success) throw new HttpError(400, "入力が正しくありません");
  const req = parsed.data;

  const item = await getItem(id);
  if (!item) throw new HttpError(404, "問題が見つかりません");

  const status = req.status ?? item.status;
  const exemplar = status === "disabled" ? false : (req.exemplar ?? item.exemplar ?? false);
  if (exemplar && status !== "approved") throw new HttpError(400, "見本にできるのは承認した問題だけです");

  const updated = {
    ...item,
    status,
    exemplar,
    reviewedBy: caller.username,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await putItem(updated);
  if (status === "approved" && !item.reviewedBy) await incrementTeacherApproved(item.grade, item.type);
  if (exemplar !== (item.exemplar ?? false)) await setExemplar(updated, exemplar);
  return { item: updated };
}

export async function getItems(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const q = event.queryStringParameters ?? {};
  const type = z.enum(QUESTION_TYPES).safeParse(q.type);
  const status = z.enum(ITEM_STATUSES as [ItemStatus, ...ItemStatus[]]).safeParse(q.status);
  if (!type.success || !status.success) throw new HttpError(400, "type と status を指定してください");
  return { items: await listItems("pre2", type.data, status.data, 50) };
}

export async function startGeneration(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const parsed = GenerateRequest.safeParse(parseBody(event.body, event.isBase64Encoded));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const req = parsed.data;

  const usage = await getUsageSummary(await getSettings());
  if (!usage.canGenerate) throw new HttpError(409, `API 使用額が予算の上限（${usage.stopAtJpy}円）に達しています`);

  const now = new Date().toISOString();
  const job: GenerateJob = {
    id: randomUUID(),
    grade: "pre2",
    type: req.type,
    genre: req.type === "reading" || (req.type === "conversation" && req.genre === "dialogue") ? req.genre : undefined,
    topic: req.topic || undefined,
    count: req.count,
    status: "queued",
    approved: 0,
    review: 0,
    rejected: 0,
    usd: 0,
    requestedBy: caller.username,
    createdAt: now,
    updatedAt: now,
  };
  await createJob(job);
  await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.GENERATOR_FN_NAME,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({ jobId: job.id })),
    }),
  );
  return { job };
}

export async function getJobs() {
  return { jobs: await listJobs(20) };
}

export async function getUsage() {
  const settings = await getSettings();
  return {
    usage: await getUsageSummary(settings),
    usdJpy: settings.usdJpy,
    estimatedUsdPerItem: ESTIMATED_USD_PER_ITEM,
    maxPerJob: MAX_PER_JOB,
    maxDialoguePerJob: MAX_DIALOGUE_PER_JOB,
    models: { generation: settings.generationModel, verification: settings.verificationModel },
  };
}
