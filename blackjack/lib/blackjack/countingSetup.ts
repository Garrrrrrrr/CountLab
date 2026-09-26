import { COUNTING_PRESETS, type CountBias, type CountingPreset, type DeckResolution } from "./countingTraining";
import type { TrueCountRounding } from "./hiLo";

/**
 * What each counting drill's setup screen offers: the ready-made sessions
 * ("cards"), which card the current values match, the plain-language summary
 * of what is about to happen, and how a practice hand-off (a benchmark target,
 * a weak spot, the Test Out report) turns into setup values.
 *
 * Everything here is pure so the setup screens stay thin and testable.
 */

export type FeedbackMode = "immediate" | "end";
export type RunningGroup = "1" | "2" | "3" | "4" | "random";
export type RunningCheckpoint = "final" | "5" | "10" | "random" | "sign";
/** A card interval of 0 means self-paced: the next group appears on a tap or key press. */
export const SELF_PACED = 0;

/** The values that decide what a Running Count session deals and when it asks. */
export type RunningValues = {
  decks: number;
  amount: number;
  speed: number;
  group: RunningGroup;
  checkpoint: RunningCheckpoint;
  /** Stop the cards once, halfway through, and ask the counter to hold the count. */
  interruption: boolean;
};
export type RunningCardId = "starter" | CountingPreset;

/** The `?session=starter` values used by the home page, onboarding and the dashboard. */
export const RUNNING_STARTER: RunningValues = { decks: 1, amount: 20, speed: 1000, group: "1", checkpoint: "5", interruption: false };

export function runningPresetValues(preset: CountingPreset): RunningValues {
  const p = COUNTING_PRESETS[preset];
  return { decks: p.decks, amount: p.cards, speed: p.speed, group: p.group, checkpoint: p.checkpoint, interruption: p.interruption };
}

export const RUNNING_SESSION_CARDS: ReadonlyArray<{ id: RunningCardId; title: string; description: string; values: RunningValues }> = [
  { id: "starter", title: "Starter", description: "20 cards, one at a time. We check your count every 5 cards.", values: RUNNING_STARTER },
  { id: "one-deck-speed", title: "One-deck speed", description: "Count a full deck as fast as you can, with one check at the end. This is the benchmark run.", values: runningPresetValues("one-deck-speed") },
  { id: "two-card-cancellation", title: "Two-card cancellation", description: "Cards arrive in pairs so you learn to cancel +1 and −1 at a glance. Checks every 10 cards.", values: runningPresetValues("two-card-cancellation") },
  { id: "six-deck-casino", title: "Six-deck casino", description: "Random groups of 1–4 cards like a real table, checked at random moments.", values: runningPresetValues("six-deck-casino") },
  { id: "recovery", title: "Interruption recovery", description: "You are interrupted halfway through and must hold the count. Checks when the count reaches or crosses zero.", values: runningPresetValues("recovery") },
];

const sameRunning = (a: RunningValues, b: RunningValues) =>
  a.decks === b.decks && a.amount === b.amount && a.speed === b.speed && a.group === b.group && a.checkpoint === b.checkpoint && a.interruption === b.interruption;

/** The session card the values match exactly, or null for custom settings. */
export function matchRunningPreset(values: RunningValues): RunningCardId | null {
  return RUNNING_SESSION_CARDS.find((card) => sameRunning(card.values, values))?.id ?? null;
}

/** One card is burned before dealing, so a shoe gives at most decks × 52 − 1. */
export const effectiveCardCount = (decks: number, amount: number) => Math.max(0, Math.min(amount, decks * 52 - 1));

const AVERAGE_GROUP: Record<RunningGroup, number> = { "1": 1, "2": 2, "3": 3, "4": 4, random: 2.5 };
/** Rough answering time per check, for the duration estimate only. */
const SECONDS_PER_CHECK = 5;

function expectedChecks({ checkpoint, decks, amount, group }: RunningValues) {
  const cards = effectiveCardCount(decks, amount);
  const groups = cards / AVERAGE_GROUP[group];
  if (checkpoint === "5") return Math.ceil(cards / 5);
  if (checkpoint === "10") return Math.ceil(cards / 10);
  if (checkpoint === "random") return Math.max(1, Math.round(groups / 17.5));
  if (checkpoint === "sign") return Math.max(1, Math.round(groups / 8));
  return 1;
}

/** Approximate session length in seconds, or null when self-paced. */
export function estimateRunningSeconds(values: RunningValues): number | null {
  if (values.speed === SELF_PACED) return null;
  const groups = effectiveCardCount(values.decks, values.amount) / AVERAGE_GROUP[values.group];
  return groups * values.speed / 1000 + expectedChecks(values) * SECONDS_PER_CHECK;
}

