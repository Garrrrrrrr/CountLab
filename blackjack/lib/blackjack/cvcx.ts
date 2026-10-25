import {
  AdvantageResult,
  AdvantageRules,
  CountShares,
  HandCountPoint,
  RampPoint,
  calculateAdvantage,
  effectiveRuleAdjustment,
  getCountProfile,
  recommendUnit,
} from "./advantage";

export interface CvcxScenario {
  bankroll: number;
  minimumBet: number;
  playerHands?: number;
  handsByTrueCount?: HandCountPoint[];
  handsPerHour: number;
  hours: number;
  targetRisk: number;
  maxSpread: number;
  wongInAt: number | null;
  rules: AdvantageRules;
  /** Extra shift for rules AdvantageRules cannot express; the rest come from `rules`. Default 0. */
  ruleAdjustment?: number;
  /** Watched and played shares per count when back-counting with an exit point. */
  countShares?: CountShares;
}

export interface CvcxPerformance extends AdvantageResult {
  playedFrequency: number;
  /**
   * SCORE: expected win in dollars per 100 rounds with a $10,000 bankroll sized
   * for a 13.5% lifetime risk of ruin. Scale-invariant in the betting unit, so
   * it compares games rather than stakes. This is plain SCORE, not c-SCORE —
   * nothing here models comps or the cost of playing.
   */
  cScore: number;
  requiredBankroll: number;
  tripRiskOfRuin: number;
  chanceOfProfit: number;
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

export function normalCdf(value: number) {
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial =
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t);
  const erf = 1 - polynomial * Math.exp(-x * x);
  return 0.5 * (1 + (value < 0 ? -erf : erf));
}

export function finiteHorizonRisk(
  bankroll: number,
  meanPerRound: number,
  variancePerRound: number,
  rounds: number,
) {
  if (bankroll <= 0) return 1;
  if (rounds <= 0 || variancePerRound <= 0) return 0;
  const deviation = Math.sqrt(variancePerRound * rounds);
  const first = normalCdf((-bankroll - meanPerRound * rounds) / deviation);
  const exponent = clamp(
    (-2 * meanPerRound * bankroll) / variancePerRound,
    -745,
    709,
  );
  const second =
    Math.exp(exponent) *
    normalCdf((-bankroll + meanPerRound * rounds) / deviation);
  return clamp(first + second);
}


export function requiredBankroll(
  meanPerRound: number,
  variancePerRound: number,
  targetRisk: number,
) {
  if (meanPerRound <= 0 || variancePerRound <= 0) return Infinity;
  if (targetRisk >= 1) return 0;
  if (targetRisk <= 0) return Infinity;
  return (-variancePerRound * Math.log(targetRisk)) / (2 * meanPerRound);
}

/** SCORE of a ramp in betting units: EV² / variance per round, which is scale-free. */
function rampScore(rules: AdvantageRules, ramp: RampPoint[], ruleAdjustment: number, countShares?: CountShares) {
  const result = calculateAdvantage({ bankroll: 1, bettingUnit: 1, handsPerHour: 1, hours: 1, rules, ramp, ruleAdjustment, countShares });
  return result.evPerRound > 0 && result.sdPerRound > 0 ? result.evPerRound ** 2 / result.sdPerRound ** 2 : 0;
}

/**
 * Harris's spread-limited optimal bets, as CVCX makes them: each count's bet is proportional
 * to its Kelly weight (edge ÷ variance), clamped to [1, spread] units, with the proportion chosen
 * to maximise SCORE. Wonged-out counts bet 0. Unrounded; `createOptimalRamp` rounds to chips.
 */
