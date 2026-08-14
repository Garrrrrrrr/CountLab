import type { SessionSimulationConfig, SessionSimulationResult } from "./sessionSimulation";

export interface SavedSimulationRun {
  id: string;
  name: string;
  createdAt: string;
  config: SessionSimulationConfig;
  result: SessionSimulationResult;
}

export interface SimulationTemplate {
  id: string;
  name: string;
  createdAt: string;
  config: SessionSimulationConfig;
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

const RUNS_KEY = "countlab:simulation-runs:v1";
const TEMPLATES_KEY = "countlab:simulation-templates:v1";
const LIBRARY_EVENT = "countlab-simulation-library";
const MAX_RUNS = 40;
const MAX_TEMPLATES = 20;

const availableStorage = (): StorageLike | undefined => typeof window === "undefined" ? undefined : window.localStorage;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validConfig = (value: unknown): value is SessionSimulationConfig => {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<SessionSimulationConfig>;
  return finite(config.bankroll)
    && finite(config.bettingUnit)
    && finite(config.playerHands)
    && finite(config.rounds)
    && finite(config.paths)
    && finite(config.roundsPerHour)
    && typeof config.seed === "string"
    && Boolean(config.rules && finite(config.rules.decks) && finite(config.rules.penetration))
    && Array.isArray(config.ramp)
    && config.ramp.every((point) => finite(point?.trueCount) && finite(point?.units));
};
const validResult = (value: unknown): value is SessionSimulationResult => {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<SessionSimulationResult>;
  return result.methodology === "profile-moment-monte-carlo-v1"
    && finite(result.expectedEvPerRound)
    && finite(result.expectedHourlyEv)
    && finite(result.averageBet)
    && Array.isArray(result.samplePath)
    && Array.isArray(result.countBreakdown);
};
const validRun = (value: unknown): value is SavedSimulationRun => {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<SavedSimulationRun>;
  return typeof run.id === "string" && typeof run.name === "string" && typeof run.createdAt === "string" && validConfig(run.config) && validResult(run.result);
};
const validTemplate = (value: unknown): value is SimulationTemplate => {
  if (!value || typeof value !== "object") return false;
  const template = value as Partial<SimulationTemplate>;
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

export const simulationLibrary = {
  event: LIBRARY_EVENT,
  runs(store?: StorageLike) {
    return read(RUNS_KEY, validRun, store);
  },
  templates(store?: StorageLike) {
    return read(TEMPLATES_KEY, validTemplate, store);
  },
  saveRun(run: SavedSimulationRun, store?: StorageLike) {
    const next = [run, ...this.runs(store).filter((item) => item.id !== run.id)]
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
      .slice(0, MAX_RUNS);
    write(RUNS_KEY, next, store);
    return run;
  },
  addRun(config: SessionSimulationConfig, result: SessionSimulationResult, name: string, store?: StorageLike, now = new Date()) {
    return this.saveRun({ id: createId(), name: name.trim() || defaultRunName(config, now), createdAt: now.toISOString(), config, result }, store);
  },
  renameRun(id: string, name: string, store?: StorageLike) {
    const normalized = name.trim();
    if (!normalized) return;
    write(RUNS_KEY, this.runs(store).map((run) => run.id === id ? { ...run, name: normalized } : run), store);
  },
  duplicateRun(id: string, store?: StorageLike, now = new Date()) {
    const source = this.runs(store).find((run) => run.id === id);
    if (!source) return;
    return this.saveRun({ ...source, id: createId(), name: `${source.name} copy`, createdAt: now.toISOString() }, store);
  },
  deleteRun(id: string, store?: StorageLike) {
    write(RUNS_KEY, this.runs(store).filter((run) => run.id !== id), store);
  },
  saveTemplate(config: SessionSimulationConfig, name: string, store?: StorageLike, now = new Date()) {
    const template: SimulationTemplate = { id: createId(), name: name.trim() || defaultTemplateName(config), createdAt: now.toISOString(), config };
    const next = [template, ...this.templates(store)].slice(0, MAX_TEMPLATES);
    write(TEMPLATES_KEY, next, store);
    return template;
  },
  deleteTemplate(id: string, store?: StorageLike) {
    write(TEMPLATES_KEY, this.templates(store).filter((template) => template.id !== id), store);
  },
  exportData(store?: StorageLike) {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      runs: this.runs(store),
      templates: this.templates(store),
    }, null, 2);
  },
  importData(raw: string, store?: StorageLike) {
    const parsed = JSON.parse(raw) as { version?: unknown; runs?: unknown; templates?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.runs) || !Array.isArray(parsed.templates)) throw new Error("This is not a valid CountLab analysis library.");
    if (!parsed.runs.every(validRun) || !parsed.templates.every(validTemplate)) throw new Error("The analysis library contains invalid or incomplete records.");
    const runs = [...parsed.runs, ...this.runs(store)].filter((run, index, all) => all.findIndex((candidate) => candidate.id === run.id) === index).slice(0, MAX_RUNS);
    const templates = [...parsed.templates, ...this.templates(store)].filter((template, index, all) => all.findIndex((candidate) => candidate.id === template.id) === index).slice(0, MAX_TEMPLATES);
    write(RUNS_KEY, runs, store);
    write(TEMPLATES_KEY, templates, store);
    return { runs: runs.length, templates: templates.length };
  },
  clear(store?: StorageLike) {
    const target = store ?? availableStorage();
    target?.removeItem(RUNS_KEY);
    target?.removeItem(TEMPLATES_KEY);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_EVENT));
  },
};

export function defaultRunName(config: SessionSimulationConfig, now = new Date()) {
  return `${config.rules.decks}D · ${Math.round(config.rules.penetration * 100)}% · ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function defaultTemplateName(config: SessionSimulationConfig) {
  const maximum = Math.max(...config.ramp.map((point) => point.units));
  return `${config.rules.decks}D ${Math.round(config.rules.penetration * 100)}% · 1–${maximum}`;
}
