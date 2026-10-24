import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "@/lib/blackjack/advantage";
import { journalLibrary, type JournalSession } from "@/lib/blackjack/journal";
import {
  cashLabel, dateFilterPhrase, deleteAllJournalRecords, filterByDate, filterByVenue, groupByMonth, isNarrowed, orderedRange,
  signedCash, simulationHands, SIMULATION_HAND_CAP, toneClass, venueChoices, venueKey, type DateFilter,
} from "./model";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

let counter = 0;
const session = (overrides: Partial<JournalSession> = {}): JournalSession => ({
  id: `s${counter++}`,
  createdAt: "2026-10-01T12:00:00.000Z",
  bankrollId: "main",
  date: "2026-10-20",
  hours: 4,
  handsPerHour: 100,
  playerHands: 1,
  bettingUnit: 25,
  rules: DEFAULT_ADVANTAGE_RULES,
  ramp: RAMPS["1-8"],
  netResult: 100,
  expenses: 0,
  ...overrides,
});

const now = new Date("2026-10-24T15:00:00");
const custom = (from: string, to: string): DateFilter => ({ period: "custom", from, to });

describe("date filter", () => {
  const sessions = [
    session({ id: "today", date: "2026-10-24" }),
    session({ id: "week", date: "2026-10-18" }),
    session({ id: "month", date: "2026-09-30" }),
    session({ id: "spring", date: "2026-03-01" }),
    session({ id: "lastYear", date: "2025-12-31" }),
    session({ id: "broken", date: "2026-9-8" }),
  ];
  const ids = (filter: DateFilter) => filterByDate(sessions, filter, now).map((item) => item.id);

  it("keeps everything for all time", () => {
    expect(ids({ period: "all", from: "", to: "" })).toHaveLength(6);
  });

  it("matches the old rolling windows and keeps invalid dates visible for repair", () => {
    expect(ids({ period: "7", from: "", to: "" })).toEqual(["today", "week", "broken"]);
    expect(ids({ period: "30", from: "", to: "" })).toEqual(["today", "week", "month", "broken"]);
  });

  it("limits this year to the local calendar year", () => {
    expect(ids({ period: "year", from: "", to: "" })).toEqual(["today", "week", "month", "spring", "broken"]);
  });

  it("treats custom bounds as inclusive, open-ended when blank, and in order whichever is typed first", () => {
    expect(ids(custom("2026-09-30", "2026-10-18"))).toEqual(["week", "month", "broken"]);
    expect(ids(custom("2026-10-18", "2026-09-30"))).toEqual(["week", "month", "broken"]);
    expect(ids(custom("2026-10-01", ""))).toEqual(["today", "week", "broken"]);
    expect(ids(custom("", "2025-12-31"))).toEqual(["lastYear", "broken"]);
    expect(ids(custom("2026-1", ""))).toHaveLength(6);
  });

  it("says the range in words", () => {
    expect(dateFilterPhrase({ period: "all", from: "", to: "" }, now)).toBe("all time");
    expect(dateFilterPhrase({ period: "30", from: "", to: "" }, now)).toBe("the last 30 days");
    expect(dateFilterPhrase({ period: "year", from: "", to: "" }, now)).toBe("2026");
    expect(dateFilterPhrase(custom("2026-10-18", "2026-09-30"), now)).toBe("Sep 30 to Oct 18");
    expect(dateFilterPhrase(custom("2026-10-18", "2026-10-18"), now)).toBe("Oct 18");
    expect(dateFilterPhrase(custom("2025-12-01", ""), now)).toBe("since Dec 1, 2025");
    expect(dateFilterPhrase(custom("", "2026-10-01"), now)).toBe("until Oct 1");
    expect(dateFilterPhrase(custom("", ""), now)).toBe("all time");
  });

  it("knows when a filter narrows nothing", () => {
    expect(isNarrowed({ period: "all", from: "", to: "" })).toBe(false);
    expect(isNarrowed(custom("", ""))).toBe(false);
    expect(isNarrowed(custom("2026-10-01", ""))).toBe(true);
    expect(isNarrowed({ period: "7", from: "", to: "" })).toBe(true);
    expect(orderedRange(custom("2026-13-01", "2026-10-01"))).toEqual({ from: "", to: "2026-10-01" });
  });
});

