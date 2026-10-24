/** Shared fixtures for the strategy-drill tests: every rule combination the settings can produce, and a seeded RNG. */
import { DEFAULT_TABLE_RULES, type TableRules } from "@/lib/strategy";

export const ALL_RULES: TableRules[] = [1, 2, 6].flatMap((decks) => [true, false].flatMap((hitSoft17) => [true, false].flatMap((das) =>
  (["none", "late", "early"] as const).map((surrender) => ({ ...DEFAULT_TABLE_RULES, decks, hitSoft17, das, surrender })))));

/** mulberry32: deterministic, so a failing draw can be replayed. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const label = (rules: TableRules) => `${rules.decks}D ${rules.hitSoft17 ? "H17" : "S17"} ${rules.das ? "DAS" : "NDAS"} ${rules.surrender}`;
