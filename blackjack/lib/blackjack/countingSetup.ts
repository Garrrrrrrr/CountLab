import { COUNTING_PRESETS, type CountBias, type CountingPreset, type DeckAsk, type DeckResolution } from "./countingTraining";
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
/**
 * When a check stops the cards. "deck" is the end of every 52 cards;
 * "round" and "3-rounds" are for table rounds, where a check waits for the
 * round to finish.
 */
export type RunningCheckpoint = "final" | "5" | "10" | "random" | "sign" | "deck" | "round" | "3-rounds";
/** A stream of cards, or full rounds at a table (player spots and the dealer). */
export type RunningDeal = "cards" | "table";
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
  /** Absent means "cards", which is what every session saved before table rounds was. */
  deal?: RunningDeal;
  /** Player spots at the table, for table rounds. */
  spots?: number;
};
export type RunningCardId = "starter" | CountingPreset | "table";

/** Spots a table round can deal to. */
export const TABLE_SPOTS = [1, 2, 3, 5, 7] as const;
export const DEFAULT_TABLE_SPOTS = 3;
export const dealOf = (values: Pick<RunningValues, "deal">): RunningDeal => (values.deal === "table" ? "table" : "cards");
export const spotsOf = (values: Pick<RunningValues, "spots">) =>
  Number.isInteger(values.spots) && (values.spots as number) >= 1 && (values.spots as number) <= 7 ? (values.spots as number) : DEFAULT_TABLE_SPOTS;

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
  { id: "table", title: "Full table", description: "Real rounds at a three-spot table: players hit, split and double, then the dealer turns the hole card and draws. Checked every 3 rounds.", values: { decks: 6, amount: 156, speed: 650, group: "1", checkpoint: "3-rounds", interruption: false, deal: "table", spots: 3 } },
];

/** The four session cards Settings can hold as the default (`countingPreset`). */
export const isSettingsPreset = (id: RunningCardId | null): id is CountingPreset =>
  id === "one-deck-speed" || id === "two-card-cancellation" || id === "six-deck-casino" || id === "recovery";

const sameRunning = (a: RunningValues, b: RunningValues) =>
  a.decks === b.decks && a.amount === b.amount && a.speed === b.speed && a.checkpoint === b.checkpoint && a.interruption === b.interruption
  && dealOf(a) === dealOf(b) && (dealOf(a) === "table" ? spotsOf(a) === spotsOf(b) : a.group === b.group);

/**
 * The session card the values match exactly, or null for custom settings.
 * `cards` lets a caller match against its own list (the Starter at the
 * reader's own speed, say).
 */
export function matchRunningPreset(values: RunningValues, cards: ReadonlyArray<{ id: RunningCardId; values: RunningValues }> = RUNNING_SESSION_CARDS): RunningCardId | null {
  return cards.find((card) => sameRunning(card.values, values))?.id ?? null;
}

/** One card is burned before dealing, so a shoe gives at most decks × 52 − 1. */
export const effectiveCardCount = (decks: number, amount: number) => Math.max(0, Math.min(amount, decks * 52 - 1));

const AVERAGE_GROUP: Record<RunningGroup, number> = { "1": 1, "2": 2, "3": 3, "4": 4, random: 2.5 };
/** Rough answering time per check, for the duration estimate only. */
const SECONDS_PER_CHECK = 5;
/** Cards in an average round: about 2.7 per spot (hits, doubles, splits) and 2.9 for the dealer. */
export const cardsPerRound = (spots: number) => spots * 2.7 + 2.9;
/** How long a finished round stays on the table before the next one is dealt. */
export const roundPauseMs = (speed: number) => Math.max(900, Math.min(1600, (speed || 1000) * 1.5));

/** Steps between random checks: groups of cards, or whole table rounds. Inclusive bounds. */
export const RANDOM_CHECK_GAP: Record<RunningDeal, readonly [number, number]> = { cards: [10, 25], table: [2, 5] };
export const randomCheckGap = (deal: RunningDeal, rng: () => number = Math.random) => {
  const [low, high] = RANDOM_CHECK_GAP[deal];
  return low + Math.floor(rng() * (high - low + 1));
};

