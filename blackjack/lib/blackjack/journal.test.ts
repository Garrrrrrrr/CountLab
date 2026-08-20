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

  it("updates a session's fields in place, keeping its id, createdAt, and bankrollId", () => {
    const store = new MemoryStorage();
    const saved = journalLibrary.addSession(sessionInput, store, new Date("2026-08-13T12:00:00Z"));
    const updated = journalLibrary.updateSession(saved.id, { ...sessionInput, netResult: 500, notes: "corrected" }, store);
    expect(updated?.id).toBe(saved.id);
    expect(updated?.createdAt).toBe(saved.createdAt);
    expect(updated?.bankrollId).toBe(saved.bankrollId);
    expect(updated?.netResult).toBe(500);
    expect(updated?.notes).toBe("corrected");
    expect(journalLibrary.sessions(store)).toHaveLength(1);
    expect(journalLibrary.sessions(store)[0].netResult).toBe(500);
  });

  it("returns undefined and changes nothing when updating an id that doesn't exist", () => {
    const store = new MemoryStorage();
    journalLibrary.addSession(sessionInput, store);
    const result = journalLibrary.updateSession("nonexistent-id", { ...sessionInput, netResult: 999 }, store);
    expect(result).toBeUndefined();
    expect(journalLibrary.sessions(store).map((s) => s.netResult)).toEqual([120]);
  });

  it("stores an optional per-true-count hands schedule alongside a session", () => {
    const store = new MemoryStorage();
    const handsByTrueCount = [{ trueCount: 0, hands: 1 }, { trueCount: 2, hands: 2 }];
    const saved = journalLibrary.addSession({ ...sessionInput, handsByTrueCount }, store);
    expect(journalLibrary.sessions(store)[0].handsByTrueCount).toEqual(handsByTrueCount);
    expect(saved.handsByTrueCount).toEqual(handsByTrueCount);
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

describe("multi-bankroll support", () => {
  it("backfills a default Main bankroll for sessions and transactions written before multi-bankroll support", () => {
    const store = new MemoryStorage();
    const session = journalLibrary.addSession(sessionInput, store);
    const transaction = journalLibrary.addTransaction({ date: "2026-08-01", type: "deposit", amount: 500 }, store);
    expect(session.bankrollId).toBeTruthy();
    expect(transaction.bankrollId).toBe(session.bankrollId);
    expect(journalLibrary.bankrolls(store)).toHaveLength(1);
    expect(journalLibrary.bankrolls(store)[0].name).toBe("Main");
  });

  it("adds a second bankroll and can scope new sessions to it", () => {
    const store = new MemoryStorage();
    const main = journalLibrary.bankrolls(store)[0];
    const trip = journalLibrary.addBankroll("Vegas trip", store);
    expect(journalLibrary.bankrolls(store).map((b) => b.name)).toEqual(["Main", "Vegas trip"]);
    const session = journalLibrary.addSession({ ...sessionInput, bankrollId: trip.id }, store);
    expect(session.bankrollId).toBe(trip.id);
    expect(session.bankrollId).not.toBe(main.id);
  });

  it("reassigns sessions and transactions to the fallback bankroll on delete, and refuses to delete the last one", () => {
    const store = new MemoryStorage();
    const trip = journalLibrary.addBankroll("Vegas trip", store);
    const main = journalLibrary.bankrolls(store).find((b) => b.name === "Main")!;
    const session = journalLibrary.addSession({ ...sessionInput, bankrollId: trip.id }, store);
    expect(journalLibrary.deleteBankroll(trip.id, store)).toBe(true);
    expect(journalLibrary.bankrolls(store)).toHaveLength(1);
    expect(journalLibrary.sessions(store).find((s) => s.id === session.id)?.bankrollId).toBe(main.id);
    expect(journalLibrary.deleteBankroll(main.id, store)).toBe(false);
    expect(journalLibrary.bankrolls(store)).toHaveLength(1);
  });

  it("renames a bankroll", () => {
    const store = new MemoryStorage();
    const main = journalLibrary.bankrolls(store)[0];
    journalLibrary.renameBankroll(main.id, "Retirement fund", store);
    expect(journalLibrary.bankrolls(store)[0].name).toBe("Retirement fund");
  });
});

describe("CSV export/import", () => {
  it("round-trips sessions through CSV, including rules and ramp, creating a bankroll by name if needed", () => {
    const source = new MemoryStorage();
    journalLibrary.addBankroll("Vegas trip", source);
    journalLibrary.renameBankroll(journalLibrary.bankrolls(source)[0].id, "Main", source);
    const tripBankroll = journalLibrary.bankrolls(source).find((b) => b.name === "Vegas trip")!;
    journalLibrary.addSession({ ...sessionInput, bankrollId: tripBankroll.id, notes: "line1\nline2, with a comma" }, source, new Date("2026-08-13T12:00:00Z"));
    const csv = journalLibrary.exportSessionsCsv(source);

    const target = new MemoryStorage();
    const imported = journalLibrary.importSessionsCsv(csv, target);
    expect(imported).toBe(1);
    const [session] = journalLibrary.sessions(target);
    expect(session.netResult).toBe(120);
    expect(session.expenses).toBe(15);
    expect(session.ramp).toEqual(RAMPS["1-8"]);
    expect(session.rules).toEqual(DEFAULT_ADVANTAGE_RULES);
    expect(session.notes).toBe("line1\nline2, with a comma");
    const importedBankroll = journalLibrary.bankrolls(target).find((b) => b.id === session.bankrollId);
    expect(importedBankroll?.name).toBe("Vegas trip");
  });

  it("round-trips a per-true-count hands schedule through CSV", () => {
    const source = new MemoryStorage();
    const handsByTrueCount = [{ trueCount: 0, hands: 1 }, { trueCount: 3, hands: 3 }];
    journalLibrary.addSession({ ...sessionInput, handsByTrueCount }, source, new Date("2026-08-13T12:00:00Z"));
    const csv = journalLibrary.exportSessionsCsv(source);

    const target = new MemoryStorage();
    journalLibrary.importSessionsCsv(csv, target);
    expect(journalLibrary.sessions(target)[0].handsByTrueCount).toEqual(handsByTrueCount);
  });

  it("skips malformed CSV rows instead of throwing", () => {
    const target = new MemoryStorage();
    const csv = "date,bankroll,location,hours,handsPerHour,playerHands,bettingUnit,decks,penetration,dealerHitsSoft17,doubleAfterSplit,resplitAces,lateSurrender,blackjackPayout,ramp,netResult,expenses,notes\nnot-a-date,,,,,,,,,,,,,,,,,";
    expect(journalLibrary.importSessionsCsv(csv, target)).toBe(0);
    expect(journalLibrary.sessions(target)).toEqual([]);
  });

  it("exports transactions to CSV with the owning bankroll name", () => {
    const source = new MemoryStorage();
    journalLibrary.addTransaction({ date: "2026-08-01", type: "deposit", amount: 500 }, source);
    const csv = journalLibrary.exportTransactionsCsv(source);
    expect(csv).toContain("Main");
    expect(csv).toContain("500");
  });
});

describe("sessionsInRange", () => {
  const sessions = [
    { ...sessionInput, id: "a", createdAt: "2026-08-01T00:00:00Z", bankrollId: "main", date: "2026-08-13" },
    { ...sessionInput, id: "b", createdAt: "2026-07-01T00:00:00Z", bankrollId: "main", date: "2026-07-01" },
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
