import { DEFAULT_ADVANTAGE_RULES, zeroBetsBelow, type AdvantageRules, type RampPoint } from "./advantage";
import { GAME_OPTIONS } from "./coefficients";
import { analyzeCvcx, createOptimalRamp, goalByHorizonProbability, resultPercentile, riskSizedUnit, type CvcxPerformance, type CvcxScenario } from "./cvcx";
import type { CvcxTemplate } from "./cvcxLibrary";
import { AUDITED_RULES, normalizeConfig, OPTIMAL_RAMP_NAME, PRESET_NAMES, presetRamp, type LabConfig } from "./labConfig";
import { sameRamp } from "./rampSteps";
import { isEstimated, sumRuleAdjustment, type RuleAdjustmentFlags } from "./ruleAdjustments";
import type { SessionSimulationConfig } from "./sessionSimulation";
import type { SimulationTemplate } from "./simulationLibrary";

/** The rules the audited engine understands directly (everything but the hole-card and doubling rules). */
export function labRules(config: LabConfig): AdvantageRules {
  return {
    ...DEFAULT_ADVANTAGE_RULES,
    decks: config.decks,
    penetration: config.dealt / config.decks,
    dealerHitsSoft17: config.dealerHitsSoft17,
    doubleAfterSplit: config.doubleAfterSplit,
    resplitAces: config.resplitAces,
    lateSurrender: config.lateSurrender,
    blackjackPayout: config.blackjackPayout,
    useIndices: config.useIndices,
  };
}

export function labRuleFlags(config: LabConfig): RuleAdjustmentFlags {
  return {
    dealerStandsSoft17: !config.dealerHitsSoft17,
    noDoubleAfterSplit: !config.doubleAfterSplit,
    noResplitAces: !config.resplitAces,
    noLateSurrender: !config.lateSurrender,
    europeanNoHoleCard: config.europeanNoHoleCard,
    blackjackPays6to5: config.blackjackPayout === 1.2,
    doubleOnly9to11: config.doubleRule === "9to11",
    doubleOnly10to11: config.doubleRule === "10to11",
  };
}

/**
 * The engine derives the edge shift for every rule AdvantageRules carries, so
 * only the two it cannot express are passed in. The full total is for display.
 */
export const extraRuleAdjustment = (config: LabConfig) =>
  sumRuleAdjustment({ europeanNoHoleCard: config.europeanNoHoleCard, doubleOnly9to11: config.doubleRule === "9to11", doubleOnly10to11: config.doubleRule === "10to11" });

/**
 * The ramp actually played. Sitting out low counts is a property of the game
 * being played, so skipped counts drop out of EV, variance, and "rounds
 * played"; the saved ramp keeps its units underneath.
 */
export const playedRamp = (config: LabConfig): RampPoint[] =>
  config.wongInAt === null ? config.ramp : zeroBetsBelow(config.ramp, config.wongInAt);

/** True when the played ramp bets nothing at any count. */
export const bettingNothing = (ramp: readonly RampPoint[]) => ramp.every((point) => !(point.units > 0));

export function labScenario(config: LabConfig, rules = labRules(config)): CvcxScenario {
  return {
    bankroll: config.bankroll,
    minimumBet: config.baseBet,
    playerHands: 1,
    handsByTrueCount: config.hands,
    handsPerHour: config.handsPerHour,
    hours: config.hours,
    targetRisk: config.targetRisk,
    maxSpread: config.maxSpread,
    wongInAt: config.wongInAt,
    rules,
    ruleAdjustment: extraRuleAdjustment(config),
  };
}

/** "1–12", "1.5–8", or null when nothing is bet. */
export function playedSpread(ramp: readonly RampPoint[]) {
  const played = ramp.map((point) => point.units).filter((units) => units > 0);
  return played.length ? { min: Math.min(...played), max: Math.max(...played) } : null;
}

/* ------------------------------------------------------------------------ */
/* Bankroll fit                                                              */
/* ------------------------------------------------------------------------ */

