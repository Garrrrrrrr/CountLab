import { accountStorage } from "@/lib/supabase/accountStorage";
import { storage, type DrillType } from "./storage";

export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

export interface LeitnerState {
  itemKey: string;
  box: LeitnerBox;
  dueAt: string;
  /** Not kept since schedules started syncing; older saves still carry it. */
  lastSeenAt?: string;
  /** Times answered wrong, ever. Older saves lack it; box 1 there means the last answer was a miss. */
  misses?: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** box -> ms until due again after a correct answer moves an item into that box: a miss is due at once, then 1, 3, 7 and 16 days. */
const BOX_INTERVAL_MS: Record<LeitnerBox, number> = {
  1: 0,
  2: DAY_MS,
  3: 3 * DAY_MS,
  4: 7 * DAY_MS,
  5: 16 * DAY_MS,
};

const keyFor = (drill: DrillType) => `hilo:leitner:${drill}`;
/** The drill-progress name a schedule syncs under: one row per drill, next to its unfinished session. */
export const reviewProgressName = (drill: DrillType) => `Review: ${drill}` as DrillType;

/**
 * Schedules ride the drill-progress rows, so they reach every device the
 * account signs in on. A schedule saved before that, on this device only, is
 * read until the first answer writes the synced copy.
 */
const syncedStore: StorageLike = {
  getItem: (key) => {
    const drill = key.slice("hilo:leitner:".length) as DrillType;
    const synced = storage.progress(reviewProgressName(drill));
    return synced ? JSON.stringify(synced.state) : accountStorage.getItem(key);
  },
  setItem: (key, value) => storage.saveProgress(reviewProgressName(key.slice("hilo:leitner:".length) as DrillType), JSON.parse(value)),
};
const availableStorage = (): StorageLike | undefined => typeof window === "undefined" ? undefined : syncedStore;

/** Stored compactly, `[box, dueAt ms, misses]` per item, to stay well inside a progress row for a few hundred hands. */
type Packed = { v: 2; items: Record<string, [number, number, number]> };

function readState(drill: DrillType, store = availableStorage()): Record<string, LeitnerState> {
  if (!store) return {};
  try {
    const raw = JSON.parse(store.getItem(keyFor(drill)) || "{}") as Packed | Record<string, LeitnerState>;
    if (raw && (raw as Packed).v === 2) {
      return Object.fromEntries(Object.entries((raw as Packed).items).map(([itemKey, [box, due, misses]]) => [itemKey, { itemKey, box: box as LeitnerBox, dueAt: new Date(due).toISOString(), misses }]));
    }
    return raw as Record<string, LeitnerState>;
  } catch {
    return {};
  }
}

function writeState(drill: DrillType, state: Record<string, LeitnerState>, store = availableStorage()) {
  const items = Object.fromEntries(Object.values(state).map((entry) => [entry.itemKey, [entry.box, new Date(entry.dueAt).getTime(), missesOf(entry)] as [number, number, number]]));
  store?.setItem(keyFor(drill), JSON.stringify({ v: 2, items } satisfies Packed));
}

const missesOf = (entry: LeitnerState) => entry.misses ?? (entry.box === 1 ? 1 : 0);

/** Correct answers move an item up a box (longer interval); incorrect resets it to box 1 (due immediately). */
export function recordAnswer(drill: DrillType, itemKey: string, correct: boolean, now = new Date(), store?: StorageLike): LeitnerState {
  const state = readState(drill, store);
  const previous = state[itemKey];
  const nextBox = (correct ? Math.min(5, (previous?.box ?? 1) + 1) : 1) as LeitnerBox;
  const entry: LeitnerState = {
    itemKey,
    box: nextBox,
    dueAt: new Date(now.getTime() + BOX_INTERVAL_MS[nextBox]).toISOString(),
    misses: (previous ? missesOf(previous) : 0) + (correct ? 0 : 1),
  };
  state[itemKey] = entry;
  writeState(drill, state, store);
  return entry;
}

/** Every item CountLab has scheduling state for, keyed by item key. */
export function leitnerStates(drill: DrillType, store?: StorageLike): Record<string, LeitnerState> {
  return readState(drill, store);
}

/**
 * "Review due": items missed at least once whose next review has come,
 * most overdue first. A miss is due at once; each right answer puts the
 * next review further out (1, 3, 7, then 16 days), so a missed hand keeps
 * coming back on later days until it sticks. `valid` drops keys the
 * current rules no longer deal.
 */
export function reviewDueKeys(drill: DrillType, now = new Date(), store?: StorageLike, valid: (key: string) => boolean = () => true): string[] {
  return Object.values(readState(drill, store))
    .filter((entry) => missesOf(entry) > 0 && new Date(entry.dueAt).getTime() <= now.getTime() && valid(entry.itemKey))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .map((entry) => entry.itemKey);
}

/**
 * Among the given candidate item keys, returns the ones that are due now
 * (never seen before, or past their scheduled review time), most-overdue first.
 * Unseen items are always due, ordered after items that were seen and are overdue.
 */
export function dueItemKeys(drill: DrillType, candidateKeys: string[], now = new Date(), store?: StorageLike): string[] {
  const state = readState(drill, store);
  const seenDue: [string, number][] = [];
  const unseen: string[] = [];
  for (const key of candidateKeys) {
    const entry = state[key];
    if (!entry) {
      unseen.push(key);
      continue;
    }
    const overdueMs = now.getTime() - new Date(entry.dueAt).getTime();
    if (overdueMs >= 0) seenDue.push([key, overdueMs]);
  }
  seenDue.sort((a, b) => b[1] - a[1]);
  return [...seenDue.map(([key]) => key), ...unseen];
}

const PRACTICE_FOCUS_KEY = "countlab:practice-focus";

/** One-shot handoff from a "weak spots" list to a drill's setup: which category to jump straight into. */
export function setPracticeFocus(drill: DrillType, category: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PRACTICE_FOCUS_KEY, JSON.stringify({ drill, category }));
}

/** Reads and clears the pending practice focus if it matches `drill`. */
export function consumePracticeFocus(drill: DrillType): string | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = sessionStorage.getItem(PRACTICE_FOCUS_KEY);
  if (!raw) return undefined;
  sessionStorage.removeItem(PRACTICE_FOCUS_KEY);
  try {
    const parsed = JSON.parse(raw) as { drill?: string; category?: string };
    return parsed.drill === drill && typeof parsed.category === "string" ? parsed.category : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The pending practice focus for `drill`, without clearing it. Safe to call
 * while rendering (a render can be discarded); clear it after mount with
 * `consumePracticeFocus`.
 */
export function peekPracticeFocus(drill: DrillType): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PRACTICE_FOCUS_KEY) || "null") as { drill?: string; category?: string } | null;
    return parsed?.drill === drill && typeof parsed.category === "string" ? parsed.category : undefined;
  } catch {
    return undefined;
  }
}
