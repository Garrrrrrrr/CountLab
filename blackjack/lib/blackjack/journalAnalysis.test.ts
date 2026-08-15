import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import type { JournalSession } from "./journal";
import {
  aggregateJournal,
  classifySessionAssessment,
  currentBankroll,
  journalCumulativeSeries,
  sessionZScore,
  theoreticalSessionOutcome,
} from "./journalAnalysis";

function makeSession(overrides: Partial<JournalSession> = {}): JournalSession {
  return {
    id: "s1",
    createdAt: "2026-08-01T12:00:00.000Z",
    bankrollId: "main",
    date: "2026-08-01",
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

describe("theoreticalSessionOutcome", () => {
  it("produces a positive trip EV and standard deviation for a positive-edge ramp over a real session length", () => {
    const outcome = theoreticalSessionOutcome(makeSession());
    expect(outcome.tripEv).toBeGreaterThan(0);
    expect(outcome.standardDeviation).toBeGreaterThan(0);
    expect(outcome.hourlyEv * 4).toBeCloseTo(outcome.tripEv, 6);
  });

  it("scales standard deviation with the square root of rounds played, holding the per-round distribution fixed", () => {
    const short = theoreticalSessionOutcome(makeSession({ hours: 1 }));
    const long = theoreticalSessionOutcome(makeSession({ hours: 4 }));
    expect(long.standardDeviation / short.standardDeviation).toBeCloseTo(Math.sqrt(4), 5);
  });
});

describe("sessionZScore and classifySessionAssessment", () => {
  it("returns z = 0 when the realized result exactly matches trip EV", () => {
    const outcome = theoreticalSessionOutcome(makeSession());
    const session = makeSession({ netResult: outcome.tripEv });
    const z = sessionZScore(session, outcome);
    expect(z).toBeCloseTo(0, 8);
    expect(classifySessionAssessment(z)).toBe("within-expected-range");
  });

  it("classifies a result several standard deviations above EV as a high outlier", () => {
    const outcome = theoreticalSessionOutcome(makeSession());
    const session = makeSession({ netResult: outcome.tripEv + 5 * outcome.standardDeviation });
    const z = sessionZScore(session, outcome);
    expect(z).toBeCloseTo(5, 6);
    expect(classifySessionAssessment(z)).toBe("outlier-high");
  });

  it("classifies a result several standard deviations below EV as a low outlier", () => {
    const outcome = theoreticalSessionOutcome(makeSession());
    const session = makeSession({ netResult: outcome.tripEv - 5 * outcome.standardDeviation });
    const z = sessionZScore(session, outcome);
    expect(classifySessionAssessment(z)).toBe("outlier-low");
  });

  it("returns insufficient-data when there is no variance to compare against", () => {
    const outcome = { tripEv: 0, standardDeviation: 0, hourlyEv: 0, averageBet: 0, playerEdge: 0 };
    const session = makeSession({ hours: 0 });
    expect(sessionZScore(session, outcome)).toBeNull();
    expect(classifySessionAssessment(null)).toBe("insufficient-data");
  });
});

describe("aggregateJournal", () => {
  it("sums actual and theoretical results and combines variance in quadrature across sessions", () => {
    const a = makeSession({ id: "a", netResult: 100 });
    const b = makeSession({ id: "b", netResult: -50 });
    const outcomeA = theoreticalSessionOutcome(a);
    const outcomeB = theoreticalSessionOutcome(b);
    const aggregate = aggregateJournal([a, b]);
    expect(aggregate.sessionCount).toBe(2);
    expect(aggregate.totalHours).toBe(8);
    expect(aggregate.totalActual).toBe(50);
    expect(aggregate.totalTheoretical).toBeCloseTo(outcomeA.tripEv + outcomeB.tripEv, 8);
    expect(aggregate.combinedStandardDeviation).toBeCloseTo(
      Math.sqrt(outcomeA.standardDeviation ** 2 + outcomeB.standardDeviation ** 2),
      8,
    );
    expect(aggregate.winRate).toBe(0.5);
  });

  it("returns zeroed output for an empty journal", () => {
    const aggregate = aggregateJournal([]);
    expect(aggregate.sessionCount).toBe(0);
    expect(aggregate.combinedZ).toBeNull();
    expect(aggregate.winRate).toBe(0);
  });
});

describe("journalCumulativeSeries", () => {
  it("orders sessions by date and accumulates actual, theoretical, and widening confidence bands", () => {
    const first = makeSession({ id: "first", date: "2026-08-02", netResult: 100 });
    const second = makeSession({ id: "second", date: "2026-08-01", netResult: -30 });
    const series = journalCumulativeSeries([first, second]);
    expect(series.map((point) => point.date)).toEqual(["2026-08-01", "2026-08-02"]);
    expect(series[1].actual).toBe(70);
    expect(series[1].upper - series[1].lower).toBeGreaterThan(series[0].upper - series[0].lower);
  });
});

describe("currentBankroll", () => {
  it("nets session play, expenses, deposits, and withdrawals", () => {
    const sessions = [makeSession({ netResult: 200, expenses: 40 })];
    const transactions = [
      { type: "deposit" as const, amount: 1000 },
      { type: "withdrawal" as const, amount: 300 },
    ];
    expect(currentBankroll(sessions, transactions)).toBe(200 - 40 + 1000 - 300);
  });
});
