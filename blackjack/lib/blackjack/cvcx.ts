import {
  AdvantageResult,
  AdvantageRules,
  HandCountPoint,
  IndexTier,
  RampPoint,
  calculateAdvantage,
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
  /** Flat edge-percentage shift from rule toggles that depart from the audited baseline. Default 0. */
  ruleAdjustment?: number;
  /** Directly simulated index-play tier. */
  indexTier?: IndexTier;
}

export interface CvcxPerformance extends AdvantageResult {
  playedFrequency: number;
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

export function createOptimalRamp(
  rules: AdvantageRules,
  maxSpread: number,
  wongInAt: number | null,
  chipIncrement = 0.5,
  ruleAdjustment = 0,
  indexTier: IndexTier = "full",
): RampPoint[] {
  const rows = getCountProfile(rules, indexTier).map((row) => ({
    tc: row.tc,
    adv: row.adv + ruleAdjustment,
    sd: row.sd,
  }));
  const eligible = rows.filter(
    (row) => wongInAt === null || row.tc >= wongInAt,
  );
  const positive = eligible
    .map((row) => ({
      tc: row.tc,
      kellyWeight: Math.max(0, row.adv / row.sd ** 2),
    }))
    .filter((row) => row.kellyWeight > 0);
  const baseline = positive[0]?.kellyWeight ?? 1;
  return rows.map((row) => {
    if (wongInAt !== null && row.tc < wongInAt)
      return { trueCount: row.tc, units: 0 };
    const weight = Math.max(1, Math.max(0, row.adv / row.sd ** 2) / baseline);
    const bounded = Math.min(Math.max(1, maxSpread), weight);
    return {
      trueCount: row.tc,
      units:
        chipIncrement > 0
          ? Math.round(bounded / chipIncrement) * chipIncrement
          : bounded,
    };
  });
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
    indexTier: scenario.indexTier,
  });
  const variance = result.sdPerRound ** 2;
  const playedFrequency = result.rows.reduce(
    (sum, row) => sum + (row.bet > 0 ? row.frequency : 0),
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
    scenario.indexTier,
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
  return clamp(
    1 -
      normalCdf(
        (goal - meanPerRound * rounds) /
          Math.sqrt(variancePerRound * rounds),
      ),
  );
}


export function resultPercentile(
  actualResult: number,
  expectedResult: number,
  standardDeviation: number,
) {
  if (standardDeviation <= 0) return actualResult >= expectedResult ? 1 : 0;
  return normalCdf((actualResult - expectedResult) / standardDeviation);
}
