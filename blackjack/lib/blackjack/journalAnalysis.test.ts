import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import { RULE_DELTAS } from "./ruleAdjustments";
import type { JournalSession } from "./journal";
import {
  aggregateJournal,
  classifySessionAssessment,
  currentBankroll,
  journalByVenue,
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

  it("applies the same off-baseline rule penalty as the Bankroll Lab, e.g. 6:5 blackjack payout", () => {
    const baseline = theoreticalSessionOutcome(makeSession());
    const sixToFive = theoreticalSessionOutcome(
      makeSession({ rules: { ...DEFAULT_ADVANTAGE_RULES, blackjackPayout: 1.2 } }),
    );
    expect(sixToFive.playerEdge).toBeCloseTo(baseline.playerEdge + RULE_DELTAS.blackjackPays6to5, 8);
  });

  it("uses a per-true-count hands schedule when the session recorded one, like the Bankroll Lab", () => {
    const flat = theoreticalSessionOutcome(makeSession({ playerHands: 1 }));
    const spread = theoreticalSessionOutcome(
      makeSession({ playerHands: 1, handsByTrueCount: [{ trueCount: 0, hands: 1 }, { trueCount: 2, hands: 3 }] }),
    );
    expect(spread.tripEv).toBeGreaterThan(flat.tripEv);
    expect(spread.standardDeviation).toBeGreaterThan(flat.standardDeviation);
  });

  it("applies the S17 bonus and no-DAS/no-RSA/no-LS penalties together, like the Bankroll Lab", () => {
    const baseline = theoreticalSessionOutcome(makeSession());
    const offBaseline = theoreticalSessionOutcome(
      makeSession({
        rules: {
          ...DEFAULT_ADVANTAGE_RULES,
          dealerHitsSoft17: false,
          doubleAfterSplit: false,
          resplitAces: false,
          lateSurrender: false,
        },
      }),
    );
    const expectedDelta =
      RULE_DELTAS.dealerStandsSoft17 + RULE_DELTAS.noDoubleAfterSplit + RULE_DELTAS.noResplitAces + RULE_DELTAS.noLateSurrender;
    expect(offBaseline.playerEdge).toBeCloseTo(baseline.playerEdge + expectedDelta, 8);
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

  it("reports expenses as their own total without netting them against the table result", () => {
    const aggregate = aggregateJournal([
      makeSession({ id: "a", netResult: 400, expenses: 120 }),
      makeSession({ id: "b", netResult: -100, expenses: 30 }),
    ]);
    expect(aggregate.totalActual).toBe(300);
    expect(aggregate.totalExpenses).toBe(150);
    expect(aggregate.netAfterExpenses).toBe(150);
  });

  it("divides actual and theoretical results by hours played to give hourly rates", () => {
    const aggregate = aggregateJournal([
      makeSession({ id: "a", hours: 4, netResult: 400 }),
      makeSession({ id: "b", hours: 6, netResult: 100 }),
    ]);
    expect(aggregate.totalHours).toBe(10);
    expect(aggregate.actualPerHour).toBe(50);
    expect(aggregate.theoreticalPerHour).toBeCloseTo(aggregate.totalTheoretical / 10, 8);
  });

  it("totals action as average bet across every round played", () => {
    const session = makeSession({ hours: 4, handsPerHour: 100 });
    const outcome = theoreticalSessionOutcome(session);
    expect(aggregateJournal([session]).totalAction).toBeCloseTo(outcome.averageBet * 400, 6);
  });

  it("reports a result exactly at expectation as the fiftieth percentile of outcomes", () => {
    const session = makeSession();
    const outcome = theoreticalSessionOutcome(session);
    expect(aggregateJournal([makeSession({ netResult: outcome.tripEv })]).resultPercentile).toBeCloseTo(0.5, 6);
  });

  it("places a result one standard deviation above expectation near the eighty-fourth percentile", () => {
    const outcome = theoreticalSessionOutcome(makeSession());
    const aggregate = aggregateJournal([makeSession({ netResult: outcome.tripEv + outcome.standardDeviation })]);
    expect(aggregate.resultPercentile).toBeCloseTo(0.8413, 3);
  });

  it("leaves the percentile undefined when there is no variance to place a result against", () => {
    expect(aggregateJournal([]).resultPercentile).toBeNull();
  });

  it("reports the hours needed for expectation to overtake one standard deviation, and progress toward them", () => {
    const session = makeSession({ hours: 4 });
    const outcome = theoreticalSessionOutcome(session);
    const aggregate = aggregateJournal([session]);
    // N0 is where cumulative EV equals cumulative SD: (sd/ev)^2 hours at this pace.
    const expected = 4 * (outcome.standardDeviation / outcome.tripEv) ** 2;
    expect(aggregate.nZeroHours).toBeCloseTo(expected, 4);
    expect(aggregate.longRunProgress).toBeCloseTo(4 / expected, 6);
  });

  it("leaves the long run undefined for a journal with no positive expectation", () => {
    const aggregate = aggregateJournal([]);
    expect(aggregate.nZeroHours).toBeNull();
    expect(aggregate.longRunProgress).toBeNull();
  });

  it("measures the deepest and the current fall from the cumulative peak", () => {
    const aggregate = aggregateJournal([
      makeSession({ id: "a", date: "2026-08-01", netResult: 1000 }),
      makeSession({ id: "b", date: "2026-08-02", netResult: -700 }),
      makeSession({ id: "c", date: "2026-08-03", netResult: 200 }),
    ]);
    expect(aggregate.maxDrawdown).toBe(700);
    expect(aggregate.currentDrawdown).toBe(500);
  });

  it("reports no drawdown for a journal that only ever climbed", () => {
    const aggregate = aggregateJournal([
      makeSession({ id: "a", date: "2026-08-01", netResult: 100 }),
      makeSession({ id: "b", date: "2026-08-02", netResult: 250 }),
    ]);
    expect(aggregate.maxDrawdown).toBe(0);
    expect(aggregate.currentDrawdown).toBe(0);
  });

  it("names the biggest winning and losing sessions", () => {
    const aggregate = aggregateJournal([
      makeSession({ id: "a", date: "2026-08-01", netResult: 120 }),
      makeSession({ id: "b", date: "2026-08-02", netResult: 900 }),
      makeSession({ id: "c", date: "2026-08-03", netResult: -640 }),
    ]);
    expect(aggregate.bestSession).toEqual({ date: "2026-08-02", netResult: 900 });
    expect(aggregate.worstSession).toEqual({ date: "2026-08-03", netResult: -640 });
  });

  it("counts the longest runs of consecutive winning and losing sessions by date", () => {
    const aggregate = aggregateJournal([
      makeSession({ id: "a", date: "2026-08-01", netResult: 50 }),
      makeSession({ id: "b", date: "2026-08-02", netResult: 60 }),
      makeSession({ id: "c", date: "2026-08-03", netResult: 70 }),
      makeSession({ id: "d", date: "2026-08-04", netResult: -10 }),
      makeSession({ id: "e", date: "2026-08-05", netResult: -20 }),
    ]);
    expect(aggregate.longestWinStreak).toBe(3);
    expect(aggregate.longestLossStreak).toBe(2);
  });

  it("treats a breakeven session as ending both streaks", () => {
    const aggregate = aggregateJournal([
      makeSession({ id: "a", date: "2026-08-01", netResult: 50 }),
      makeSession({ id: "b", date: "2026-08-02", netResult: 0 }),
      makeSession({ id: "c", date: "2026-08-03", netResult: 50 }),
    ]);
    expect(aggregate.longestWinStreak).toBe(1);
    expect(aggregate.longestLossStreak).toBe(0);
  });
});

describe("journalByVenue", () => {
  it("groups sessions by location and sorts the busiest venue first", () => {
    const venues = journalByVenue([
      makeSession({ id: "a", location: "Downtown", hours: 3, netResult: 300 }),
      makeSession({ id: "b", location: "Strip", hours: 8, netResult: -200 }),
      makeSession({ id: "c", location: "Downtown", hours: 2, netResult: 100 }),
    ]);
    expect(venues.map((venue) => venue.location)).toEqual(["Strip", "Downtown"]);
    expect(venues[1].sessionCount).toBe(2);
    expect(venues[1].totalHours).toBe(5);
    expect(venues[1].totalActual).toBe(400);
    expect(venues[1].actualPerHour).toBe(80);
  });

  it("collects sessions logged without a location under one unnamed group", () => {
    const venues = journalByVenue([
      makeSession({ id: "a", netResult: 10 }),
      makeSession({ id: "b", location: "   ", netResult: 20 }),
    ]);
    expect(venues).toHaveLength(1);
    expect(venues[0].location).toBe("");
    expect(venues[0].totalActual).toBe(30);
  });

  it("treats the same venue name in different letter cases as one venue", () => {
    const venues = journalByVenue([
      makeSession({ id: "a", location: "Bellagio", netResult: 10 }),
      makeSession({ id: "b", location: "bellagio", netResult: 20 }),
    ]);
    expect(venues).toHaveLength(1);
    expect(venues[0].location).toBe("Bellagio");
    expect(venues[0].sessionCount).toBe(2);
  });

  it("scores each venue against the theoretical EV of the sessions played there", () => {
    const session = makeSession({ location: "Downtown", netResult: 0 });
    const outcome = theoreticalSessionOutcome(session);
    const [venue] = journalByVenue([session]);
    expect(venue.totalTheoretical).toBeCloseTo(outcome.tripEv, 8);
    expect(venue.combinedZ).toBeCloseTo(-outcome.tripEv / outcome.standardDeviation, 6);
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
  it("nets session play, deposits, and withdrawals", () => {
    const sessions = [makeSession({ netResult: 200 })];
    const transactions = [
      { type: "deposit" as const, amount: 1000 },
      { type: "withdrawal" as const, amount: 300 },
    ];
    expect(currentBankroll(sessions, transactions)).toBe(200 + 1000 - 300);
  });

  it("leaves session expenses out of the bankroll, since they are spending rather than table results", () => {
    const withExpenses = [makeSession({ netResult: 200, expenses: 40 })];
    const withoutExpenses = [makeSession({ netResult: 200, expenses: 0 })];
    expect(currentBankroll(withExpenses, [])).toBe(currentBankroll(withoutExpenses, []));
    expect(currentBankroll(withExpenses, [])).toBe(200);
  });
});
