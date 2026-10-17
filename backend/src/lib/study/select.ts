import type { Item } from "../../../../shared/types";
import type { QuestionState } from "./srs";

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 出題する問題を選ぶ。優先順:
// 1. 2周目以降: 前の周までに間違え、今の周ではまだ解いていない設問を含む問題
// 2. まだ一度も解いていない問題
// 3. 最後に解いてから最も日が経った問題
export function selectItems(params: {
  items: Item[];
  states: Map<string, QuestionState>;
  cycle: number;
  count: number;
  exclude?: Set<string>;
  random?: () => number;
}): Item[] {
  const { items, states, cycle, count, exclude = new Set(), random = Math.random } = params;
  const weak: Item[] = [];
  const fresh: Item[] = [];
  const seen: { item: Item; last: string }[] = [];

  for (const item of items) {
    if (exclude.has(item.id)) continue;
    const qs = item.questions.map((q) => states.get(q.id)).filter((s): s is QuestionState => !!s);
    if (qs.length === 0) {
      fresh.push(item);
      continue;
    }
    const isWeak = cycle >= 2 && qs.some((s) => s.wrongCycles.some((c) => c < cycle) && s.lastCycle < cycle);
    if (isWeak) weak.push(item);
    else seen.push({ item, last: qs.map((s) => s.lastAnsweredAt).sort().at(-1)! });
  }

  const ordered = [
    ...shuffle(weak, random),
    ...shuffle(fresh, random),
    ...seen.sort((a, b) => a.last.localeCompare(b.last)).map((s) => s.item),
  ];
  return ordered.slice(0, count);
}
