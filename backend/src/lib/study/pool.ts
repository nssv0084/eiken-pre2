import type { Slot } from "../../../../shared/curriculum";
import type { Item } from "../../../../shared/types";

// 枠に合う問題だけを残す。ジャンルのない枠（短い会話など）には、長い会話を出さない
export const poolForSlot = (items: Item[], slot: Slot): Item[] =>
  items.filter((i) => (slot.genre ? i.genre === slot.genre : i.genre !== "dialogue"));