/** "about 40 s", "about 2 min". */
export function formatApproxDuration(seconds: number) {
  if (seconds < 55) return `about ${Math.max(10, Math.round(seconds / 10) * 10)} s`;
  return `about ${Math.max(1, Math.round(seconds / 60))} min`;
}

/** "1 s", "0.75 s", "Self-paced". */
export const formatInterval = (ms: number) => ms === SELF_PACED ? "Self-paced" : `${Number((ms / 1000).toFixed(2))} s`;
export const RUNNING_INTERVALS = [1500, 1000, 850, 750, 650, 500, 300, SELF_PACED] as const;

const deckWord = (decks: number) => `${decks} ${decks === 1 ? "deck" : "decks"}`;
const GROUP_PHRASE: Record<RunningGroup, string> = { "1": "one at a time", "2": "in pairs", "3": "3 at a time", "4": "4 at a time", random: "1–4 at a time" };
export const CHECKPOINT_PHRASE: Record<RunningCheckpoint, string> = {
  final: "one check at the end",
  "5": "a count check every 5 cards",
  "10": "a count check every 10 cards",
  random: "checks at random moments",
  sign: "a check whenever the count reaches or crosses zero",
};

/** The short line under each session card: "20 cards · 1 deck · 1 s each · about 40 s". */
export function runningCardMeta(values: RunningValues) {
  const pace = values.speed === SELF_PACED ? "self-paced" : `${formatInterval(values.speed)} ${values.group === "1" ? "per card" : "per group"}`;
  const seconds = estimateRunningSeconds(values);
  return [`${effectiveCardCount(values.decks, values.amount)} cards`, deckWord(values.decks), pace, seconds === null ? null : formatApproxDuration(seconds)].filter(Boolean).join(" · ");
}

/** The plain-language sentence above Start, in parts so numbers can be styled. */
export function describeRunningSession(values: RunningValues & { bias: CountBias; feedbackMode: FeedbackMode }) {
  return [
    `${effectiveCardCount(values.decks, values.amount)} cards from a ${values.decks}-deck shoe`,
    GROUP_PHRASE[values.group],
    values.speed === SELF_PACED ? "at your own pace" : `${formatInterval(values.speed)} each`,
    CHECKPOINT_PHRASE[values.checkpoint],
    values.feedbackMode === "immediate" ? "results after each check" : "results at the end",
    values.interruption ? "one interruption halfway" : null,
    values.bias !== "none" ? `${values.bias} stretches` : null,
  ].filter((part): part is string => Boolean(part));
}

/**
 * A Running Count practice hand-off: a session card id (Benchmark target) or
 * the Test Out report's "running count" category, which maps to the realistic
 * six-deck session.
 */
export function normalizeRunningFocus(raw?: string | null): RunningCardId | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  const card = RUNNING_SESSION_CARDS.find((option) => option.id === value);
  if (card) return card.id;
  return value.includes("running count") ? "six-deck-casino" : undefined;
}

/* ------------------------------- True Count ------------------------------- */

export type TrueCountFocus = "adaptive" | "all" | "positive" | "negative" | "zero" | "index" | "last-deck";
export type TrueCountMode = "division" | "combined";
export type TrueCountValues = { mode: TrueCountMode; resolution: DeckResolution; focus: TrueCountFocus };
export type TrueCountCardId = "starter" | "division" | "tray" | "index" | "last-deck";

export const TRUE_COUNT_FOCUS_LABEL: Record<TrueCountFocus, string> = {
  adaptive: "Adaptive — weak spots first",
  all: "Mixed",
  positive: "Positive counts",
  negative: "Negative counts",
  zero: "Zero counts",
  index: "Near index plays",
  "last-deck": "Last deck",
};

export const TRUE_COUNT_SESSION_CARDS: ReadonlyArray<{ id: TrueCountCardId; title: string; description: string; meta: string; values: TrueCountValues }> = [
  { id: "starter", title: "Starter", description: "Whole decks, and we tell you how many are left. Divide and round.", meta: "full deck · division only · mixed counts", values: { mode: "division", resolution: 1, focus: "all" } },
  { id: "division", title: "Division only", description: "We give you the running count and the decks left. You divide and round.", meta: "half deck · division only · mixed counts", values: { mode: "division", resolution: 0.5, focus: "all" } },
  { id: "tray", title: "Tray + division", description: "Read the discard tray, estimate the decks left, then divide. Weak spots come up more often.", meta: "half deck · tray estimate · adaptive", values: { mode: "combined", resolution: 0.5, focus: "adaptive" } },
  { id: "index", title: "Index boundaries", description: "True counts close to the numbers where strategy plays change.", meta: "half deck · tray estimate · near index plays", values: { mode: "combined", resolution: 0.5, focus: "index" } },
  { id: "last-deck", title: "Last-deck precision", description: "Late in the shoe, where small errors in decks left swing the true count most.", meta: "quarter deck · tray estimate · last deck", values: { mode: "combined", resolution: 0.25, focus: "last-deck" } },
];

