import { BASIC_ES10_COEFFICIENTS } from "./basicEs10Coefficients";
import { BASIC_LS_COEFFICIENTS } from "./basicLsCoefficients";
import { GAME_OPTIONS, type Decks } from "./coefficients";
import { ruleAdjustmentFlagsFromRules, sumRuleAdjustment } from "./ruleAdjustments";
import { WONG_ES10_COEFFICIENTS } from "./wongEs10Coefficients";
import { WONG_LS_COEFFICIENTS } from "./wongLsCoefficients";
/** Stored with journal sessions; every saved value now prices with Wong's indices, which the charts teach. */
export type IndexPolicy = "h17-pro";
export interface AdvantageRules {
  decks: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  /** Early surrender against a ten (late against an ace): simulated, not estimated. Implies surrender. */
  earlySurrender?: boolean;
  blackjackPayout: 1.5 | 1.2;
  penetration: number;
  /** Wong's index plays and insurance, as the charts teach. Set false for basic strategy. */
  useIndices?: boolean;
  indexPolicy?: IndexPolicy;
}
export interface RampPoint {
  trueCount: number;
  units: number;
}
export interface HandCountPoint {
  trueCount: number;
  hands: number;
}
export interface AdvantageInput {
  bankroll: number;
  bettingUnit?: number;
  playerHands?: number;
  handsByTrueCount?: HandCountPoint[];
  handsPerHour: number;
  hours: number;
  rules: AdvantageRules;
  ramp: RampPoint[];
  /**
   * Extra flat edge shift for rules `AdvantageRules` cannot express: European
   * no-hole-card and restricted doubling. The shifts for the rules it *can*
   * express are derived from `rules` and applied automatically — do not add
   * them here as well.
   */
  ruleAdjustment?: number;
  /**
   * Back-counting with an exit point: per true count −8…+8, the share of all dealt rounds that are
   * watched and that are played (../blackjack-simulator/wongout.py). Watched shares replace the
   * count frequencies (time at the table), and only the played part of each count is bet.
   */
  countShares?: CountShares;
}
export interface CountShares {
  watched: readonly number[];
  played: readonly number[];
  /** Time away from any table (moving to a fresh shoe), in the same units: it counts toward the hours but deals nothing. */
  idle?: number;
}
export interface CountRow {
  trueCount: number;
  label: string;
  frequency: number;
  advantage: number;
  sdUnits: number;
  standardError: number;
  ci95: [number, number];
  samples: number;
  bet: number;
  totalBet: number;
  playerHands: number;
  units: number;
  /** The share of this count's rounds that are played: 1 unless back-counting with an exit point. */
  playShare: number;
}
export interface AdvantageResult {
  averageBet: number;
  playerEdge: number;
  evPerRound: number;
  evPer100: number;
  hourlyEv: number;
  tripEv: number;
  sdPerRound: number;
  sdPerHour: number;
  standardDeviation: number;
  riskOfRuin: number;
  nZeroRounds: number;
  nZeroHours: number;
  rows: CountRow[];
}
export const DEFAULT_ADVANTAGE_RULES: AdvantageRules = {
  decks: 6,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  resplitAces: true,
  lateSurrender: true,
  blackjackPayout: 1.5,
  penetration: 0.75,
  useIndices: true,
  indexPolicy: "h17-pro",
};
const TC_LABELS = [
  "≤ -8",
  "-7",
  "-6",
  "-5",
  "-4",
  "-3",
  "-2",
  "-1",
  "0",
  "+1",
  "+2",
  "+3",
  "+4",
  "+5",
  "+6",
  "+7",
  "≥ +8",
];
const Z95 = 1.95996398454;
/** The audited profile key whose deck count and penetration best match `rules`. */
export function profileKey(rules: AdvantageRules) {
  const options = GAME_OPTIONS[rules.decks as Decks] ?? GAME_OPTIONS[6],
    requested = rules.penetration * rules.decks,
    selected = [...options].sort(
      (a, b) => Math.abs(a.dealt - requested) - Math.abs(b.dealt - requested),
    )[0];
  const key = `${rules.decks}-${selected.dealt}`;
  return key in BASIC_LS_COEFFICIENTS ? key : "6-4.5";
}
/**
 * Per-true-count edge, frequency, and variance for a game.
 *
 * Every curve is simulated with the site's own strategy engine (../blackjack-simulator/wong.py):
 * basic strategy, or basic strategy plus Wong's count plays and insurance, each with late
 * surrender or with early surrender against a ten. No curve is interpolated.
 */
