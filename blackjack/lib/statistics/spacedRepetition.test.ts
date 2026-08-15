import { describe, expect, it } from "vitest";
import { recordAnswer, leitnerStates, dueItemKeys } from "./spacedRepetition";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("spacedRepetition (Leitner boxes)", () => {
  it("starts an item in box 1 and moves it up a box on a correct answer", () => {
    const store = new MemoryStorage();
    const first = recordAnswer("True Count", "positive", true, new Date("2026-08-01T00:00:00Z"), store);
    expect(first.box).toBe(2);
    const second = recordAnswer("True Count", "positive", true, new Date("2026-08-01T00:00:00Z"), store);
    expect(second.box).toBe(3);
  });

  it("resets an item to box 1 on an incorrect answer", () => {
    const store = new MemoryStorage();
    recordAnswer("True Count", "negative", true, new Date("2026-08-01T00:00:00Z"), store);
    recordAnswer("True Count", "negative", true, new Date("2026-08-01T00:00:00Z"), store);
    const reset = recordAnswer("True Count", "negative", false, new Date("2026-08-01T00:00:00Z"), store);
    expect(reset.box).toBe(1);
  });

  it("caps the box at 5", () => {
    const store = new MemoryStorage();
    let state = recordAnswer("True Count", "zero", true, new Date("2026-08-01T00:00:00Z"), store);
    for (let i = 0; i < 10; i++) state = recordAnswer("True Count", "zero", true, new Date("2026-08-01T00:00:00Z"), store);
    expect(state.box).toBe(5);
  });

  it("treats unseen items as due, and seen items as due only once their interval has passed", () => {
    const store = new MemoryStorage();
    recordAnswer("True Count", "positive", true, new Date("2026-08-01T00:00:00Z"), store);
    const dueSoon = dueItemKeys("True Count", ["positive", "negative"], new Date("2026-08-01T00:00:01Z"), store);
    expect(dueSoon).toEqual(["negative"]);
    const dueLater = dueItemKeys("True Count", ["positive", "negative"], new Date("2026-08-02T00:00:00Z"), store);
    expect(dueLater.sort()).toEqual(["negative", "positive"]);
  });

  it("orders overdue seen items before never-seen items, most overdue first", () => {
    const store = new MemoryStorage();
    recordAnswer("Basic Strategy", "Hard totals", true, new Date("2026-08-01T00:00:00Z"), store);
    recordAnswer("Basic Strategy", "Pairs", true, new Date("2026-08-01T02:00:00Z"), store);
    const due = dueItemKeys("Basic Strategy", ["Hard totals", "Pairs", "Soft totals"], new Date("2026-08-03T00:00:00Z"), store);
    expect(due).toEqual(["Hard totals", "Pairs", "Soft totals"]);
  });

  it("persists state per drill independently", () => {
    const store = new MemoryStorage();
    recordAnswer("True Count", "positive", true, new Date("2026-08-01T00:00:00Z"), store);
    expect(Object.keys(leitnerStates("True Count", store))).toEqual(["positive"]);
    expect(Object.keys(leitnerStates("Basic Strategy", store))).toEqual([]);
  });
});
