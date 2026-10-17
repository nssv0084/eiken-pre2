import { describe, expect, it } from "vitest";
import {
  CURRICULUM_DAYS,
  delayDays,
  getDayPlan,
  nextProgress,
  projectProgress,
} from "../../shared/curriculum";
import { addDays, daysBetween, studyDate } from "../../shared/dates";

describe("studyDate", () => {
  it("日本時間の午前3時より前は前日扱い", () => {
    // 2026-10-18 02:59 JST = 2026-10-17 17:59 UTC
    expect(studyDate(new Date("2026-10-17T17:59:00Z"))).toBe("2026-10-17");
    // 2026-10-18 03:00 JST
    expect(studyDate(new Date("2026-10-17T18:00:00Z"))).toBe("2026-10-18");
  });

  it("日付の加算と差分", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(daysBetween("2026-10-17", "2026-12-16")).toBe(60);
  });
});

describe("getDayPlan", () => {
  it("1周30日のすべての日に計画がある", () => {
    for (let d = 1; d <= CURRICULUM_DAYS; d++) {
      expect(getDayPlan("pre2", d).slots.length).toBeGreaterThan(0);
    }
    expect(() => getDayPlan("pre2", 0)).toThrow(RangeError);
    expect(() => getDayPlan("pre2", 31)).toThrow(RangeError);
  });

  it("30日目は本番と同じ29問の模試", () => {
    const plan = getDayPlan("pre2", 30);
    expect(plan.isMock).toBe(true);
    const questionsPerItem = { vocab: 1, conversation: 1, cloze: 2 } as const;
    const total = plan.slots.reduce((sum, s) => {
      if (s.type === "reading") return sum + (s.genre === "email" ? 3 : 4);
      return sum + s.count * questionsPerItem[s.type];
    }, 0);
    expect(total).toBe(29);
  });

  it("内容一致はEメールと説明文が交互", () => {
    expect(getDayPlan("pre2", 19).slots[0].genre).toBe("email");
    expect(getDayPlan("pre2", 20).slots[0].genre).toBe("explanation");
  });
});

describe("進度", () => {
  it("30日目の次は次の周の1日目", () => {
    expect(nextProgress({ cycle: 1, day: 29 })).toEqual({ cycle: 1, day: 30 });
    expect(nextProgress({ cycle: 1, day: 30 })).toEqual({ cycle: 2, day: 1 });
  });

  it("遅れは経過日数と完了日数の差", () => {
    // 開始から10日経過、9日分完了（10日目に取り組み中）なら遅れ1日
    expect(delayDays({ cycle: 1, day: 10 }, "2026-10-01", "2026-10-11")).toBe(1);
    expect(delayDays({ cycle: 1, day: 1 }, "2026-10-01", "2026-10-01")).toBe(0);
  });

  it("毎日進めているペースなら受験日までの日数分進む", () => {
    const p = projectProgress({ cycle: 1, day: 11 }, "2026-10-01", "2026-10-11", "2026-12-20");
    expect(p.daysLeft).toBe(70);
    // 10 + 70 = 80 日分完了 → 3周目の21日目
    expect(p).toMatchObject({ cycle: 3, day: 21, reachesTwoCycles: true });
  });

  it("ペースが半分なら2周に届かない警告", () => {
    const p = projectProgress({ cycle: 1, day: 6 }, "2026-10-01", "2026-10-11", "2026-12-20");
    // 5 + floor(70 * 0.5) = 40
    expect(p).toMatchObject({ cycle: 2, day: 11, reachesTwoCycles: false });
  });
});
