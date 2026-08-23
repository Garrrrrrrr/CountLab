import { describe, expect, it } from "vitest";
import { CHECKLIST_TICKS_KEY, checklistStore } from "./practiceChecklistStore";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  raw(key: string) { return this.values.get(key); }
}

const NOW = new Date("2026-08-22T15:00:00.000Z");

describe("checklistStore", () => {
  it("starts with nothing ticked", () => {
    expect(checklistStore.ticks(new MemoryStorage(), NOW)).toEqual([]);
  });

  it("remembers a tick", () => {
    const store = new MemoryStorage();
    checklistStore.toggle("recite-deviations", store, NOW);
    expect(checklistStore.ticks(store, NOW)).toEqual(["recite-deviations"]);
  });

  it("toggles the same id back off", () => {
    const store = new MemoryStorage();
    checklistStore.toggle("recite-deviations", store, NOW);
    checklistStore.toggle("recite-deviations", store, NOW);
    expect(checklistStore.ticks(store, NOW)).toEqual([]);
  });

  it("keeps ticks separate per day", () => {
    const store = new MemoryStorage();
    checklistStore.toggle("recite-deviations", store, NOW);
    const tomorrow = new Date("2026-08-23T09:00:00.000Z");
    expect(checklistStore.ticks(store, tomorrow)).toEqual([]);
    // Yesterday's record is untouched by reading a new day.
    expect(checklistStore.ticks(store, NOW)).toEqual(["recite-deviations"]);
  });

  it("holds several ticks on one day without disturbing each other", () => {
    const store = new MemoryStorage();
    checklistStore.toggle("recite-deviations", store, NOW);
    checklistStore.toggle("recite-basic-strategy", store, NOW);
    expect(checklistStore.ticks(store, NOW).sort()).toEqual(["recite-basic-strategy", "recite-deviations"]);
  });

  it("drops days older than the retention window so the key cannot grow forever", () => {
    const store = new MemoryStorage();
    const longAgo = new Date("2026-01-01T09:00:00.000Z");
    checklistStore.toggle("recite-deviations", store, longAgo);
    // Writing on a much later day prunes the stale record.
    checklistStore.toggle("recite-basic-strategy", store, NOW);
    expect(checklistStore.ticks(store, longAgo)).toEqual([]);
    expect(checklistStore.ticks(store, NOW)).toEqual(["recite-basic-strategy"]);
  });

  it("survives a corrupt payload instead of throwing", () => {
    const store = new MemoryStorage();
    store.setItem(CHECKLIST_TICKS_KEY, "{ not json");
    expect(checklistStore.ticks(store, NOW)).toEqual([]);
    checklistStore.toggle("recite-deviations", store, NOW);
    expect(checklistStore.ticks(store, NOW)).toEqual(["recite-deviations"]);
  });

  it("ignores a payload of the wrong shape", () => {
    const store = new MemoryStorage();
    store.setItem(CHECKLIST_TICKS_KEY, JSON.stringify({ "2026-08-22": "not-an-array" }));
    expect(checklistStore.ticks(store, NOW)).toEqual([]);
  });
});
