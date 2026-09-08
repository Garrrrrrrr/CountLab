import { describe, expect, it } from "vitest";
import { adaptLiveRoundsToSimulatedShoe, emptyFullShoeScore, gradeFullShoeDecision, playingDecisionCategory, summarizeFullShoeSession } from "./fullShoeSession";

describe("full shoe session", () => {
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
});
