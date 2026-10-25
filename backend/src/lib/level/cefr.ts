// 語彙レベルの判定に『CEFR-J Wordlist Version 1.6』東京外国語大学投野由紀夫研究室 を使用
import { CEFRJ } from "./cefrj-data";

export type CefrLevel = "A1" | "A2" | "B1" | "B2";
const LIST = CEFRJ;

const IRREGULAR: Record<string, string> = {
  am: "be", is: "be", are: "be", was: "be", were: "be", been: "be", being: "be",
  has: "have", had: "have", does: "do", did: "do", done: "do",
  went: "go", gone: "go", made: "make", took: "take", taken: "take", came: "come",
  saw: "see", seen: "see", got: "get", gotten: "get", gave: "give", given: "give",
  found: "find", thought: "think", told: "tell", became: "become", left: "leave",
  felt: "feel", brought: "bring", began: "begin", begun: "begin", kept: "keep",
  held: "hold", wrote: "write", written: "write", stood: "stand", heard: "hear",
  meant: "mean", met: "meet", ran: "run", paid: "pay", sat: "sit", spoke: "speak",
  spoken: "speak", lay: "lie", lain: "lie", led: "lead", grew: "grow", grown: "grow",
  lost: "lose", fell: "fall", fallen: "fall", sent: "send", built: "build",
  understood: "understand", drew: "draw", drawn: "draw", broke: "break", broken: "break",
  spent: "spend", rose: "rise", risen: "rise", drove: "drive", driven: "drive",
  bought: "buy", wore: "wear", worn: "wear", chose: "choose", chosen: "choose",
  sought: "seek", threw: "throw", thrown: "throw", caught: "catch", dealt: "deal",
  won: "win", forgot: "forget", forgotten: "forget", sold: "sell", fought: "fight",
  taught: "teach", ate: "eat", eaten: "eat", flew: "fly", flown: "fly", sang: "sing",
  sung: "sing", swam: "swim", swum: "swim", slept: "sleep", woke: "wake", woken: "wake",
  hid: "hide", hidden: "hide", shook: "shake", shaken: "shake", stole: "steal",
  stolen: "steal", froze: "freeze", frozen: "freeze", rode: "ride", ridden: "ride",
  bit: "bite", bitten: "bite", blew: "blow", blown: "blow", knew: "know", known: "know",
  said: "say", fed: "feed", born: "bear", shown: "show", laid: "lay", hung: "hang",
  shot: "shoot", struck: "strike", lit: "light", fled: "flee", bent: "bend", lent: "lend",
  dug: "dig", swept: "sweep", bred: "breed", sank: "sink", sunk: "sink", stuck: "stick",
  swung: "swing", tore: "tear", torn: "tear", wept: "weep", sped: "speed", fit: "fit",
  overslept: "oversleep", forgave: "forgive", forgiven: "forgive", hit: "hit",
  children: "child", men: "man", women: "woman", people: "person",
  feet: "foot", teeth: "tooth", mice: "mouse", better: "good", best: "good",
  worse: "bad", worst: "bad", further: "far", farther: "far",
};

const VOWELS = /[aeiou]/;

const normalize = (raw: string) => raw.toLowerCase().replace(/[’']s$/, "").replace(/[’']/g, "'");

// 規則では戻せない形（不規則な活用、短縮形）の元の語
function explicitLemmas(w: string): string[] {
  const out: string[] = [];
  // didn't → did → do、won't → will
  const negative = w.match(/^(.+)n't$/);
  const contracted = w.match(/^(.+)'(re|ve|ll|d|m|s)$/);
  const base = negative ? ({ wo: "will", ca: "can", sha: "shall" }[negative[1]] ?? negative[1]) : contracted?.[1];
  if (base) {
    out.push(base);
    if (IRREGULAR[base]) out.push(IRREGULAR[base]);
  }
  if (IRREGULAR[w]) out.push(IRREGULAR[w]);
  return out;
}

// 語形変化を戻した見出し語の候補（元の形を最優先）
export function lemmaCandidates(raw: string): string[] {
  const w = normalize(raw);
  const out = [w, ...explicitLemmas(w)];
  const add = (s: string) => s.length > 1 && out.push(s);
  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  if (w.endsWith("ied")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ed")) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    if (w.length > 4 && w.at(-3) === w.at(-4)) add(w.slice(0, -3));
  }
  if (w.endsWith("ing")) {
    const stem = w.slice(0, -3);
    add(stem);
    add(stem + "e");
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1));
    if (stem.endsWith("y")) add(stem.slice(0, -1) + "ie");
  }
  for (const suf of ["est", "er"]) {
    if (w.endsWith(suf) && VOWELS.test(w.slice(0, -suf.length))) {
      const stem = w.slice(0, -suf.length);
      add(stem);
      add(stem + "e");
      if (stem.endsWith("i")) add(stem.slice(0, -1) + "y");
      if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1));
    }
  }
  if (w.endsWith("ily")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ly")) add(w.slice(0, -2));
  return [...new Set(out)];
}

const ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2"];

// 元の形がリストにあればそれを使う。ただし不規則な活用・短縮形の元の語もあれば、低いほうを採る
// （found は「設立する」B2 ではなく find の過去形 A1。unlikely は likely に戻さず B1 のまま）
export function wordLevel(word: string): CefrLevel | undefined {
  const w = normalize(word);
  const direct = [w, ...explicitLemmas(w)].map((c) => LIST[c]).filter((l): l is CefrLevel => !!l);
  if (direct.length) return direct.reduce((a, b) => (ORDER.indexOf(b) < ORDER.indexOf(a) ? b : a));
  for (const c of lemmaCandidates(word)) {
    if (LIST[c]) return LIST[c];
  }
  return undefined;
}

export interface LevelProfile {
  tokens: number;
  A1: number;
  A2: number;
  B1: number;
  B2: number;
  unknown: number;
  // B2 とリスト外の割合（0〜1）
  aboveB1Rate: number;
  hardWords: string[];
}

// 本文の語彙構成。固有名詞（文頭以外の大文字始まり）、数字、Eメールのヘッダー行は数えない
export function profileText(text: string): LevelProfile {
  const body = text
    .split("\n")
    .filter((line) => !/^(From|To|Date|Subject):/.test(line.trim()))
    .join("\n");
  const profile: LevelProfile = { tokens: 0, A1: 0, A2: 0, B1: 0, B2: 0, unknown: 0, aboveB1Rate: 0, hardWords: [] };
  const hard = new Set<string>();
  const sentenceStart = /(^|[.!?]\s+|\n\s*|"\s*)$/;
  for (const m of body.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
    const token = m[0].replace(/[’']$/, "");
    const before = body.slice(Math.max(0, m.index - 3), m.index);
    const isProper = /^[A-Z]/.test(token) && !sentenceStart.test(before) && token !== "I";
    if (isProper) continue;
    const parts = token.includes("-") ? token.split("-").filter(Boolean) : [token];
    for (const part of parts) {
      profile.tokens++;
      const level = wordLevel(part);
      if (level) profile[level]++;
      else profile.unknown++;
      if (!level || level === "B2") hard.add(part.toLowerCase());
    }
  }
  profile.aboveB1Rate = profile.tokens === 0 ? 0 : (profile.B2 + profile.unknown) / profile.tokens;
  profile.hardWords = [...hard].slice(0, 20);
  return profile;
}
