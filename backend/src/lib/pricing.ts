// 100万トークンあたりの米ドル（Claude API の通常料金、2026-10 時点）
interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
};

// 一覧にないモデル（フォールバック先など）は、多めに見積もるため高い方の単価で計算する
const FALLBACK_PRICE: Price = { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 };

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costUsd(model: string, usage: TokenUsage): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1_000_000
  );
}

// 生成画面の見積もり用（1出題単位あたり、生成と検証の合計の目安）
export const ESTIMATED_USD_PER_ITEM = {
  vocab: 0.02,
  conversation: 0.025,
  cloze: 0.08,
  reading: 0.12,
} as const;
