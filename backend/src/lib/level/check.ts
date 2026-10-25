import type { Item, LevelCheck } from "../../../../shared/types";
import { profileText, wordLevel } from "./cefr";

// 本文のうち B2・リスト外の語の割合のしきい値（仮の値。講師の確認結果を見て調整する）
export const PASSAGE_FAIL_RATE = 0.08;
export const PASSAGE_REVIEW_RATE = 0.04;
const CONVERSATION_REVIEW_RATE = 0.15;

const pct = (r: number) => `${Math.round(r * 100)}%`;

export function checkItemLevel(item: Item): LevelCheck {
  const notes: string[] = [];

  if (item.type === "vocab") {
    const q = item.questions[0];
    const answer = q.choices[q.answerIndex].trim();
    const isSingleWord = /^[A-Za-z'-]+$/.test(answer);
    if (item.focus !== "word" || !isSingleWord) {
      return { verdict: "pass", notes: ["熟語・文法の問題は語彙リストでは判定しない"] };
    }
    const answerLevel = wordLevel(answer) ?? "unknown";
    const distractorLevels = q.choices.filter((_, i) => i !== q.answerIndex).map((c) => wordLevel(c.trim()) ?? "unknown");
    const easyDistractors = distractorLevels.filter((l) => l === "A1").length;

    let verdict: LevelCheck["verdict"] = "pass";
    // 本番の過去問でも正解の単語の1割強は A1・B2・リスト外なので、不合格にせず講師の確認に回す
    if (answerLevel === "A1") {
      verdict = "review";
      notes.push(`正解の語 ${answer} は A1（易しめ）`);
    } else if (answerLevel === "B2") {
      verdict = "review";
      notes.push(`正解の語 ${answer} は B2（難しめ）`);
    } else if (answerLevel === "unknown") {
      verdict = "review";
      notes.push(`正解の語 ${answer} は語彙リストにない`);
    } else {
      notes.push(`正解の語 ${answer} は ${answerLevel}`);
    }
    if (verdict === "pass" && easyDistractors >= 2) {
      verdict = "review";
      notes.push(`誤りの選択肢のうち${easyDistractors}つが A1（易しすぎて消去しやすい）`);
    }
    return { verdict, notes, answerLevel, distractorLevels };
  }

  if (item.type === "conversation") {
    const q = item.questions[0];
    const profile = profileText([q.stem, ...q.choices].join("\n"));
    const verdict = profile.aboveB1Rate > CONVERSATION_REVIEW_RATE ? "review" : "pass";
    notes.push(`B2・リスト外の語 ${pct(profile.aboveB1Rate)}`);
    return { verdict, notes, aboveB1Rate: profile.aboveB1Rate, hardWords: profile.hardWords };
  }

  const profile = profileText(item.passage ?? "");
  let verdict: LevelCheck["verdict"] = "pass";
  if (profile.aboveB1Rate > PASSAGE_FAIL_RATE) verdict = "fail";
  else if (profile.aboveB1Rate > PASSAGE_REVIEW_RATE) verdict = "review";
  notes.push(
    `本文 ${profile.tokens}語、B2・リスト外の語 ${pct(profile.aboveB1Rate)}` +
      (profile.hardWords.length ? `（${profile.hardWords.slice(0, 10).join(", ")}）` : ""),
  );
  return { verdict, notes, aboveB1Rate: profile.aboveB1Rate, hardWords: profile.hardWords, tokens: profile.tokens };
}
