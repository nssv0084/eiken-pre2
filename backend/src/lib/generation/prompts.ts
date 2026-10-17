import type { Item, PassageGenre, QuestionType } from "../../../../shared/types";

export const TOPICS = [
  "学校生活",
  "部活動",
  "家族",
  "友人関係",
  "趣味",
  "旅行",
  "食べ物・料理",
  "健康",
  "スポーツ",
  "買い物",
  "アルバイト・仕事",
  "地域のイベント",
  "環境問題",
  "科学技術",
  "動物・自然",
  "歴史・文化",
  "音楽・芸術",
  "交通",
  "インターネット",
  "ボランティア",
];

export const GENERATION_SYSTEM = `あなたは英検準2級の筆記試験（リーディング）向けに、オリジナルの練習問題を作る英語教育の専門家です。
日本の中学生・高校生が自宅で解く学習アプリの問題として使われます。

## 共通のルール
- レベル: 英検準2級（CEFR A2〜B1、高校中級程度、語彙はおよそ3,600語レベル）。本文や問題文に準2級を大きく超える難語を使わない。
- 易しすぎる問題にしない。中学1年までに習う基本語（rule, always など）ではなく、reliable, revise, respect のような高校レベルの語を問う問題を中心にする。
- 長文の本文は、ほとんどの語を高校2年までに習う語にし、それを超える語は文脈から推測できる場合に限って最小限にする。
- 正解は必ず1つだけに定まるようにする。誤りの選択肢はもっともらしいが、文脈・語法・文法から明確に誤りと判断できるものにする。
- 選択肢4つは長さや品詞・形をそろえ、見た目で正解がわからないようにする。
- 英検の過去問や市販教材の文章・問題を再現しない。すべて新しく作る。
- 人名・地名・店名は架空のものにする。実在の企業名や商品名は使わない。
- 暴力、政治、宗教、恋愛の深い話題など、未成年の学習者に不適切な題材は避ける。
- 解説は日本語で2〜4文。中高生にわかる言葉で、正解の根拠（本文のどこか、語句の意味、文法のポイント）と、主な誤りの選択肢がなぜ違うかを書く。
- 解説では選択肢を番号で呼ばず、語句そのもので言及する（選択肢は後で並べ替えるため）。
- 英文は自然なアメリカ英語にする。`;

const TYPE_INSTRUCTIONS: Record<QuestionType, string> = {
  vocab: `## 形式: 短文の語句空所補充（大問1）
- 1問ずつ作る。title と passage は空文字、questions は1つ。
- stem は英文1〜2文、または A: / B: の短い会話（2〜3行）。空所は ( ) で1か所だけ示す。
- 出題のバランス: 約半分は単語（動詞・名詞・形容詞・副詞）、約3分の1は熟語・句動詞、残りは文法・語法。focus にそれぞれ word / idiom / grammar を入れる。
- 単語の問題（word）の正解は、CEFR A2〜B1（中学2年〜高校3年で習う語）にする。A1（中学1年までの基本語）や B2 以上の語は正解にしない。
- 選択肢は4つとも同じ品詞・同じ形（動詞なら同じ時制）にし、誤りの選択肢も正解と同じくらいの難しさの語にする（易しい語ばかりだと消去法で解けてしまう）。
- すでにある問題で使われた誤りの選択肢は、なるべく使わない。
- 解説には、正解の語句の意味（日本語）と、紛らわしい選択肢の意味も短く書く。`,
  conversation: `## 形式: 会話文の空所補充（大問2）
- 1問ずつ作る。title と passage は空文字、questions は1つ。
- stem は2人の会話（A: / B: の形式、4〜6行、改行で区切る）。空所 ( ) は会話の1か所で、文または句が入る。
- 選択肢は4つとも文または句で、空所の前後の発言とのつながりから正解が1つに決まるようにする。
- 日常的な場面（学校、家庭、店、駅、電話など）の自然な話し言葉にする。`,
  cloze: `## 形式: 長文の語句空所補充（大問3）
- 1題に設問2つ。title は英語のタイトル、passage は150〜200語の英文（物語文または説明文、3段落程度、段落は空行で区切る）。
- 本文中に空所を ( 1 ) と ( 2 ) の形で1つずつ入れる。
- 設問の stem はそれぞれ "( 1 )"、"( 2 )" とする。
- 選択肢は2〜6語程度の句で、文法的にはどれも入り得るが、文脈を理解すると1つに決まるものにする。`,
  reading: `## 形式: 長文の内容一致選択（大問4）
- 指定されたジャンルに従う。
- 設問は本文の流れの順に並べ、各設問は主に1つの段落の内容を問う。
- stem は疑問文（例: Why did Emma ...?）または文の前半（例: According to the article, scientists ...）。
- 正解の選択肢は本文の表現をそのまま写さず言い換える。誤りの選択肢は本文に出てくる語を含みつつ内容が違うものにする。`,
};

const GENRE_INSTRUCTIONS: Record<PassageGenre, string> = {
  email: `- ジャンル: Eメール。設問は3つ。
- title は件名（英語）。passage は次の形式で始める:
From: （差出人の名前）
To: （宛先の名前）
Date: （月 日）
Subject: （件名）

その後に本文を200〜230語、3段落で書く（空行で区切る）。友人・家族・先生などの身近なやり取りにする。`,
  explanation: `- ジャンル: 説明文。設問は4つ。
- title は英語のタイトル。passage は280〜320語、4段落（空行で区切る）。社会・科学・歴史・文化などについて事実に基づく内容にする（架空の研究者や町が登場してもよい）。
- 4つ目の設問は "Which of the following statements is true?" とし、本文全体から選ばせてもよい。`,
  story: `- ジャンル: 物語文。設問は3〜4つ。`,
};

