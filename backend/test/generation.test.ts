import { describe, expect, it } from "vitest";
import type { Item } from "../../shared/types";
import { buildGenerationPrompt } from "../src/lib/generation/prompts";
import { shuffleChoices, validateGenItem, type GenItem } from "../src/lib/generation/schema";
import { judgeSolve, type SolveResult } from "../src/lib/generation/verify";

const vocab = (overrides: Partial<GenItem["questions"][0]> = {}): GenItem => ({
  topic: "学校生活",
  focus: "word",
  title: "",
  passage: "",
  questions: [
    {
      stem: "Kenji was too tired to ( ) his homework.",
      choices: ["finish", "happen", "invite", "borrow"],
      answerIndex: 0,
      explanation: "too ～ to … の構文。",
      ...overrides,
    },
  ],
});

describe("validateGenItem", () => {
  it("[GEN-06] 正しい語彙問題は通る", () => {
    expect(validateGenItem(vocab(), "vocab")).toBeNull();
  });

  it("[GEN-06] 選択肢の数・重複・正解番号・空所の崩れをはじく", () => {
    expect(validateGenItem(vocab({ choices: ["a", "b", "c"] }), "vocab")).toMatch("4つ");
    expect(validateGenItem(vocab({ choices: ["a", "b", "c", "A"] }), "vocab")).toMatch("重複");
    expect(validateGenItem(vocab({ answerIndex: 4 }), "vocab")).toMatch("正解番号");
    expect(validateGenItem(vocab({ stem: "No blank here." }), "vocab")).toMatch("空所");
  });

  it("[GEN-06] 内容一致はジャンルで設問数が決まる", () => {
    const q = vocab().questions[0];
    const reading: GenItem = { topic: "t", focus: "none", title: "Hi", passage: "x".repeat(400), questions: [q, q, q] };
    expect(validateGenItem(reading, "reading", "email")).toBeNull();
    expect(validateGenItem(reading, "reading", "explanation")).toMatch("設問数");
  });

  it("[GEN-06] 長文空所は本文に ( 1 ) ( 2 ) が必要", () => {
    const q = vocab().questions[0];
    const base = { topic: "t", focus: "none" as const, title: "T", questions: [q, q] };
    expect(validateGenItem({ ...base, passage: `${"x".repeat(300)} ( 1 ) and ( 2 )` }, "cloze")).toBeNull();
    expect(validateGenItem({ ...base, passage: `${"x".repeat(300)} ( 1 )` }, "cloze")).toMatch("( 2 )");
  });
});

describe("shuffleChoices", () => {
  it("並べ替えても正解の語句は変わらない", () => {
    const q = vocab().questions[0];
    for (let seed = 0; seed < 20; seed++) {
      let s = seed;
      const random = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      const shuffled = shuffleChoices(q, random);
      expect(shuffled.choices[shuffled.answerIndex]).toBe("finish");
      expect([...shuffled.choices].sort()).toEqual([...q.choices].sort());
    }
  });
});

describe("judgeSolve", () => {
  const item = { questions: [{ id: "x:0", ...vocab().questions[0] }] } as Item;
  const solve = (o: Partial<SolveResult["questions"][0]> = {}, extra: Partial<SolveResult> = {}): SolveResult => ({
    questions: [{ chosenNumber: 1, uniquelyCorrect: true, issues: "", ...o }],
    difficulty: 3,
    levelAppropriate: true,
    naturalEnglish: true,
    notes: "",
    ...extra,
  });

  it("[GEN-07] 答えが一致し品質も問題なければ合格", () => {
    expect(judgeSolve(item, solve()).passed).toBe(true);
  });

  it("[GEN-07] 答えの不一致・正解が複数・レベル不適合は不合格", () => {
    expect(judgeSolve(item, solve({ chosenNumber: 2 })).passed).toBe(false);
    expect(judgeSolve(item, solve({ uniquelyCorrect: false })).passed).toBe(false);
    expect(judgeSolve(item, solve({}, { levelAppropriate: false })).passed).toBe(false);
  });

  it("[LVL-02] 難しさ3・4は合格、2は講師の確認へ、1・5は不合格", () => {
    expect(judgeSolve(item, solve({}, { difficulty: 3 }))).toMatchObject({ passed: true, needsReview: false });
    expect(judgeSolve(item, solve({}, { difficulty: 4 }))).toMatchObject({ passed: true, needsReview: false });
    expect(judgeSolve(item, solve({}, { difficulty: 2 }))).toMatchObject({ passed: true, needsReview: true });
    expect(judgeSolve(item, solve({}, { difficulty: 1 })).passed).toBe(false);
    expect(judgeSolve(item, solve({}, { difficulty: 5 })).passed).toBe(false);
  });
});

describe("buildGenerationPrompt", () => {
  it("[GEN-04] 語彙は既存問題の正解の語句を重複回避のために渡す", () => {
    const existing = [{ title: undefined, questions: [{ stem: "I ( ) him.", choices: ["met", "a", "b", "c"], answerIndex: 0 }] }] as unknown as Item[];
    const { user } = buildGenerationPrompt({ type: "vocab", count: 2, topics: ["旅行", "健康"], existing });
    expect(user).toContain("2問");
    expect(user).toContain("1. 旅行");
    expect(user).toContain("（正解: met ／ 誤り: a, b, c）");
  });

  it("[GEN-09] 同じ題材で複数作るときは、場面・人物・筋を変えるよう指示する", () => {
    const { user } = buildGenerationPrompt({ type: "cloze", count: 2, topics: ["コンビニ", "コンビニ"], existing: [] });
    expect(user).toContain("同じ題材で複数作る");
    expect(user).toContain("場面・登場人物・話の筋");
  });

  it("[GEN-09] 題材がすべて違うとき、1つだけのときは指示を足さない", () => {
    expect(buildGenerationPrompt({ type: "cloze", count: 2, topics: ["旅行", "健康"], existing: [] }).user).not.toContain("同じ題材で複数作る");
    expect(buildGenerationPrompt({ type: "cloze", count: 1, topics: ["旅行"], existing: [] }).user).not.toContain("同じ題材で複数作る");
  });
});
