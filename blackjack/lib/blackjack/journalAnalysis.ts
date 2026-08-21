import { calculateAdvantage } from "./advantage";
import type { JournalSession } from "./journal";

const Z95 = 1.95996398454;

export interface TheoreticalOutcome {
  tripEv: number;
  standardDeviation: number;
  hourlyEv: number;
  averageBet: number;
  playerEdge: number;
}

/**
 * bankroll is fixed at 0 because calculateAdvantage only uses it to derive
 * riskOfRuin/nZeroHours, neither of which this function returns; a realized
 * session's trip EV and SD do not depend on bankroll size.
 */
export function theoreticalSessionOutcome(session: Pick<JournalSession, "rules" | "ramp" | "bettingUnit" | "playerHands" | "handsByTrueCount" | "handsPerHour" | "hours">): TheoreticalOutcome {
  // The audited coefficients are simulated for exactly H17/DAS/RSA/LS/3:2, so a
  // session logged with other rules needs a flat literature-estimated delta or
  // its edge is overstated. calculateAdvantage derives that from session.rules.
  const result = calculateAdvantage({
    bankroll: 0,
    bettingUnit: session.bettingUnit,
    playerHands: session.playerHands,
    handsByTrueCount: session.handsByTrueCount,
    handsPerHour: session.handsPerHour,
    hours: session.hours,
    rules: session.rules,
    ramp: session.ramp,
  });
  return {
    tripEv: result.tripEv,
    standardDeviation: result.standardDeviation,
    hourlyEv: result.hourlyEv,
    averageBet: result.averageBet,
    playerEdge: result.playerEdge,
  };
}

export function sessionZScore(session: JournalSession, outcome: TheoreticalOutcome = theoreticalSessionOutcome(session)): number | null {
  if (!(outcome.standardDeviation > 0)) return null;
  return (session.netResult - outcome.tripEv) / outcome.standardDeviation;
}

export type SessionAssessment =
  | "insufficient-data"
  | "within-expected-range"
  | "better-than-expected"
  | "worse-than-expected"
  | "outlier-high"
  | "outlier-low";

export function classifySessionAssessment(z: number | null): SessionAssessment {
  if (z === null || !Number.isFinite(z)) return "insufficient-data";
  const magnitude = Math.abs(z);
  if (magnitude < 1) return "within-expected-range";
  if (magnitude < 2) return z > 0 ? "better-than-expected" : "worse-than-expected";
  return z > 0 ? "outlier-high" : "outlier-low";
}

export interface JournalAggregate {
  sessionCount: number;
  totalHours: number;
  totalActual: number;
  totalTheoretical: number;
  combinedStandardDeviation: number;
  combinedZ: number | null;
  ci95: [number, number];
  winRate: number;
  assessment: SessionAssessment;
}

export function aggregateJournal(sessions: JournalSession[]): JournalAggregate {
  let totalHours = 0, totalActual = 0, totalTheoretical = 0, combinedVariance = 0, wins = 0;
  for (const session of sessions) {
    const outcome = theoreticalSessionOutcome(session);
    totalHours += session.hours;
    totalActual += session.netResult;
    totalTheoretical += outcome.tripEv;
    combinedVariance += outcome.standardDeviation ** 2;
    if (session.netResult > 0) wins += 1;
  }
  const combinedStandardDeviation = Math.sqrt(combinedVariance);
  const combinedZ = combinedStandardDeviation > 0 ? (totalActual - totalTheoretical) / combinedStandardDeviation : null;
  return {
    sessionCount: sessions.length,
    totalHours,
    totalActual,
    totalTheoretical,
    combinedStandardDeviation,
    combinedZ,
    ci95: [totalTheoretical - Z95 * combinedStandardDeviation, totalTheoretical + Z95 * combinedStandardDeviation],
    winRate: sessions.length ? wins / sessions.length : 0,
    assessment: classifySessionAssessment(combinedZ),
  };
}

export interface JournalCumulativePoint {
  index: number;
  date: string;
  actual: number;
  theoretical: number;
  lower: number;
  upper: number;
}

function orderSessions(sessions: JournalSession[]) {
  return [...sessions].sort((a, b) => a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date));
}

export function journalCumulativeSeries(sessions: JournalSession[]): JournalCumulativePoint[] {
  let actual = 0, theoretical = 0, variance = 0;
  return orderSessions(sessions).map((session, index) => {
    const outcome = theoreticalSessionOutcome(session);
    actual += session.netResult;
    theoretical += outcome.tripEv;
    variance += outcome.standardDeviation ** 2;
    const standardDeviation = Math.sqrt(variance);
    return {
      index: index + 1,
      date: session.date,
      actual: Math.round(actual),
      theoretical: Math.round(theoretical),
      lower: Math.round(theoretical - Z95 * standardDeviation),
      upper: Math.round(theoretical + Z95 * standardDeviation),
    };
  });
}

export function currentBankroll(sessions: JournalSession[], transactions: { type: "deposit" | "withdrawal"; amount: number }[]): number {
  const netPlay = sessions.reduce((sum, session) => sum + session.netResult - session.expenses, 0);
  const netTransactions = transactions.reduce((sum, transaction) => sum + (transaction.type === "deposit" ? transaction.amount : -transaction.amount), 0);
  return netPlay + netTransactions;
}
