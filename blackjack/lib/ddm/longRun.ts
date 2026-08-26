import { finiteHorizonRisk, normalCdf, requiredBankroll } from "../blackjack/cvcx";
import generatedData from "./profileBuckets.generated.json";

export const DDM_TRUE_COUNTS = Array.from({ length: 17 }, (_, index) => index - 8);

export type DDMTcMode = "exact" | "half" | "full" | "none";
export type DDMPolicy = "indices" | "insurance" | "basic";
export type DDMRamp = ReadonlyArray<number>;

interface GeneratedBucket {
  tc: number;
  frequency: number;
  unitEv: number;
  unitSd: number;
}

export interface DDMSourceProfile {
  id: string;
  rounds: number;
  cutDecks: number | null;
  tcMode: DDMTcMode;
  policy: DDMPolicy;
  source: string;
  buckets: ReadonlyArray<GeneratedBucket>;
}

export interface DDMBucketRow extends GeneratedBucket {
  label: string;
  units: number;
  evContribution: number;
}

export interface DDMProfile {
  id: string;
  label: string;
  description: string;
  rounds: number;
  cutDecks: number | null;
  count: string;
  policy: string;
  source: string;
  ramp: ReadonlyArray<readonly [number, number]>;
  buckets: ReadonlyArray<DDMBucketRow>;
  playedFrequency: number;
  evPerRound: number;
  variancePerRound: number;
  avgBet: number;
  ci95: number;
}

export const DDM_SOURCE_PROFILES = generatedData.profiles as DDMSourceProfile[];

const thresholdRamp = (points: ReadonlyArray<readonly [number, number]>): DDMRamp =>
  DDM_TRUE_COUNTS.map((tc) => {
    let units = points[0]?.[1] ?? 0;
    for (const [threshold, value] of points) if (tc >= threshold) units = value;
    return units;
  });

export const DDM_RAMP_PRESETS = {
  Recommended: thresholdRamp([[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]]),
  "1–2–4–8–16": thresholdRamp([[-8, 1], [1, 2], [2, 4], [3, 8], [4, 16]]),
  Flat: thresholdRamp([[-8, 1]]),
} satisfies Record<string, DDMRamp>;

export const DEFAULT_DDM_RAMP = DDM_RAMP_PRESETS.Recommended;

export const ddmCountLabel = (mode: DDMTcMode) => ({
  exact: "Hi-Lo · exact decks",
  half: "Hi-Lo · half-deck estimation",
  full: "Hi-Lo · full-deck estimation",
  none: "No running count",
})[mode];

export const ddmPolicyLabel = (policy: DDMPolicy) => ({
  indices: "Insurance + 18 indices",
  insurance: "Insurance +4 only",
  basic: "Basic strategy",
})[policy];

export function getDDMSourceProfile({
  cutDecks,
  tcMode,
  policy,
}: {
  cutDecks: number | null;
  tcMode: DDMTcMode;
  policy: DDMPolicy;
}): DDMSourceProfile | undefined {
  return DDM_SOURCE_PROFILES.find((profile) =>
    profile.cutDecks === cutDecks && profile.tcMode === tcMode && profile.policy === policy,
  );
}

export const ddmRampWithWonging = (ramp: DDMRamp, enterAt: number | null): DDMRamp =>
  DDM_TRUE_COUNTS.map((tc, index) => enterAt !== null && tc < enterAt ? 0 : Math.max(0, ramp[index] ?? 0));

const countLabel = (tc: number) => tc === -8 ? "≤−8" : tc === 8 ? "+8+" : tc > 0 ? `+${tc}` : String(tc);

export function reweightDDMProfile(source: DDMSourceProfile, requestedRamp: DDMRamp): DDMProfile {
  const ramp = DDM_TRUE_COUNTS.map((_, index) => Math.max(0, Number.isFinite(requestedRamp[index]) ? requestedRamp[index] : 0));
  let mean = 0;
  let secondMoment = 0;
  let avgBet = 0;
  let playedFrequency = 0;
  const buckets = source.buckets.map((bucket) => {
    const index = Math.max(0, Math.min(16, bucket.tc + 8));
    const units = source.tcMode === "none" ? Math.max(0, ramp[8] ?? 1) : ramp[index];
    const evContribution = bucket.frequency * units * bucket.unitEv;
    mean += evContribution;
    secondMoment += bucket.frequency * units ** 2 * (bucket.unitSd ** 2 + bucket.unitEv ** 2);
    avgBet += bucket.frequency * units;
    if (units > 0) playedFrequency += bucket.frequency;
    return { ...bucket, label: countLabel(bucket.tc), units, evContribution };
  });
  const variance = Math.max(0, secondMoment - mean ** 2);
  const decksDealt = source.cutDecks === null ? null : 6 - source.cutDecks;
  const isCsm = source.tcMode === "none";
  return {
    id: source.id,
    label: isCsm ? "Continuous shuffler" : `${decksDealt} decks dealt`,
    description: isCsm
      ? "Continuous-shuffler control with no persistent count. The wager is flat because every observed round is TC 0."
      : `Composition-conditioned TC buckets from ${source.rounds.toLocaleString()} seeded rounds. Each edited wager is repriced directly from that bucket without interpolating game conditions.`,
    rounds: source.rounds,
    cutDecks: source.cutDecks,
    count: ddmCountLabel(source.tcMode),
    policy: ddmPolicyLabel(source.policy),
    source: source.source,
    ramp: buckets.map((bucket) => [bucket.tc, bucket.units] as const),
    buckets,
    playedFrequency,
    evPerRound: mean,
    variancePerRound: variance,
    avgBet,
    ci95: 1.96 * Math.sqrt(variance / source.rounds),
  };
}

