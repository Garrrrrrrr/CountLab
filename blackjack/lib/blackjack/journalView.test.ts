import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import type { JournalSession } from "./journal";
import { compactMoney, longDate, money, shortDate, signedMoney } from "./journalFormat";
import { bankrollBalances, cashTotals, neighbourId, newestFirst, periodTitle, previewJsonImport, sessionMatches, targetBankrollId } from "./journalView";

function makeSession(overrides: Partial<JournalSession> = {}): JournalSession {
  return {
    id: "s1",
    createdAt: "2026-08-01T12:00:00.000Z",
    bankrollId: "main",
    date: "2026-09-08",
    hours: 4,
    handsPerHour: 100,
    playerHands: 1,
    bettingUnit: 25,
    rules: DEFAULT_ADVANTAGE_RULES,
    ramp: RAMPS["1-8"],
    netResult: 0,
    expenses: 0,
    ...overrides,
  };
}

describe("formatting", () => {
  it("writes signs out with a true minus", () => {
    expect(signedMoney(120)).toBe("+$120");
    expect(signedMoney(-450)).toBe("−$450");
    expect(signedMoney(0)).toBe("$0");
    expect(signedMoney(-0.4)).toBe("$0");
    expect(money(-50)).toBe("−$50");
    expect(money(1234.5, 2)).toBe("$1,234.50");
  });

  it("abbreviates chart ticks", () => {
    expect(compactMoney(11000)).toBe("$11K");
    expect(compactMoney(-5000)).toBe("−$5K");
    expect(compactMoney(0)).toBe("$0");
  });

  it("shows the year only outside the current one", () => {
    const now = new Date(2026, 8, 26);
    expect(shortDate("2026-09-08", now)).toBe("Sep 8");
    expect(shortDate("2025-12-31", now)).toBe("Dec 31, 2025");
    expect(shortDate("2026-9-8", now)).toBe("Invalid date");
    expect(longDate("2026-09-08")).toBe("Sep 8, 2026");
  });
});

describe("sessionMatches", () => {
  const session = makeSession({ location: "Bellagio", notes: "Fresh shuffle", netResult: 120 });

  it("finds a session by any spelling of its date", () => {
    for (const query of ["2026-09-08", "Sep 8", "sep 8, 2026", "September 8"]) expect(sessionMatches(session, query, "all")).toBe(true);
    expect(sessionMatches(session, "Sep 9", "all")).toBe(false);
  });

  it("searches casino and notes, case-insensitively", () => {
    expect(sessionMatches(session, "bellagio", "all")).toBe(true);
    expect(sessionMatches(session, "SHUFFLE", "all")).toBe(true);
  });

  it("keeps breakevens out of both Wins and Losses", () => {
    const even = makeSession({ netResult: 0 });
    expect(sessionMatches(even, "", "all")).toBe(true);
    expect(sessionMatches(even, "", "win")).toBe(false);
    expect(sessionMatches(even, "", "loss")).toBe(false);
    expect(sessionMatches(session, "", "win")).toBe(true);
    expect(sessionMatches(session, "", "loss")).toBe(false);
  });
});

describe("scopes and lists", () => {
  it("orders newest first by date, then by when it was logged", () => {
    const ordered = newestFirst([
      makeSession({ id: "a", date: "2026-09-01" }),
      makeSession({ id: "b", date: "2026-09-03", createdAt: "2026-09-03T08:00:00Z" }),
      makeSession({ id: "c", date: "2026-09-03", createdAt: "2026-09-03T09:00:00Z" }),
    ]);
    expect(ordered.map((session) => session.id)).toEqual(["c", "b", "a"]);
  });

  it("balances each bankroll on its own records", () => {
    const balances = bankrollBalances(
      [{ id: "main", createdAt: "", name: "Main" }, { id: "trip", createdAt: "", name: "Trip" }],
      [makeSession({ bankrollId: "main", netResult: 200 }), makeSession({ bankrollId: "trip", netResult: -50 })],
      [{ id: "t", createdAt: "", bankrollId: "trip", date: "2026-09-01", type: "deposit", amount: 1000 }],
    );
    expect(balances.get("main")).toBe(200);
    expect(balances.get("trip")).toBe(950);
  });

  it("totals deposits and withdrawals", () => {
    expect(cashTotals([{ type: "deposit", amount: 500 }, { type: "withdrawal", amount: 120 }, { type: "deposit", amount: 20 }])).toEqual({ deposits: 520, withdrawals: 120, net: 400 });
  });

  it("targets the viewed bankroll, or the default under All", () => {
    expect(targetBankrollId("all", "main")).toBe("main");
    expect(targetBankrollId("trip", "main")).toBe("trip");
  });

  it("moves focus to the next row, then the previous, then nowhere", () => {
    expect(neighbourId(["a", "b", "c"], "b")).toBe("c");
    expect(neighbourId(["a", "b", "c"], "c")).toBe("b");
    expect(neighbourId(["a"], "a")).toBeNull();
    expect(neighbourId(["a"], "z")).toBeNull();
  });

  it("titles the period", () => {
    expect(periodTitle("all")).toBe("All time");
    expect(periodTitle(30)).toBe("Last 30 days");
  });
});

describe("previewJsonImport", () => {
  const existing = { sessions: [{ id: "s1" }, { id: "s2" }], transactions: [{ id: "t1" }] };

  it("counts records and the ones that will replace local copies", () => {
    const raw = JSON.stringify({ version: 1, bankrolls: [], sessions: [{ id: "s1" }, { id: "s9" }], transactions: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] });
    expect(previewJsonImport(raw, existing)).toEqual({ sessions: 2, transactions: 3, replacing: 2 });
  });

  it("rejects files that are not journal backups", () => {
    expect(() => previewJsonImport("not json", existing)).toThrow(/isn't valid JSON/);
    expect(() => previewJsonImport(JSON.stringify({ version: 2, sessions: [], transactions: [] }), existing)).toThrow("This is not a valid CountLab journal backup.");
    expect(() => previewJsonImport("null", existing)).toThrow("This is not a valid CountLab journal backup.");
  });
});
