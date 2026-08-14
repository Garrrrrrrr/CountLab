import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import { journalLibrary, sessionsInRange } from "./journal";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const sessionInput = {
  date: "2026-08-01",
  hours: 4,
  handsPerHour: 100,
  playerHands: 1,
  bettingUnit: 25,
  rules: DEFAULT_ADVANTAGE_RULES,
  ramp: RAMPS["1-8"],
  netResult: 120,
  expenses: 15,
};

describe("journal library", () => {
  it("adds and deletes casino sessions", () => {
    const store = new MemoryStorage();
    const saved = journalLibrary.addSession(sessionInput, store, new Date("2026-08-13T12:00:00Z"));
    expect(journalLibrary.sessions(store)).toHaveLength(1);
    expect(saved.netResult).toBe(120);
    journalLibrary.deleteSession(saved.id, store);
    expect(journalLibrary.sessions(store)).toEqual([]);
  });

  it("adds and deletes bankroll transactions", () => {
    const store = new MemoryStorage();
    const deposit = journalLibrary.addTransaction({ date: "2026-08-01", type: "deposit", amount: 1000 }, store);
    expect(journalLibrary.transactions(store)).toHaveLength(1);
    journalLibrary.deleteTransaction(deposit.id, store);
    expect(journalLibrary.transactions(store)).toEqual([]);
  });

  it("ignores malformed or old storage payloads", () => {
    const store = new MemoryStorage();
    store.setItem("countlab:journal-sessions:v1", JSON.stringify({ version: 1, items: [{ id: "broken" }] }));
    expect(journalLibrary.sessions(store)).toEqual([]);
    store.setItem("countlab:journal-sessions:v1", JSON.stringify({ version: 0, items: [] }));
    expect(journalLibrary.sessions(store)).toEqual([]);
  });

  it("exports and merges a validated portable backup", () => {
    const source = new MemoryStorage();
    journalLibrary.addSession(sessionInput, source, new Date("2026-08-13T12:00:00Z"));
    journalLibrary.addTransaction({ date: "2026-08-01", type: "deposit", amount: 500 }, source, new Date("2026-08-13T12:00:00Z"));
    const target = new MemoryStorage();
    const imported = journalLibrary.importData(journalLibrary.exportData(source), target);
    expect(imported).toEqual({ sessions: 1, transactions: 1 });
    expect(journalLibrary.sessions(target)[0].netResult).toBe(120);
    expect(() => journalLibrary.importData('{"version":1,"sessions":[{}],"transactions":[]}', target)).toThrow(/invalid/i);
  });
});

describe("sessionsInRange", () => {
  const sessions = [
    { ...sessionInput, id: "a", createdAt: "2026-08-01T00:00:00Z", date: "2026-08-13" },
    { ...sessionInput, id: "b", createdAt: "2026-07-01T00:00:00Z", date: "2026-07-01" },
  ];
  it("filters sessions older than the requested day window", () => {
    const now = new Date("2026-08-13T12:00:00Z");
    const recent = sessionsInRange(sessions, 7, now);
    expect(recent.map((session) => session.id)).toEqual(["a"]);
  });
  it("returns every session when the range is 'all'", () => {
    expect(sessionsInRange(sessions, "all")).toHaveLength(2);
  });
});