export function exactOptimalRamp(
  rules: AdvantageRules,
  maxSpread: number,
  wongInAt: number | null,
  ruleAdjustment = 0,
  countShares?: CountShares,
): RampPoint[] {
  const shift = effectiveRuleAdjustment(rules, ruleAdjustment);
  const spread = Math.max(1, maxSpread);
  const weights = getCountProfile(rules).map((row) => ({
    trueCount: row.tc,
    out: wongInAt !== null && row.tc < wongInAt,
    weight: Math.max(0, (row.adv + shift) / row.sd ** 2),
  }));
  const at = (scale: number) => weights.map(({ trueCount, out, weight }) => ({ trueCount, units: out ? 0 : Math.min(spread, Math.max(1, scale * weight)) }));
  const positive = weights.filter((row) => !row.out && row.weight > 0).map((row) => row.weight);
  if (!positive.length) return at(0);
  // Below `low` every bet is the minimum; above `high` every positive count is at the cap.
  const low = Math.log(1 / Math.max(...positive)), high = Math.log(spread / Math.min(...positive));
  const score = (logScale: number) => rampScore(rules, at(Math.exp(logScale)), ruleAdjustment, countShares);
  const steps = 200;
  let best = low, bestScore = score(low);
  for (let step = 1; step <= steps; step++) {
    const point = low + ((high - low) * step) / steps;
    const value = score(point);
    if (value > bestScore) [best, bestScore] = [point, value];
  }
  // Golden-section refinement inside the best grid cell's neighbours.
  let a = Math.max(low, best - (high - low) / steps), b = Math.min(high, best + (high - low) / steps);
  const ratio = (Math.sqrt(5) - 1) / 2;
  for (let round = 0; round < 40; round++) {
    const c = b - ratio * (b - a), d = a + ratio * (b - a);
    if (score(c) >= score(d)) b = d;
    else a = c;
  }
  const refined = (a + b) / 2;
  return at(Math.exp(score(refined) >= bestScore ? refined : best));
}

/**
 * The smallest bankroll whose chance of going broke within `rounds` is at most `targetRisk`.
 * Finite-horizon ruin rises with the bankroll's shortfall and is never above the lifetime figure,
 * so the lifetime bankroll bounds a bisection. With no edge it is the unbounded lifetime answer.
 */
export function bankrollForHorizon(meanPerRound: number, variancePerRound: number, rounds: number, targetRisk: number) {
  if (targetRisk >= 1 || rounds <= 0) return 0;
  if (variancePerRound <= 0) return meanPerRound >= 0 ? 0 : -meanPerRound * rounds;
  let high = meanPerRound > 0 ? requiredBankroll(meanPerRound, variancePerRound, targetRisk) : Infinity;
  if (!Number.isFinite(high)) {
    high = Math.sqrt(variancePerRound * rounds);
    while (finiteHorizonRisk(high, meanPerRound, variancePerRound, rounds) > targetRisk) high *= 2;
  }
  let low = 0;
  for (let step = 0; step < 100 && high - low > 0.01; step++) {
    const middle = (low + high) / 2;
    if (finiteHorizonRisk(middle, meanPerRound, variancePerRound, rounds) > targetRisk) low = middle;
    else high = middle;
  }
  return high;
}

export function createOptimalRamp(
  rules: AdvantageRules,
  maxSpread: number,
  wongInAt: number | null,
  chipIncrement = 0.5,
  ruleAdjustment = 0,
  countShares?: CountShares,
): RampPoint[] {
  return exactOptimalRamp(rules, maxSpread, wongInAt, ruleAdjustment, countShares).map((point) => ({
    trueCount: point.trueCount,
    units: chipIncrement > 0 && point.units > 0 ? Math.max(1, Math.round(point.units / chipIncrement) * chipIncrement) : point.units,
  }));
}

export function analyzeCvcx(
  scenario: CvcxScenario,
  ramp: RampPoint[],
  bettingUnit = scenario.minimumBet,
): CvcxPerformance {
  const result = calculateAdvantage({
    bankroll: scenario.bankroll,
    bettingUnit,
    playerHands: scenario.playerHands,
    handsByTrueCount: scenario.handsByTrueCount,
    handsPerHour: scenario.handsPerHour,
    hours: scenario.hours,
    rules: scenario.rules,
    ramp,
    ruleAdjustment: scenario.ruleAdjustment,
    countShares: scenario.countShares,
  });
  const variance = result.sdPerRound ** 2;
  const playedFrequency = result.rows.reduce(
    (sum, row) => sum + (row.bet > 0 ? row.frequency * row.playShare : 0),
    0,
  );
  const cScore =
    result.evPerRound > 0 && variance > 0
      ? (1_000_000 * result.evPerRound ** 2) / variance
      : 0;
  const rounds = scenario.handsPerHour * scenario.hours;
  return {
    ...result,
    playedFrequency,
    cScore,
    requiredBankroll: requiredBankroll(
      result.evPerRound,
      variance,
      scenario.targetRisk,
    ),
    tripRiskOfRuin: finiteHorizonRisk(
      scenario.bankroll,
      result.evPerRound,
      variance,
      rounds,
    ),
    chanceOfProfit:
      result.standardDeviation > 0
        ? normalCdf(result.tripEv / result.standardDeviation)
        : Number(result.tripEv > 0),
  };
}

