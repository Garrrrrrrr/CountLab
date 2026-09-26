import { describe, expect, it } from "vitest";
import {
  BENCHMARK_MIN_QUESTIONS,
  classifyCountError,
  countingBenchmarkDetails,
  countingCategoryLabel,
  countingMastery,
  isPerfectDeck,
  lastDeckAccuracyFromCategories,
  rightForOwnEstimate,
  runningCountCause,
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
      // One random card is burned so a full-shoe session doesn't always resolve to a running count of 0.
      expect(cards).toHaveLength(103);
      expect(Math.abs(runningCount(cards))).toBeLessThanOrEqual(1);
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

  it("counts a one-deck shoe (51 cards after the burn) as a perfect deck", () => {
    expect(isPerfectDeck({ cardsLength: 51, seen: 51, correct: 1, checks: 1 })).toBe(true);
    expect(isPerfectDeck({ cardsLength: 20, seen: 20, correct: 4, checks: 4 })).toBe(false);
    expect(isPerfectDeck({ cardsLength: 51, seen: 40, correct: 1, checks: 1 })).toBe(false);
    expect(isPerfectDeck({ cardsLength: 51, seen: 51, correct: 0, checks: 1 })).toBe(false);
    expect(isPerfectDeck({ cardsLength: 51, seen: 51, correct: 0, checks: 0 })).toBe(false);
    const deck = makeCountSequence(1, 52);
    expect(deck).toHaveLength(51);
    expect(isPerfectDeck({ cardsLength: deck.length, seen: deck.length, correct: 1, checks: 1 })).toBe(true);
  });

  it("computes last-deck accuracy from the ', last deck' tallies only", () => {
    expect(lastDeckAccuracyFromCategories({ "0.5-deck": { correct: 0, total: 5 }, "0.5-deck, last deck": { correct: 1, total: 2 }, "0.25-deck, last deck": { correct: 2, total: 2 } })).toBe(75);
    expect(lastDeckAccuracyFromCategories({ "0.5-deck": { correct: 3, total: 5 } })).toBe(0);
    expect(lastDeckAccuracyFromCategories(undefined)).toBe(0);
  });

  it("names category tallies in plain words and passes other drills' keys through", () => {
    expect(countingCategoryLabel("1-card groups, negative")).toBe("One at a time · negative counts");
    expect(countingCategoryLabel("random-card groups, zero")).toBe("Random groups · zero counts");
    expect(countingCategoryLabel("negative, 0.5-deck divisor")).toBe("Negative counts · half-deck divisor");
    expect(countingCategoryLabel("0.5-deck, last deck")).toBe("Half-deck precision · last deck");
    expect(countingCategoryLabel("0.25-deck")).toBe("Quarter-deck precision");
    expect(countingCategoryLabel("positive")).toBe("Positive counts");
    expect(countingCategoryLabel("Hard totals")).toBe("Hard totals");
  });

  it("names a running-count cause only on strong evidence", () => {
    expect(runningCountCause("interruption recovery", 3)).toBe("Lost the count after the interruption");
    expect(runningCountCause("zero crossing", 1)).toBe("Crossing zero");
    expect(runningCountCause("missed cancellation", 2)).toBe("Missed a cancellation");
    expect(runningCountCause("negative arithmetic", -3)).toBe("Adding negatives");
    expect(runningCountCause("negative arithmetic", 4)).toBeUndefined();
    expect(runningCountCause(undefined, 4)).toBeUndefined();
  });

  it("tells a wrong deck estimate apart from a wrong division", () => {
    expect(rightForOwnEstimate({ runningCount: 6, decksAnswer: 3, trueCountAnswer: 2, rounding: "floor" })).toBe(true);
    expect(rightForOwnEstimate({ runningCount: 6, decksAnswer: 3, trueCountAnswer: 1, rounding: "floor" })).toBe(false);
    expect(rightForOwnEstimate({ runningCount: 6, decksAnswer: Number.NaN, trueCountAnswer: 2, rounding: "floor" })).toBe(false);
  });
});

describe("counting benchmark", () => {
  const base = { questions: 10, correct: 10, accuracy: 100, averageResponseTime: 100, bestStreak: 10, date: new Date().toISOString(), mistakes: [] };

  it("judges each target on the latest qualifying session, so warm-ups never remove a met target", () => {
    const sessions: Session[] = [
      { ...base, id: "warmup", drill: "Running Count", questions: 4, correct: 3, accuracy: 75, metrics: { cardsSeen: 20, elapsedSeconds: 40, perfectDeck: false } },
      { ...base, id: "deck", drill: "Running Count", questions: 1, correct: 1, metrics: { cardsSeen: 51, elapsedSeconds: 28.5, perfectDeck: true, averageAnswerLatency: 3000 } },
      { ...base, id: "short-tc", drill: "True Count", questions: 1, correct: 1, accuracy: 100 },
      { ...base, id: "tc", drill: "True Count", correct: 8, accuracy: 80 },
    ];
    const mastery = countingMastery(sessions);
    expect(mastery.checks[0].met).toBe(true);
    expect(mastery.checks[1].met).toBe(false);
    const [running, tc, deck, shoe] = countingBenchmarkDetails(sessions);
    expect(running.latest).toBe("28.5 s (25.5 s dealing + 3.0 s answering) · perfect");
    expect(running.note).toMatch(/full-deck/);
    expect(tc.latest).toBe("80% (target 95%)");
    expect(tc.progress).toBeCloseTo(80 / 95);
    expect(tc.note).toMatch(new RegExp(`under ${BENCHMARK_MIN_QUESTIONS} questions`));
    expect(deck.latest).toBe("No 10-photo session yet");
    expect(deck.progress).toBeUndefined();
    expect(deck.practiceHref).toContain("focus=0.25-deck");
    expect(shoe.latest).toBe("Not tried yet");
  });

  it("does not let a one-question session meet the 95% target", () => {
    const sessions: Session[] = [{ ...base, id: "one", drill: "True Count", questions: 1, correct: 1, accuracy: 100 }];
    expect(countingMastery(sessions).checks[1].met).toBe(false);
  });

  it("credits perfect one-deck runs saved before 51-card decks counted", () => {
    const sessions: Session[] = [{ ...base, id: "legacy", drill: "Running Count", questions: 1, correct: 1, metrics: { cardsSeen: 51, elapsedSeconds: 27, perfectDeck: false } }];
    expect(countingMastery(sessions).checks[0].met).toBe(true);
    const [running] = countingBenchmarkDetails([{ ...sessions[0], correct: 0, accuracy: 0 }]);
    expect(running.met).toBe(false);
    expect(running.latest).toBe("27.0 s · 1 missed check");
  });

  it("shows the deck-estimation error as progress toward 0.25", () => {
    const sessions: Session[] = [{ ...base, id: "de", drill: "Deck Estimation", metrics: { meanAbsoluteDeckError: 0.5 } }];
    const [, , deck] = countingBenchmarkDetails(sessions);
    expect(deck.latest).toBe("0.50 decks off on average (target 0.25 or less)");
    expect(deck.progress).toBeCloseTo(0.5);
    expect(deck.met).toBe(false);
  });
});
