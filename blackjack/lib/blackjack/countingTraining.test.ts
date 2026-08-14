import { describe, expect, it } from "vitest";
import {
  classifyCountError,
  countingMastery,
  expectedBet,
  makeCountSequence,
  makeTrueCountScenario,
  roundDeckEstimate,
  simulateRound,
} from "./countingTraining";
import { runningCount } from "./hiLo";
import { BlackjackShoe } from "./shoe";
import { DEFAULT_RULES } from "./types";
import { Session } from "../statistics/storage";

describe("counting training scenarios", () => {
  it("keeps complete shoes composition correct when biasing the order", () => {
    for (const bias of ["positive", "negative"] as const) {
      const cards = makeCountSequence(2, 104, bias);
      expect(cards).toHaveLength(104);
      expect(runningCount(cards)).toBe(0);
    }
  });

  it("creates true-count questions from a partially dealt shoe", () => {
    const scenario = makeTrueCountScenario({ decks: 6, resolution: 0.5, rounding: "floor", focus: "negative" });
    expect(scenario.runningCount).toBeLessThan(0);
    expect(scenario.cardsDealt).toBeGreaterThan(0);
    expect(scenario.estimatedDecksRemaining * 2).toBe(Math.round(scenario.estimatedDecksRemaining * 2));
  });

  it("rounds tray estimates at the selected visual resolution", () => {
    expect(roundDeckEstimate(3.74, 0.5)).toBe(3.5);
    expect(roundDeckEstimate(0.12, 0.25)).toBe(0.25);
  });

  it("deals and resolves a complete multi-player round", () => {
    const shoe = new BlackjackShoe(6), before = shoe.cardsRemaining();
    const round = simulateRound(shoe, 4, DEFAULT_RULES, 2);
    expect(round.heroInitial).toHaveLength(2);
    expect(round.dealerHand.length).toBeGreaterThanOrEqual(2);
    expect(round.playerHands.length).toBeGreaterThanOrEqual(4);
    expect(round.exposedCards).toHaveLength(before - shoe.cardsRemaining());
  });

  it("supports a zero bet while back-counting negative shoes", () => {
    expect(expectedBet(-2, 25, "1-8", true)).toBe(0);
    expect(expectedBet(3, 25, "1-8", true)).toBe(150);
  });

  it("labels cancellation and interruption errors", () => {
    const cancellingPair = makeCountSequence(1, 52).sort((a, b) => runningCount([a, b]));
    const low = cancellingPair.find((card) => runningCount([card]) === 1)!;
    const high = cancellingPair.find((card) => runningCount([card]) === -1)!;
    expect(classifyCountError({ expected: 0, actual: 1, cards: [low, high] })).toBe("missed cancellation");
    expect(classifyCountError({ expected: 2, actual: 1, interrupted: true })).toBe("interruption recovery");
  });

  it("turns stored performance into actionable mastery checks", () => {
    const base = { id: "x", questions: 10, correct: 10, accuracy: 100, averageResponseTime: 100, bestStreak: 10, date: new Date().toISOString(), mistakes: [] };
    const sessions: Session[] = [
      { ...base, id: "1", drill: "Running Count", metrics: { perfectDeck: true, elapsedSeconds: 29 } },
      { ...base, id: "2", drill: "True Count" },
      { ...base, id: "3", drill: "Deck Estimation", metrics: { meanAbsoluteDeckError: 0.2 } },
      { ...base, id: "4", drill: "Full Shoe" },
    ];
    expect(countingMastery(sessions).score).toBe(100);
  });
});