export type BankrollFit =
  | { kind: "no-bets" }
  | { kind: "no-edge" }
  /** Even a $1 unit carries more risk than the target with this ramp. */
  | { kind: "unaffordable" }
  | { kind: "covered"; required: number; raiseTo: number | null }
  | { kind: "short"; required: number; shortBy: number; maxUnit: number };

/**
 * How the bankroll compares with what the ramp needs, and the largest whole-
 * dollar unit that keeps risk of ruin at or under the target. It is floored,
 * never rounded, so applying it never lands above the target, and it is never
 * silently raised to $1.
 */
export function bankrollFit({ bankroll, unit, required, evPerRound, riskSizedUnit, noBets }: { bankroll: number; unit: number; required: number; evPerRound: number; riskSizedUnit: number; noBets: boolean }): BankrollFit {
  if (noBets) return { kind: "no-bets" };
  if (!(evPerRound > 0) || !Number.isFinite(required)) return { kind: "no-edge" };
  const maxUnit = Number.isFinite(riskSizedUnit) ? Math.max(0, Math.floor(riskSizedUnit + 1e-9)) : 0;
  if (bankroll >= required) return { kind: "covered", required, raiseTo: maxUnit > unit ? maxUnit : null };
  if (maxUnit < 1) return { kind: "unaffordable" };
  return { kind: "short", required, shortBy: required - bankroll, maxUnit };
}

/* ------------------------------------------------------------------------ */
/* Compare games                                                             */
/* ------------------------------------------------------------------------ */

export type CompareBasis = "yours" | "optimal";

export interface GameComparison {
  decks: 6 | 8;
  dealt: number;
  /** The ramp this row was priced with: the player's own, or that game's optimal ramp. */
  ramp: RampPoint[];
  result: CvcxPerformance;
  current: boolean;
}

/**
 * Prices the player's setup in each of the nine audited games, either with the
 * player's own ramp or with each game's own optimal ramp (capped at the
 * maximum spread), and ranks them by SCORE, which compares games regardless of
 * stakes. Expected win breaks ties, such as games with no edge at all.
 */
export function compareGames(config: LabConfig, basis: CompareBasis): GameComparison[] {
  const scenario = labScenario(config);
  const extra = extraRuleAdjustment(config);
  const ownRamp = playedRamp(config);
  const rows = ([6, 8] as const).flatMap((decks) => GAME_OPTIONS[decks].map((option) => {
    const rules = { ...scenario.rules, decks, penetration: option.dealt / decks };
    const ramp = basis === "yours" ? ownRamp : createOptimalRamp(rules, config.maxSpread, config.wongInAt, config.chipIncrement, extra);
    return {
      decks,
      dealt: option.dealt,
      ramp,
      result: analyzeCvcx({ ...scenario, rules }, ramp, config.baseBet),
      current: decks === config.decks && Math.abs(option.dealt - config.dealt) < 1e-6,
    };
  }));
  return rows.sort((a, b) => b.result.cScore - a.result.cScore || b.result.hourlyEv - a.result.hourlyEv);
}

/* ------------------------------------------------------------------------ */
/* Hand-offs to other tools                                                  */
/* ------------------------------------------------------------------------ */

export type Destination = "simulation" | "compare" | "trip-planner" | "journal";

export interface LabBlocker {
  reason: string;
  /** The one change that clears it. */
  fix?: "rules" | "hands";
}

const SIMULATED_RULES: (keyof typeof AUDITED_RULES)[] = ["dealerHitsSoft17", "doubleAfterSplit", "resplitAces", "lateSurrender", "blackjackPayout"];

/**
 * Why another tool cannot open this setup, worded for someone still in the Lab.
 * Mirrors the checks those tools run on arrival (unsupportedScenario).
 */
