import { describe, expect, it } from "vitest";
import {
  describeRunningSession,
  describeTrueCountSession,
  effectiveCardCount,
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

  it("maps practice hand-offs to a session", () => {
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

describe("deck estimation setup", () => {
  it("reads the resolution from Test Out and weak-spot hand-offs", () => {
    expect(parseDeckResolutionFocus("0.5-deck resolution")).toBe(0.5);
    expect(parseDeckResolutionFocus("0.25-deck")).toBe(0.25);
    expect(parseDeckResolutionFocus("1-deck, last deck")).toBe(1);
    expect(parseDeckResolutionFocus("bogus")).toBeUndefined();
  });
});
