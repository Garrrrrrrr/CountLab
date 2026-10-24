import { describe, expect, it } from "vitest";
import { roundDeckEstimate } from "./countingTraining";
import { trueCount } from "./hiLo";
import {
  BET_SPREAD_PRESETS,
  betUnitsAt,
  emptyFullShoeScore,
  gradeFullShoeDecision,
  roundCountRange,
  summarizeFullShoeSession,
  summarizeHandGrades,
  type BetRamp,
  type FullShoeLiveRound,
} from "./fullShoeSession";

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

  it("grades betting, basic strategy, deviations and both count checks separately", () => {
    let score = emptyFullShoeScore();
    score = gradeFullShoeDecision(score, "Betting", true);
    score = gradeFullShoeDecision(score, "Basic Strategy", false);
    score = gradeFullShoeDecision(score, "Deviations", true);
    score = gradeFullShoeDecision(score, "Running count", true);
    score = gradeFullShoeDecision(score, "True count", false);
    expect(score.categories).toEqual({
      Betting: { correct: 1, total: 1 },
      "Basic Strategy": { correct: 0, total: 1 },
      Deviations: { correct: 1, total: 1 },
      "Running count": { correct: 1, total: 1 },
      "True count": { correct: 0, total: 1 },
    });
    expect(score).toMatchObject({ correct: 3, total: 5, bestStreak: 2, streak: 0 });
    expect(summarizeFullShoeSession(score, [], 12_000, -25)).toMatchObject({
      accuracy: 60,
      decisions: 5,
      handsPlayed: 0,
      durationMs: 12_000,
      netResult: -25,
      categories: { Betting: { accuracy: 100 }, "Basic Strategy": { accuracy: 0 }, Deviations: { accuracy: 100 }, "Running count": { accuracy: 100 }, "True count": { accuracy: 0 } },
    });
  });

  it("summarizes hand grades and count ranges from round records", () => {
    const decision = (ok: boolean, trueCount = 0) => ({ category: "Basic Strategy" as const, chosen: "H", correct: "H", ok, explanation: "", trueCount });
    const round = (overrides: Partial<FullShoeLiveRound>): FullShoeLiveRound => ({
      round: 1, dealerCards: [], playerHands: [], bet: 10, runningCountBefore: 0, trueCountBefore: 0, netResult: 0, decisions: [], ...overrides,
    });
    expect(summarizeHandGrades([round({ decisions: [decision(true), decision(false), decision(false)] })])).toEqual([{ index: 0, roundInShoe: 1, graded: 3, errors: 2 }]);
    expect(summarizeHandGrades([round({ round: 5 }), round({ round: 12, decisions: [decision(true)] })])).toEqual([
      { index: 0, roundInShoe: 5, graded: 0, errors: 0 },
      { index: 1, roundInShoe: 12, graded: 1, errors: 0 },
    ]);
    expect(summarizeHandGrades([])).toEqual([]);
    expect(roundCountRange(round({ trueCountBefore: 1, decisions: [decision(true, 3), decision(true, -1)] }))).toEqual({ min: -1, max: 3 });
  });
});
