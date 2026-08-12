import { GAME_OPTIONS, RAW_COEFFICIENTS } from "./coefficients";
export interface AdvantageRules {
  decks: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  blackjackPayout: 1.5 | 1.2;
  penetration: number;
  useIndices?: boolean;
}
export interface RampPoint {
  trueCount: number;
  units: number;
}
export interface AdvantageInput {
  bankroll: number;
  bettingUnit?: number;
  handsPerHour: number;
  hours: number;
  rules: AdvantageRules;
  ramp: RampPoint[];
}
export interface CountRow {
  trueCount: number;
  label: string;
  frequency: number;
  advantage: number;
  sdUnits: number;
  bet: number;
  units: number;
}
export interface AdvantageResult {
  offTopEdge: number;
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
export function getCountProfile(rules: AdvantageRules) {
  const options = GAME_OPTIONS[rules.decks as 6 | 8] ?? GAME_OPTIONS[6],
    requested = rules.penetration * rules.decks,
    selected = [...options].sort(
      (a, b) => Math.abs(a.dealt - requested) - Math.abs(b.dealt - requested),
    )[0],
    raw =
      RAW_COEFFICIENTS[`${rules.decks}-${selected.dealt}`] ??
      RAW_COEFFICIENTS["6-4.5"];
  return raw.map(([p, adv, sd], index) => ({
    tc: index - 8,
    label: TC_LABELS[index],
    p,
    adv,
    sd,
  }));
}
export const COUNT_PROFILE = getCountProfile(DEFAULT_ADVANTAGE_RULES);
export function estimateOffTopEdge(
  rules: AdvantageRules = DEFAULT_ADVANTAGE_RULES,
) {
  return getCountProfile(rules).find((row) => row.tc === 0)?.adv ?? 0;
}
export function unitsAt(tc: number, ramp: RampPoint[]) {
  return [...ramp]
    .sort((a, b) => a.trueCount - b.trueCount)
    .reduce(
      (units, point) => (tc >= point.trueCount ? point.units : units),
      ramp[0]?.units ?? 1,
    );
}
export function calculateCountRows(input: AdvantageInput): CountRow[] {
  const unit = input.bettingUnit ?? 1;
  return getCountProfile(input.rules).map((row) => {
    const units = unitsAt(row.tc, input.ramp);
    return {
      trueCount: row.tc,
      label: row.label,
      frequency: row.p,
      advantage: row.adv,
      sdUnits: row.sd,
      bet: unit * units,
      units,
    };
  });
}
export function calculateAdvantage(input: AdvantageInput): AdvantageResult {
  const rows = calculateCountRows(input);
  let averageBet = 0,
    evPerRound = 0,
    variance = 0;
  for (const row of rows) {
    averageBet += row.frequency * row.bet;
    evPerRound += row.frequency * row.advantage * row.bet;
    variance += row.frequency * Math.pow(row.sdUnits * row.bet, 2);
  }
  const sdPerRound = Math.sqrt(variance),
    sdPerHour = sdPerRound * Math.sqrt(input.handsPerHour),
    riskOfRuin =
      evPerRound > 0
        ? Math.min(1, Math.exp((-2 * input.bankroll * evPerRound) / variance))
        : 1,
    nZeroRounds =
      evPerRound > 0 ? variance / (evPerRound * evPerRound) : Infinity;
  return {
    offTopEdge: estimateOffTopEdge(input.rules),
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
) {
  if (targetRisk >= 1) return Infinity;
  const result = calculateAdvantage({
    bankroll: 1,
    bettingUnit: 1,
    handsPerHour: 100,
    hours: 1,
    rules,
    ramp,
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
