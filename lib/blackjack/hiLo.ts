import { Card, Rank } from "./types";
export type TrueCountRounding = "floor" | "truncate" | "nearest";
export function hiLoValue(card: Card | Rank): number {
  const rank = typeof card === "string" ? card : card.rank;
  if (["2","3","4","5","6"].includes(rank)) return 1;
  if (["10","J","Q","K","A"].includes(rank)) return -1;
  return 0;
}
export const runningCount = (cards: Card[]) => cards.reduce((sum, card) => sum + hiLoValue(card), 0);
export function trueCount(rc: number, decksRemaining: number, rounding: TrueCountRounding = "floor") {
  if (decksRemaining <= 0) return rc;
  const value = rc / decksRemaining;
  if (rounding === "truncate") return Math.trunc(value);
  if (rounding === "nearest") return Math.round(value);
  return Math.floor(value);
}
export const signed = (n: number) => n > 0 ? `+${n}` : `${n}`;