export function getCountProfile(rules: AdvantageRules) {
  const key = profileKey(rules);
  const early = rules.earlySurrender === true;
  const coefficients = rules.useIndices === false
    ? (early ? BASIC_ES10_COEFFICIENTS : BASIC_LS_COEFFICIENTS)[key]
    : (early ? WONG_ES10_COEFFICIENTS : WONG_LS_COEFFICIENTS)[key];
  return coefficients.map((plain, position) => {
    const [p, adv, sd, samples, standardError] = plain;
    return {
      tc: position - 8,
      label: TC_LABELS[position],
      p,
      adv,
      sd,
      samples,
      standardError,
      ci95: [adv - Z95 * standardError, adv + Z95 * standardError] as [
        number,
        number,
      ],
    };
  });
}
/**
 * Total flat edge shift for a game: whatever the caller supplies for rules the
 * rules object cannot express, plus the delta for every rule it can.
 *
 * Deriving the second half here rather than at each call site is deliberate.
 * Compare Scenarios and the Trip Planner both rendered H17/DAS/RSA/LS/payout
 * switches, passed them in `rules`, and never passed a `ruleAdjustment` — so a
 * 6:5 no-DAS no-surrender game priced identically to a liberal 3:2 one.
 */
export function effectiveRuleAdjustment(rules: AdvantageRules, extra = 0) {
  return extra + sumRuleAdjustment(ruleAdjustmentFlagsFromRules(rules));
}
export function unitsAt(tc: number, ramp: RampPoint[]) {
  return [...ramp]
    .sort((a, b) => a.trueCount - b.trueCount)
    .reduce(
      (units, point) => (tc >= point.trueCount ? point.units : units),
      ramp[0]?.units ?? 1,
    );
}
export function handsAt(
  tc: number,
  schedule: HandCountPoint[] | undefined,
  fallback = 1,
) {
  const hands = schedule
    ? [...schedule]
        .sort((a, b) => a.trueCount - b.trueCount)
        .reduce(
          (current, point) => (tc >= point.trueCount ? point.hands : current),
          fallback,
        )
    : fallback;
  return Math.min(7, Math.max(1, Math.floor(hands)));
}
/**
 * Pairwise correlation between two of the player's simultaneous hands in the
 * same round. Every hand is settled against one shared dealer hand, so they are
 * a long way from independent.
 *
 * Measured by `blackjack-simulator/covariance.py` on the audited kernel (6 decks,
 * 4.5 dealt, H17 · DAS · RSA · LS · peek · 3:2, full indices): 0.37234 over 57.8M
 * two-hand rounds, 0.37245 over 43.8M three-hand rounds, and 0.37237 over 35.3M
 * four-hand rounds. It is flat across true counts (0.362 to 0.384) and across
 * hand counts, so one constant reproduces the measured round variance to within
 * 0.01%. See `blackjack-simulator/results/multi-hand-covariance.json`.
 */
export const SIMULTANEOUS_HAND_CORRELATION = 0.3724;
/**
 * Round-variance multiplier for `hands` equally sized simultaneous hands,
 * relative to the variance of a single hand: n · (1 + (n − 1) · ρ). Treating the
 * hands as independent would use a bare n, which understates variance — and so
 * understates risk of ruin, N₀, and required bankroll — by 37% at two hands.
 */
export function simultaneousHandVarianceFactor(
  hands: number,
  correlation = SIMULTANEOUS_HAND_CORRELATION,
) {
  if (hands <= 1) return Math.max(0, hands);
  return hands * (1 + (hands - 1) * correlation);
}
/** Stops betting below `trueCount`, modelling a Wong-in / back-counting entry point. */
export function zeroBetsBelow(ramp: RampPoint[], trueCount: number): RampPoint[] {
  return ramp.map((point) =>
    point.trueCount < trueCount ? { ...point, units: 0 } : point,
  );
}
export function zeroNegativeCountBets(ramp: RampPoint[]): RampPoint[] {
  return zeroBetsBelow(ramp, 0);
}
/**
 * Applies a hand-entered wager to every count it implies, so editing one cell
 * produces a ramp somebody would actually play.
 *
 * A negative-count edit carries up to true count 0 (nobody bets *more* as the
 * count drops), and a positive-count edit carries up to the top (nobody bets
 * *less* as the count climbs). Editing a higher count afterwards overrides only
 * the counts at or above it, which is how a ramp is built step by step.
 */
