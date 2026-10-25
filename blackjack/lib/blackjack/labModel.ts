import { DEFAULT_ADVANTAGE_RULES, profileKey, zeroBetsBelow, type AdvantageRules, type CountShares, type RampPoint } from "./advantage";
import { DECK_COUNTS, GAME_OPTIONS, type Decks } from "./coefficients";
import { analyzeCvcx, bankrollForHorizon, createOptimalRamp, goalByHorizonProbability, goalOrBust, resultPercentile, riskSizedUnit, type CvcxPerformance, type CvcxScenario } from "./cvcx";
import type { CvcxTemplate } from "./cvcxLibrary";
import { AUDITED_RULES, normalizeConfig, OPTIMAL_RAMP_NAME, PRESET_NAMES, presetRamp, type LabConfig } from "./labConfig";
import { sameRamp } from "./rampSteps";
import { isEstimated, sumRuleAdjustment, type RuleAdjustmentFlags } from "./ruleAdjustments";
import type { SessionSimulationConfig } from "./sessionSimulation";
import type { SimulationTemplate } from "./simulationLibrary";
import { WONG_OUT_SHARES } from "./wongOutShares";

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
    earlySurrender: config.earlySurrender,
    blackjackPayout: config.blackjackPayout,
    useIndices: config.useIndices,
  };
}

