import { RAMPS, type HandCountPoint, type RampPoint } from "./advantage";
import { GAME_OPTIONS } from "./coefficients";
import { templateHandSchedule, type CvcxTemplateConfig } from "./cvcxLibrary";
import { expandHands, expandRamp, TRUE_COUNTS } from "./rampSteps";
import type { VenuePreset } from "./venuePresets";

export type DoubleRule = "any2" | "9to11" | "10to11";

/**
 * Everything on the Game & Bankroll Lab page: the fields of a saved scenario
 * (CvcxTemplateConfig) with the optional ones filled in and the ramp and hand
 * schedule expanded to one point per true count.
 */
export interface LabConfig {
  decks: 6 | 8;
  dealt: number;
  bankroll: number;
  baseBet: number;
  handsPerHour: number;
  hours: number;
  targetRisk: number;
  maxSpread: number;
  wongInAt: number | null;
  rampName: string;
  ramp: RampPoint[];
  chipIncrement: number;
  hands: HandCountPoint[];
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  europeanNoHoleCard: boolean;
  blackjackPayout: 1.5 | 1.2;
  useIndices: boolean;
  doubleRule: DoubleRule;
}

/** A saved scenario the page is working on, with the inputs it was saved or loaded with. */
export interface ActiveScenario {
  id: string;
  name: string;
  /** configKey() of the inputs when it was saved or loaded; the page is "edited" once they differ. */
  snapshot: string;
}

export const OPTIMAL_RAMP_NAME = "Optimized";
export const CUSTOM_RAMP_NAME = "Custom";
export const PRESET_NAMES = Object.keys(RAMPS);
export const isPresetName = (name: string) => Object.hasOwn(RAMPS, name);
export const presetRamp = (name: string) => expandRamp(RAMPS[name]);
/** The largest multiple of the unit a ramp reaches. */
export const rampSpread = (ramp: readonly RampPoint[]) => Math.max(0, ...ramp.map((point) => point.units));

/** The ruleset the coefficients were simulated for; anything else is an estimate. */
export const AUDITED_RULES = {
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  resplitAces: true,
  lateSurrender: true,
  europeanNoHoleCard: false,
  blackjackPayout: 1.5,
  doubleRule: "any2",
} as const satisfies Partial<LabConfig>;

/** A typical six-deck game with a 1–12 ramp, so the page shows real numbers before anything is entered. */
export const DEFAULT_LAB_CONFIG: LabConfig = {
  decks: 6,
  dealt: 4.5,
  bankroll: 25000,
  baseBet: 15,
  handsPerHour: 100,
  hours: 100,
  targetRisk: 0.05,
  maxSpread: 12,
  wongInAt: null,
  rampName: "1-12",
  ramp: presetRamp("1-12"),
  chipIncrement: 0.5,
  hands: expandHands(undefined),
  ...AUDITED_RULES,
  useIndices: true,
};

/** Snaps a dealt figure to the audited penetration it came from, so float noise never unselects it. */
export function snapDealt(decks: 6 | 8, dealt: number) {
  return GAME_OPTIONS[decks].find((option) => Math.abs(option.dealt - dealt) < 1e-6)?.dealt ?? dealt;
}

/**
 * Reads a saved scenario the way the Lab has always loaded one: older hand
 * settings migrate to a per-count schedule, a missing doubling rule means any
 * two cards, and a missing play mode means indices. Sparse ramps from older
 * saves are expanded so sitting out low counts masks every count correctly.
 */
export function normalizeConfig(config: CvcxTemplateConfig): LabConfig {
  return {
    decks: config.decks,
    dealt: snapDealt(config.decks, config.dealt),
    bankroll: config.bankroll,
    baseBet: config.baseBet,
    handsPerHour: config.handsPerHour,
    hours: config.hours,
    targetRisk: config.targetRisk,
    maxSpread: config.maxSpread,
    wongInAt: config.wongInAt ?? null,
    rampName: config.rampName,
    ramp: expandRamp(config.ramp),
    chipIncrement: config.chipIncrement,
    hands: expandHands(templateHandSchedule(config)),
    dealerHitsSoft17: config.dealerHitsSoft17,
    doubleAfterSplit: config.doubleAfterSplit,
    resplitAces: config.resplitAces,
    lateSurrender: config.lateSurrender,
    europeanNoHoleCard: config.europeanNoHoleCard,
    blackjackPayout: config.blackjackPayout,
    // Scenarios saved before the control existed were priced with indices on.
    useIndices: config.useIndices !== false,
    doubleRule: config.doubleRule ?? "any2",
  };
}