export function riskSizedUnit(
  scenario: CvcxScenario,
  ramp: RampPoint[],
) {
  return recommendUnit(
    scenario.bankroll,
    scenario.targetRisk,
    scenario.rules,
    ramp,
    scenario.playerHands,
    scenario.handsByTrueCount,
    scenario.ruleAdjustment,
    scenario.countShares,
  );
}

export function goalByHorizonProbability(
  goal: number,
  meanPerRound: number,
  variancePerRound: number,
  rounds: number,
) {
  if (goal <= 0) return 1;
  if (rounds <= 0 || variancePerRound <= 0)
    return Number(meanPerRound * rounds >= goal);
  const deviation = Math.sqrt(variancePerRound * rounds);
  // Reflection principle for a Brownian process with drift: this measures
  // reaching the upper boundary at any time, not just ending beyond it.
  const terminalTail = normalCdf((meanPerRound * rounds - goal) / deviation);
  const exponent = clamp(
    (2 * meanPerRound * goal) / variancePerRound,
    -745,
    709,
  );
  const reflectedTail = Math.exp(exponent) * normalCdf(
    (-meanPerRound * rounds - goal) / deviation,
  );
  return clamp(terminalTail + reflectedTail);
}


/**
 * Goal or bust: starting with `bankroll`, the chance of first being up `goal` (reaching the goal)
 * or first losing the whole bankroll (ruin), within `rounds` rounds or, when `rounds` is
 * Infinity, ever. The two need not add to 1 with a time limit: the trip can end between them.
 * Brownian motion with drift between two absorbing barriers, the model Blackjack Attack's
 * double-barrier risk formulas use. The time-limited case is the eventual probability less the
 * part still to come after `rounds`, from the eigenfunction series of the killed density.
 */
export function goalOrBust(bankroll: number, goal: number, meanPerRound: number, variancePerRound: number, rounds = Infinity) {
  if (bankroll <= 0) return { goal: 0, ruin: 1 };
  if (goal <= 0) return { goal: 1, ruin: 0 };
  if (rounds <= 0) return { goal: 0, ruin: 0 };
  if (variancePerRound <= 0) {
    const steps = meanPerRound > 0 ? goal / meanPerRound : meanPerRound < 0 ? bankroll / -meanPerRound : Infinity;
    return steps > rounds ? { goal: 0, ruin: 0 } : meanPerRound > 0 ? { goal: 1, ruin: 0 } : { goal: 0, ruin: 1 };
  }
  const span = bankroll + goal;
  // Eventually: the gambler's-ruin formula for a drifted walk, written to stay finite.
  const a = (2 * meanPerRound) / variancePerRound;
  let reachEver: number;
  if (Math.abs(a * span) < 1e-12) reachEver = bankroll / span;
  else if (-a * span > 700) reachEver = Math.exp(Math.min(0, a * goal));
  else reachEver = Math.expm1(-a * bankroll) / Math.expm1(-a * span);
  reachEver = clamp(reachEver);
  if (!Number.isFinite(rounds)) return { goal: reachEver, ruin: 1 - reachEver };
  // Still to come after `rounds`: Σ (kπ/L) sin(kπB/L) e^{−λk·n} / λk, scaled per barrier.
  const drift = (meanPerRound * meanPerRound) / (2 * variancePerRound);
  const tailRuin = { sum: 0 }, tailGoal = { sum: 0 };
  for (let k = 1; k <= 200_000; k++) {
    const wave = (k * Math.PI) / span;
    const lambda = drift + (wave * wave * variancePerRound) / 2;
    const decay = Math.exp(-lambda * rounds);
    if (decay < 1e-18 && k > 2) break;
    const term = (wave * Math.sin(wave * bankroll) * decay) / lambda;
    tailRuin.sum += term;
    tailGoal.sum += k % 2 ? term : -term;
  }
  const scale = variancePerRound / span;
  const ruinTail = scale * Math.exp(clamp((-meanPerRound * bankroll) / variancePerRound, -745, 709)) * tailRuin.sum;
  const goalTail = scale * Math.exp(clamp((meanPerRound * goal) / variancePerRound, -745, 709)) * tailGoal.sum;
  return { goal: clamp(reachEver - goalTail), ruin: clamp(1 - reachEver - ruinTail) };
}

export function resultPercentile(
  actualResult: number,
  expectedResult: number,
  standardDeviation: number,
) {
  if (standardDeviation <= 0) return actualResult >= expectedResult ? 1 : 0;
  return normalCdf((actualResult - expectedResult) / standardDeviation);
}