export function fillRampFromTrueCount(
  ramp: RampPoint[],
  trueCount: number,
  units: number,
): RampPoint[] {
  const covers = (point: RampPoint) =>
    trueCount > 0
      ? point.trueCount >= trueCount
      : point.trueCount >= trueCount && point.trueCount <= 0;
  return ramp.map((point) => (covers(point) ? { ...point, units } : point));
}
export function calculateCountRows(input: AdvantageInput): CountRow[] {
  const unit = input.bettingUnit ?? 1;
  const ruleAdjustment = effectiveRuleAdjustment(input.rules, input.ruleAdjustment);
  const shares = input.countShares;
  const watchedTotal = shares ? shares.watched.reduce((sum, share) => sum + share, shares.idle ?? 0) : 1;
  return getCountProfile(input.rules).map((row, position) => {
    const units = unitsAt(row.tc, input.ramp);
    const playerHands = handsAt(
      row.tc,
      input.handsByTrueCount,
      input.playerHands,
    );
    const watched = shares ? shares.watched[position] : 0;
    return {
      trueCount: row.tc,
      label: row.label,
      frequency: shares ? watched / watchedTotal : row.p,
      playShare: shares ? (watched > 0 ? shares.played[position] / watched : 0) : 1,
      advantage: row.adv + ruleAdjustment,
      sdUnits: row.sd,
      standardError: row.standardError,
      ci95: row.ci95,
      samples: row.samples,
      bet: unit * units,
      totalBet: unit * units * playerHands,
      playerHands,
      units,
    };
  });
}
export function calculateAdvantage(input: AdvantageInput): AdvantageResult {
  const rows = calculateCountRows(input);
  let averageBet = 0,
    evPerRound = 0,
    secondMoment = 0;
  for (const row of rows) {
    // Only the played part of a count is bet; the rest is time spent watching.
    const played = row.frequency * row.playShare;
    averageBet += played * row.totalBet;
    evPerRound += played * row.advantage * row.totalBet;
    secondMoment +=
      played *
      (simultaneousHandVarianceFactor(row.playerHands) *
        Math.pow(row.sdUnits * row.bet, 2) +
        Math.pow(row.advantage * row.totalBet, 2));
  }
  const variance = Math.max(0, secondMoment - evPerRound * evPerRound),
    sdPerRound = Math.sqrt(variance),
    sdPerHour = sdPerRound * Math.sqrt(input.handsPerHour),
    riskOfRuin =
      evPerRound > 0
        ? Math.min(1, Math.exp((-2 * input.bankroll * evPerRound) / variance))
        : 1,
    nZeroRounds =
      evPerRound > 0 ? variance / (evPerRound * evPerRound) : Infinity;
  return {
    averageBet,
    playerEdge: averageBet ? evPerRound / averageBet : 0,
    evPerRound,
    evPer100: evPerRound * 100,
    hourlyEv: evPerRound * input.handsPerHour,
    tripEv: evPerRound * input.handsPerHour * input.hours,
    sdPerRound,
    sdPerHour,
    standardDeviation: sdPerRound * Math.sqrt(input.handsPerHour * input.hours),
    riskOfRuin,
    nZeroRounds,
    nZeroHours: nZeroRounds / input.handsPerHour,
    rows,
  };
}
export function recommendUnit(
  bankroll: number,
  targetRisk: number,
  rules: AdvantageRules,
  ramp: RampPoint[],
  playerHands = 1,
  handsByTrueCount?: HandCountPoint[],
  ruleAdjustment = 0,
  countShares?: CountShares,
) {
  if (targetRisk >= 1) return Infinity;
  const result = calculateAdvantage({
    bankroll: 1,
    bettingUnit: 1,
    playerHands,
    handsByTrueCount,
    handsPerHour: 100,
    hours: 1,
    rules,
    ramp,
    ruleAdjustment,
    countShares,
  });
  if (result.evPerRound <= 0) return 0;
  return Math.max(
    0,
    (-2 * bankroll * result.evPerRound) /
      (result.sdPerRound ** 2 * Math.log(targetRisk)),
  );
}
export const RAMPS: Record<string, RampPoint[]> = {
  "1-4": [
    { trueCount: -8, units: 1 },
    { trueCount: 2, units: 2 },
    { trueCount: 3, units: 3 },
    { trueCount: 4, units: 4 },
  ],
  "1-8": [
    { trueCount: -8, units: 1 },
    { trueCount: 1, units: 2 },
    { trueCount: 2, units: 4 },
    { trueCount: 3, units: 6 },
    { trueCount: 4, units: 8 },
  ],
  "1-12": [
    { trueCount: -8, units: 1 },
    { trueCount: 1, units: 2 },
    { trueCount: 2, units: 4 },
    { trueCount: 3, units: 8 },
    { trueCount: 4, units: 12 },
  ],
};