/** The saved-scenario record, with the same fields in the same order the Lab has always written. */
export function toTemplateConfig(config: LabConfig): CvcxTemplateConfig {
  return {
    decks: config.decks,
    dealt: config.dealt,
    bankroll: config.bankroll,
    baseBet: config.baseBet,
    handsPerHour: config.handsPerHour,
    hours: config.hours,
    targetRisk: config.targetRisk,
    maxSpread: config.maxSpread,
    wongInAt: config.wongInAt,
    rampName: config.rampName,
    ramp: config.ramp,
    chipIncrement: config.chipIncrement,
    hands: config.hands,
    dealerHitsSoft17: config.dealerHitsSoft17,
    doubleAfterSplit: config.doubleAfterSplit,
    resplitAces: config.resplitAces,
    lateSurrender: config.lateSurrender,
    europeanNoHoleCard: config.europeanNoHoleCard,
    blackjackPayout: config.blackjackPayout,
    useIndices: config.useIndices,
    doubleRule: config.doubleRule,
  };
}

/** A canonical fingerprint of the inputs; equal fingerprints price identically. */
export function configKey(config: LabConfig) {
  return JSON.stringify({
    ...toTemplateConfig(config),
    ramp: expandRamp(config.ramp).map((point) => point.units),
    hands: expandHands(config.hands).map((point) => point.hands),
  });
}

/** The fields of `config` whose values differ from `next`, for undoing exactly what a change touched. */
export function changedFields(config: LabConfig, next: Partial<LabConfig>): Partial<LabConfig> {
  const previous: Partial<LabConfig> = {};
  for (const key of Object.keys(next) as (keyof LabConfig)[]) {
    if (JSON.stringify(config[key]) !== JSON.stringify(next[key])) Object.assign(previous, { [key]: config[key] });
  }
  return previous;
}

/** A name that is not already taken: "Weekend", then "Weekend (2)", "Weekend (3)"… */
export function uniqueName(name: string, taken: readonly string[]) {
  const trimmed = name.trim();
  if (!taken.includes(trimmed)) return trimmed;
  const base = trimmed.replace(/ \(\d+\)$/, "");
  let number = 2;
  while (taken.includes(`${base} (${number})`)) number++;
  return `${base} (${number})`;
}

/* ------------------------------------------------------------------------ */
/* Rules                                                                     */
/* ------------------------------------------------------------------------ */

export interface RuleState {
  key: "soft17" | "payout" | "double" | "das" | "rsa" | "surrender" | "holeCard";
  label: string;
  /** Short form for a one-line summary, e.g. "H17". */
  short: string;
  /** Differs from the audited game, so results for it are estimates. */
  differs: boolean;
}

const DOUBLE_LABEL: Record<DoubleRule, [string, string]> = {
  any2: ["Double any two cards", "D any 2"],
  "9to11": ["Double 9–11 only", "D9–11"],
  "10to11": ["Double 10–11 only", "D10–11"],
};