export function labBlocker(config: LabConfig, destination: Destination): LabBlocker | undefined {
  const simulator = destination === "simulation";
  if (config.europeanNoHoleCard || config.doubleRule !== "any2") {
    return { reason: simulator ? "The Session Simulator doesn't model the no-hole-card or restricted doubling rules." : "Doesn't model the no-hole-card or restricted doubling rules.", fix: "rules" };
  }
  if (simulator && new Set(config.hands.map((point) => point.hands)).size > 1) {
    return { reason: "The Session Simulator needs the same number of hands at every count.", fix: "hands" };
  }
  if (simulator && SIMULATED_RULES.some((key) => config[key] !== AUDITED_RULES[key])) {
    return { reason: "The Session Simulator models only the audited rules: H17 · DAS · RSA · LS · 3:2.", fix: "rules" };
  }
  return undefined;
}

/** The Session Simulator setup the Lab hands over: the played ramp, one hand, 50 paths of 100,000 rounds. */
export function simulationConfigFor(config: LabConfig, seed: string): SessionSimulationConfig {
  return {
    bankroll: config.bankroll,
    bettingUnit: config.baseBet,
    playerHands: 1,
    rounds: 100_000,
    paths: 50,
    roundsPerHour: config.handsPerHour,
    seed,
    rules: labRules(config),
    ramp: playedRamp(config),
  };
}

const canonical = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
      : value;

/** Two simulator setups that differ only in their random seed. */
export const sameSimulationSetup = (first: SessionSimulationConfig, second: SessionSimulationConfig) =>
  JSON.stringify(canonical({ ...first, seed: "" })) === JSON.stringify(canonical({ ...second, seed: "" }));

/** An existing simulator template with this name and setup, so repeated hand-offs don't fill the library with copies. */
export const reusableSimulationTemplate = (templates: readonly SimulationTemplate[], config: SessionSimulationConfig, name: string) =>
  templates.find((template) => template.name === name && sameSimulationSetup(template.config, config));

/* ------------------------------------------------------------------------ */
/* The whole page's pricing                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Everything the Calculator shows for one set of inputs, from one computation:
 * the played ramp priced in the audited engine, the Kelly-weighted ramp for the
 * same game, the unit the bankroll supports, and the expert figures. It is the
 * computation the Game & Bankroll Lab ran in its page hook, moved here so the
 * page and the tests read the same function.
 */
export function priceLab(config: LabConfig) {
  const rules = labRules(config);
  const flags = labRuleFlags(config);
  const activeRamp = playedRamp(config);
  const scenario = labScenario(config, rules);
  const result = analyzeCvcx(scenario, activeRamp, config.baseBet);
  const optimalRamp = createOptimalRamp(rules, config.maxSpread, config.wongInAt, config.chipIncrement, extraRuleAdjustment(config));
  const noBets = bettingNothing(activeRamp);
  const sizedUnit = riskSizedUnit(scenario, activeRamp);
  return {
    rules,
    activeRamp,
    scenario,
    result,
    optimalRamp,
    /** The optimal ramp's SCORE, so its trade-off against the current ramp shows before anyone builds it. */
    optimalScore: analyzeCvcx(scenario, optimalRamp, config.baseBet).cScore,
    usingOptimal: sameRamp(activeRamp, optimalRamp),
    /** The unit the optimal ramp would suit at the target risk; shown as guidance, never applied by the ramp builder. */
    optimalUnit: riskSizedUnit(scenario, optimalRamp),
    /** The largest unit (unrounded) that keeps this ramp at the target risk of ruin with this bankroll. */
    riskSizedUnit: sizedUnit,
    noBets,
    estimated: isEstimated(flags),
    /** The full rule adjustment, for display; the engine receives only the part it cannot derive. */
    ruleAdjustment: sumRuleAdjustment(flags),
    fit: bankrollFit({ bankroll: config.bankroll, unit: config.baseBet, required: result.requiredBankroll, evPerRound: result.evPerRound, riskSizedUnit: sizedUnit, noBets }),
    staleOptimal: config.rampName === OPTIMAL_RAMP_NAME && !sameRamp(config.ramp, optimalRamp),
    figures: expertFigures(result, config.baseBet),
  };
}

export type LabPricing = ReturnType<typeof priceLab>;

