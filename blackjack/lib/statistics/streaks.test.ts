import { describe, expect, it } from "vitest";
import type { Session } from "./storage";
import { computeStreak, practiceHeatmap, unlockedMilestones } from "./streaks";

function makeSession(date: string): Session {
  return { id: date, drill: "True Count", questions: 10, correct: 8, accuracy: 80, averageResponseTime: 1000, bestStreak: 3, date, mistakes: [] };
}

describe("computeStreak", () => {
  it("returns zeros for no history", () => {
    expect(computeStreak([])).toEqual({ currentStreakDays: 0, bestStreakDays: 0, practiceDaysThisWeek: 0, practiceDays: [] });
  });

  it("counts a current streak that includes today", () => {
    const now = new Date("2026-08-15T12:00:00Z");
    const sessions = [makeSession("2026-08-13T10:00:00.000Z"), makeSession("2026-08-14T10:00:00.000Z"), makeSession("2026-08-15T10:00:00.000Z")];
    const streak = computeStreak(sessions, now);
    expect(streak.currentStreakDays).toBe(3);
    expect(streak.bestStreakDays).toBe(3);
  });

  it("keeps a streak alive if today hasn't been practiced yet, but not if yesterday was skipped too", () => {
    const now = new Date("2026-08-15T23:00:00Z");
    const stillAlive = computeStreak([makeSession("2026-08-13T10:00:00.000Z"), makeSession("2026-08-14T10:00:00.000Z")], now);
    expect(stillAlive.currentStreakDays).toBe(2);
    const broken = computeStreak([makeSession("2026-08-12T10:00:00.000Z")], now);
    expect(broken.currentStreakDays).toBe(0);
  });

  it("deduplicates multiple sessions on the same day and finds the longest historical run", () => {
    const now = new Date("2026-08-20T12:00:00Z");
    const sessions = [
      makeSession("2026-08-01T10:00:00.000Z"), makeSession("2026-08-02T10:00:00.000Z"), makeSession("2026-08-02T18:00:00.000Z"),
      makeSession("2026-08-03T10:00:00.000Z"), makeSession("2026-08-04T10:00:00.000Z"), makeSession("2026-08-05T10:00:00.000Z"),
    ];
    const streak = computeStreak(sessions, now);
    expect(streak.bestStreakDays).toBe(5);
    expect(streak.currentStreakDays).toBe(0);
    expect(streak.practiceDays).toHaveLength(5);
  });
});

describe("unlockedMilestones", () => {
  it("unlocks streak and session-count milestones once thresholds are met", () => {
    const sessions = Array.from({ length: 12 }, (_, i) => makeSession(`2026-08-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`));
    const streak = computeStreak(sessions, new Date("2026-08-12T12:00:00Z"));
    const unlocked = unlockedMilestones(sessions, streak).map((m) => m.id);
    expect(unlocked).toContain("streak-3");
    expect(unlocked).toContain("streak-7");
    expect(unlocked).toContain("sessions-10");
    expect(unlocked).not.toContain("streak-30");
    expect(unlocked).not.toContain("sessions-50");
  });
});

describe("practiceHeatmap", () => {
  it("builds a weeks x 7 grid marking practiced days", () => {
    const now = new Date("2026-08-15T12:00:00Z");
    const grid = practiceHeatmap(["2026-08-15"], 4, now);
    expect(grid).toHaveLength(4);
    expect(grid[0]).toHaveLength(7);
    const flagged = grid.flat().filter((cell) => cell.practiced);
    expect(flagged).toEqual([{ date: "2026-08-15", practiced: true }]);
  });
});
