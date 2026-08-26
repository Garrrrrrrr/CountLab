import { finiteHorizonRisk, normalCdf, requiredBankroll } from "../blackjack/cvcx";

export interface DDMProfile {
  id: string;
  label: string;
  description: string;
  rounds: number;
  cutDecks: number | null;
  count: string;
  policy: string;
  ramp: ReadonlyArray<readonly [number, number]>;
  evPerRound: number;
  variancePerRound: number;
  avgBet: number;
  ci95: number;
}

export const DDM_PROFILES: DDMProfile[] = [
  {
    id: "main",
    label: "Main · 5 decks dealt · exact TC",
    description: "Recommended Hi-Lo 1–3–7–11–15–16 ramp, insurance +4, and all 18 selected play indices.",
    rounds: 9_999_999_996, cutDecks: 1, count: "Hi-Lo · exact decks", policy: "Insurance + 18 indices",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: 0.07397920950459168, variancePerRound: 70.577453741688, avgBet: 2.9257262870702907, ci95: 0.00016465733579971078,
  },
  {
    id: "half_deck",
    label: "5 decks dealt · half-deck TC",
    description: "Main indexed ramp with remaining decks rounded to the nearest half deck.",
    rounds: 999_999_996, cutDecks: 1, count: "Hi-Lo · half-deck estimation", policy: "Insurance + 18 indices",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: 0.07053724178214897, variancePerRound: 65.35089770769527, avgBet: 2.843248595372994, ci95: 0.000501041698308311,
  },
  {
    id: "full_deck",
    label: "5 decks dealt · full-deck TC",
    description: "Main indexed ramp with remaining decks rounded to whole decks.",
    rounds: 999_999_996, cutDecks: 1, count: "Hi-Lo · full-deck estimation", policy: "Insurance + 18 indices",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: 0.06440116575760466, variancePerRound: 56.89347896518957, avgBet: 2.6769543907078175, ci95: 0.0004674975481058901,
  },
  {
    id: "op_ramp",
    label: "OP 1–2–4–8–16 ramp · indexed",
    description: "Original proposed ramp with insurance +4 and all 18 selected play indices; five decks dealt.",
    rounds: 999_999_996, cutDecks: 1, count: "Hi-Lo · exact decks", policy: "Insurance + 18 indices",
    ramp: [[-8, 1], [1, 2], [2, 4], [3, 8], [4, 16]],
    evPerRound: 0.0661309477645238, variancePerRound: 58.88102195378936, avgBet: 2.524733687098934, ci95: 0.00047559333685473834,
  },
  {
    id: "insurance_only",
    label: "Optimized ramp · insurance only",
    description: "Recommended ramp and insurance +4, without the 18 play indices; five decks dealt.",
    rounds: 999_999_996, cutDecks: 1, count: "Hi-Lo · exact decks", policy: "Insurance only",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: 0.07265891854063568, variancePerRound: 70.05646659724098, avgBet: 2.921782460687129, ci95: 0.0005187668384092326,
  },
  {
    id: "basic_only",
    label: "Optimized ramp · basic strategy",
    description: "Recommended ramp with no insurance index and no play deviations; five decks dealt.",
    rounds: 999_999_996, cutDecks: 1, count: "Hi-Lo · exact decks", policy: "Basic strategy",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: 0.07008467003033868, variancePerRound: 70.2255566118861, avgBet: 2.921782460687129, ci95: 0.0005193925153137642,
  },
  {
    id: "cut_2",
    label: "4 decks dealt · main indexed policy",
    description: "Two decks cut off with the recommended ramp and complete index package.",
    rounds: 499_999_992, cutDecks: 2, count: "Hi-Lo · exact decks", policy: "Insurance + 18 indices",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: 0.03722985109567761, variancePerRound: 46.96285108549019, avgBet: 2.4157773586524374, ci95: 0.00060067605484786,
  },
  {
    id: "cut_2_5",
    label: "3.5 decks dealt · main indexed policy",
    description: "Two and a half decks cut off with the recommended ramp and complete index package.",
    rounds: 499_999_992, cutDecks: 2.5, count: "Hi-Lo · exact decks", policy: "Insurance + 18 indices",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: 0.024844702897515242, variancePerRound: 37.11105214889965, avgBet: 2.1861530909784492, ci95: 0.0005339673789729098,
  },
  {
    id: "cut_3",
    label: "3 decks dealt · main indexed policy",
    description: "Three decks cut off with the recommended ramp and complete index package.",
    rounds: 499_999_992, cutDecks: 3, count: "Hi-Lo · exact decks", policy: "Insurance + 18 indices",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: 0.014825630737210091, variancePerRound: 28.183930754494654, avgBet: 1.9581850893309611, ci95: 0.00046533302296519746,
  },
  {
    id: "cut_3_5",
    label: "2.5 decks dealt · main indexed policy",
    description: "Three and a half decks cut off with the recommended ramp and complete index package.",
    rounds: 499_999_992, cutDecks: 3.5, count: "Hi-Lo · exact decks", policy: "Insurance + 18 indices",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: 0.006987245111795922, variancePerRound: 20.703665428415178, avgBet: 1.7528278620452458, ci95: 0.00039882898453648516,
  },
  {
    id: "cut_4",
    label: "2 decks dealt · near break-even",
    description: "Four decks cut off. Positive in the one-billion-round run, but the edge is too small for a practical N₀.",
    rounds: 999_999_996, cutDecks: 4, count: "Hi-Lo · exact decks", policy: "Insurance + 18 indices",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: 0.00068249475272998, variancePerRound: 14.26655117645462, avgBet: 1.5482596381930385, ci95: 0.0002341033299141497,
  },
  {
    id: "cut_4_1",
    label: "1.9 decks dealt · negative EV",
    description: "Four-point-one decks cut off. This is beyond the sampled break-even boundary.",
    rounds: 999_999_996, cutDecks: 4.1, count: "Hi-Lo · exact decks", policy: "Insurance + 18 indices",
    ramp: [[-8, 1], [1, 3], [2, 7], [3, 11], [4, 15], [5, 16]],
    evPerRound: -0.0002753712511014846, variancePerRound: 13.338073672460467, avgBet: 1.5166497650665993, ci95: 0.0002263573744438029,
  },
  {
    id: "csm",
    label: "Continuous shuffler · flat bet",
    description: "CSM control. There is no persistent count and therefore no count-based betting opportunity.",
    rounds: 100_000_000, cutDecks: null, count: "No count", policy: "Basic strategy · flat bet",
    ramp: [[-8, 1]],
    evPerRound: -0.008754420350176813, variancePerRound: 2.790115916732035, avgBet: 1, ci95: 0.0003273853360768314,
  },
];