export function matchTrueCountPreset(values: TrueCountValues): TrueCountCardId | null {
  return TRUE_COUNT_SESSION_CARDS.find((card) => card.values.mode === values.mode && card.values.resolution === values.resolution && card.values.focus === values.focus)?.id ?? null;
}

const FOCUS_ALIASES: ReadonlyArray<[RegExp, TrueCountFocus]> = [
  [/^negative/, "negative"],
  [/^positive/, "positive"],
  [/^zero/, "zero"],
  [/^(index|near index)/, "index"],
  [/^last[- ]deck/, "last-deck"],
  [/^(all|mixed)/, "all"],
];
/**
 * A True Count practice hand-off. The Benchmark sends "negative"; the Test Out
 * report sends "negative count". Anything unrecognised becomes adaptive.
 */
export function normalizeTrueCountFocus(raw?: string | null): TrueCountFocus {
  const value = raw?.trim().toLowerCase() ?? "";
  return FOCUS_ALIASES.find(([pattern]) => pattern.test(value))?.[1] ?? "adaptive";
}

export const RESOLUTION_WORD: Record<DeckResolution, string> = { 1: "whole", 0.5: "half", 0.25: "quarter" };
export const RESOLUTION_LABEL: Record<DeckResolution, string> = { 1: "Full deck", 0.5: "Half deck", 0.25: "Quarter deck" };
export const ROUNDING_LABEL: Record<TrueCountRounding, string> = { floor: "Floor", truncate: "Truncate", nearest: "Nearest" };

export function describeTrueCountSession(values: TrueCountValues & { decks: number; target: number; rounding: TrueCountRounding; feedbackMode: FeedbackMode }) {
  return [
    `${values.target} questions`,
    `${values.decks}-deck shoe`,
    values.mode === "combined" ? "you estimate decks left and the true count" : "we give decks left, you give the true count",
    `decks to the nearest ${RESOLUTION_WORD[values.resolution]} deck`,
    `${ROUNDING_LABEL[values.rounding]} rounding`,
    values.focus === "all" || values.focus === "adaptive" ? null : TRUE_COUNT_FOCUS_LABEL[values.focus].toLowerCase(),
    values.feedbackMode === "immediate" ? "results after each question" : "results at the end",
  ].filter((part): part is string => Boolean(part));
}

/* ----------------------------- Deck Estimation ---------------------------- */

export const DECK_ESTIMATION_SESSION_CARDS: ReadonlyArray<{ value: DeckResolution; title: string; description: string }> = [
  { value: 1, title: "Full deck", description: "Round to whole decks. A good place to start." },
  { value: 0.5, title: "Half deck", description: "Round to the nearest half deck, like most counters." },
  { value: 0.25, title: "Quarter deck", description: "Round to the nearest quarter deck for late-shoe precision." },
];

/** "0.5-deck", "0.25-deck resolution" (Test Out) or "1-deck, last deck" (a weak spot) to a resolution. */
export function parseDeckResolutionFocus(raw?: string | null): DeckResolution | undefined {
  const match = /^(1|0\.5|0\.25)-deck/.exec(raw?.trim() ?? "");
  return match ? (Number(match[1]) as DeckResolution) : undefined;
}

export function describeDeckEstimationSession(values: { decks: number; resolution: DeckResolution; target: number; feedbackMode: FeedbackMode }) {
  return [
    `${values.target} real tray photos`,
    `${values.decks}-deck shoe`,
    `round to the nearest ${RESOLUTION_WORD[values.resolution]} deck`,
    values.feedbackMode === "immediate" ? "results after each photo" : "results at the end",
  ];
}

/** The rounding rule with worked examples: "+2.8 → +2, −1.5 → −2". */
export function roundingExamples(rounding: TrueCountRounding) {
  if (rounding === "truncate") return "+2.8 → +2, −1.5 → −1";
  if (rounding === "nearest") return "+2.8 → +3, −1.4 → −1";
  return "+2.8 → +2, −1.5 → −2";
}