export function labRuleFlags(config: LabConfig): RuleAdjustmentFlags {
  return {
    dealerStandsSoft17: !config.dealerHitsSoft17,
    noDoubleAfterSplit: !config.doubleAfterSplit,
    noResplitAces: !config.resplitAces,
    noLateSurrender: !config.lateSurrender && !config.earlySurrender,
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

/** The "enter:leave" key of the simulated back-counting rule for this setup, e.g. "1:-1" or "start:0". */
export const wongOutRule = (wongInAt: number | null, wongOutAt: number) => `${wongInAt ?? "start"}:${wongOutAt}`;

/** The leave points that have simulated shares for an entry point: below the entry (below 0, where a shoe starts, when playing from the top), from −3 to +1. */
export const wongOutChoices = (wongInAt: number | null) => [-3, -2, -1, 0, 1].filter((exit) => exit < (wongInAt ?? 0));

/**
 * Watched and played shares for leaving at a count, or undefined when the player stays (the
 * simple sit-out ramp prices that) or the rule has no simulated shares.
 */
export function countSharesFor(config: Pick<LabConfig, "wongInAt" | "wongOutAt" | "handsPerHour" | "shoeMoveMinutes">, rules: AdvantageRules): CountShares | undefined {
  if (config.wongOutAt === null) return undefined;
  const shares = WONG_OUT_SHARES[profileKey(rules)]?.[wongOutRule(config.wongInAt, config.wongOutAt)];
  // Each move to a fresh shoe is time that deals nothing: shoeMoveMinutes of rounds not played.
  return shares && { ...shares, idle: shares.moves * config.handsPerHour * config.shoeMoveMinutes / 60 };
}

/** Rounds played in each shoe before leaving it for a fresh one, when the rule moves at all. */
export function roundsPerShoe(config: Pick<LabConfig, "wongInAt" | "wongOutAt">, rules: AdvantageRules): number | undefined {
  if (config.wongOutAt === null) return undefined;
  const shares = WONG_OUT_SHARES[profileKey(rules)]?.[wongOutRule(config.wongInAt, config.wongOutAt)];
  return shares?.moves ? shares.played.reduce((sum, share) => sum + share, 0) / shares.moves : undefined;
}

/** The most units one hand may bet at this unit under the table maximum. */
export const tableMaxUnits = (config: Pick<LabConfig, "tableMax" | "baseBet">) =>
  config.tableMax !== null && config.baseBet > 0 ? config.tableMax / config.baseBet : Infinity;

/** The top bet an optimal ramp may use: the chosen spread, or less where the table maximum stops it. */
export const effectiveSpread = (config: LabConfig) => Math.max(1, Math.min(config.maxSpread, tableMaxUnits(config)));

/**
 * The ramp actually played. Sitting out low counts is a property of the game
 * being played, so skipped counts drop out of EV, variance, and "rounds
 * played"; the saved ramp keeps its units underneath. With a leave point the
 * simulated shares decide what is played instead. No bet goes above the table maximum.
 */
export function playedRamp(config: LabConfig): RampPoint[] {
  const sitting = config.wongInAt === null || countSharesFor(config, labRules(config)) ? config.ramp : zeroBetsBelow(config.ramp, config.wongInAt);
  const cap = tableMaxUnits(config);
  return Number.isFinite(cap) ? sitting.map((point) => ({ ...point, units: Math.min(point.units, cap) })) : sitting;
}

/** The optimal ramp for a setup: its spread, sit-out or leave rule, table maximum and rules. */
export function optimalRampFor(config: LabConfig, rules = labRules(config)) {
  const shares = countSharesFor(config, rules);
  return createOptimalRamp(rules, effectiveSpread(config), shares ? null : config.wongInAt, config.chipIncrement, extraRuleAdjustment(config), shares);
}

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
    countShares: countSharesFor(config, rules),
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
  decks: Decks;
  dealt: number;
  /** The ramp this row was priced with: the player's own, or that game's optimal ramp. */
  ramp: RampPoint[];
  result: CvcxPerformance;
  current: boolean;
}

/**
 * Prices the player's setup in every simulated game (each deck count and penetration), either with the
 * player's own ramp or with each game's own optimal ramp (capped at the
 * maximum spread), and ranks them by SCORE, which compares games regardless of
 * stakes. Expected win breaks ties, such as games with no edge at all.
 */
export function compareGames(config: LabConfig, basis: CompareBasis): GameComparison[] {
  const scenario = labScenario(config);
  const rows = DECK_COUNTS.flatMap((decks) => GAME_OPTIONS[decks].map((option) => {
    const game = { ...config, decks, dealt: option.dealt };
    const rules = { ...scenario.rules, decks, penetration: option.dealt / decks };
    const ramp = basis === "yours" ? playedRamp(game) : optimalRampFor(game, rules);
    return {
      decks,
      dealt: option.dealt,
      ramp,
      result: analyzeCvcx({ ...scenario, rules, countShares: countSharesFor(game, rules) }, ramp, config.baseBet),
      current: decks === config.decks && Math.abs(option.dealt - config.dealt) < 1e-6,
    };
  }));
  return rows.sort((a, b) => b.result.cScore - a.result.cScore || b.result.hourlyEv - a.result.hourlyEv);
}

export interface RuleComparison {
  key: string;
  /** "Dealer stands on soft 17", or "Your game" for the current row. */
  label: string;
  patch: Partial<LabConfig>;
  ramp: RampPoint[];
  result: CvcxPerformance;
  current: boolean;
}

/** Every one-rule change from the current game: what a table with that rule instead would be worth. */
export function ruleVariants(config: LabConfig): { key: string; label: string; patch: Partial<LabConfig> }[] {
  const surrender = config.earlySurrender ? "early" : config.lateSurrender ? "late" : "none";
  return [
    { key: "soft17", label: config.dealerHitsSoft17 ? "Dealer stands on soft 17" : "Dealer hits soft 17", patch: { dealerHitsSoft17: !config.dealerHitsSoft17 } },
    ...(["none", "late", "early"] as const).filter((option) => option !== surrender).map((option) => ({
      key: `surrender-${option}`,
      label: option === "none" ? "No surrender" : option === "late" ? "Late surrender" : "Early surrender vs 10",
      patch: { lateSurrender: option !== "none", earlySurrender: option === "early" },
    })),
    { key: "das", label: config.doubleAfterSplit ? "No double after split" : "Double after split", patch: { doubleAfterSplit: !config.doubleAfterSplit } },
    { key: "rsa", label: config.resplitAces ? "No resplitting aces" : "Resplit aces", patch: { resplitAces: !config.resplitAces } },
    { key: "payout", label: config.blackjackPayout === 1.5 ? "Blackjack pays 6:5" : "Blackjack pays 3:2", patch: { blackjackPayout: config.blackjackPayout === 1.5 ? 1.2 : 1.5 } },
    { key: "holeCard", label: config.europeanNoHoleCard ? "Dealer peeks" : "No hole card (European)", patch: { europeanNoHoleCard: !config.europeanNoHoleCard } },
    ...(["any2", "9to11", "10to11"] as const).filter((rule) => rule !== config.doubleRule).map((rule) => ({
      key: `double-${rule}`,
      label: rule === "any2" ? "Double any two cards" : rule === "9to11" ? "Double 9–11 only" : "Double 10–11 only",
      patch: { doubleRule: rule },
    })),
  ];
}

/**
 * The current game beside each one-rule change, priced with the player's ramp or each variant's
 * own optimal ramp, and ranked by SCORE like compareGames.
 */
export function compareRules(config: LabConfig, basis: CompareBasis): RuleComparison[] {
  const rows = [{ key: "current", label: "Your game", patch: {} }, ...ruleVariants(config)].map((variant) => {
    const game = { ...config, ...variant.patch };
    const scenario = labScenario(game);
    const ramp = basis === "yours" ? playedRamp(game) : optimalRampFor(game, scenario.rules);
    return { ...variant, ramp, result: analyzeCvcx(scenario, ramp, game.baseBet), current: variant.key === "current" };
  });
  return rows.sort((a, b) => b.result.cScore - a.result.cScore || b.result.hourlyEv - a.result.hourlyEv);
}

/* ------------------------------------------------------------------------ */
/* Hand-offs to other tools                                                  */
/* ------------------------------------------------------------------------ */

export type Destination = "simulation" | "compare" | "trip-planner" | "journal";

export interface LabBlocker {
  reason: string;
  /** The one change that clears it. */
  fix?: "rules" | "hands" | "leave";
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
  if (config.wongOutAt !== null) {
    return { reason: simulator ? "The Session Simulator doesn't model leaving the table at a count." : "Doesn't model leaving the table at a count.", fix: "leave" };
  }
  if (simulator && new Set(config.hands.map((point) => point.hands)).size > 1) {
    return { reason: "The Session Simulator needs the same number of hands at every count.", fix: "hands" };
  }
  if (simulator && config.earlySurrender) {
    return { reason: "The Session Simulator models late surrender only, not early surrender against a ten.", fix: "rules" };
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
  const optimalRamp = optimalRampFor(config, rules);
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
    /** The bankroll that keeps `trips` trips like this one at the target risk of going broke. */
    bankrollForTrips: (trips: number) => bankrollForHorizon(result.evPerRound, variance, rounds * Math.max(0, trips), config.targetRisk),
    /** Average hours for the bankroll to double, and the chance it doubles before it is lost. */
    doubling: {
      hours: result.hourlyEv > 0 ? config.bankroll / result.hourlyEv : Infinity,
      chance: goalOrBust(config.bankroll, config.bankroll, result.evPerRound, variance).goal,
    },
    /** Chance of being up `goal` before losing the bankroll, and of going broke first: on this trip, and ever. */
    goalOrBust: (goal: number) => ({
      trip: goalOrBust(config.bankroll, goal, result.evPerRound, variance, rounds),
      ever: goalOrBust(config.bankroll, goal, result.evPerRound, variance),
    }),
  };
}

export type TripOutlook = ReturnType<typeof tripOutlook>;

/* ------------------------------------------------------------------------ */
/* Suggest a ramp (the Bet Spread Recommender, on the Lab's own game)        */
/* ------------------------------------------------------------------------ */

export type SuggestionStatus = "met" | "risk-limited" | "minimum-too-high" | "over-table-max";

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
  const sitOut = (ramp: RampPoint[]) => (config.wongInAt === null || scenario.countShares ? ramp : zeroBetsBelow(ramp, config.wongInAt));
  const candidates = [
    ...PRESET_NAMES.map((name) => ({ key: name, name: `${name.replace("-", "–")} spread`, kind: "preset" as const, ramp: presetRamp(name) })),
    // The table maximum depends on the unit chosen below, so the optimal shape here uses the spread alone.
    { key: "optimal", name: "Kelly-weighted ramp", kind: "optimal" as const, ramp: optimalRampFor({ ...config, tableMax: null }, rules) },
    { key: "yours", name: "Your ramp", kind: "yours" as const, ramp: config.ramp },
  ].filter((candidate, index, all) => all.findIndex((other) => sameRamp(sitOut(other.ramp), sitOut(candidate.ramp))) === index);

  const minimumWhole = Math.max(1, Math.ceil(tableMinimum - 1e-9));
  const suggestions: SpreadSuggestion[] = candidates.map((candidate) => {
    const played = sitOut(candidate.ramp);
    const perDollar = analyzeCvcx(scenario, played, 1);
    const requiredRaw = perDollar.evPerRound > 0 ? Math.max(0, hourlyGoal) / (perDollar.evPerRound * config.handsPerHour) : Infinity;
    const allowedRaw = riskSizedUnit(scenario, played);
    const requiredWhole = Number.isFinite(requiredRaw) ? Math.max(minimumWhole, Math.ceil(requiredRaw - 1e-9)) : Infinity;
    const units = played.map((point) => point.units).filter((value) => value > 0);
    // The top bet has to fit under the table maximum, which caps the unit as risk does.
    const tableCap = config.tableMax !== null && units.length ? Math.floor(config.tableMax / Math.max(...units) + 1e-9) : Number.MAX_SAFE_INTEGER;
    const riskWhole = Number.isFinite(allowedRaw) ? Math.floor(allowedRaw + 1e-9) : Number.MAX_SAFE_INTEGER;
    const allowedWhole = Math.min(riskWhole, tableCap);
    let baseBet: number, status: SuggestionStatus;
    if (tableCap < minimumWhole) { baseBet = minimumWhole; status = "over-table-max"; }
    else if (allowedWhole < minimumWhole) { baseBet = minimumWhole; status = "minimum-too-high"; }
    else if (requiredWhole <= allowedWhole) { baseBet = requiredWhole; status = "met"; }
    else { baseBet = allowedWhole; status = "risk-limited"; }
    return {
      ...candidate,
      baseBet,
      minBet: units.length ? Math.min(...units) * baseBet : 0,
      maxBet: units.length ? Math.max(...units) * baseBet : 0,
      status,
      feasible: status === "met",
      withinRisk: status !== "minimum-too-high" && status !== "over-table-max",
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
