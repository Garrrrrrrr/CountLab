import type { RampPoint } from "./advantage";
import type { DEVIATION_SKILL } from "./ruleAdjustments";

export interface CvcxTemplateConfig {
  decks: 6 | 8;
  dealt: number;
  bankroll: number;
  baseBet: number;
  playerHands: number;
  handsPerHour: number;
  hours: number;
  targetRisk: number;
  maxSpread: number;
  wongInAt: number | null;
  rampName: string;
  ramp: RampPoint[];
  chipIncrement: number;
  extraHandsAt: number | null;
  highCountHands: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  europeanNoHoleCard: boolean;
  blackjackPayout: 1.5 | 1.2;
  deviationSkillLevel: keyof typeof DEVIATION_SKILL;
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
    && finite(config.playerHands)
    && finite(config.handsPerHour)
    && finite(config.hours)
    && finite(config.targetRisk)
    && finite(config.maxSpread)
    && typeof config.rampName === "string"
    && Array.isArray(config.ramp)
    && config.ramp.every((point) => finite(point?.trueCount) && finite(point?.units))
    && finite(config.chipIncrement)
    && finite(config.highCountHands)
    && typeof config.dealerHitsSoft17 === "boolean"
    && typeof config.doubleAfterSplit === "boolean"
    && typeof config.resplitAces === "boolean"
    && typeof config.lateSurrender === "boolean"
    && typeof config.europeanNoHoleCard === "boolean"
    && (config.blackjackPayout === 1.5 || config.blackjackPayout === 1.2)
    && typeof config.deviationSkillLevel === "string";
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

export function defaultCvcxTemplateName(config: CvcxTemplateConfig) {
  const maximum = Math.max(...config.ramp.map((point) => point.units));
  return `${config.decks}D ${Math.round((config.dealt / config.decks) * 100)}% · 1–${maximum}`;
}

export const cvcxLibrary = {
  event: LIBRARY_EVENT,
  templates(store?: StorageLike) {
    return read(TEMPLATES_KEY, validTemplate, store);
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
