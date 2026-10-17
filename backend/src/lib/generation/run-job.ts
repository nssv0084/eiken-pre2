import { randomUUID } from "node:crypto";
import type { Item, ItemStatus, QuestionType } from "../../../../shared/types";
import { callStructured, ClaudeOutputError } from "../claude";
import { putItem, recentDeliverableItems } from "../items";
import { getJob, updateJob, type GenerateJob } from "../jobs";
import { getSettings } from "../settings";
import { getUsageSummary } from "../usage";
import { buildGenerationPrompt, TOPICS } from "./prompts";
import { GenOutputSchema, shuffleChoices, validateGenItem, type GenItem } from "./schema";
import { verifyItem } from "./verify";

// 1回の生成呼び出しで作る数
const PER_CALL: Record<QuestionType, number> = { vocab: 10, conversation: 5, cloze: 1, reading: 1 };
// 重複回避のためにプロンプトへ渡す既存問題の数
const EXISTING_FOR_PROMPT: Record<QuestionType, number> = { vocab: 150, conversation: 60, cloze: 30, reading: 30 };
const VERIFY_CONCURRENCY = 3;

function pickTopics(n: number, fixed?: string): string[] {
  if (fixed) return Array.from({ length: n }, () => fixed);
  const pool = [...TOPICS].sort(() => Math.random() - 0.5);
  return Array.from({ length: n }, (_, i) => pool[i % pool.length]);
}

function toItem(gen: GenItem, job: GenerateJob, model: string, now: string): Item {
  const id = randomUUID();
  return {
    id,
    grade: job.grade,
    type: job.type,
    status: "pending",
    genre: job.type === "reading" ? job.genre : undefined,
    title: gen.title || undefined,
    passage: gen.passage || undefined,
    questions: gen.questions.map((q, i) => ({ ...shuffleChoices(q), id: `${id}:${i}` })),
    topic: gen.topic,
    source: "ai",
    model,
    createdAt: now,
    updatedAt: now,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job || job.status !== "queued") return;
  await updateJob(jobId, { status: "running" });

  const settings = await getSettings();
  const counts = { approved: 0, review: 0, rejected: 0, usd: 0 };
  const accepted = () => counts.approved + counts.review;
  // 不合格の分を作り直せるよう、必要な呼び出し回数の2倍まで試す
  const maxCalls = Math.ceil(job.count / PER_CALL[job.type]) * 2 + 1;

  try {
    for (let call = 0; call < maxCalls && accepted() < job.count; call++) {
      const usage = await getUsageSummary(settings);
      if (!usage.canGenerate) throw new Error(`API 使用額が予算の上限（${usage.stopAtJpy}円）に達したため停止しました`);

      const n = Math.min(PER_CALL[job.type], job.count - accepted());
      const existing = await recentDeliverableItems(job.grade, job.type, EXISTING_FOR_PROMPT[job.type]);
      const prompt = buildGenerationPrompt({
        type: job.type,
        count: n,
        topics: pickTopics(n, job.topic),
        genre: job.genre,
        existing,
      });

      let generated: GenItem[];
      try {
        const res = await callStructured({
          model: settings.generationModel,
          effort: "medium",
          ...prompt,
          schema: GenOutputSchema,
          purpose: "generate",
          jobId,
        });
        counts.usd += res.usd;
        generated = res.data.items.slice(0, n);
      } catch (e) {
        if (!(e instanceof ClaudeOutputError)) throw e;
        console.warn("generation output rejected", e.message);
        counts.rejected += n;
        continue;
      }

      const now = new Date().toISOString();
      const candidates: Item[] = [];
      for (const gen of generated) {
        const problem = validateGenItem(gen, job.type, job.genre);
        if (problem) {
          console.warn("invalid generated item", problem);
          counts.rejected++;
          continue;
        }
        candidates.push(toItem(gen, job, settings.generationModel, now));
      }

      const verified = await mapLimit(candidates, VERIFY_CONCURRENCY, async (item) => {
        try {
          return { item, outcome: await verifyItem(item, settings.verificationModel, jobId) };
        } catch (e) {
          if (!(e instanceof ClaudeOutputError)) throw e;
          return { item, outcome: { passed: false, notes: `検証できませんでした: ${e.message}`, usd: 0 } };
        }
      });

      for (const { item, outcome } of verified) {
        counts.usd += outcome.usd;
        let status: ItemStatus = "disabled";
        if (outcome.passed && accepted() < job.count) {
          status = Math.random() < settings.spotCheckRate ? "review" : "approved";
        }
        await putItem({
          ...item,
          status,
          verification: {
            passed: outcome.passed,
            model: settings.verificationModel,
            notes: outcome.notes,
            verifiedAt: new Date().toISOString(),
          },
        });
        if (status === "approved") counts.approved++;
        else if (status === "review") counts.review++;
        else counts.rejected++;
      }
      await updateJob(jobId, counts);
    }
    await updateJob(jobId, { ...counts, status: "done" });
  } catch (e) {
    console.error(e);
    await updateJob(jobId, { ...counts, status: "error", error: (e as Error).message });
  }
}
