import { describe, expect, it } from "vitest";
import { roundDeckEstimate } from "./countingTraining";
import { trueCount } from "./hiLo";
import {
  adaptLiveRoundsToSimulatedShoe,
  BET_SPREAD_PRESETS,
  betUnitsAt,
  emptyFullShoeScore,
  gradeFullShoeDecision,
  playingDecisionCategory,
  summarizeFullShoeSession,
  summarizeHandGrades,
  type BetRamp,
} from "./fullShoeSession";
import type { SimulatedHand } from "./shoeSimulation";

describe("full shoe session", () => {
  it("never divides the true count by less than the selected deck precision", () => {
    expect(trueCount(2, roundDeckEstimate(0.12, 1), "floor")).toBe(2);
    expect(trueCount(2, roundDeckEstimate(0.12, 0.5), "floor")).toBe(4);
    expect(trueCount(2, roundDeckEstimate(0.12, 0.25), "floor")).toBe(8);
  });

  it("uses an editable positive-count ramp and caps TC +6 or higher", () => {
    const ramp: BetRamp = { 1: 1.5, 2: 3, 3: 5, 4: 7, 5: 9, 6: 12 };
    expect([-4, 0].map((count) => betUnitsAt(ramp, count))).toEqual([1, 1]);
    expect([1, 2, 3, 4, 5, 6].map((count) => betUnitsAt(ramp, count))).toEqual([1.5, 3, 5, 7, 9, 12]);
    expect(betUnitsAt(ramp, 9)).toBe(12);
  });

  it("keeps the existing spread presets as ramp shortcuts", () => {
    expect(BET_SPREAD_PRESETS.flat).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 });
    expect(BET_SPREAD_PRESETS["1-8"]).toEqual({ 1: 2, 2: 4, 3: 6, 4: 8, 5: 8, 6: 8 });
    expect(BET_SPREAD_PRESETS["1-12"]).toEqual({ 1: 2, 2: 4, 3: 8, 4: 12, 5: 12, 6: 12 });
  });

  it("reports zero accuracy when a session ends before any decisions", () => {
    expect(summarizeFullShoeSession(emptyFullShoeScore(), [], 500, 0)).toMatchObject({ accuracy: 0, decisions: 0 });
  });

  it("separates betting, basic strategy, and deviation grades", () => {
    let score = emptyFullShoeScore();
    score = gradeFullShoeDecision(score, "Betting", true);
    score = gradeFullShoeDecision(score, playingDecisionCategory("H", "H"), false);
    score = gradeFullShoeDecision(score, playingDecisionCategory("H", "S"), true);
    expect(score.categories).toEqual({
      Betting: { correct: 1, total: 1 },
      "Basic Strategy": { correct: 0, total: 1 },
      Deviations: { correct: 1, total: 1 },
    });
    expect(score).toMatchObject({ correct: 2, total: 3, bestStreak: 1 });
    expect(summarizeFullShoeSession(score, [], 12_000, -25)).toMatchObject({
      accuracy: 67,
      decisions: 3,
      handsPlayed: 0,
      durationMs: 12_000,
      netResult: -25,
      categories: { Betting: { accuracy: 100 }, "Basic Strategy": { accuracy: 0 }, Deviations: { accuracy: 100 } },
    });
  });

  it("adapts live rounds into the existing hand replayer shape with corrections", () => {
    const shoe = adaptLiveRoundsToSimulatedShoe([{
      round: 3,
      dealerCards: [{ rank: "10", suit: "spades" }, { rank: "7", suit: "hearts" }],
      playerHands: [{ cards: [{ rank: "A", suit: "clubs" }, { rank: "9", suit: "diamonds" }], bet: 20, net: 20, surrendered: false }],
      bet: 20,
      runningCountBefore: 4,
      trueCountBefore: 1,
      netResult: 20,
      decisions: [{ category: "Basic Strategy", chosen: "Hit", correct: "Stand", ok: false, explanation: "Stand on soft 20.", trueCount: 2 }],
    }]);
    expect(shoe).toMatchObject({ totalHands: 1, totalProfit: 20, tcMin: 1, tcMax: 2 });
    expect(shoe.hands[0]).toMatchObject({ roundInShoe: 3, runningCountBefore: 4, netResult: 20 });
    expect(shoe.hands[0].decisions?.[0]).toMatchObject({ chosen: "Hit", correct: "Stand", ok: false });
  });

  it("summarizes hand grades", () => {
    const decision = (ok: boolean) => ({ category: "Basic Strategy" as const, chosen: "H", correct: "H", ok, explanation: "", trueCount: 0 });
    const hand = (overrides: Partial<SimulatedHand>): SimulatedHand => ({
      shoeNumber: 1,
      handNumber: 1,
      roundInShoe: 1,
      dealerCards: [],
      playerHands: [],
      bet: 10,
      runningCountBefore: 0,
      trueCountBefore: 0,
      tcMin: 0,
      tcMax: 0,
      netResult: 0,
      ...overrides,
    });

    expect(summarizeHandGrades([hand({ decisions: [decision(true), decision(true)] })])).toEqual([
      { index: 0, roundInShoe: 1, graded: 2, errors: 0 },
    ]);

    expect(summarizeHandGrades([hand({ decisions: [decision(true), decision(false), decision(false)] })])).toEqual([
      { index: 0, roundInShoe: 1, graded: 3, errors: 2 },
    ]);

    expect(summarizeHandGrades([hand({ decisions: undefined }), hand({ decisions: [] })])).toEqual([
      { index: 0, roundInShoe: 1, graded: 0, errors: 0 },
      { index: 1, roundInShoe: 1, graded: 0, errors: 0 },
    ]);

    expect(summarizeHandGrades([])).toEqual([]);

    expect(summarizeHandGrades([
      hand({ roundInShoe: 5, decisions: [] }),
      hand({ roundInShoe: 12, decisions: [decision(true)] }),
    ])).toEqual([
      { index: 0, roundInShoe: 5, graded: 0, errors: 0 },
      { index: 1, roundInShoe: 12, graded: 1, errors: 0 },
    ]);
  });
});
