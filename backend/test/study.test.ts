import { describe, expect, it } from "vitest";
import type { Item } from "../../shared/types";
import { usageFlag } from "../src/lib/study/feedback";
import { selectItems } from "../src/lib/study/select";
import { nextQuestionState, type QuestionState } from "../src/lib/study/srs";
import { currentStreak, markStudied } from "../src/lib/study/streak";

const base = { questionId: "a:0", itemId: "a", type: "vocab" as const, cycle: 1, now: "2026-10-17T10:00:00Z" };

describe("nextQuestionState（復習の予定）", () => {
  it("[REV-01][REV-02] 間違えたら翌日に復習、正解したら3日後、2回続けて正解したら外す", () => {
    const s1 = nextQuestionState(undefined, { ...base, correct: false, today: "2026-10-17" });
    expect(s1.nextReviewDate).toBe("2026-10-18");
    expect(s1.wrongCycles).toEqual([1]);

    const s2 = nextQuestionState(s1, { ...base, correct: true, today: "2026-10-18" });
    expect(s2.nextReviewDate).toBe("2026-10-21");

    const s3 = nextQuestionState(s2, { ...base, correct: true, today: "2026-10-21" });
    expect(s3.nextReviewDate).toBeUndefined();
    expect(s3).toMatchObject({ attempts: 3, correctCount: 2, correctStreak: 2 });
  });

  it("[REV-03] 復習で間違えたら翌日から数え直す", () => {
    const s1 = nextQuestionState(undefined, { ...base, correct: false, today: "2026-10-17" });
    const s2 = nextQuestionState(s1, { ...base, correct: true, today: "2026-10-18" });
    const s3 = nextQuestionState(s2, { ...base, correct: false, today: "2026-10-21" });
    expect(s3).toMatchObject({ correctStreak: 0, nextReviewDate: "2026-10-22" });
  });

  it("初めて正解した問題は復習に入らない", () => {
    expect(nextQuestionState(undefined, { ...base, correct: true, today: "2026-10-17" }).nextReviewDate).toBeUndefined();
  });
});

const item = (id: string) => ({ id, questions: [{ id: `${id}:0` }] }) as unknown as Item;
const state = (id: string, o: Partial<QuestionState>): [string, QuestionState] => [
  `${id}:0`,
  { questionId: `${id}:0`, itemId: id, type: "vocab", attempts: 1, correctCount: 1, correctStreak: 1, lastResult: true, lastAnsweredAt: "2026-10-01", lastCycle: 1, wrongCycles: [], ...o },
];

describe("selectItems（出題の選び方）", () => {
  const items = ["old", "recent", "fresh", "weak"].map(item);
  const states = new Map([
    state("old", { lastAnsweredAt: "2026-10-01" }),
    state("recent", { lastAnsweredAt: "2026-10-15" }),
    state("weak", { wrongCycles: [1], lastCycle: 1, lastAnsweredAt: "2026-10-16" }),
  ]);

  it("1周目は未出題を優先し、次に古い順", () => {
    const ids = selectItems({ items, states, cycle: 1, count: 4 }).map((i) => i.id);
    expect(ids).toEqual(["fresh", "old", "recent", "weak"]);
  });

  it("[CYC-02] 2周目は前の周で間違えた問題を最優先", () => {
    const ids = selectItems({ items, states, cycle: 2, count: 2 }).map((i) => i.id);
    expect(ids).toEqual(["weak", "fresh"]);
  });

  it("除外した問題は選ばない", () => {
    const ids = selectItems({ items, states, cycle: 1, count: 4, exclude: new Set(["fresh"]) }).map((i) => i.id);
    expect(ids).not.toContain("fresh");
  });
});

describe("連続学習日数", () => {
  it("[STK-01] 前日に続けて学習すると増え、空くと1に戻る", () => {
    expect(markStudied({ count: 3, lastDate: "2026-10-16" }, "2026-10-17")).toEqual({ count: 4, lastDate: "2026-10-17" });
    expect(markStudied({ count: 3, lastDate: "2026-10-14" }, "2026-10-17")).toEqual({ count: 1, lastDate: "2026-10-17" });
    const same = { count: 3, lastDate: "2026-10-17" };
    expect(markStudied(same, "2026-10-17")).toBe(same);
  });

  it("[STK-01] 前日も今日も学習していなければ表示は0", () => {
    expect(currentStreak({ count: 5, lastDate: "2026-10-16" }, "2026-10-17")).toBe(5);
    expect(currentStreak({ count: 5, lastDate: "2026-10-15" }, "2026-10-17")).toBe(0);
  });
});

describe("usageFlag（正答率による見直し）", () => {
  it("解答数が少ないうちは判定しない", () => {
    expect(usageFlag(7, 7)).toBeNull();
  });
  it("[LVL-04] 極端な正答率は理由付きで返す", () => {
    expect(usageFlag(10, 10)).toMatch("易しすぎる");
    expect(usageFlag(10, 2)).toMatch("難しすぎる");
    expect(usageFlag(10, 6)).toBeNull();
  });
});
