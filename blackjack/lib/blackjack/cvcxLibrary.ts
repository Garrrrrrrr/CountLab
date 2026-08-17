import type { HandCountPoint, IndexTier, RampPoint } from "./advantage";

export interface CvcxTemplateConfig {
  decks: 6 | 8;
  dealt: number;
  bankroll: number;
  handsPerHour: number;
  hours: number;
  targetRisk: number;
  maxSpread: number;
  wongInAt: number | null;
  rampName: string;
  ramp: RampPoint[];
  chipIncrement: number;
  baseBet: number;
  /** Hands played at each true count. Canonical since the Lab merged its three
   * separate hand-count controls into the bet-spread table. */
  hands?: HandCountPoint[];
  /** @deprecated Superseded by `hands`; still read so older saves keep loading. */
  playerHands?: number;
  /** @deprecated Superseded by `hands`. */
  extraHandsAt?: number | null;
  /** @deprecated Superseded by `hands`. */
  highCountHands?: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  europeanNoHoleCard: boolean;
  blackjackPayout: 1.5 | 1.2;
  /** Directly simulated index tier. */
  indexTier?: IndexTier;
  /** @deprecated Migrated to `indexTier` while reading older local saves. */
  deviationSkillLevel?: "beginner" | "intermediate" | "pro" | "perfect";
  doubleRule?: "any2" | "9to11" | "10to11";
}

export interface CvcxTemplate {
  id: string;
  name: string;
  createdAt: string;
  config: CvcxTemplateConfig;
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

const TEMPLATES_KEY = "countlab:cvcx-templates:v1";
const LIBRARY_EVENT = "countlab-cvcx-library";
const MAX_TEMPLATES = 20;

const availableStorage = (): StorageLike | undefined => typeof window === "undefined" ? undefined : window.localStorage;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validConfig = (value: unknown): value is CvcxTemplateConfig => {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<CvcxTemplateConfig>;
  return (config.decks === 6 || config.decks === 8)
    && finite(config.dealt)
    && finite(config.bankroll)
    && finite(config.baseBet)
    && finite(config.handsPerHour)
    && finite(config.hours)
    && finite(config.targetRisk)
    && finite(config.maxSpread)
    && typeof config.rampName === "string"
    && Array.isArray(config.ramp)
    && config.ramp.every((point) => finite(point?.trueCount) && finite(point?.units))
    && finite(config.chipIncrement)
    && typeof config.dealerHitsSoft17 === "boolean"
    && typeof config.doubleAfterSplit === "boolean"
    && typeof config.resplitAces === "boolean"
    && typeof config.lateSurrender === "boolean"
    && typeof config.europeanNoHoleCard === "boolean"
    && (config.blackjackPayout === 1.5 || config.blackjackPayout === 1.2)
    && (typeof config.indexTier === "string" || typeof config.deviationSkillLevel === "string");
};
const validTemplate = (value: unknown): value is CvcxTemplate => {
  if (!value || typeof value !== "object") return false;
  const template = value as Partial<CvcxTemplate>;
  return typeof template.id === "string" && typeof template.name === "string" && typeof template.createdAt === "string" && validConfig(template.config);
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

/** Hand schedule for a saved scenario, migrating pre-merge saves that stored the
 * old "player hands" / "add hands at" / "high-count hands" triple. */
export function templateHandSchedule(config: CvcxTemplateConfig): HandCountPoint[] {
  if (config.hands?.length) return config.hands;
  const base = config.playerHands ?? 1;
  const step = config.extraHandsAt;
  return Array.from({ length: 17 }, (_, index) => {
    const trueCount = index - 8;
    return {
      trueCount,
      hands:
        step !== null && step !== undefined && trueCount >= step
          ? (config.highCountHands ?? base)
          : base,
    };
  });
}

const LEGACY_TIER: Record<NonNullable<CvcxTemplateConfig["deviationSkillLevel"]>, IndexTier> = {
  beginner: "70",
  intermediate: "82",
  pro: "i18fab4",
  perfect: "full",
};

export function templateIndexTier(config: CvcxTemplateConfig): IndexTier {
  if (config.indexTier && ["none", "70", "82", "i18fab4", "full"].includes(config.indexTier))
    return config.indexTier;
  return config.deviationSkillLevel ? LEGACY_TIER[config.deviationSkillLevel] : "full";
}

export function defaultCvcxTemplateName(config: CvcxTemplateConfig) {
  const maximum = Math.max(...config.ramp.map((point) => point.units));
  return `${config.decks}D ${Math.round((config.dealt / config.decks) * 100)}% · 1–${maximum}`;
}

export const cvcxLibrary = {
  event: LIBRARY_EVENT,
  templates(store?: StorageLike) {
    return read(TEMPLATES_KEY, validTemplate, store).map((template) => ({
      ...template,
      config: { ...template.config, indexTier: templateIndexTier(template.config) },
    }));
  },
  saveTemplate(config: CvcxTemplateConfig, name: string, store?: StorageLike, now = new Date()) {
    const template: CvcxTemplate = { id: createId(), name: name.trim() || defaultCvcxTemplateName(config), createdAt: now.toISOString(), config };
    const next = [template, ...this.templates(store)].slice(0, MAX_TEMPLATES);
    write(TEMPLATES_KEY, next, store);
    return template;
  },
  deleteTemplate(id: string, store?: StorageLike) {
    write(TEMPLATES_KEY, this.templates(store).filter((template) => template.id !== id), store);
  },
  exportData(store?: StorageLike) {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), templates: this.templates(store) }, null, 2);
  },
  importData(raw: string, store?: StorageLike) {
    const parsed = JSON.parse(raw) as { version?: unknown; templates?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.templates)) throw new Error("This is not a valid CountLab Lab template backup.");
    if (!parsed.templates.every(validTemplate)) throw new Error("The template backup contains invalid or incomplete records.");
    const templates = [...parsed.templates, ...this.templates(store)].filter((template, index, all) => all.findIndex((candidate) => candidate.id === template.id) === index).slice(0, MAX_TEMPLATES);
    write(TEMPLATES_KEY, templates, store);
    return { templates: templates.length };
  },
  clear(store?: StorageLike) {
    const target = store ?? availableStorage();
    target?.removeItem(TEMPLATES_KEY);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_EVENT));
  },
};
