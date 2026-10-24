import type { Card } from "./types";

export type FullShoeMode = "coached" | "checkout";
/** The three categories every saved shoe has had since the first version. */
export type PlayGradingCategory = "Betting" | "Basic Strategy" | "Deviations";
/** Count checks, added with the remake. Shoes saved before it have none. */
export type CountGradingCategory = "Running count" | "True count";
export type FullShoeGradingCategory = PlayGradingCategory | CountGradingCategory;
export type BetSpreadPreset = "flat" | "1-8" | "1-12" | "custom";
export type PositiveTrueCount = 1 | 2 | 3 | 4 | 5 | 6;
export type BetRamp = Record<PositiveTrueCount, number>;

export const POSITIVE_TRUE_COUNTS = [1, 2, 3, 4, 5, 6] as const;
export const GRADING_CATEGORIES: readonly FullShoeGradingCategory[] = ["Betting", "Basic Strategy", "Deviations", "Running count", "True count"];

export const BET_SPREAD_PRESETS: Record<Exclude<BetSpreadPreset, "custom">, BetRamp> = {
  flat: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
  "1-8": { 1: 2, 2: 4, 3: 6, 4: 8, 5: 8, 6: 8 },
  "1-12": { 1: 2, 2: 4, 3: 8, 4: 12, 5: 12, 6: 12 },
};

export function betUnitsAt(ramp: BetRamp, trueCount: number): number {
  if (trueCount <= 0) return 1;
  const bucket = Math.min(6, Math.max(1, Math.floor(trueCount))) as PositiveTrueCount;
  return ramp[bucket];
}

/** One graded answer. The optional fields arrived with the remake and are absent on older saved shoes. */
export interface FullShoeDecision {
  category: FullShoeGradingCategory;
  chosen: string;
  correct: string;
  ok: boolean;
  explanation: string;
  trueCount: number;
  /** "Hard 16 vs a 10", "Bet before round 4", "Running count after round 7". */
  question?: string;
  cards?: Card[];
  upcard?: Card;
  runningCount?: number;
  /** Wrong at the real count, right at the count the player last reported. */
  credited?: boolean;
  seat?: number;
}

export interface FullShoeLivePlayerHand {
  cards: Card[];
  bet: number;
  net: number;
  surrendered: boolean;
  seat?: number;
  owner?: number;
  doubled?: boolean;
  fromSplit?: boolean;
  outcome?: string;
}

export interface FullShoeLiveRound {
  round: number;
  dealerCards: Card[];
  playerHands: FullShoeLivePlayerHand[];
  bet: number;
  runningCountBefore: number;
  trueCountBefore: number;
  netResult: number;
  decisions: FullShoeDecision[];
  insurance?: number;
  /** Cash after the round settled. */
  bankrollAfter?: number;
  /** Decks left in the shoe when the round was dealt. */
  decksBefore?: number;
}

export type CategoryTally = { correct: number; total: number };

export interface FullShoeScore {
  correct: number;
  total: number;
  streak: number;
  bestStreak: number;
  categories: Record<FullShoeGradingCategory, CategoryTally>;
}

export type CategoryReport = CategoryTally & { accuracy: number };

export interface FullShoeReport {
  accuracy: number;
  decisions: number;
  handsPlayed: number;
  durationMs: number;
  netResult: number;
  categories: Record<PlayGradingCategory, CategoryReport> & Partial<Record<CountGradingCategory, CategoryReport>>;
}

const accuracy = (correct: number, total: number) => total ? Math.round((correct / total) * 100) : 0;

export const emptyFullShoeScore = (): FullShoeScore => ({
  correct: 0,
  total: 0,
  streak: 0,
  bestStreak: 0,
  categories: Object.fromEntries(GRADING_CATEGORIES.map((category) => [category, { correct: 0, total: 0 }])) as FullShoeScore["categories"],
});

export function gradeFullShoeDecision(score: FullShoeScore, category: FullShoeGradingCategory, ok: boolean): FullShoeScore {
  const streak = ok ? score.streak + 1 : 0;
  return {
    correct: score.correct + Number(ok),
    total: score.total + 1,
    streak,
    bestStreak: Math.max(score.bestStreak, streak),
    categories: {
      ...score.categories,
      [category]: {
        correct: score.categories[category].correct + Number(ok),
        total: score.categories[category].total + 1,
      },
    },
  };
}

export function summarizeFullShoeSession(
  score: FullShoeScore,
  rounds: readonly FullShoeLiveRound[],
  durationMs: number,
  netResult: number,
): FullShoeReport {
  return {
    accuracy: accuracy(score.correct, score.total),
    decisions: score.total,
    handsPlayed: rounds.length,
    durationMs,
    netResult,
    categories: Object.fromEntries(Object.entries(score.categories).map(([category, result]) => [
      category,
      { ...result, accuracy: accuracy(result.correct, result.total) },
    ])) as FullShoeReport["categories"],
  };
}

export interface HandGrade {
  /** Index into the rounds list. */
  index: number;
  roundInShoe: number;
  /** Decisions graded for this round. 0 means the round was never graded. */
  graded: number;
  /** How many of those decisions were wrong. */
  errors: number;
}

export function summarizeHandGrades(rounds: readonly Pick<FullShoeLiveRound, "round" | "decisions">[]): HandGrade[] {
  return rounds.map((round, index) => {
    const decisions = round.decisions ?? [];
    return {
      index,
      roundInShoe: round.round,
      graded: decisions.length,
      errors: decisions.filter((decision) => decision.ok === false).length,
    };
  });
}

/** Lowest and highest true count a round saw, from its own records. */
export function roundCountRange(round: Pick<FullShoeLiveRound, "trueCountBefore" | "decisions">): { min: number; max: number } {
  const counts = [round.trueCountBefore, ...(round.decisions ?? []).map((decision) => decision.trueCount)];
  return { min: Math.min(...counts), max: Math.max(...counts) };
}