function formatExemplar(item: Item): string {
  const parts: string[] = [];
  if (item.title) parts.push(`タイトル: ${item.title}`);
  if (item.passage) parts.push(item.passage);
  for (const q of item.questions) {
    parts.push(q.stem);
    parts.push(q.choices.map((c, j) => `${j === q.answerIndex ? "◯" : "・"}${c}`).join("  "));
  }
  return parts.join("\n");
}

export function buildGenerationPrompt(params: {
  type: QuestionType;
  count: number;
  topics: string[];
  genre?: PassageGenre;
  existing: Item[];
  exemplars?: Item[];
}): { system: string; user: string } {
  const { type, count, topics, genre, existing, exemplars = [] } = params;
  const lines = [
    `次の条件で問題を${count}${type === "cloze" || type === "reading" ? "題" : "問"}作り、items に入れてください。`,
    "",
    TYPE_INSTRUCTIONS[type],
    type === "reading" && genre ? GENRE_INSTRUCTIONS[genre] : "",
    type === "cloze" ? "- 本文は物語文か説明文のどちらかにする。" : "",
    "",
    "## 各問題の題材（この順に1つずつ使う）",
    ...topics.map((t, i) => `${i + 1}. ${t}`),
  ];

  if (exemplars.length > 0) {
    lines.push(
      "",
      "## 見本（講師が「準2級らしい」と判断した問題。難しさと形式の目安にする。内容や語句はまねしない）",
      ...exemplars.map((e, i) => `### 見本${i + 1}\n${formatExemplar(e)}`),
    );
  }

  if (existing.length > 0) {
    lines.push("", "## すでにある問題（内容・正解の語句・場面が重複しないようにする）");
    for (const item of existing) {
      const q = item.questions[0];
      if (!q) continue;
      const head = item.title || q.stem.replace(/\s+/g, " ").slice(0, 80);
      if (type === "vocab") {
        const wrong = q.choices.filter((_, i) => i !== q.answerIndex).join(", ");
        lines.push(`- ${head}（正解: ${q.choices[q.answerIndex]} ／ 誤り: ${wrong}）`);
      } else {
        lines.push(`- ${head}`);
      }
    }
  }
  return { system: GENERATION_SYSTEM, user: lines.filter((l) => l !== undefined).join("\n") };
}

export const SOLVE_SYSTEM = `あなたは英検準2級の問題を厳しくチェックする校閲者です。
受験者と同じ立場で問題を解き、そのうえで問題の品質を評価してください。

- 各設問について、最も適切な選択肢の番号（1〜4）を chosenNumber に入れる。
- uniquelyCorrect: 正解と言える選択肢がちょうど1つで、他の3つは明確に誤りなら true。2つ以上が正解になり得る、または正解がない場合は false。
- difficulty: 問題全体の難しさを1〜5の整数で付ける。基準は「本番の英検準2級で出題されてもおかしくないか」。
  1 = 英検3級以下（中学1〜2年の基本語・基本文法だけで、ほぼ迷わず解ける）
  2 = 準2級の本番より明らかに易しい（3級でも出題されうる語・熟語・文法）
  3 = 準2級の標準（準2級でよく出る語・熟語・文法を問う。文脈の手がかりがはっきりしていて解きやすくても、問われている知識が準2級の頻出事項なら3とする）
  4 = 準2級としては難しめ（準2級の合格者なら解ける上位レベル）
  5 = 英検2級以上
- levelAppropriate: 語彙・文法・内容が英検準2級として適切なら true（易しすぎる・難しすぎる場合は false）。
- naturalEnglish: 英文が文法的に正しく自然なら true。
- issues / notes: 問題点があれば日本語で具体的に書く。なければ空文字。`;

export const EXPLANATION_SYSTEM = `あなたは英検準2級の問題の解説をチェックする校閲者です。
問題・正解・日本語の解説を読み、解説が正しく、中高生にわかりやすいかを判定してください。

- ok: 解説が正解の根拠を正しく説明しており、事実や文法の誤り、正解と矛盾する記述がなければ true。
- issues: 問題点があれば日本語で具体的に書く。なければ空文字。`;

function formatQuestions(item: Item, withAnswers: boolean): string {
  const parts: string[] = [];
  if (item.title) parts.push(`タイトル: ${item.title}`);
  if (item.passage) parts.push(`本文:\n${item.passage}`);
  item.questions.forEach((q, i) => {
    parts.push(`設問${i + 1}: ${q.stem}`);
    q.choices.forEach((c, j) => parts.push(`  ${j + 1}) ${c}`));
    if (withAnswers) {
      parts.push(`  正解: ${q.answerIndex + 1}) ${q.choices[q.answerIndex]}`);
      parts.push(`  解説: ${q.explanation}`);
    }
  });
  return parts.join("\n");
}

export const buildSolvePrompt = (item: Item) => `次の問題を解いて評価してください。\n\n${formatQuestions(item, false)}`;
export const buildExplanationPrompt = (item: Item) => `次の問題の解説をチェックしてください。\n\n${formatQuestions(item, true)}`;
