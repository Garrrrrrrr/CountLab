import { DrillType } from "./storage";

export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

export interface LeitnerState {
  itemKey: string;
  box: LeitnerBox;
  dueAt: string;
  lastSeenAt: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** box -> ms until due again after a correct answer moves an item into that box. Fixed, no configurability for MVP. */
const BOX_INTERVAL_MS: Record<LeitnerBox, number> = {
  1: 0,
  2: 60 * 60 * 1000,
  3: 24 * 60 * 60 * 1000,
  4: 3 * 24 * 60 * 60 * 1000,
  5: 7 * 24 * 60 * 60 * 1000,
};

const keyFor = (drill: DrillType) => `hilo:leitner:${drill}`;
const availableStorage = (): StorageLike | undefined => typeof window === "undefined" ? undefined : window.localStorage;

function readState(drill: DrillType, store = availableStorage()): Record<string, LeitnerState> {
  if (!store) return {};
  try {
    return JSON.parse(store.getItem(keyFor(drill)) || "{}") as Record<string, LeitnerState>;
  } catch {
    return {};
  }
}

function writeState(drill: DrillType, state: Record<string, LeitnerState>, store = availableStorage()) {
  store?.setItem(keyFor(drill), JSON.stringify(state));
}

/** Correct answers move an item up a box (longer interval); incorrect resets it to box 1 (due immediately). */
export function recordAnswer(drill: DrillType, itemKey: string, correct: boolean, now = new Date(), store?: StorageLike): LeitnerState {
  const state = readState(drill, store);
  const previousBox = state[itemKey]?.box ?? 1;
  const nextBox = (correct ? Math.min(5, previousBox + 1) : 1) as LeitnerBox;
  const entry: LeitnerState = {
    itemKey,
    box: nextBox,
    dueAt: new Date(now.getTime() + BOX_INTERVAL_MS[nextBox]).toISOString(),
    lastSeenAt: now.toISOString(),
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

/** Marks an item as due right now (box reset to 1), so the next `dueItemKeys` call surfaces it first. Used by click-to-practice. */
export function forceDue(drill: DrillType, itemKey: string, store?: StorageLike) {
  const state = readState(drill, store);
  state[itemKey] = { itemKey, box: 1, dueAt: new Date(0).toISOString(), lastSeenAt: state[itemKey]?.lastSeenAt ?? new Date(0).toISOString() };
  writeState(drill, state, store);
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
