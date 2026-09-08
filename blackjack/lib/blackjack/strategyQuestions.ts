import { Card, RANKS, SUITS } from "./types";
import type { Action } from "./types";

/**
 * Hand generation for basic-strategy questions.
 *
 * Lifted out of the drill component so the drill and the test-out exam ask the
 * same questions from one definition, and so the generation is reachable by the
 * unit suite — vitest only collects `lib/**` and `scripts/**`.
 */
export type StrategyCategory = "Hard totals" | "Soft totals" | "Pairs" | "Surrender";

export const STRATEGY_CATEGORIES: readonly StrategyCategory[] = [
  "Hard totals",
  "Soft totals",
  "Pairs",
  "Surrender",
];

/** Two-card hard totals worth drilling: no pairs, no aces, spread across the chart. */
const STRATEGY_HARD_HANDS: Array<[Card["rank"], Card["rank"]]> = [
  ["2", "3"],
  ["3", "4"],
  ["4", "5"],
  ["4", "6"],
  ["5", "6"],
  ["5", "7"],
  ["6", "7"],
  ["6", "8"],
  ["7", "8"],
  ["6", "10"],
  ["7", "10"],
  ["8", "10"],
  ["9", "10"],
  ["10", "K"],
];

const pick = <T,>(items: readonly T[], rng: () => number): T => items[Math.floor(rng() * items.length)];

export const randomCard = (rng: () => number = Math.random): Card => ({
  rank: pick(RANKS, rng),
  suit: pick(SUITS, rng),
});

/**
 * Hands worth asking a surrender question about: every total and pair a
 * published rule gives up somewhere, plus the neighbours it does not, so the
 * answer is not "yes" every time.
 *
 * Wider than the two hands this used to deal. A drill that only ever showed
 * 10,6 and 10,5 never asked about the fourteens, 7,7 or 8,8, all of which are
 * live surrenders under early surrender against a ten.
 */
const STRATEGY_SURRENDER_HANDS: Array<[Card["rank"], Card["rank"]]> = [
  ["10", "7"],
  ["10", "6"],
  ["9", "7"],
  ["10", "5"],
  ["9", "6"],
  ["10", "4"],
  ["9", "5"],
  ["10", "3"],
  ["10", "2"],
  ["8", "8"],
  ["7", "7"],
];

export interface StrategyQuestion {
  player: Card[];
  dealer: Card;
  /**
   * The slice of the chart the hand was drawn for.
   *
   * Reported rather than inferred from the answer. With surrender asked as its
   * own question the play decision is never `R`, so `strategyCategoryOf` can no
   * longer recognise a surrender hand from the action it produces.
   */
  category: StrategyCategory;
}

/**
 * A random two-card decision. Without a preferred category the draw is over
 * pairs, soft totals, and hard totals — surrender hands are only dealt when
 * asked for, because they are a narrow slice of the chart and would otherwise
 * dominate a short set.
 */
export function randomStrategyQuestion(
  preferred?: StrategyCategory,
  rng: () => number = Math.random,
): StrategyQuestion {
  const category = preferred ?? pick(["Pairs", "Soft totals", "Hard totals"] as StrategyCategory[], rng);
  let player: Card[];
  if (category === "Surrender") {
    const [first, second] = pick(STRATEGY_SURRENDER_HANDS, rng);
    player = [
      { rank: first, suit: "spades" },
      { rank: second, suit: "hearts" },
    ];
  } else if (category === "Pairs") {
    const rank = pick(RANKS, rng);
    player = [
      { rank, suit: "spades" },
      { rank, suit: "hearts" },
    ];
  } else if (category === "Soft totals") {
    const rank = pick(["2", "3", "4", "5", "6", "7", "8", "9"] as Card["rank"][], rng);
    player = [
      { rank: "A", suit: "spades" },
      { rank, suit: "hearts" },
    ];
  } else {
    const [first, second] = pick(STRATEGY_HARD_HANDS, rng);
    player = [
      { rank: first, suit: "spades" },
      { rank: second, suit: "hearts" },
    ];
  }
  // Surrender is only ever on the table against a high upcard, and the 8 is
  // included because 16 v 8 carries an index the drill should ask about.
  const dealer = category === "Surrender"
    ? { rank: pick(["8", "9", "10", "A"] as Card["rank"][], rng), suit: "diamonds" as const }
    : randomCard(rng);
  return { player, dealer, category };
}

/**
 * Which part of the chart a question belongs to, for per-category scoring.
 * Surrender wins over the shape of the hand: a 10,6 that the rules let you
 * surrender is a surrender question, not a hard-total one.
 */
export function strategyCategoryOf(player: Card[], action: Action): StrategyCategory {
  if (action === "R") return "Surrender";
  if (player[0].rank === player[1].rank) return "Pairs";
  return player.some((card) => card.rank === "A") ? "Soft totals" : "Hard totals";
}
