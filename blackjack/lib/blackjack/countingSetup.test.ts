import { describe, expect, it } from "vitest";
import {
  checkpointsFor,
  dealOf,
  describeRunningSession,
  describeTrueCountSession,
  effectiveCardCount,
  fitCheckpoint,
  fitQuestionTarget,
  fitShoeSize,
  isCheckDue,
  isSettingsPreset,
  nextCheckText,
  randomCheckGap,
  spotsOf,
  estimateRunningSeconds,
  formatApproxDuration,
  formatInterval,
  matchRunningPreset,
  matchTrueCountPreset,
  normalizeRunningFocus,
  normalizeTrueCountFocus,
  parseDeckResolutionFocus,
  RUNNING_SESSION_CARDS,
  RUNNING_STARTER,
  runningCardMeta,
  runningPresetValues,
  SELF_PACED,
  TRUE_COUNT_SESSION_CARDS,
} from "./countingSetup";

describe("running count setup", () => {
  it("matches the starter values from ?session=starter", () => {
    expect(matchRunningPreset({ decks: 1, amount: 20, speed: 1000, group: "1", checkpoint: "5", interruption: false })).toBe("starter");
  });

  it("matches each preset and reports custom values as null", () => {
    for (const card of RUNNING_SESSION_CARDS) expect(matchRunningPreset(card.values)).toBe(card.id);
    expect(matchRunningPreset(runningPresetValues("six-deck-casino"))).toBe("six-deck-casino");
    expect(matchRunningPreset({ ...runningPresetValues("six-deck-casino"), speed: 500 })).toBeNull();
    // Recovery without its interruption is no longer the Recovery session.
    expect(matchRunningPreset({ ...runningPresetValues("recovery"), interruption: false })).toBeNull();
  });

  it("caps the dealt cards at the shoe minus the burn card", () => {
    expect(effectiveCardCount(1, 52)).toBe(51);
    expect(effectiveCardCount(1, 156)).toBe(51);
    expect(effectiveCardCount(6, 234)).toBe(234);
  });

  it("estimates durations in plain words", () => {
    expect(formatApproxDuration(estimateRunningSeconds(runningPresetValues("one-deck-speed"))!)).toBe("about 30 s");
    expect(formatApproxDuration(estimateRunningSeconds(RUNNING_STARTER)!)).toBe("about 40 s");
    expect(formatApproxDuration(95)).toBe("about 2 min");
    expect(estimateRunningSeconds({ ...RUNNING_STARTER, speed: SELF_PACED })).toBeNull();
  });

  it("formats intervals and card meta", () => {
    expect(formatInterval(750)).toBe("0.75 s");
    expect(formatInterval(1000)).toBe("1 s");
    expect(formatInterval(SELF_PACED)).toBe("Self-paced");
    expect(runningCardMeta(RUNNING_STARTER)).toBe("20 cards · 1 deck · 1 s per card · about 40 s");
  });

  it("describes the session before it starts", () => {
    expect(describeRunningSession({ ...RUNNING_STARTER, bias: "none", feedbackMode: "immediate" })).toEqual([
      "20 cards from a 1-deck shoe", "one at a time", "1 s each", "a count check every 5 cards", "results after each check",
    ]);
    expect(describeRunningSession({ ...runningPresetValues("recovery"), bias: "negative", feedbackMode: "end" })).toContain("one interruption halfway");
  });

  it("matches table rounds by spots, not by group", () => {
    const table = RUNNING_SESSION_CARDS.find((card) => card.id === "table")!.values;
    expect(matchRunningPreset(table)).toBe("table");
    expect(matchRunningPreset({ ...table, group: "random" })).toBe("table");
    expect(matchRunningPreset({ ...table, spots: 5 })).toBeNull();
    expect(matchRunningPreset({ ...table, deal: "cards" })).toBeNull();
    expect(isSettingsPreset("table")).toBe(false);
    expect(isSettingsPreset("recovery")).toBe(true);
    expect(isSettingsPreset("starter")).toBe(false);
  });

  it("matches against a caller's own card list", () => {
    const cards = RUNNING_SESSION_CARDS.map((card) => (card.id === "starter" ? { ...card, values: { ...card.values, speed: 750 } } : card));
    expect(matchRunningPreset({ ...RUNNING_STARTER, speed: 750 }, cards)).toBe("starter");
    expect(matchRunningPreset(RUNNING_STARTER, cards)).toBeNull();
  });

  it("describes table rounds and their duration", () => {
    const table = RUNNING_SESSION_CARDS.find((card) => card.id === "table")!.values;
    expect(runningCardMeta(table)).toMatch(/^about 156 cards · 6 decks · 3 spots · 0\.65 s per card · about \d+ min$/);
    expect(describeRunningSession({ ...table, bias: "positive", feedbackMode: "immediate" })).toEqual([
      "about 156 cards from a 6-deck shoe", "full rounds at a 3-spot table", "0.65 s per card", "a check every 3 rounds", "results after each check",
    ]);
    expect(dealOf({})).toBe("cards");
    expect(spotsOf({ spots: 9 })).toBe(3);
  });

  it("offers checks that fit the deal and maps the rest", () => {
    expect(checkpointsFor("table")).not.toContain("5");
    expect(checkpointsFor("cards")).not.toContain("round");
    expect(fitCheckpoint("5", "table")).toBe("round");
    expect(fitCheckpoint("10", "table")).toBe("3-rounds");
    expect(fitCheckpoint("3-rounds", "cards")).toBe("10");
    expect(fitCheckpoint("deck", "table")).toBe("deck");
  });

  it("decides when a check is due", () => {
    const base = { total: 104, countBefore: 2, countAfter: 3, steps: 1, randomGap: 12 };
    expect(isCheckDue({ ...base, checkpoint: "5", from: 3, to: 5 })).toBe(true);
    expect(isCheckDue({ ...base, checkpoint: "5", from: 5, to: 7 })).toBe(false);
    expect(isCheckDue({ ...base, checkpoint: "10", from: 8, to: 11 })).toBe(true);
    expect(isCheckDue({ ...base, checkpoint: "deck", from: 50, to: 53 })).toBe(true);
    expect(isCheckDue({ ...base, checkpoint: "deck", from: 40, to: 51 })).toBe(false);
    expect(isCheckDue({ ...base, checkpoint: "final", from: 40, to: 51 })).toBe(false);
    expect(isCheckDue({ ...base, checkpoint: "final", from: 100, to: 104 })).toBe(true);
    expect(isCheckDue({ ...base, checkpoint: "round", from: 0, to: 11 })).toBe(true);
    expect(isCheckDue({ ...base, checkpoint: "3-rounds", from: 0, to: 11, steps: 2 })).toBe(false);
    expect(isCheckDue({ ...base, checkpoint: "3-rounds", from: 0, to: 11, steps: 3 })).toBe(true);
    expect(isCheckDue({ ...base, checkpoint: "random", from: 0, to: 11, steps: 12 })).toBe(true);
    expect(isCheckDue({ ...base, checkpoint: "sign", from: 0, to: 2 })).toBe(false);
    expect(isCheckDue({ ...base, checkpoint: "sign", from: 0, to: 2, countAfter: 0 })).toBe(true);
    expect(isCheckDue({ ...base, checkpoint: "sign", from: 0, to: 2, countBefore: 0, countAfter: -1 })).toBe(false);
  });

  it("says where the next check comes", () => {
    expect(nextCheckText("5", 7, 20)).toBe("Next check after card 10");
    expect(nextCheckText("deck", 60, 234)).toBe("Next check after card 104");
    expect(nextCheckText("5", 18, 20)).toBe("Next check after card 20");
    expect(nextCheckText("3-rounds", 30, 156, 1)).toBe("Check in 2 rounds");
    expect(nextCheckText("3-rounds", 30, 156, 2)).toBe("Check after this round");
  });

  it("draws random gaps inside the bounds", () => {
    expect(randomCheckGap("cards", () => 0)).toBe(10);
    expect(randomCheckGap("cards", () => 0.9999)).toBe(25);
    expect(randomCheckGap("table", () => 0.5)).toBeGreaterThanOrEqual(2);
  });

  it("maps practice hand-offs to a session", () => {
    expect(normalizeRunningFocus("table rounds")).toBe("table");
    expect(normalizeRunningFocus("one-deck-speed")).toBe("one-deck-speed");
    expect(normalizeRunningFocus("running count")).toBe("six-deck-casino");
    expect(normalizeRunningFocus("starter")).toBe("starter");
    expect(normalizeRunningFocus("bogus")).toBeUndefined();
    expect(normalizeRunningFocus(null)).toBeUndefined();
  });
});