/** Each table rule in plain words, in the order players usually list them. */
export function ruleStates(config: LabConfig): RuleState[] {
  return [
    { key: "soft17", label: config.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands on soft 17", short: config.dealerHitsSoft17 ? "H17" : "S17", differs: !config.dealerHitsSoft17 },
    { key: "payout", label: config.blackjackPayout === 1.5 ? "Blackjack pays 3:2" : "Blackjack pays 6:5", short: config.blackjackPayout === 1.5 ? "3:2" : "6:5", differs: config.blackjackPayout !== 1.5 },
    { key: "double", label: DOUBLE_LABEL[config.doubleRule][0], short: DOUBLE_LABEL[config.doubleRule][1], differs: config.doubleRule !== "any2" },
    { key: "das", label: config.doubleAfterSplit ? "Double after split" : "No double after split", short: config.doubleAfterSplit ? "DAS" : "No DAS", differs: !config.doubleAfterSplit },
    { key: "rsa", label: config.resplitAces ? "Resplit aces" : "No resplitting aces", short: config.resplitAces ? "RSA" : "No RSA", differs: !config.resplitAces },
    { key: "surrender", label: config.lateSurrender ? "Late surrender" : "No surrender", short: config.lateSurrender ? "LS" : "No LS", differs: !config.lateSurrender },
    { key: "holeCard", label: config.europeanNoHoleCard ? "No hole card (European)" : "Dealer peeks", short: config.europeanNoHoleCard ? "ENHC" : "Peek", differs: config.europeanNoHoleCard },
  ];
}

/** Whether every rule matches the audited game. */
export const hasAuditedRules = (config: LabConfig) => ruleStates(config).every((rule) => !rule.differs);

/* ------------------------------------------------------------------------ */
/* Venues                                                                    */
/* ------------------------------------------------------------------------ */

/** What a venue record cannot carry from the current page, in plain words. */
export function venueGaps(config: LabConfig): string[] {
  const gaps: string[] = [];
  if (config.europeanNoHoleCard) gaps.push("the no-hole-card rule");
  if (config.doubleRule !== "any2") gaps.push("the doubling rule");
  if (config.wongInAt !== null) gaps.push("When you play");
  if (config.hands.some((point) => point.hands !== 1)) gaps.push("hands per count");
  return gaps;
}

/** The inputs a venue sets when loaded: its game, rules, play mode (when stored) and ramp. Bankroll and unit stay. */
export function venuePatch(preset: VenuePreset): Partial<LabConfig> {
  const decks = preset.rules.decks === 8 ? 8 : 6;
  return {
    decks,
    dealt: snapDealt(decks, preset.rules.penetration * decks),
    dealerHitsSoft17: preset.rules.dealerHitsSoft17,
    doubleAfterSplit: preset.rules.doubleAfterSplit,
    resplitAces: preset.rules.resplitAces,
    lateSurrender: preset.rules.lateSurrender,
    blackjackPayout: preset.rules.blackjackPayout,
    ...(typeof preset.rules.useIndices === "boolean" ? { useIndices: preset.rules.useIndices } : {}),
    ramp: expandRamp(preset.ramp),
    rampName: CUSTOM_RAMP_NAME,
    maxSpread: rampSpread(preset.ramp),
  };
}

/* ------------------------------------------------------------------------ */
/* Working draft                                                             */
/* ------------------------------------------------------------------------ */

/** The page's unsaved inputs, kept for this browser tab only so leaving the page does not lose them. */
export interface LabDraft {
  version: 1;
  config: LabConfig;
  active: ActiveScenario | null;
  draftName: string;
}

/** Per account, so a guest in the same tab never sees a signed-in player's figures. */
export const labDraftKey = (accountScope: string) => `countlab:lab-draft:${accountScope}`;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const bool = (value: unknown): value is boolean => typeof value === "boolean";
const seventeen = <T extends { trueCount: number }>(points: unknown, field: keyof T): points is T[] =>
  Array.isArray(points) && points.length === TRUE_COUNTS.length && points.every((point, index) => point && point.trueCount === TRUE_COUNTS[index] && finite(point[field as string]));

export function isLabConfig(value: unknown): value is LabConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  return (config.decks === 6 || config.decks === 8)
    && [config.dealt, config.bankroll, config.baseBet, config.handsPerHour, config.hours, config.targetRisk, config.maxSpread, config.chipIncrement].every(finite)
    && (config.wongInAt === null || finite(config.wongInAt))
    && typeof config.rampName === "string"
    && seventeen<RampPoint>(config.ramp, "units")
    && seventeen<HandCountPoint>(config.hands, "hands")
    && [config.dealerHitsSoft17, config.doubleAfterSplit, config.resplitAces, config.lateSurrender, config.europeanNoHoleCard, config.useIndices].every(bool)
    && (config.blackjackPayout === 1.5 || config.blackjackPayout === 1.2)
    && (config.doubleRule === "any2" || config.doubleRule === "9to11" || config.doubleRule === "10to11");
}

/** Reads a stored draft, or null when it is missing, from another version, or damaged. */
export function parseLabDraft(raw: string | null): LabDraft | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Partial<LabDraft>;
    if (draft.version !== 1 || !isLabConfig(draft.config)) return null;
    const active = draft.active && typeof draft.active.id === "string" && typeof draft.active.name === "string" && typeof draft.active.snapshot === "string" ? draft.active : null;
    return { version: 1, config: draft.config, active, draftName: typeof draft.draftName === "string" ? draft.draftName : "" };
  } catch {
    return null;
  }
}
