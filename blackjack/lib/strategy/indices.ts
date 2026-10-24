/**
 * Shared vocabulary for count-based plays. The numbers themselves are Stanford
 * Wong's, transcribed in `wong.ts`; this file only names their shapes.
 */
import type { Action } from "@/lib/blackjack/types";
import { WONG_SOURCE, type WongSource } from "./wong";

export type Dealer = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "A";
export const DEALERS: readonly Dealer[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

/** Which of Wong's tables a number comes from. */
export type IndexSource = WongSource;
export const SOURCE_NAME: Record<IndexSource, string> = WONG_SOURCE;

/**
 * A count-based change to a hit, stand, double or split decision: play
 * `play` at `at` or higher (`up`), or at `at` or lower (`down`).
 */
export interface PlayIndex {
  /** "16" hard total, "A,7" soft hand, "T,T" pair. */
  hand: string;
  dealer: Dealer;
  play: Exclude<Action, "R">;
  dir: "up" | "down";
  at: number;
  source: IndexSource;
}