describe("true count setup", () => {
  it("normalises focus from the Benchmark and the Test Out report", () => {
    expect(normalizeTrueCountFocus("negative count")).toBe("negative");
    expect(normalizeTrueCountFocus("negative")).toBe("negative");
    expect(normalizeTrueCountFocus("Positive count")).toBe("positive");
    expect(normalizeTrueCountFocus("zero")).toBe("zero");
    expect(normalizeTrueCountFocus("last-deck")).toBe("last-deck");
    expect(normalizeTrueCountFocus("bogus")).toBe("adaptive");
    expect(normalizeTrueCountFocus(undefined)).toBe("adaptive");
  });

  it("matches session cards by mode, resolution and focus", () => {
    for (const card of TRUE_COUNT_SESSION_CARDS) expect(matchTrueCountPreset(card.values)).toBe(card.id);
    expect(matchTrueCountPreset({ mode: "combined", resolution: 1, focus: "zero" })).toBeNull();
  });

  it("describes the session", () => {
    expect(describeTrueCountSession({ mode: "combined", resolution: 0.5, focus: "adaptive", decks: 6, target: 10, rounding: "floor", feedbackMode: "immediate" }).join(" · "))
      .toBe("10 questions · 6-deck shoe · you estimate decks left and the true count · decks to the nearest half deck · Floor rounding · results after each question");
  });
});

describe("shared counting setup", () => {
  it("fits saved settings to the offered shoe sizes and question counts", () => {
    expect(fitShoeSize(6)).toBe(6);
    expect(fitShoeSize(5)).toBe(6);
    expect(fitShoeSize(3)).toBe(2);
    expect(fitShoeSize(4)).toBe(4);
    expect(fitQuestionTarget(20)).toBe(20);
    expect(fitQuestionTarget(7)).toBe(10);
  });
});

describe("deck estimation setup", () => {
  it("reads the resolution from Test Out and weak-spot hand-offs", () => {
    expect(parseDeckResolutionFocus("0.5-deck resolution")).toBe(0.5);
    expect(parseDeckResolutionFocus("0.25-deck")).toBe(0.25);
    expect(parseDeckResolutionFocus("1-deck, last deck")).toBe(1);
    expect(parseDeckResolutionFocus("bogus")).toBeUndefined();
  });
});
