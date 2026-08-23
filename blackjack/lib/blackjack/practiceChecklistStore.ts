import { dayKey } from "./practiceChecklist";

/**
 * Per-day ticks for the checklist items the app cannot observe — reciting
 * aloud, counting a physical deck. Auto items are never stored here: they are
 * derived from drill sessions, so there is nothing to remember.
 *
 * Device-local by design. The auto items already travel between devices
 * because they are computed from synced session history; syncing three
 * checkboxes would mean a new Supabase table for no real gain.
 */

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const CHECKLIST_TICKS_KEY = "hilo:checklist-ticks:v1";

/** Days of history kept. Enough for a heatmap later; bounded so the key cannot grow forever. */
const RETAINED_DAYS = 60;

type TickRecord = Record<string, string[]>;

const availableStorage = (): StorageLike | undefined =>
  typeof window === "undefined" ? undefined : window.localStorage;

function read(store: StorageLike | undefined): TickRecord {
  if (!store) return {};
  try {
    const parsed: unknown = JSON.parse(store.getItem(CHECKLIST_TICKS_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record: TickRecord = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      // A malformed day is dropped rather than poisoning the whole record.
      if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) record[key] = value;
    }
    return record;
  } catch {
    return {};
  }
}

/**
 * Drops days older than the retention window. Pruned by age rather than by
 * count: a device used twice a year would otherwise keep records indefinitely,
 * since a count-based cap never fills up.
 */
function prune(record: TickRecord, now: Date): TickRecord {
  const cutoff = dayKey(new Date(now.getTime() - RETAINED_DAYS * 86_400_000).toISOString());
  // Day keys are zero-padded YYYY-MM-DD, so lexical order is chronological.
  const keys = Object.keys(record).filter((key) => key >= cutoff);
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}

export const checklistStore = {
  ticks(store: StorageLike | undefined = availableStorage(), now: Date = new Date()): string[] {
    return read(store)[dayKey(now.toISOString())] ?? [];
  },

  toggle(id: string, store: StorageLike | undefined = availableStorage(), now: Date = new Date()): string[] {
    if (!store) return [];
    const key = dayKey(now.toISOString());
    const record = read(store);
    const current = record[key] ?? [];
    const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];

    const updated = prune({ ...record, [key]: next }, now);
    // An empty day carries no information; drop it so pruning stays meaningful.
    if (next.length === 0) delete updated[key];

    store.setItem(CHECKLIST_TICKS_KEY, JSON.stringify(updated));
    return next;
  },
};
