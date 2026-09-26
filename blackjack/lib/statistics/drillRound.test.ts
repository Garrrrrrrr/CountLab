import { describe, expect, it } from "vitest";
import {
  answeredInProgress,
  applyAnswer,
  checklistProgress,
  clockText,
  EMPTY_TALLY,
  explainModeOf,
  historyTotals,
  pausesOn,
  relativeTime,
  roundLengthOf,
  shuffled,
  spokenDuration,
  tallyFromProgress,
} from "./drillRound";
import type { Session } from "./storage";

const session = (drill: Session["drill"], categories: Session["categories"], extra: Partial<Session> = {}): Session => ({
  id: Math.random().toString(36),
  drill,
  questions: Object.values(categories ?? {}).reduce((sum, value) => sum + value.total, 0),
  correct: 0,
  accuracy: 0,
  averageResponseTime: 0,
  bestStreak: 0,
  date: new Date().toISOString(),
  mistakes: [],
  categories,
  ...extra,
});

describe("round settings", () => {
  it("defaults progress saved before rounds had a length or explain mode", () => {
    expect(roundLengthOf(undefined)).toBe(10);
    expect(roundLengthOf(20)).toBe(20);
    expect(roundLengthOf(15)).toBe(10);
    expect(explainModeOf(undefined)).toBe("mistakes");
    expect(explainModeOf("never")).toBe("never");
  });

  it("pauses on mistakes, on every hand, or never", () => {
    expect(pausesOn("mistakes", false)).toBe(true);
    expect(pausesOn("mistakes", true)).toBe(false);
    expect(pausesOn("every", true)).toBe(true);
    expect(pausesOn("never", false)).toBe(false);
  });
});

describe("tally", () => {
  it("counts answers, streaks, time and categories", () => {
    let tally = EMPTY_TALLY;
    tally = applyAnswer(tally, { ok: true, ms: 900, category: "Pairs" });
    tally = applyAnswer(tally, { ok: true, ms: 1100, category: "Pairs" });
    tally = applyAnswer(tally, { ok: false, ms: 2000, category: "Soft totals", mistake: { question: "A,8 vs 6", userAnswer: "Stand", correctAnswer: "Double", explanation: "" } });
    expect(tally).toMatchObject({ answered: 3, correct: 2, streak: 0, best: 2, totalMs: 4000 });
    expect(tally.categories).toEqual({ Pairs: { correct: 2, total: 2 }, "Soft totals": { correct: 0, total: 1 } });
    expect(tally.mistakes).toHaveLength(1);
  });

  it("does not deal the last hand again after a reload on the old last-hand screen", () => {
    // The previous version saved q = 9 while its tenth answer was already counted.
    const legacy = { q: 9, correctCount: 10, streak: 10, best: 10, totalMs: 10000, mistakes: [], categories: { Pairs: { correct: 6, total: 6 }, "Hard totals": { correct: 4, total: 4 } } };
    expect(answeredInProgress(legacy)).toBe(10);
    expect(tallyFromProgress(legacy).answered).toBe(10);
    expect(answeredInProgress({ q: 3, categories: { Pairs: { correct: 1, total: 3 } } })).toBe(3);
    expect(answeredInProgress({})).toBe(0);
  });
});

describe("history", () => {
  it("leaves retry rounds and other drills out of the per-category history", () => {
    const totals = historyTotals([
      session("Basic Strategy", { Pairs: { correct: 1, total: 4 } }),
      session("Basic Strategy", { Pairs: { correct: 4, total: 4 } }, { tags: ["retry"] }),
      session("Deviations", { Pairs: { correct: 0, total: 9 } }),
      session("Basic Strategy", { Pairs: { correct: 2, total: 2 }, "Soft totals": { correct: 1, total: 1 } }),
    ], "Basic Strategy");
    expect(totals).toEqual({ Pairs: { correct: 3, total: 6 }, "Soft totals": { correct: 1, total: 1 } });
  });

  it("reports today's checklist progress for the drill's item", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    const sessions = [
      session("Basic Strategy", { Pairs: { correct: 5, total: 60 } }, { date: "2026-09-26T09:00:00Z" }),
      session("Basic Strategy", { Pairs: { correct: 5, total: 50 } }, { date: "2026-09-25T09:00:00Z" }),
      session("H17 Chart", {}, { date: "2026-09-26T10:00:00Z", questions: 320 }),
    ];
    expect(checklistProgress(sessions, "Basic Strategy", now)).toEqual({ current: 60, target: 200, done: false, unit: "hands" });
    expect(checklistProgress(sessions, "H17 Chart", now)).toEqual({ current: 1, target: 2, done: false, unit: "runs" });
    expect(checklistProgress(sessions, "Test Out", now)).toBeUndefined();
  });
});

describe("formatting", () => {
  it("formats clocks past an hour and speaks durations", () => {
    expect(clockText(252_000)).toBe("4:12");
    expect(clockText(4_512_000)).toBe("1:15:12");
    expect(spokenDuration(252_000)).toBe("4 minutes 12 seconds");
    expect(spokenDuration(61_000)).toBe("1 minute 1 second");
    expect(spokenDuration(3_700_000)).toBe("1 hour 1 minute");
  });

  it("describes when something happened", () => {
    const now = Date.parse("2026-09-26T12:00:00Z");
    expect(relativeTime("2026-09-26T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-26T11:30:00Z", now)).toBe("30 min ago");
    expect(relativeTime("2026-09-25T11:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-09-23T12:00:00Z", now)).toBe("3 days ago");
    expect(relativeTime(undefined, now)).toBe("");
  });

  it("shuffles without losing items", () => {
    expect(shuffled([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
