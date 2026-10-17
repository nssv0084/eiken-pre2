import { z } from "zod";
import type { Item } from "../../../../shared/types";
import { callStructured } from "../claude";
import { buildExplanationPrompt, buildSolvePrompt, EXPLANATION_SYSTEM, SOLVE_SYSTEM } from "./prompts";

const SolveSchema = z.object({
  questions: z.array(
    z.object({
      chosenNumber: z.number().describe("最も適切な選択肢の番号（1〜4の整数）"),
      uniquelyCorrect: z.boolean(),
      issues: z.string(),
    }),
  ),
  difficulty: z.number().describe("難しさ（1〜5の整数）"),
  levelAppropriate: z.boolean(),
  naturalEnglish: z.boolean(),
  notes: z.string(),
});

// 3（標準）と4（やや難しめ）は合格、2（やや易しい）は講師の確認へ、1と5は不合格
export const ACCEPTED_DIFFICULTY = [3, 4];
export const REVIEW_DIFFICULTY = [2];

const ExplanationSchema = z.object({ ok: z.boolean(), issues: z.string() });

export type SolveResult = z.infer<typeof SolveSchema>;

export interface VerifyOutcome {
  passed: boolean;
  needsReview?: boolean;
  notes: string;
  usd: number;
  difficulty?: number;
}

// 正答を見せずに解いた結果から、合否と理由を判定する
export function judgeSolve(
  item: Item,
  solve: SolveResult,
): { passed: boolean; needsReview: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (solve.questions.length !== item.questions.length) {
    return { passed: false, needsReview: false, reasons: ["検証結果の設問数が一致しません"] };
  }
  item.questions.forEach((q, i) => {
    const s = solve.questions[i];
    if (s.chosenNumber - 1 !== q.answerIndex) {
      reasons.push(`設問${i + 1}: 検証役の答え（${s.chosenNumber}）が正解（${q.answerIndex + 1}）と違う`);
    }
    if (!s.uniquelyCorrect) reasons.push(`設問${i + 1}: 正解が1つに定まらない`);
    if (s.issues) reasons.push(`設問${i + 1}: ${s.issues}`);
  });
  const needsReview = REVIEW_DIFFICULTY.includes(solve.difficulty);
  const difficultyOk = ACCEPTED_DIFFICULTY.includes(solve.difficulty) || needsReview;
  if (needsReview) reasons.push(`難しさ ${solve.difficulty}（やや易しい。講師の確認へ）`);
  else if (!difficultyOk) {
    reasons.push(`難しさ ${solve.difficulty}（${solve.difficulty <= 1 ? "易しすぎる" : "難しすぎる"}）`);
  }
  if (!solve.levelAppropriate) reasons.push("準2級のレベルに合わない");
  if (!solve.naturalEnglish) reasons.push("英文が不自然");
  if (solve.notes) reasons.push(solve.notes);

  const passed =
    difficultyOk &&
    solve.levelAppropriate &&
    solve.naturalEnglish &&
    item.questions.every((q, i) => solve.questions[i].chosenNumber - 1 === q.answerIndex && solve.questions[i].uniquelyCorrect);
  return { passed, needsReview, reasons };
}

export async function verifyItem(item: Item, model: string, jobId: string): Promise<VerifyOutcome> {
  const solve = await callStructured({
    model,
    effort: "medium",
    system: SOLVE_SYSTEM,
    user: buildSolvePrompt(item),
    schema: SolveSchema,
    purpose: "verify-solve",
    jobId,
  });
  const judged = judgeSolve(item, solve.data);
  const difficulty = solve.data.difficulty;
  if (!judged.passed) return { passed: false, notes: judged.reasons.join(" / "), usd: solve.usd, difficulty };

  const explanation = await callStructured({
    model,
    effort: "low",
    system: EXPLANATION_SYSTEM,
    user: buildExplanationPrompt(item),
    schema: ExplanationSchema,
    purpose: "verify-explanation",
    jobId,
  });
  const reasons = [...judged.reasons];
  if (explanation.data.issues) reasons.push(`解説: ${explanation.data.issues}`);
  return {
    passed: explanation.data.ok,
    needsReview: judged.needsReview,
    notes: reasons.join(" / "),
    usd: solve.usd + explanation.usd,
    difficulty,
  };
}
