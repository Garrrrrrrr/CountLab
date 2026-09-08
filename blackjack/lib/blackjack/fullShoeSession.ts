import type { SimulatedDecision, SimulatedHand, SimulatedPlayerHand, SimulatedShoe } from "./shoeSimulation";
import type { Action, Card } from "./types";

export type FullShoeMode = "coached" | "checkout";
export type FullShoeGradingCategory = SimulatedDecision["category"];
export type FullShoeDecision = SimulatedDecision;
export type BetSpreadPreset = "flat" | "1-8" | "1-12" | "custom";
export type PositiveTrueCount = 1 | 2 | 3 | 4 | 5 | 6;
export type BetRamp = Record<PositiveTrueCount, number>;

export const POSITIVE_TRUE_COUNTS = [1, 2, 3, 4, 5, 6] as const;

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

export interface FullShoeLivePlayerHand {
  cards: Card[];
  bet: number;
  net: number;
  surrendered: boolean;
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
}

export interface FullShoeScore {
  correct: number;
  total: number;
  streak: number;
  bestStreak: number;
  categories: Record<FullShoeGradingCategory, { correct: number; total: number }>;
}

export interface FullShoeReport {
  accuracy: number;
  decisions: number;
  handsPlayed: number;
  durationMs: number;
  netResult: number;
  categories: Record<FullShoeGradingCategory, { correct: number; total: number; accuracy: number }>;
}

const accuracy = (correct: number, total: number) => total ? Math.round((correct / total) * 100) : 0;

export const emptyFullShoeScore = (): FullShoeScore => ({
  correct: 0,
  total: 0,
  streak: 0,
  bestStreak: 0,
  categories: {
    Betting: { correct: 0, total: 0 },
    "Basic Strategy": { correct: 0, total: 0 },
    Deviations: { correct: 0, total: 0 },
  },
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

export const playingDecisionCategory = (basicAction: Action, correctAction: Action): FullShoeGradingCategory =>
  basicAction === correctAction ? "Basic Strategy" : "Deviations";

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
  /** Index into shoe.hands — what HandReplayer's selected index uses. */
  index: number;
  roundInShoe: number;
  /** Decisions graded for this hand. 0 means the hand was never graded. */
  graded: number;
  /** How many of those decisions were wrong. */
  errors: number;
}

export function summarizeHandGrades(hands: readonly SimulatedHand[]): HandGrade[] {
  return hands.map((hand, index) => {
    const decisions = hand.decisions ?? [];
    return {
      index,
      roundInShoe: hand.roundInShoe,
      graded: decisions.length,
      errors: decisions.filter((decision) => decision.ok === false).length,
    };
  });
}

export function adaptLiveRoundsToSimulatedShoe(rounds: readonly FullShoeLiveRound[]): SimulatedShoe {
  const hands: SimulatedHand[] = rounds.map((round, index) => {
    const counts = [round.trueCountBefore, ...round.decisions.map((decision) => decision.trueCount)];
    const playerHands: SimulatedPlayerHand[] = round.playerHands.map((hand) => ({
      cards: [...hand.cards],
      net: hand.net,
      surrendered: hand.surrendered,
      bet: hand.bet,
    }));
    return {
      shoeNumber: 1,
      handNumber: index + 1,
      roundInShoe: round.round,
      dealerCards: [...round.dealerCards],
      playerHands,
      bet: round.bet,
      runningCountBefore: round.runningCountBefore,
      trueCountBefore: round.trueCountBefore,
      tcMin: Math.min(...counts),
      tcMax: Math.max(...counts),
      netResult: round.netResult,
      decisions: round.decisions.map((decision) => ({ ...decision })),
    };
  });
  const allCounts = hands.flatMap((hand) => [hand.tcMin, hand.tcMax]);
  return {
    shoeNumber: 1,
    hands,
    totalHands: hands.length,
    totalProfit: hands.reduce((sum, hand) => sum + hand.netResult, 0),
    tcMin: allCounts.length ? Math.min(...allCounts) : 0,
    tcMax: allCounts.length ? Math.max(...allCounts) : 0,
  };
}