function expectedChecks(values: RunningValues) {
  const { checkpoint, decks, amount, group } = values;
  const cards = effectiveCardCount(decks, amount);
  const table = dealOf(values) === "table";
  const steps = table ? cards / cardsPerRound(spotsOf(values)) : cards / AVERAGE_GROUP[group];
  if (checkpoint === "5") return Math.ceil(cards / 5);
  if (checkpoint === "10") return Math.ceil(cards / 10);
  if (checkpoint === "deck") return Math.max(1, Math.ceil(cards / 52));
  if (checkpoint === "round") return Math.max(1, Math.round(steps));
  if (checkpoint === "3-rounds") return Math.max(1, Math.ceil(steps / 3));
  if (checkpoint === "random") return Math.max(1, Math.round(steps / (table ? 3.5 : 17.5)));
  if (checkpoint === "sign") return Math.max(1, Math.round(steps / (table ? 2 : 8)));
  return 1;
}

/** Approximate session length in seconds, or null when self-paced. */
export function estimateRunningSeconds(values: RunningValues): number | null {
  if (values.speed === SELF_PACED) return null;
  const cards = effectiveCardCount(values.decks, values.amount);
  if (dealOf(values) === "table") {
    const rounds = cards / cardsPerRound(spotsOf(values));
    return cards * values.speed / 1000 + rounds * roundPauseMs(values.speed) / 1000 + expectedChecks(values) * SECONDS_PER_CHECK;
  }
  const groups = cards / AVERAGE_GROUP[values.group];
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
  deck: "a check at the end of each deck",
  round: "a check after every round",
  "3-rounds": "a check every 3 rounds",
};

/** Short option labels for the "Ask for the count" choice. */
export const CHECKPOINT_LABEL: Record<RunningCheckpoint, string> = {
  final: "At the end only",
  "5": "Every 5 cards",
  "10": "Every 10 cards",
  random: "At random moments",
  sign: "When the count crosses zero",
  deck: "After each deck",
  round: "After every round",
  "3-rounds": "Every 3 rounds",
};

/** Which checks make sense for a deal. Table rounds are checked between rounds, never mid-round. */
export function checkpointsFor(deal: RunningDeal): RunningCheckpoint[] {
  return deal === "table" ? ["round", "3-rounds", "deck", "random", "sign", "final"] : ["5", "10", "deck", "random", "sign", "final"];
}

/** A checkpoint that fits the deal: the current one when it already does, else the nearest equivalent. */
export function fitCheckpoint(checkpoint: RunningCheckpoint, deal: RunningDeal): RunningCheckpoint {
  if (checkpointsFor(deal).includes(checkpoint)) return checkpoint;
  if (deal === "table") return checkpoint === "5" ? "round" : "3-rounds";
  return checkpoint === "round" ? "5" : "10";
}

/**
 * Whether the cards stop for a count check after a step: one group of cards,
 * or for table rounds one whole round. `from` and `to` are the cards dealt
 * before and after the step and `steps` the steps since the last check. The
 * last card always ends in a check.
 */
export function isCheckDue({ checkpoint, from, to, total, countBefore, countAfter, steps, randomGap }: {
  checkpoint: RunningCheckpoint; from: number; to: number; total: number; countBefore: number; countAfter: number; steps: number; randomGap: number;
}) {
  if (to >= total) return true;
  const crossed = (every: number) => Math.floor(to / every) > Math.floor(from / every);
  switch (checkpoint) {
    case "5": return crossed(5);
    case "10": return crossed(10);
    case "deck": return crossed(52);
    case "round": return true;
    case "3-rounds": return steps >= 3;
    case "random": return steps >= randomGap;
    case "sign": return countBefore !== 0 && Math.sign(countBefore) !== Math.sign(countAfter);
    default: return false;
  }
}

/** Where the next check comes, in words, for the line above the cards. */
export function nextCheckText(checkpoint: RunningCheckpoint, cursor: number, total: number, stepsSinceCheck = 0) {
  if (checkpoint === "5" || checkpoint === "10" || checkpoint === "deck") {
    const step = checkpoint === "deck" ? 52 : Number(checkpoint);
    return `Next check after card ${Math.min(total, (Math.floor(cursor / step) + 1) * step)}`;
  }
  if (checkpoint === "round") return "Check after this round";
  if (checkpoint === "3-rounds") {
    const left = Math.max(1, 3 - stepsSinceCheck);
    return left === 1 ? "Check after this round" : `Check in ${left} rounds`;
  }
  if (checkpoint === "final") return "One check, at the end";
  if (checkpoint === "random") return "Checks come at random moments";
  return "Check when the count crosses zero";
}

