import { describe, expect, it } from "vitest";
import { buildForecast, deliverableCount, MAX_PER_JOB, type ForecastKey } from "../../shared/stock";

const stockOf = (s: Partial<Record<ForecastKey, number>>) => ({
  vocab: 0,
  conversation: 0,
  dialogue: 0,
  cloze: 0,
  reading: 0,
  ...s,
});

const forecast = (stock: Partial<Record<ForecastKey, number>>, progresses: { cycle: number; day: number }[], alertDays = 7) =>
  buildForecast({ grade: "pre2", deliverable: stockOf(stock), progresses, alertDays });

const of = (f: ReturnType<typeof forecast>, type: ForecastKey) => f!.items.find((i) => i.type === type)!;

describe("在庫の見通し", () => {
  it("[STK-05] 1日目から毎日進むと、語彙197問は14日分（15日目で足りなくなる）", () => {
    const v = of(forecast({ vocab: 197 }, [{ cycle: 1, day: 1 }]), "vocab");
    expect(v.daysLeft).toBe(14);
    expect(v.shortage).toBe(142);
  });

  it("[STK-05] 周の終わりまで足りるときは daysLeft が null", () => {
    const f = forecast({ vocab: 339, conversation: 52, dialogue: 14, cloze: 12, reading: 13 }, [{ cycle: 1, day: 1 }]);
    for (const item of f!.items) {
      expect(item.daysLeft).toBeNull();
      expect(item.shortage).toBe(0);
      expect(item.suggested).toBe(0);
    }
  });

  it("[STK-05] 進んだ日の分は在庫から引かれる（10日目まで終えた生徒は、残り在庫で数える）", () => {
    // 1〜10日目で語彙150問を使用済み。在庫197なら残り47問 → 11〜14日目（各10問）で40問、15日目で足りなくなる
    const v = of(forecast({ vocab: 197 }, [{ cycle: 1, day: 11 }]), "vocab");
    expect(v.daysLeft).toBe(4);
    expect(v.shortage).toBe(339 - 150 - 47);
  });

  it("[STK-04] 最も進んでいる生徒を基準にする", () => {
    const f = forecast({ vocab: 197 }, [
      { cycle: 1, day: 3 },
      { cycle: 1, day: 11 },
      { cycle: 1, day: 1 },
    ]);
    expect(f!.lead).toEqual({ cycle: 1, day: 11 });
  });

  it("[STK-06] 出題できるのは承認済みだけ", () => {
    expect(deliverableCount({ approved: 142, review: 5, reported: 2, disabled: 45, pending: 1 })).toBe(142);
    expect(deliverableCount({})).toBe(0);
  });

  it("[STK-07] 2周目は前の周の問題を再利用せず、新しい問題だけで進める上限の見積りになる", () => {
    // 2周目1日目: 1周目の339問は使用済みとして数える。在庫が339なら2周目の最初の日から足りない
    const v = of(forecast({ vocab: 339 }, [{ cycle: 2, day: 1 }]), "vocab");
    expect(v.daysLeft).toBe(0);
    expect(v.shortage).toBe(339);
    expect(forecast({ vocab: 339 }, [{ cycle: 2, day: 1 }])!.upperBound).toBe(true);
    expect(forecast({ vocab: 339 }, [{ cycle: 1, day: 1 }])!.upperBound).toBe(false);
  });

  it("[STK-08] 警告日数より少ない形式だけ警告する", () => {
    // 語彙は14日分、会話文は周の終わりまで足りる
    const f = forecast({ vocab: 197, conversation: 52, dialogue: 14, cloze: 12, reading: 13 }, [{ cycle: 1, day: 1 }], 15);
    expect(of(f, "vocab").warn).toBe(true);
    expect(of(f, "conversation").warn).toBe(false);
    const g = forecast({ vocab: 197, conversation: 52, dialogue: 14, cloze: 12, reading: 13 }, [{ cycle: 1, day: 1 }], 14);
    expect(of(g, "vocab").warn).toBe(false);
  });

  it("[STK-09] 作る数の目安は、足りない数の10%増しを切り上げ。生成の回数も出す", () => {
    const v = of(forecast({ vocab: 197 }, [{ cycle: 1, day: 1 }]), "vocab");
    expect(v.suggested).toBe(157); // ceil(142 * 1.1)
    expect(v.runs).toBe(Math.ceil(157 / MAX_PER_JOB.vocab)); // 6回
    expect(v.runs).toBe(6);
  });

  it("[STK-10] 内容一致は Eメールと説明文を合わせた題数で見る", () => {
    // 1周で13題（19〜26日目に8題、27〜29日目に3題、30日目に2題）
    const r = of(forecast({ reading: 7 }, [{ cycle: 1, day: 1 }]), "reading");
    expect(r.shortage).toBe(6);
    expect(r.daysLeft).toBe(25); // 19〜25日目の7題で使い切り、26日目で足りなくなる
  });

  it("[STK-18] 会話文は短い会話（問）と長い会話（題）を分けて見通す", () => {
    const f = forecast({ conversation: 39, dialogue: 5 }, [{ cycle: 1, day: 1 }]);
    // 短い会話: 1〜10日目は3問ずつ（30問）、11日目からは2問ずつ → 15日目で足りなくなる
    expect(of(f, "conversation").daysLeft).toBe(14);
    expect(of(f, "conversation").shortage).toBe(52 - 39);
    // 長い会話: 1〜10日目に1題ずつ → 6日目で足りなくなる
    expect(of(f, "dialogue").daysLeft).toBe(5);
    expect(of(f, "dialogue").shortage).toBe(14 - 5);
    expect(of(f, "dialogue").runs).toBe(Math.ceil(10 / 5));
  });

  it("[STK-11] 生徒がいなければ見通しを出さない", () => {
    expect(forecast({ vocab: 100 }, [])).toBeNull();
  });

  it("在庫がすでに使用済みの数を下回っても、負の数にならない", () => {
    const v = of(forecast({ vocab: 100 }, [{ cycle: 1, day: 20 }]), "vocab");
    expect(v.daysLeft).toBe(0);
    expect(v.shortage).toBeGreaterThan(0);
  });
});
