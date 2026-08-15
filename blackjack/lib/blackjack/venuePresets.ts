import type { AdvantageRules, RampPoint } from "./advantage";

export interface VenuePreset {
  id: string;
  name: string;
  createdAt: string;
  rules: AdvantageRules;
  ramp: RampPoint[];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredCollection<T> {
  version: 1;
  items: T[];
}

const PRESETS_KEY = "countlab:venue-presets:v1";
const LIBRARY_EVENT = "countlab-venue-presets";
const MAX_PRESETS = 20;

const availableStorage = (): StorageLike | undefined => typeof window === "undefined" ? undefined : window.localStorage;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validRules = (value: unknown): value is AdvantageRules => {
  if (!value || typeof value !== "object") return false;
  const rules = value as Partial<AdvantageRules>;
  return finite(rules.decks)
    && typeof rules.dealerHitsSoft17 === "boolean"
    && typeof rules.doubleAfterSplit === "boolean"
    && typeof rules.resplitAces === "boolean"
    && typeof rules.lateSurrender === "boolean"
    && (rules.blackjackPayout === 1.5 || rules.blackjackPayout === 1.2)
    && finite(rules.penetration);
};
const validPreset = (value: unknown): value is VenuePreset => {
  if (!value || typeof value !== "object") return false;
  const preset = value as Partial<VenuePreset>;
  return typeof preset.id === "string"
    && typeof preset.name === "string"
    && typeof preset.createdAt === "string"
    && validRules(preset.rules)
    && Array.isArray(preset.ramp)
    && preset.ramp.every((point) => finite(point?.trueCount) && finite(point?.units));
};

function read<T>(key: string, validate: (value: unknown) => value is T, store = availableStorage()): T[] {
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(key) || "{}") as Partial<StoredCollection<unknown>>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(validate);
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[], store = availableStorage()) {
  if (!store) return;
  store.setItem(key, JSON.stringify({ version: 1, items } satisfies StoredCollection<T>));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_EVENT));
}

const createId = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const venuePresetLibrary = {
  event: LIBRARY_EVENT,
  presets(store?: StorageLike) {
    return read(PRESETS_KEY, validPreset, store);
  },
  savePreset(name: string, rules: AdvantageRules, ramp: RampPoint[], store?: StorageLike, now = new Date()) {
    const preset: VenuePreset = { id: createId(), name: name.trim() || `${rules.decks}D venue`, createdAt: now.toISOString(), rules, ramp };
    const next = [preset, ...this.presets(store)].slice(0, MAX_PRESETS);
    write(PRESETS_KEY, next, store);
    return preset;
  },
  deletePreset(id: string, store?: StorageLike) {
    write(PRESETS_KEY, this.presets(store).filter((preset) => preset.id !== id), store);
  },
  clear(store?: StorageLike) {
    const target = store ?? availableStorage();
    target?.removeItem(PRESETS_KEY);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_EVENT));
  },
};
