import { z } from "zod";
import type { PassageGenre, QuestionType } from "../../../../shared/types";

export const GenQuestionSchema = z.object({
  stem: z.string().describe("問題文（英語）。空所は ( ) で示す。長文型は ( 1 ) のように空所番号のみ、または設問文"),
  choices: z.array(z.string()).describe("選択肢ちょうど4つ（英語）"),
  // .int() を付けると説明文に不要な範囲が付くため、整数チェックは validateGenItem で行う
  answerIndex: z.number().describe("正解の選択肢の位置（0〜3の整数）"),
  explanation: z.string().describe("日本語の解説。選択肢は番号ではなく語句で言及する"),
});

export const GenItemSchema = z.object({
  topic: z.string().describe("題材（日本語で短く）"),
  focus: z
    .enum(["word", "idiom", "grammar", "none"])
    .describe("語彙問題の観点（word=単語, idiom=熟語・句動詞, grammar=文法・語法）。語彙問題以外は none"),
  title: z.string().describe("長文のタイトル。Eメールは件名。語彙・会話文は空文字"),
  passage: z.string().describe("長文の本文（英語）。語彙・会話文は空文字"),
  questions: z.array(GenQuestionSchema),
});

export const GenOutputSchema = z.object({ items: z.array(GenItemSchema) });

export type GenItem = z.infer<typeof GenItemSchema>;

export function expectedQuestionCount(type: QuestionType, genre?: PassageGenre): number {
  if (type === "cloze") return 2;
  if (type === "reading") return genre === "email" ? 3 : 4;
  return 1;
}

// 生成結果のうち、形式の崩れたものを機械的にはじく。理由を返し、問題なければ null
export function validateGenItem(item: GenItem, type: QuestionType, genre?: PassageGenre): string | null {
  const expected = expectedQuestionCount(type, genre);
  if (item.questions.length !== expected) return `設問数が${expected}ではありません`;
  const isPassage = type === "cloze" || type === "reading";
  if (isPassage && item.passage.trim().length < 300) return "本文が短すぎます";
  if (!isPassage && item.passage.trim() !== "") return "語彙・会話文に本文があります";
  if (type === "vocab" && item.focus === "none") return "語彙問題の観点（focus）がありません";

  for (const [i, q] of item.questions.entries()) {
    if (q.choices.length !== 4) return `設問${i + 1}の選択肢が4つではありません`;
    if (q.choices.some((c) => c.trim() === "")) return `設問${i + 1}に空の選択肢があります`;
    const normalized = q.choices.map((c) => c.trim().toLowerCase());
    if (new Set(normalized).size !== 4) return `設問${i + 1}の選択肢が重複しています`;
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) return `設問${i + 1}の正解番号が不正です`;
    if (q.explanation.trim() === "") return `設問${i + 1}に解説がありません`;
    if ((type === "vocab" || type === "conversation") && !q.stem.includes("( )")) return "問題文に空所 ( ) がありません";
    if (type === "cloze" && !item.passage.includes(`( ${i + 1} )`)) return `本文に空所 ( ${i + 1} ) がありません`;
  }
  return null;
}

// 正解の位置が偏らないよう、選択肢をシャッフルして正解番号を付け直す
export function shuffleChoices<T extends { choices: string[]; answerIndex: number }>(
  q: T,
  random: () => number = Math.random,
): T {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, choices: order.map((i) => q.choices[i]), answerIndex: order.indexOf(q.answerIndex) };
}
