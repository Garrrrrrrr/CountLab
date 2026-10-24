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
  divisionText,
  estimateBias,
  gradeDeckEstimate,
  gradeTrueCount,
  makeCountSequence,
  makeTableRounds,
  makeTrueCountScenario,
  mistakeCauses,
  roundDeckEstimate,
  roundStarts,
  simulateRound,
  tableRoundCards,
  tableRoundLayout,
} from "./countingTraining";
import { runningCount } from "./hiLo";
import { BlackjackShoe } from "./shoe";
import { DEFAULT_RULES } from "./types";
import type { Mistake, Session } from "../statistics/storage";

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

  it("links each target to the new drill routes", () => {
    for (const detail of countingBenchmarkDetails([])) {
      expect(detail.href).toMatch(/^\/train\//);
      expect(detail.practiceHref).toMatch(/^\/train\//);
    }
  });
});

/** A small seeded generator so table and photo tests are repeatable. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (card: { rank: string; suit: string }) => `${card.rank}${card.suit}`;

describe("table rounds for the running count", () => {
  it("lays out every card of a played round once, the hole card after the players' cards", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const shoe = new BlackjackShoe(6, seeded(seed));
      const round = simulateRound(shoe, 5, DEFAULT_RULES, 0);
      expect(round.seats).toHaveLength(5);
      expect(round.seats.flat()).toEqual(round.playerHands);
      const layout = tableRoundLayout(round);
      const shown = tableRoundCards(layout);
      expect(layout.size).toBe(round.exposedCards.length);
      expect(shown.map(key).sort()).toEqual(round.exposedCards.map(key).sort());
      const ats = [...layout.dealer, ...layout.seats.flat(2)].map((entry) => entry.at).sort((a, b) => a - b);
      expect(ats).toEqual(ats.map((_, index) => index));
      const hole = layout.dealer[1];
      expect(hole.downFrom).toBe(2 * 5 + 1);
      const playerAts = layout.seats.flat(2).map((entry) => entry.at);
      expect(Math.max(...playerAts)).toBeLessThan(hole.at);
      expect(layout.dealer[0].at).toBe(5);
    }
  });

  it("keeps a split pair as two hands of the same spot", () => {
    const split = tableRoundLayout({
      seats: [[[{ rank: "8", suit: "spades" }, { rank: "3", suit: "clubs" }, { rank: "10", suit: "hearts" }], [{ rank: "8", suit: "hearts" }, { rank: "9", suit: "clubs" }]]],
      dealerHand: [{ rank: "6", suit: "spades" }, { rank: "10", suit: "spades" }, { rank: "5", suit: "spades" }],
    });
    expect(split.seats[0].map((hand) => hand.map((entry) => entry.at))).toEqual([[0, 3, 4], [2, 5]]);
    expect(split.dealer.map((entry) => entry.at)).toEqual([1, 6, 7]);
    expect(split.dealer[1].downFrom).toBe(3);
    expect(split.size).toBe(8);
  });

  it("deals rounds until the session's cards are shown, and the card list sums to the shoe's count", () => {
    const { rounds, cards } = makeTableRounds({ decks: 6, amount: 156, spots: 3, rules: DEFAULT_RULES, rng: seeded(7) });
    expect(cards.length).toBeGreaterThanOrEqual(156);
    expect(cards.length).toBeLessThan(156 + 40);
    expect(rounds.reduce((sum, round) => sum + round.size, 0)).toBe(cards.length);
    const starts = roundStarts(rounds);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(rounds[0].size);
    expect(rounds.flatMap(tableRoundCards).map(key)).toEqual(cards.map(key));
  });

  it("never runs a small shoe dry mid-round", () => {
    const { rounds, cards } = makeTableRounds({ decks: 1, amount: 500, spots: 7, rules: DEFAULT_RULES, rng: seeded(3) });
    expect(cards.length).toBeLessThanOrEqual(51);
    for (const round of rounds) expect(round.dealer.length).toBeGreaterThanOrEqual(2);
  });
});

describe("true count from a tray photo", () => {
  it("uses the photo's depth for the decks left", () => {
    const scenario = makeTrueCountScenario({ decks: 6, resolution: 0.5, rounding: "floor", discarded: 3.65, rng: seeded(11) });
    expect(scenario.exactDecksRemaining).toBe(2.35);
    expect(scenario.estimatedDecksRemaining).toBe(2.5);
    expect(scenario.cardsDealt).toBe(190);
  });

  it("still honours the count focus", () => {
    const scenario = makeTrueCountScenario({ decks: 6, resolution: 0.5, rounding: "floor", discarded: 2, focus: "positive", rng: seeded(5) });
    expect(scenario.runningCount).toBeGreaterThan(0);
  });

  it("grades the decks and the true count, and spots a sound division of a wrong estimate", () => {
    const question = { runningCount: 7, estimatedDecksRemaining: 2.5, answer: 2 };
    expect(gradeTrueCount({ question, mode: "combined", tcText: "2", deckText: "2.5", rounding: "floor" })).toMatchObject({ ok: true, category: undefined });
    const ownEstimate = gradeTrueCount({ question, mode: "combined", tcText: "3", deckText: "2", rounding: "floor" });
    expect(ownEstimate).toMatchObject({ ok: false, deckOk: false, tcOk: false, ownEstimate: true, category: "deck estimate" });
    const sameAnyway = gradeTrueCount({ question, mode: "combined", tcText: "2", deckText: "3", rounding: "floor" });
    expect(sameAnyway).toMatchObject({ ok: false, tcOk: true, ownEstimate: true });
    expect(gradeTrueCount({ question, mode: "division", tcText: "2", deckText: "", rounding: "floor" }).ok).toBe(true);
    // +7 ÷ 2.5 = 2.8: saying 3 rounded the wrong way, saying 5 divided wrong.
    expect(gradeTrueCount({ question, mode: "division", tcText: "3", deckText: "", rounding: "floor" }).category).toBe("true-count rounding");
    expect(gradeTrueCount({ question, mode: "division", tcText: "5", deckText: "", rounding: "floor" }).category).toBe("true-count division");
    expect(gradeTrueCount({ question, mode: "combined", tcText: "", deckText: "", rounding: "floor" })).toMatchObject({ ok: false, tc: null, deck: null, ownEstimate: false });
  });

  it("writes the division out with real minus signs", () => {
    expect(divisionText(7, 2.5)).toBe("+7 ÷ 2.5 = 2.80");
    expect(divisionText(-3, 2)).toBe("−3 ÷ 2 = −1.50");
  });
});

describe("deck estimation grading", () => {
  it("grades against the rounded tray and measures the error from the exact depth", () => {
    expect(gradeDeckEstimate({ remaining: 2.35, resolution: 0.5, value: 2.5, decks: 6 })).toEqual({ expected: 2.5, ok: true, error: 0.15, signedError: 0.15 });
    expect(gradeDeckEstimate({ remaining: 2.35, resolution: 1, value: 3, decks: 6 })).toEqual({ expected: 2, ok: false, error: 0.65, signedError: 0.65 });
    expect(gradeDeckEstimate({ remaining: 2.35, resolution: 0.25, value: null, decks: 6 })).toEqual({ expected: 2.25, ok: false, error: 6, signedError: null });
  });

  it("reads a lean in the estimates", () => {
    expect(estimateBias([0.5, 0.3, -0.1])).toEqual({ mean: 0.23, direction: "over" });
    expect(estimateBias([-0.5, -0.25])).toEqual({ mean: -0.38, direction: "under" });
    expect(estimateBias([0.05, -0.05])).toEqual({ mean: 0, direction: "even" });
    expect(estimateBias([])).toEqual({ mean: 0, direction: "even" });
  });
});

describe("mistake causes", () => {
  it("tallies the confident causes, most common first, with a tip", () => {
    const miss = (category: Mistake["category"], correctAnswer = "3") => ({ question: "q", userAnswer: "1", correctAnswer, explanation: "", category });
    const causes = mistakeCauses([miss("missed cancellation"), miss("zero crossing"), miss("missed cancellation"), miss("negative arithmetic", "4"), miss("negative arithmetic", "-2")]);
    expect(causes.map((cause) => [cause.category, cause.count])).toEqual([["missed cancellation", 2], ["zero crossing", 1], ["negative arithmetic", 1]]);
    expect(causes[0].label).toBe("Missed a cancellation");
    expect(causes[0].tip).toMatch(/Pair/);
  });

  it("names table-round tallies", () => {
    expect(countingCategoryLabel("table rounds, negative")).toBe("Table rounds · negative counts");
  });
});