interface MainBucket {
  tc: number;
  frequency: number;
  evAtRecordedBet: number;
  sdAtRecordedBet: number;
  recordedBet: number;
}

/** Independent ten-billion-round main run, retained by TC so arbitrary ramps can be reweighted. */
const MAIN_BUCKETS: MainBucket[] = [
  { tc: -8, frequency: 0.01501665240600666, evAtRecordedBet: -0.10660486154690509, sdAtRecordedBet: 1.6026492475269836, recordedBet: 1 },
  { tc: -7, frequency: 0.00940169800376068, evAtRecordedBet: -0.08208540361538948, sdAtRecordedBet: 1.6157321377803548, recordedBet: 1 },
  { tc: -6, frequency: 0.015330236706132094, evAtRecordedBet: -0.07149309703743843, sdAtRecordedBet: 1.6211654524839965, recordedBet: 1 },
  { tc: -5, frequency: 0.02434309850973724, evAtRecordedBet: -0.06060318184227862, sdAtRecordedBet: 1.6296633195685921, recordedBet: 1 },
  { tc: -4, frequency: 0.041111976716444794, evAtRecordedBet: -0.04903075056957794, sdAtRecordedBet: 1.6376583852533348, recordedBet: 1 },
  { tc: -3, frequency: 0.06785662052714264, evAtRecordedBet: -0.037360315122088934, sdAtRecordedBet: 1.6535768502622448, recordedBet: 1 },
  { tc: -2, frequency: 0.11831196174732478, evAtRecordedBet: -0.02573184681629702, sdAtRecordedBet: 1.663299078122046, recordedBet: 1 },
  { tc: -1, frequency: 0.17727492327090996, evAtRecordedBet: -0.014868587882710756, sdAtRecordedBet: 1.669171117809392, recordedBet: 1 },
  { tc: 0, frequency: 0.25189883430075954, evAtRecordedBet: -0.004251619815555304, sdAtRecordedBet: 1.6701505944497386, recordedBet: 1 },
  { tc: 1, frequency: 0.11209426394483771, evAtRecordedBet: 0.026913236414053472, sdAtRecordedBet: 5.014115176956594, recordedBet: 3 },
  { tc: 2, frequency: 0.0656662439262665, evAtRecordedBet: 0.14570040110060262, sdAtRecordedBet: 11.708984765321734, recordedBet: 7 },
  { tc: 3, frequency: 0.0387107450154843, evAtRecordedBet: 0.3550032917217171, sdAtRecordedBet: 18.42819343744478, recordedBet: 11 },
  { tc: 4, frequency: 0.024308328409723332, evAtRecordedBet: 0.6686743729363143, sdAtRecordedBet: 25.235967744283602, recordedBet: 15 },
  { tc: 5, frequency: 0.014727127405890852, evAtRecordedBet: 0.9168181162064233, sdAtRecordedBet: 26.90963017546606, recordedBet: 16 },
  { tc: 6, frequency: 0.00926429730370572, evAtRecordedBet: 1.121563877273239, sdAtRecordedBet: 26.918645533808665, recordedBet: 16 },
  { tc: 7, frequency: 0.005672362402268945, evAtRecordedBet: 1.3194570925158096, sdAtRecordedBet: 26.938974621131276, recordedBet: 16 },
  { tc: 8, frequency: 0.009010629403604252, evAtRecordedBet: 1.8053022134058694, sdAtRecordedBet: 27.006906991404698, recordedBet: 16 },
];

