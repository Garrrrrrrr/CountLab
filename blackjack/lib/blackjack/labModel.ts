import { DEFAULT_ADVANTAGE_RULES, zeroBetsBelow, type AdvantageRules, type RampPoint } from "./advantage";
import { GAME_OPTIONS } from "./coefficients";
import { analyzeCvcx, createOptimalRamp, type CvcxPerformance, type CvcxScenario } from "./cvcx";
import { AUDITED_RULES, type LabConfig } from "./labConfig";
import { sumRuleAdjustment, type RuleAdjustmentFlags } from "./ruleAdjustments";
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