/**
 * The comparison figures CVCX users read, from one priced result: units won
 * per hour and per 100 rounds, DI (1000 × EV ÷ SD per round, the square root
 * of SCORE) and SCORE. DI and SCORE only mean something with an edge.
 */
export function expertFigures(result: CvcxPerformance, unit: number) {
  const edge = result.evPerRound > 0 && result.sdPerRound > 0;
  return {
    unitsPerHour: unit > 0 ? result.hourlyEv / unit : NaN,
    unitsPer100: unit > 0 ? result.evPer100 / unit : NaN,
    desirabilityIndex: edge ? (1000 * result.evPerRound) / result.sdPerRound : NaN,
    score: edge ? result.cScore : NaN,
  };
}

/* ------------------------------------------------------------------------ */
/* Trip outlook                                                              */
/* ------------------------------------------------------------------------ */

/** Nested ranges of trip results, by the share of trips that land inside each. */
export const TRIP_RANGES = [
  { label: "2 in 3 trips", z: 1 },
  { label: "9 in 10 trips", z: 1.6448536 },
  { label: "19 in 20 trips", z: 1.959964 },
] as const;

/** Trip-result percentiles, from a bad trip to a good one. */
export const TRIP_PERCENTILES = [
  { percentile: 5, z: -1.6448536, label: "Bad trip", detail: "1 in 20 do worse" },
  { percentile: 25, z: -0.6744898, label: "Below par", detail: "1 in 4 do worse" },
  { percentile: 50, z: 0, label: "Middle", detail: "half do better" },
  { percentile: 75, z: 0.6744898, label: "Above par", detail: "1 in 4 do better" },
  { percentile: 95, z: 1.6448536, label: "Good trip", detail: "1 in 20 do better" },
] as const;

/**
 * What one trip of `config.hours` looks like. The normal approximation the Lab
 * and the Trip Planner always used, built on the Lab's own priced result so the
 * hole-card and doubling adjustments carry through.
 */
export function tripOutlook(config: LabConfig, result: CvcxPerformance) {
  const rounds = config.handsPerHour * config.hours;
  const variance = result.sdPerRound ** 2;
  const expected = result.tripEv;
  const sd = result.standardDeviation;
  return {
    rounds,
    expected,
    standardDeviation: sd,
    endingBankroll: config.bankroll + expected,
    ranges: TRIP_RANGES.map((range) => ({ ...range, low: expected - range.z * sd, high: expected + range.z * sd })),
    percentiles: TRIP_PERCENTILES.map((point) => ({ ...point, value: expected + point.z * sd })),
    chanceAhead: result.chanceOfProfit,
    chanceOfLoss: 1 - result.chanceOfProfit,
    riskOfRuin: result.tripRiskOfRuin,
    /** Chance the trip ends down at least `loss` dollars. */
    lossAtLeast: (loss: number) => resultPercentile(-Math.abs(loss), expected, sd),
    /** Chance the trip is up `goal` dollars at some point, not only at the end. */
    reachesGoal: (goal: number) => goalByHorizonProbability(goal, result.evPerRound, variance, rounds),
  };
}

export type TripOutlook = ReturnType<typeof tripOutlook>;

/* ------------------------------------------------------------------------ */
/* Suggest a ramp (the Bet Spread Recommender, on the Lab's own game)        */
/* ------------------------------------------------------------------------ */

export type SuggestionStatus = "met" | "risk-limited" | "minimum-too-high";

export interface SpreadSuggestion {
  key: string;
  name: string;
  kind: "preset" | "optimal" | "yours";
  /** The seventeen-point ramp to apply; counts below the sit-out point stay in it and are masked when played. */
  ramp: RampPoint[];
  /** The whole-dollar unit chosen for the targets. */
  baseBet: number;
  minBet: number;
  maxBet: number;
  status: SuggestionStatus;
  /** Meets both the hourly goal and the risk ceiling. */
  feasible: boolean;
  /** Keeps risk of ruin at or under the target. */
  withinRisk: boolean;
  result: CvcxPerformance;
}