describe("venue filter", () => {
  const sessions = [
    session({ id: "a", location: "Bellagio", date: "2026-10-01" }),
    session({ id: "b", location: "  bellagio ", date: "2026-10-05" }),
    session({ id: "c", location: "Wynn", date: "2026-10-02" }),
    session({ id: "d", location: undefined }),
    session({ id: "e", location: "   " }),
  ];

  it("matches casinos regardless of case and spaces", () => {
    expect(venueKey(" Bellagio ")).toBe("bellagio");
    expect(venueKey(undefined)).toBe("");
    expect(filterByVenue(sessions, "bellagio").map((item) => item.id)).toEqual(["a", "b"]);
    expect(filterByVenue(sessions, "").map((item) => item.id)).toEqual(["d", "e"]);
    expect(filterByVenue(sessions, null)).toHaveLength(5);
  });

  it("lists the busiest casino first, with the latest spelling, and unnamed sessions last", () => {
    expect(venueChoices(sessions)).toEqual([
      { key: "bellagio", name: "bellagio", count: 2 },
      { key: "wynn", name: "Wynn", count: 1 },
      { key: "", name: "No casino recorded", count: 2 },
    ]);
  });
});

describe("month groups", () => {
  it("groups newest month first with totals, and puts dates needing repair on top", () => {
    const groups = groupByMonth([
      session({ id: "sep", date: "2026-09-12", netResult: -50, hours: 2 }),
      session({ id: "oct1", date: "2026-10-01", netResult: 200, hours: 3 }),
      session({ id: "oct2", date: "2026-10-20", netResult: -75, hours: 1.5 }),
      session({ id: "bad", date: "" }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["invalid", "2026-10", "2026-09"]);
    expect(groups[0].label).toBe("Date needs fixing");
    expect(groups[1]).toMatchObject({ label: "October 2026", total: 125, hours: 4.5 });
    expect(groups[1].sessions.map((item) => item.id)).toEqual(["oct2", "oct1"]);
  });
});

describe("labels", () => {
  it("colours by sign and names cash movements exactly", () => {
    expect(toneClass(5)).toBe("text-pos");
    expect(toneClass(-5)).toBe("text-neg");
    expect(toneClass(0)).toBe("text-ink");
    expect(signedCash({ type: "withdrawal", amount: 40 })).toBe(-40);
    expect(cashLabel({ type: "deposit", amount: 250.5, date: "2026-10-02" })).toBe("deposit of $250.50 from Oct 2");
  });

  it("caps the simulated hands and skips a game that bets nothing", () => {
    expect(simulationHands({ handsPerHour: 100, hours: 1.5, ramp: RAMPS["1-8"] })).toBe(150);
    expect(simulationHands({ handsPerHour: 100, hours: 80, ramp: RAMPS["1-8"] })).toBe(SIMULATION_HAND_CAP);
    expect(simulationHands({ handsPerHour: 100, hours: 0, ramp: RAMPS["1-8"] })).toBe(0);
    expect(simulationHands({ handsPerHour: 100, hours: 2, ramp: [{ trueCount: -8, units: 0 }] })).toBe(0);
  });
});

describe("delete everything", () => {
  const input = { date: "2026-08-01", hours: 4, handsPerHour: 100, playerHands: 1, bettingUnit: 25, rules: DEFAULT_ADVANTAGE_RULES, ramp: RAMPS["1-8"], netResult: 120, expenses: 0 };

  it("deletes every record through tombstones, so a later pull cannot bring them back, and keeps one bankroll", () => {
    const store = new MemoryStorage();
    const trip = journalLibrary.addBankroll("Trip", store);
    const home = journalLibrary.addSession(input, store);
    const away = journalLibrary.addSession({ ...input, bankrollId: trip.id }, store);
    const deposit = journalLibrary.addTransaction({ date: "2026-08-01", type: "deposit", amount: 5000 }, store);
    const keep = journalLibrary.defaultBankrollId(store);

    expect(deleteAllJournalRecords(store)).toEqual({ sessions: 2, transactions: 1, bankrolls: 1 });
    expect(journalLibrary.sessions(store)).toEqual([]);
    expect(journalLibrary.transactions(store)).toEqual([]);
    expect(journalLibrary.bankrolls(store).map((bankroll) => bankroll.id)).toEqual([keep]);

    // What a sync pull would do with the account's older copies.
    journalLibrary.mergeRemoteSessions([home, away], store);
    journalLibrary.mergeRemoteTransactions([deposit], store);
    journalLibrary.mergeRemoteBankrolls([trip], store);
    expect(journalLibrary.sessions(store)).toEqual([]);
    expect(journalLibrary.transactions(store)).toEqual([]);
    expect(journalLibrary.bankrolls(store).map((bankroll) => bankroll.id)).toEqual([keep]);
  });

  it("does nothing harmful on an empty journal", () => {
    const store = new MemoryStorage();
    expect(deleteAllJournalRecords(store)).toEqual({ sessions: 0, transactions: 0, bankrolls: 0 });
    expect(journalLibrary.bankrolls(store)).toHaveLength(1);
  });
});
