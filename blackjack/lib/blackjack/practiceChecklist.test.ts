import { describe, expect, it } from "vitest";
import { Session } from "@/lib/statistics/storage";
import { DAILY_CHECKLIST, evaluateChecklist } from "./practiceChecklist";

const NOW = new Date("2026-08-22T15:00:00.000Z");

/** A finished drill session; only the fields the checklist reads are meaningful. */
const session = (drill: Session["drill"], questions: number, date: string): Session => ({
  id: `${drill}-${date}-${questions}`,
  drill,
  questions,
  correct: questions,
  accuracy: 100,
  averageResponseTime: 1000,
  bestStreak: questions,
  date,
  mistakes: [],
});

const today = (drill: Session["drill"], questions: number) =>
  session(drill, questions, "2026-08-22T09:00:00.000Z");
const yesterday = (drill: Session["drill"], questions: number) =>
  session(drill, questions, "2026-08-21T09:00:00.000Z");

const find = (result: ReturnType<typeof evaluateChecklist>, id: string) =>
  result.items.find((entry) => entry.item.id === id)!;

describe("DAILY_CHECKLIST", () => {
  it("has a unique id for every item", () => {
    const ids = DAILY_CHECKLIST.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every auto item a drill to measure and every manual item none", () => {
    for (const item of DAILY_CHECKLIST) {
      if (item.kind === "auto") expect(item.drill, item.id).toBeDefined();
      else expect(item.drill, item.id).toBeUndefined();
    }
  });

  it("records whether each target came from the source checklist or from CountLab", () => {
    // The source PDF sets no daily number for true count or free play, so those
    // targets must not claim to be its own.
    expect(DAILY_CHECKLIST.every((item) => item.targetSource === "bja" || item.targetSource === "countlab")).toBe(true);
    expect(DAILY_CHECKLIST.find((item) => item.id === "basic-strategy-hands")!.targetSource).toBe("bja");
    expect(DAILY_CHECKLIST.find((item) => item.id === "true-count-practice")!.targetSource).toBe("countlab");
  });
});

describe("evaluateChecklist", () => {
  it("counts nothing done on a blank day", () => {
    const result = evaluateChecklist([], [], NOW);
    expect(result.total).toBe(DAILY_CHECKLIST.length);
    expect(result.completed).toBe(0);
    expect(result.items.every((entry) => !entry.done)).toBe(true);
  });

  it("reports the day it evaluated, matching the streak counter's day key", () => {
    expect(evaluateChecklist([], [], NOW).dayKey).toBe("2026-08-22");
  });

  it("sums questions across today's sessions for a hands target", () => {
    const result = evaluateChecklist([today("Basic Strategy", 120), today("Basic Strategy", 80)], [], NOW);
    const entry = find(result, "basic-strategy-hands");
    expect(entry.current).toBe(200);
    expect(entry.target).toBe(200);
    expect(entry.done).toBe(true);
  });

  it("leaves a partially met hands target incomplete but shows the progress", () => {
    const result = evaluateChecklist([today("Basic Strategy", 140)], [], NOW);
    const entry = find(result, "basic-strategy-hands");
    expect(entry.current).toBe(140);
    expect(entry.done).toBe(false);
  });

  it("counts sessions rather than questions for a runs target", () => {
    const result = evaluateChecklist([today("H17 Chart", 320), today("H17 Chart", 40)], [], NOW);
    const entry = find(result, "blank-charts");
    expect(entry.current).toBe(2);
    expect(entry.done).toBe(true);
  });

  it("does not credit a runs target from a single long session", () => {
    const result = evaluateChecklist([today("H17 Chart", 320)], [], NOW);
    expect(find(result, "blank-charts").current).toBe(1);
    expect(find(result, "blank-charts").done).toBe(false);
  });

  it("ignores sessions from previous days", () => {
    const result = evaluateChecklist([yesterday("Basic Strategy", 500)], [], NOW);
    expect(find(result, "basic-strategy-hands").current).toBe(0);
  });

  it("does not let one drill satisfy another drill's item", () => {
    const result = evaluateChecklist([today("Basic Strategy", 400)], [], NOW);
    expect(find(result, "deviation-hands").current).toBe(0);
  });

  it("caps reported progress at the target so a bar cannot overflow", () => {
    const result = evaluateChecklist([today("Basic Strategy", 900)], [], NOW);
    expect(find(result, "basic-strategy-hands").current).toBe(200);
  });

  it("marks a manual item done when it is ticked", () => {
    const result = evaluateChecklist([], ["recite-basic-strategy"], NOW);
    const entry = find(result, "recite-basic-strategy");
    expect(entry.done).toBe(true);
    expect(entry.current).toBe(1);
    expect(entry.target).toBe(1);
  });

  it("ignores a ticked id that is not on the checklist", () => {
    const result = evaluateChecklist([], ["not-a-real-item"], NOW);
    expect(result.completed).toBe(0);
  });

  it("cannot be satisfied by ticking an auto item", () => {
    // Auto items are evidence-based; a stray tick must not fake drill progress.
    const result = evaluateChecklist([], ["basic-strategy-hands"], NOW);
    expect(find(result, "basic-strategy-hands").done).toBe(false);
  });

  it("counts completed across both kinds", () => {
    const result = evaluateChecklist(
      [today("Basic Strategy", 200), today("Deviations", 100)],
      ["recite-deviations"],
      NOW,
    );
    expect(result.completed).toBe(3);
  });

  it("returns items in checklist order so the page renders the source's grouping", () => {
    const result = evaluateChecklist([], [], NOW);
    expect(result.items.map((entry) => entry.item.id)).toEqual(DAILY_CHECKLIST.map((item) => item.id));
  });
});
