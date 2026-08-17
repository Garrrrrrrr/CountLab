import {
  AdvantageInput,
  AdvantageRules,
  RampPoint,
  calculateAdvantage,
  simultaneousHandVarianceFactor,
} from "./advantage";

export interface SessionSimulationConfig {
  bankroll: number;
  bettingUnit: number;
  playerHands: number;
  rounds: number;
  paths: number;
  roundsPerHour: number;
  seed: string;
  rules: AdvantageRules;
  ramp: RampPoint[];
}

export interface SessionTracePoint {
  round: number;
  bankroll: number;
}

export interface SessionCountBreakdown {
  trueCount: number;
  label: string;
  frequency: number;
  simulatedFrequency: number;
  playerEdge: number;
  wager: number;
  evContribution: number;
}

export interface SessionSimulationResult {
  methodology: "profile-moment-monte-carlo-v1";
  seed: string;
  roundsPerPath: number;
  paths: number;
  observations: number;
  expectedEvPerRound: number;
  expectedHourlyEv: number;
  simulatedEvPerRound: number;
  simulatedStandardError: number;
  simulatedCi95: [number, number];
  averageBet: number;
  medianEndingBankroll: number;
  meanEndingBankroll: number;
  endingBankrollP10: number;
  endingBankrollP90: number;
  chanceOfProfit: number;
  ruinCrossingRate: number;
  averageMaxDrawdown: number;
  samplePath: SessionTracePoint[];
  countBreakdown: SessionCountBreakdown[];
}

export interface SimulationHooks {
  onProgress?: (completed: number, total: number) => void;
  isCancelled?: () => boolean;
  yieldControl?: () => Promise<void>;
}

export class SessionSimulationCancelled extends Error {
  constructor() {
    super("Session simulation cancelled");
    this.name = "SessionSimulationCancelled";
  }
}

const hashSeed = (seed: string) => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed: string) => {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const normalSampler = (random: () => number) => {
  let spare: number | undefined;
  return () => {
    if (spare !== undefined) {
      const value = spare;
      spare = undefined;
      return value;
    }
    const first = Math.max(Number.EPSILON, random());
    const second = random();
    const radius = Math.sqrt(-2 * Math.log(first));
    spare = radius * Math.sin(2 * Math.PI * second);
    return radius * Math.cos(2 * Math.PI * second);
  };
};

const percentile = (sorted: number[], probability: number) => {
  if (!sorted.length) return 0;
  const position = Math.min(sorted.length - 1, Math.max(0, probability * (sorted.length - 1)));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
};

const advantageInput = (config: SessionSimulationConfig): AdvantageInput => ({
  bankroll: config.bankroll,
  bettingUnit: config.bettingUnit,
  playerHands: config.playerHands,
  handsPerHour: config.roundsPerHour,
  hours: config.rounds / config.roundsPerHour,
  rules: config.rules,
  ramp: config.ramp,
});

export async function simulateProfileSessions(
  config: SessionSimulationConfig,
  hooks: SimulationHooks = {},
): Promise<SessionSimulationResult> {
  const rounds = Math.max(1, Math.floor(config.rounds));
  const paths = Math.max(1, Math.floor(config.paths));
  const analysis = calculateAdvantage(advantageInput({ ...config, rounds, paths }));
  const cdf: number[] = [];
  analysis.rows.reduce((sum, row, index) => {
    cdf[index] = sum + row.frequency;
    return cdf[index];
  }, 0);
  cdf[cdf.length - 1] = 1;

  const random = seededRandom(config.seed);
  const normal = normalSampler(random);
  const countHits = Array(analysis.rows.length).fill(0) as number[];
  const endings: number[] = [];
  const samplePath: SessionTracePoint[] = [{ round: 0, bankroll: config.bankroll }];
  const traceEvery = Math.max(1, Math.floor(rounds / 200));
  const progressEvery = Math.max(1_000, Math.min(20_000, Math.floor((rounds * paths) / 200)));
  const totalObservations = rounds * paths;
  let observation = 0;
  let outcomeMean = 0;
  let outcomeMoment = 0;
  let profitPaths = 0;
  let ruinedPaths = 0;
  let drawdownTotal = 0;

  for (let path = 0; path < paths; path += 1) {
    let bankroll = config.bankroll;
    let peak = bankroll;
    let maxDrawdown = 0;
    let crossedRuin = bankroll <= 0;
    for (let round = 1; round <= rounds; round += 1) {
      const draw = random();
      let rowIndex = cdf.findIndex((boundary) => draw <= boundary);
      if (rowIndex < 0) rowIndex = cdf.length - 1;
      const row = analysis.rows[rowIndex];
      const conditionalMean = row.advantage * row.totalBet;
      // Simultaneous hands share one dealer hand, so their round total scales
      // with the correlated-variance factor, not a bare hand count.
      const conditionalSd =
        row.sdUnits *
        row.bet *
        Math.sqrt(simultaneousHandVarianceFactor(row.playerHands));
      const outcome = conditionalMean + conditionalSd * normal();
      bankroll += outcome;
      peak = Math.max(peak, bankroll);
      maxDrawdown = Math.max(maxDrawdown, peak - bankroll);
      crossedRuin ||= bankroll <= 0;
      countHits[rowIndex] += 1;
      observation += 1;
      const delta = outcome - outcomeMean;
      outcomeMean += delta / observation;
      outcomeMoment += delta * (outcome - outcomeMean);

      if (path === 0 && (round % traceEvery === 0 || round === rounds)) {
        samplePath.push({ round, bankroll });
      }
      if (observation % progressEvery === 0) {
        if (hooks.isCancelled?.()) throw new SessionSimulationCancelled();
        hooks.onProgress?.(observation, totalObservations);
        await hooks.yieldControl?.();
      }
    }
    endings.push(bankroll);
    if (bankroll > config.bankroll) profitPaths += 1;
    if (crossedRuin) ruinedPaths += 1;
    drawdownTotal += maxDrawdown;
  }

  hooks.onProgress?.(totalObservations, totalObservations);
  const sortedEndings = [...endings].sort((first, second) => first - second);
  const outcomeVariance = observation > 1 ? outcomeMoment / (observation - 1) : 0;
  const simulatedStandardError = Math.sqrt(outcomeVariance / observation);
  const margin = 1.95996398454 * simulatedStandardError;
  return {
    methodology: "profile-moment-monte-carlo-v1",
    seed: config.seed,
    roundsPerPath: rounds,
    paths,
    observations: totalObservations,
    expectedEvPerRound: analysis.evPerRound,
    expectedHourlyEv: analysis.hourlyEv,
    simulatedEvPerRound: outcomeMean,
    simulatedStandardError,
    simulatedCi95: [outcomeMean - margin, outcomeMean + margin],
    averageBet: analysis.averageBet,
    medianEndingBankroll: percentile(sortedEndings, 0.5),
    meanEndingBankroll: endings.reduce((sum, value) => sum + value, 0) / paths,
    endingBankrollP10: percentile(sortedEndings, 0.1),
    endingBankrollP90: percentile(sortedEndings, 0.9),
    chanceOfProfit: profitPaths / paths,
    ruinCrossingRate: ruinedPaths / paths,
    averageMaxDrawdown: drawdownTotal / paths,
    samplePath,
    countBreakdown: analysis.rows.map((row, index) => ({
      trueCount: row.trueCount,
      label: row.label,
      frequency: row.frequency,
      simulatedFrequency: countHits[index] / totalObservations,
      playerEdge: row.advantage,
      wager: row.totalBet,
      evContribution: row.frequency * row.advantage * row.totalBet,
    })),
  };
}