export type CustomRamp = readonly [number, number, number, number, number, number];

export function reweightMainRamp(units: CustomRamp): DDMProfile {
  const betAt = (tc: number) => tc <= 0 ? units[0] : tc === 1 ? units[1] : tc === 2 ? units[2] : tc === 3 ? units[3] : tc === 4 ? units[4] : units[5];
  let mean = 0;
  let secondMoment = 0;
  let avgBet = 0;
  for (const bucket of MAIN_BUCKETS) {
    const bet = Math.max(0, betAt(bucket.tc));
    const unitMean = bucket.evAtRecordedBet / bucket.recordedBet;
    const unitSd = bucket.sdAtRecordedBet / bucket.recordedBet;
    mean += bucket.frequency * bet * unitMean;
    secondMoment += bucket.frequency * bet ** 2 * (unitSd ** 2 + unitMean ** 2);
    avgBet += bucket.frequency * bet;
  }
  const variance = Math.max(0, secondMoment - mean ** 2);
  const rounds = 9_999_999_996;
  return {
    id: "custom",
    label: "Custom ramp · main indexed game",
    description: "Custom ramp reweighted from the independent ten-billion-round five-deck-penetration TC buckets. Insurance +4 and all 18 play indices remain active.",
    rounds,
    cutDecks: 1,
    count: "Hi-Lo · exact decks",
    policy: "Insurance + 18 indices",
    ramp: [[-8, units[0]], [1, units[1]], [2, units[2]], [3, units[3]], [4, units[4]], [5, units[5]]],
    evPerRound: mean,
    variancePerRound: variance,
    avgBet,
    ci95: 1.96 * Math.sqrt(variance / rounds),
  };
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
