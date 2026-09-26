import { DAILY_CHECKLIST, evaluateChecklist } from "../blackjack/practiceChecklist";
import type { DrillType, Mistake, Session } from "./storage";

/**
 * Round bookkeeping shared by the strategy drills (basic strategy and index
 * plays): how long a round is, when an answer pauses for its explanation, and
 * the running tally that is saved as progress and finally as a session.
 */

export const ROUND_LENGTHS = [10, 20, 50] as const;
export type RoundLength = (typeof ROUND_LENGTHS)[number];
/** Saved progress from before rounds had a length was always ten hands. */
export const roundLengthOf = (value: unknown): RoundLength =>
  ROUND_LENGTHS.includes(value as RoundLength) ? (value as RoundLength) : 10;

export type ExplainMode = "mistakes" | "every" | "never";
export const EXPLAIN_MODES: readonly ExplainMode[] = ["mistakes", "every", "never"];
export const explainModeOf = (value: unknown): ExplainMode =>
  EXPLAIN_MODES.includes(value as ExplainMode) ? (value as ExplainMode) : "mistakes";

/** Whether an answer stops on its explanation, or the next hand follows at once. */
export const pausesOn = (explain: ExplainMode, ok: boolean) => explain === "every" || (explain === "mistakes" && !ok);

export type CategoryTotals = Record<string, { correct: number; total: number }>;

export interface RoundTally {
  /** Hands answered so far; also the index of the next hand. */
  answered: number;
  correct: number;
  streak: number;
  best: number;
  /** Time spent answering, excluding time paused on an explanation. */
  totalMs: number;
  mistakes: Mistake[];
  categories: CategoryTotals;
}

export const EMPTY_TALLY: RoundTally = { answered: 0, correct: 0, streak: 0, best: 0, totalMs: 0, mistakes: [], categories: {} };

export function applyAnswer(tally: RoundTally, answer: { ok: boolean; ms: number; category: string; mistake?: Mistake }): RoundTally {
  const streak = answer.ok ? tally.streak + 1 : 0;
  const previous = tally.categories[answer.category] ?? { correct: 0, total: 0 };
  return {
    answered: tally.answered + 1,
    correct: tally.correct + (answer.ok ? 1 : 0),
    streak,
    best: Math.max(tally.best, streak),
    totalMs: tally.totalMs + Math.max(0, answer.ms),
    mistakes: answer.ok || !answer.mistake ? tally.mistakes : [...tally.mistakes, answer.mistake],
    categories: { ...tally.categories, [answer.category]: { correct: previous.correct + (answer.ok ? 1 : 0), total: previous.total + 1 } },
  };
}

const categoryTotal = (categories: CategoryTotals | undefined) =>
  Object.values(categories ?? {}).reduce((sum, value) => sum + (Number.isFinite(value?.total) ? value.total : 0), 0);

/**
 * How many hands saved progress has really answered.
 *
 * Earlier versions saved `q` as the hand on screen and kept saving while the
 * last hand's result waited for "View results", so progress could hold q = 9
 * with ten answers already in the category totals. Reading `q` alone dealt
 * hand ten again and recorded eleven answers out of ten. The category totals
 * count every answer exactly once, so the larger of the two is the truth.
 */
export const answeredInProgress = (saved: { q?: number; categories?: CategoryTotals }) =>
  Math.max(Number.isFinite(saved.q) ? Math.max(0, saved.q as number) : 0, categoryTotal(saved.categories));

/** The tally a saved round resumes from. */
export function tallyFromProgress(saved: { q?: number; correctCount?: number; streak?: number; best?: number; totalMs?: number; mistakes?: Mistake[]; categories?: CategoryTotals }): RoundTally {
  return {
    answered: answeredInProgress(saved),
    correct: saved.correctCount ?? 0,
    streak: saved.streak ?? 0,
    best: saved.best ?? 0,
    totalMs: saved.totalMs ?? 0,
    mistakes: saved.mistakes ?? [],
    categories: saved.categories ?? {},
  };
}

/**
 * Accuracy per category across saved sessions of one drill. Retry rounds are
 * left out: those hands were answered seconds after seeing the answer, so
 * they would flatter exactly the categories the reader needs to work on.
 */
export function historyTotals(sessions: readonly Session[], drill: DrillType): CategoryTotals {
  const totals: CategoryTotals = {};
  for (const session of sessions) {
    if (session.drill !== drill || session.tags?.includes("retry")) continue;
    for (const [name, value] of Object.entries(session.categories ?? {})) {
      totals[name] ??= { correct: 0, total: 0 };
      totals[name].correct += value.correct;
      totals[name].total += value.total;
    }
  }
  return totals;
}

/** A copy in random order (Fisher-Yates). */
export function shuffled<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "3 days ago", or the date. */
export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : days < 7 ? `${days} days ago` : new Date(iso).toLocaleDateString();
}

/** Today's progress on the daily checklist item a drill feeds, if it feeds one. */
export function checklistProgress(sessions: readonly Session[], drill: DrillType, now = new Date()) {
  const item = DAILY_CHECKLIST.find((entry) => entry.kind === "auto" && entry.drill === drill);
  if (!item) return undefined;
  const entry = evaluateChecklist(sessions, [], now).items.find((candidate) => candidate.item.id === item.id)!;
  return { current: entry.current, target: entry.target, done: entry.done, unit: item.unit };
}

/** "3 min 5 s", "42 s", "1 h 2 min": a duration read aloud, for timers that are not live regions. */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  if (hours) return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes) return `${minutes} minute${minutes === 1 ? "" : "s"} ${seconds} second${seconds === 1 ? "" : "s"}`;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/** "m:ss", or "h:mm:ss" past an hour, so a long chart never reads "75:12". */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