/** The short line under each session card: "20 cards · 1 deck · 1 s each · about 40 s". */
export function runningCardMeta(values: RunningValues) {
  const table = dealOf(values) === "table";
  const spots = spotsOf(values);
  const pace = values.speed === SELF_PACED ? "self-paced" : `${formatInterval(values.speed)} ${values.group === "1" || table ? "per card" : "per group"}`;
  const seconds = estimateRunningSeconds(values);
  // Table rounds are always played out, so the session runs a few cards past the target: "about".
  return [`${table ? "about " : ""}${effectiveCardCount(values.decks, values.amount)} cards`, deckWord(values.decks), table ? `${spots} ${spots === 1 ? "spot" : "spots"}` : null, pace, seconds === null ? null : formatApproxDuration(seconds)].filter(Boolean).join(" · ");
}

/** The plain-language sentence above Start, in parts so numbers can be styled. */
export function describeRunningSession(values: RunningValues & { bias: CountBias; feedbackMode: FeedbackMode }) {
  const table = dealOf(values) === "table";
  return [
    `${table ? "about " : ""}${effectiveCardCount(values.decks, values.amount)} cards from a ${values.decks}-deck shoe`,
    table ? `full rounds at a ${spotsOf(values)}-spot table` : GROUP_PHRASE[values.group],
    values.speed === SELF_PACED ? "at your own pace" : `${formatInterval(values.speed)} ${table ? "per card" : "each"}`,
    CHECKPOINT_PHRASE[values.checkpoint],
    values.feedbackMode === "immediate" ? "results after each check" : "results at the end",
    values.interruption ? "one interruption halfway" : null,
    values.bias !== "none" && !table ? `${values.bias} stretches` : null,
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
  if (value === "table rounds" || value === "full table") return "table";
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

/** How the decks left reach the reader: read from a real tray photo, or stated outright. */
export const TRUE_COUNT_MODE_LABEL: Record<TrueCountMode, string> = { combined: "Estimate from the tray", division: "Decks given" };

/** Shoe sizes every counting drill offers, and the question counts a session can have. */
export const SHOE_SIZES = [1, 2, 4, 6, 8] as const;
export const QUESTION_TARGETS = [5, 10, 20] as const;
/** The nearest offered shoe size, for a saved setting outside the list. */
export const fitShoeSize = (decks: number) =>
  SHOE_SIZES.reduce((best, size) => (Math.abs(size - decks) < Math.abs(best - decks) ? size : best), SHOE_SIZES[3] as number);
export const fitQuestionTarget = (value: number) => (QUESTION_TARGETS as readonly number[]).includes(value) ? value : 10;

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
  { value: 1, title: "Full deck", description: "Round to whole decks. A good place to start. Under a deck left still counts as 1: you never divide by less than one step." },
  { value: 0.5, title: "Half deck", description: "Round to the nearest half deck, like most counters. Never below half a deck." },
  { value: 0.25, title: "Quarter deck", description: "Round to the nearest quarter deck for late-shoe precision. Never below a quarter." },
];

/** "0.5-deck", "0.25-deck resolution" (Test Out) or "1-deck, last deck" (a weak spot) to a resolution. */
export function parseDeckResolutionFocus(raw?: string | null): DeckResolution | undefined {
  const match = /^(1|0\.5|0\.25)-deck/.exec(raw?.trim() ?? "");
  return match ? (Number(match[1]) as DeckResolution) : undefined;
}

export function describeDeckEstimationSession(values: { decks: number; resolution: DeckResolution; target: number; feedbackMode: FeedbackMode; ask?: DeckAsk }) {
  return [
    `${values.target} real tray photos`,
    `${values.decks}-deck shoe`,
    values.ask === "played" ? "you give the decks played" : "you give the decks left",
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
