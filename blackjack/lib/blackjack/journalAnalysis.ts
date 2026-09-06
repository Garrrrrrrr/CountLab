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

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 error-function
 * approximation (|error| < 1.5e-7) — far tighter than a percentile readout
 * needs, and it keeps this module dependency-free.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

export interface SessionExtreme {
  date: string;
  netResult: number;
}

export interface JournalAggregate {
  sessionCount: number;
  totalHours: number;
  totalActual: number;
  totalTheoretical: number;
  /** Comps, travel, and the like. Reported alongside table results, never netted into them: the EV model prices the table, not the trip. */
  totalExpenses: number;
  netAfterExpenses: number;
  /** Every dollar put at risk across all rounds played, which is what a casino rates you on. */
  totalAction: number;
  actualPerHour: number;
  theoreticalPerHour: number;
  combinedStandardDeviation: number;
  combinedZ: number | null;
  /** Share of possible outcomes this result beats, from the normal approximation. Null without variance to place it against. */
  resultPercentile: number | null;
  /** Hours at this pace and edge before cumulative EV overtakes one SD. Null when expectation is not positive. */
  nZeroHours: number | null;
  /** Hours played as a fraction of nZeroHours. Passes 1 once the long run is reached. */
  longRunProgress: number | null;
  ci95: [number, number];
  winRate: number;
  /** Deepest and latest fall from the running peak of cumulative results, both reported as positive amounts. */
  maxDrawdown: number;
  currentDrawdown: number;
  bestSession: SessionExtreme | null;
  worstSession: SessionExtreme | null;
  longestWinStreak: number;
  longestLossStreak: number;
  assessment: SessionAssessment;
}

export function aggregateJournal(sessions: JournalSession[]): JournalAggregate {
  let totalHours = 0, totalActual = 0, totalTheoretical = 0, totalExpenses = 0, totalAction = 0, combinedVariance = 0, wins = 0;
  let running = 0, peak = 0, maxDrawdown = 0;
  let winStreak = 0, lossStreak = 0, longestWinStreak = 0, longestLossStreak = 0;
  let bestSession: SessionExtreme | null = null, worstSession: SessionExtreme | null = null;
  // Ordered so drawdowns and streaks follow the sequence actually played, not
  // the order sessions happen to sit in storage.
  for (const session of orderSessions(sessions)) {
    const outcome = theoreticalSessionOutcome(session);
    totalHours += session.hours;
    totalActual += session.netResult;
    totalTheoretical += outcome.tripEv;
    totalExpenses += session.expenses;
    totalAction += outcome.averageBet * session.handsPerHour * session.hours;
    combinedVariance += outcome.standardDeviation ** 2;
    if (session.netResult > 0) wins += 1;

    running += session.netResult;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);

    winStreak = session.netResult > 0 ? winStreak + 1 : 0;
    lossStreak = session.netResult < 0 ? lossStreak + 1 : 0;
    longestWinStreak = Math.max(longestWinStreak, winStreak);
    longestLossStreak = Math.max(longestLossStreak, lossStreak);

    if (!bestSession || session.netResult > bestSession.netResult) bestSession = { date: session.date, netResult: session.netResult };
    if (!worstSession || session.netResult < worstSession.netResult) worstSession = { date: session.date, netResult: session.netResult };
  }
  const combinedStandardDeviation = Math.sqrt(combinedVariance);
  const combinedZ = combinedStandardDeviation > 0 ? (totalActual - totalTheoretical) / combinedStandardDeviation : null;
  // N0 solves ev·h = sd·√h for h, which reduces to variance·hours / ev² at the
  // pace and edge these sessions were actually played at.
  const nZeroHours = totalTheoretical > 0 && totalHours > 0 ? (combinedVariance * totalHours) / totalTheoretical ** 2 : null;
  return {
    sessionCount: sessions.length,
    totalHours,
    totalActual,
    totalTheoretical,
    totalExpenses,
    netAfterExpenses: totalActual - totalExpenses,
    totalAction,
    actualPerHour: totalHours > 0 ? totalActual / totalHours : 0,
    theoreticalPerHour: totalHours > 0 ? totalTheoretical / totalHours : 0,
    combinedStandardDeviation,
    combinedZ,
    resultPercentile: combinedZ === null ? null : normalCdf(combinedZ),
    nZeroHours,
    longRunProgress: nZeroHours ? totalHours / nZeroHours : null,
    ci95: [totalTheoretical - Z95 * combinedStandardDeviation, totalTheoretical + Z95 * combinedStandardDeviation],
    winRate: sessions.length ? wins / sessions.length : 0,
    maxDrawdown,
    currentDrawdown: peak - running,
    bestSession,
    worstSession,
    longestWinStreak,
    longestLossStreak,
    assessment: classifySessionAssessment(combinedZ),
  };
}

export interface JournalVenueSummary {
  /** The first spelling seen for this venue; an empty string groups sessions logged without a location. */
  location: string;
  sessionCount: number;
  totalHours: number;
  totalActual: number;
  totalTheoretical: number;
  actualPerHour: number;
  combinedStandardDeviation: number;
  combinedZ: number | null;
  assessment: SessionAssessment;
}

/** Results split by where they were played, so a venue that is quietly costing money is visible. Busiest venue first. */
export function journalByVenue(sessions: JournalSession[]): JournalVenueSummary[] {
  const groups = new Map<string, { location: string; sessions: JournalSession[] }>();
  for (const session of sessions) {
    const location = session.location?.trim() ?? "";
    const key = location.toLocaleLowerCase();
    const group = groups.get(key) ?? { location, sessions: [] };
    group.sessions.push(session);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ location, sessions: venueSessions }) => {
      const aggregate = aggregateJournal(venueSessions);
      return {
        location,
        sessionCount: aggregate.sessionCount,
        totalHours: aggregate.totalHours,
        totalActual: aggregate.totalActual,
        totalTheoretical: aggregate.totalTheoretical,
        actualPerHour: aggregate.actualPerHour,
        combinedStandardDeviation: aggregate.combinedStandardDeviation,
        combinedZ: aggregate.combinedZ,
        assessment: aggregate.assessment,
      };
    })
    .sort((a, b) => b.totalHours - a.totalHours || b.sessionCount - a.sessionCount);
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

/**
 * Table results plus money moved in and out. Session expenses are deliberately
 * excluded: comps and travel are spending against the trip, not wins or losses
 * against the bankroll, and folding them in here made every result read worse
 * than the game actually played. `JournalAggregate.totalExpenses` reports them.
 */
export function currentBankroll(sessions: JournalSession[], transactions: { type: "deposit" | "withdrawal"; amount: number }[]): number {
  const netPlay = sessions.reduce((sum, session) => sum + session.netResult, 0);
  const netTransactions = transactions.reduce((sum, transaction) => sum + (transaction.type === "deposit" ? transaction.amount : -transaction.amount), 0);
  return netPlay + netTransactions;
}