/** Recommended-ramp aggregates retained for callers that need a ready-made profile list. */
export const DDM_PROFILES = DDM_SOURCE_PROFILES.map((source) =>
  reweightDDMProfile(source, source.tcMode === "none" ? DDM_RAMP_PRESETS.Flat : DEFAULT_DDM_RAMP),
);

/** Backward-compatible six-threshold ramp adapter. */
export type CustomRamp = readonly [number, number, number, number, number, number];
export function reweightMainRamp(units: CustomRamp): DDMProfile {
  const source = DDM_SOURCE_PROFILES.find((profile) => profile.id === "main");
  if (!source) throw new Error("Missing main DDM simulation profile");
  return reweightDDMProfile(source, thresholdRamp([[-8, units[0]], [1, units[1]], [2, units[2]], [3, units[3]], [4, units[4]], [5, units[5]]]));
}

export interface DDMCalculatorInput {
  unit: number;
  bankroll: number;
  roundsPerHour: number;
  hours: number;
  targetRisk: number;
}

export interface DDMCalculatedMetrics {
  evPerRound: number;
  sdPerRound: number;
  evPerHour: number;
  sdPerHour: number;
  tripEv: number;
  tripSd: number;
  lower95: number;
  upper95: number;
  chanceOfProfit: number;
  lifetimeRisk: number;
  tripRisk: number;
  requiredBankroll: number;
  riskSizedUnit: number;
  n0: number;
  n0Hours: number;
  score: number;
  averageBet: number;
  edgePerUnitBet: number;
  simulationCiPerHour: number;
}

export function calculateDDMLongRun(profile: DDMProfile, input: DDMCalculatorInput): DDMCalculatedMetrics {
  const unit = Math.max(0, input.unit);
  const roundsPerHour = Math.max(0, input.roundsPerHour);
  const hours = Math.max(0, input.hours);
  const rounds = roundsPerHour * hours;
  const evPerRound = profile.evPerRound * unit;
  const variancePerRound = profile.variancePerRound * unit * unit;
  const sdPerRound = Math.sqrt(variancePerRound);
  const tripEv = evPerRound * rounds;
  const tripSd = sdPerRound * Math.sqrt(rounds);
  const n0 = profile.evPerRound > 0 ? profile.variancePerRound / profile.evPerRound ** 2 : Infinity;
  const lifetimeRisk = evPerRound > 0 && variancePerRound > 0
    ? Math.exp(-2 * evPerRound * input.bankroll / variancePerRound)
    : 1;
  const riskSizedUnit = profile.evPerRound > 0 && profile.variancePerRound > 0 && input.targetRisk > 0 && input.targetRisk < 1
    ? Math.max(0, (-2 * input.bankroll * profile.evPerRound) / (profile.variancePerRound * Math.log(input.targetRisk)))
    : 0;
  return {
    evPerRound,
    sdPerRound,
    evPerHour: evPerRound * roundsPerHour,
    sdPerHour: sdPerRound * Math.sqrt(roundsPerHour),
    tripEv,
    tripSd,
    lower95: tripEv - 1.96 * tripSd,
    upper95: tripEv + 1.96 * tripSd,
    chanceOfProfit: tripSd > 0 ? normalCdf(tripEv / tripSd) : Number(tripEv > 0),
    lifetimeRisk,
    tripRisk: finiteHorizonRisk(input.bankroll, evPerRound, variancePerRound, rounds),
    requiredBankroll: requiredBankroll(evPerRound, variancePerRound, input.targetRisk),
    riskSizedUnit,
    n0,
    n0Hours: roundsPerHour > 0 ? n0 / roundsPerHour : Infinity,
    score: Number.isFinite(n0) ? 1_000_000 / n0 : 0,
    averageBet: profile.avgBet * unit,
    edgePerUnitBet: profile.avgBet > 0 ? profile.evPerRound / profile.avgBet : 0,
    simulationCiPerHour: profile.ci95 * unit * roundsPerHour,
  };
}