/**
 * Candidate spreads for this game, bankroll and risk tolerance. Each gets the
 * smallest whole-dollar unit (at least the table minimum) that reaches the
 * hourly goal, capped by the largest unit the risk ceiling allows: the Bet
 * Spread Recommender's rule, priced on the Lab's actual game instead of a
 * fixed one (its rules, play mode, hands per count, sitting out and pace).
 *
 * The recommendation is the candidate that meets both targets with the
 * smallest top bet (the least attention at the table), as the recommender
 * chose. When none can, it is the one that comes closest to the goal within
 * the risk ceiling (the most per hour); the recommender used to pick the
 * smallest top bet there too, which could recommend the slowest earner.
 */
export function suggestSpreads(config: LabConfig, { tableMinimum, hourlyGoal }: { tableMinimum: number; hourlyGoal: number }) {
  const rules = labRules(config);
  const scenario = labScenario(config, rules);
  const sitOut = (ramp: RampPoint[]) => (config.wongInAt === null ? ramp : zeroBetsBelow(ramp, config.wongInAt));
  const candidates = [
    ...PRESET_NAMES.map((name) => ({ key: name, name: `${name.replace("-", "–")} spread`, kind: "preset" as const, ramp: presetRamp(name) })),
    { key: "optimal", name: "Kelly-weighted ramp", kind: "optimal" as const, ramp: createOptimalRamp(rules, config.maxSpread, config.wongInAt, config.chipIncrement, extraRuleAdjustment(config)) },
    { key: "yours", name: "Your ramp", kind: "yours" as const, ramp: config.ramp },
  ].filter((candidate, index, all) => all.findIndex((other) => sameRamp(sitOut(other.ramp), sitOut(candidate.ramp))) === index);

  const minimumWhole = Math.max(1, Math.ceil(tableMinimum - 1e-9));
  const suggestions: SpreadSuggestion[] = candidates.map((candidate) => {
    const played = sitOut(candidate.ramp);
    const perDollar = analyzeCvcx(scenario, played, 1);
    const requiredRaw = perDollar.evPerRound > 0 ? Math.max(0, hourlyGoal) / (perDollar.evPerRound * config.handsPerHour) : Infinity;
    const allowedRaw = riskSizedUnit(scenario, played);
    const requiredWhole = Number.isFinite(requiredRaw) ? Math.max(minimumWhole, Math.ceil(requiredRaw - 1e-9)) : Infinity;
    const allowedWhole = Number.isFinite(allowedRaw) ? Math.floor(allowedRaw + 1e-9) : Number.MAX_SAFE_INTEGER;
    let baseBet: number, status: SuggestionStatus;
    if (allowedWhole < minimumWhole) { baseBet = minimumWhole; status = "minimum-too-high"; }
    else if (requiredWhole <= allowedWhole) { baseBet = requiredWhole; status = "met"; }
    else { baseBet = allowedWhole; status = "risk-limited"; }
    const units = played.map((point) => point.units).filter((value) => value > 0);
    return {
      ...candidate,
      baseBet,
      minBet: units.length ? Math.min(...units) * baseBet : 0,
      maxBet: units.length ? Math.max(...units) * baseBet : 0,
      status,
      feasible: status === "met",
      withinRisk: status !== "minimum-too-high",
      result: analyzeCvcx(scenario, played, baseBet),
    };
  });
  const recommended = suggestions
    .filter((suggestion) => suggestion.withinRisk && suggestion.maxBet > 0)
    .sort((a, b) => Number(b.feasible) - Number(a.feasible) || (a.feasible ? a.maxBet - b.maxBet : b.result.hourlyEv - a.result.hourlyEv))[0];
  return { suggestions, recommended };
}

/* ------------------------------------------------------------------------ */
/* Saved scenarios side by side                                              */
/* ------------------------------------------------------------------------ */

/** Prices a saved scenario exactly as loading it into the Calculator would. */
export function priceTemplate(template: CvcxTemplate) {
  const config = normalizeConfig(template.config);
  const pricing = priceLab(config);
  return { id: template.id, name: template.name, config, pricing, trip: tripOutlook(config, pricing.result) };
}
