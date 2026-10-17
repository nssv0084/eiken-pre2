import { describe, expect, it } from "vitest";
import type { Item } from "../../shared/types";
import { lemmaCandidates, profileText, wordLevel } from "../src/lib/level/cefr";
import { checkItemLevel } from "../src/lib/level/check";

describe("wordLevel", () => {
  it("見出し語のレベルを引ける", () => {
    expect(wordLevel("rule")).toBe("A1");
    expect(wordLevel("reliable")).toBe("B1");
  });

  it("語形変化を戻して引ける", () => {
    expect(lemmaCandidates("studies")).toContain("study");
    expect(wordLevel("rules")).toBe("A1");
    expect(wordLevel("revised")).toBe("B1");
    expect(wordLevel("stopped")).toBe(wordLevel("stop"));
    expect(wordLevel("making")).toBe(wordLevel("make"));
    expect(wordLevel("held")).toBe(wordLevel("hold"));
    expect(wordLevel("Reliable")).toBe("B1");
  });

  it("リストにない語は undefined", () => {
    expect(wordLevel("xyzzyq")).toBeUndefined();
  });
});

describe("profileText", () => {
  it("固有名詞とEメールのヘッダーは数えない", () => {
    const p = profileText("From: Kate Brown\nTo: Ken\n\nI went to Tokyo with Emma. It was fun.");
    // I went to with It was fun = 7語（Tokyo, Emma は固有名詞として除外）
    expect(p.tokens).toBe(7);
    expect(p.aboveB1Rate).toBe(0);
  });

  it("難しい語の割合と一覧を返す", () => {
    const p = profileText("The scientists studied the epistemology carefully.");
    expect(p.hardWords).toContain("epistemology");
    expect(p.aboveB1Rate).toBeGreaterThan(0);
  });
});

const vocabItem = (answer: string, distractors: string[], focus: Item["focus"] = "word") =>
  ({
    type: "vocab",
    focus,
    questions: [{ id: "x:0", stem: "( )", choices: [answer, ...distractors], answerIndex: 0, explanation: "" }],
  }) as unknown as Item;

describe("checkItemLevel", () => {
  it("正解の単語が A1 なら不合格、A2〜B1 なら合格", () => {
    expect(checkItemLevel(vocabItem("always", ["rarely", "never", "hardly"])).verdict).toBe("fail");
    expect(checkItemLevel(vocabItem("reliable", ["expensive", "empty", "noisy"])).verdict).toBe("pass");
  });

  it("誤りの選択肢の多くが A1 なら確認待ち", () => {
    expect(checkItemLevel(vocabItem("reliable", ["big", "red", "happy"])).verdict).toBe("review");
  });

  it("熟語・文法は語彙リストで判定しない", () => {
    expect(checkItemLevel(vocabItem("put up with", ["take part in", "come up with", "catch up with"], "idiom")).verdict).toBe(
      "pass",
    );
    expect(checkItemLevel(vocabItem("who", ["what", "which", "whose"], "grammar")).verdict).toBe("pass");
  });

  it("長文は難しい語の割合で判定する", () => {
    const easy = { type: "reading", questions: [], passage: "I like my school. My friends are kind. We study English every day." } as unknown as Item;
    expect(checkItemLevel(easy).verdict).toBe("pass");
    const hard = {
      type: "reading",
      questions: [],
      passage: "The phenomenon demonstrates unprecedented ramifications for contemporary epistemology.",
    } as unknown as Item;
    expect(checkItemLevel(hard).verdict).toBe("fail");
  });
});
