import { supabase } from "../supabase/client";
import { getCurrentUser } from "../supabase/currentUser";
import { track } from "../analytics/track";
import { observeApiRequest } from "../analytics/api";
import { toCsv } from "../blackjack/csv";

export type DrillType =
  | "Running Count"
  | "Basic Strategy"
  | "Deviations"
  | "True Count"
  | "Deck Estimation"
  | "Full Shoe"
  | "Counting Benchmark"
  | "H17 Chart"
  | "Chase the Flush";
export type CountingErrorCategory =
  | "missed cancellation"
  | "negative arithmetic"
  | "zero crossing"
  | "deck estimate"
  | "true-count division"
  | "true-count rounding"
  | "interruption recovery"
  | "hole-card reveal"
  | "bet sizing"
  | "playing decision";
export interface Mistake {
  question: string;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
  category?: CountingErrorCategory;
  context?: Record<string, string | number | boolean>;
}
export interface Session {
  id: string;
  drill: DrillType;
  questions: number;
  correct: number;
  accuracy: number;
  averageResponseTime: number;
  bestStreak: number;
  date: string;
  mistakes: Mistake[];
  categories?: Record<string, { correct: number; total: number }>;
  metrics?: Record<string, string | number | boolean>;
  tags?: string[];
}
export interface DrillProgress<T = unknown> {
  drill: DrillType;
  state: T;
  updatedAt: string;
}
export interface Settings {
  decks: number;
  rounding: "floor" | "truncate" | "nearest";
  speed: number;
  sound: boolean;
  animations: boolean;
  shortcuts: boolean;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  countingPreset: "one-deck-speed" | "two-card-cancellation" | "six-deck-casino" | "recovery";
  countingFeedback: "immediate" | "end";
  countingSessionQuestions: 5 | 10 | 20;
  penetration: number;
}
export const DEFAULT_SETTINGS: Settings = {
  decks: 6,
  rounding: "floor",
  speed: 1000,
  sound: false,
  animations: true,
  shortcuts: true,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  resplitAces: true,
  lateSurrender: true,
  countingPreset: "six-deck-casino",
  countingFeedback: "immediate",
  countingSessionQuestions: 10,
  penetration: 0.75,
};
const SESSION_KEY = "hilo:sessions",
  SETTINGS_KEY = "hilo:settings",
  PROGRESS_PREFIX = "hilo:progress:";
const SYNCED_SESSION_IDS_PREFIX = "countlab:drill-synced-session-ids:";
// The database enforces 60 drill-session inserts per rolling minute. A device
// can have a large guest/offline history, so replay it deliberately instead of
// turning a sign-in into dozens of rejected writes.
const DRILL_SESSION_REPLAY_INTERVAL_MS = 1_100;
let replayRetryScheduled = false;

/**
 * Local namespaces a full backup has to carry beyond settings and drill
 * sessions. Without these the "portable JSON backup" quietly left the session
 * journal, saved scenarios, simulation runs, venue presets, in-progress drills
 * and spaced-repetition schedules behind on the old device.
 *
 * Copied verbatim rather than schema-mapped: each library validates its own
 * shape when it reads, so a stale or malformed blob degrades to that library's
 * empty state instead of corrupting anything. Device- and account-scoped keys
 * (analytics identity, per-account sync bookkeeping) are deliberately excluded.
 */
const BACKUP_KEY_PREFIXES = [
  PROGRESS_PREFIX,
  "hilo:leitner:",
  "countlab:journal-",
  "countlab:cvcx-templates:",
  "countlab:simulation-runs:",
  "countlab:simulation-templates:",
  "countlab:venue-presets:",
];

function backupNamespaces(): Record<string, string> {
  const collected: Record<string, string> = {};
  if (typeof window === "undefined") return collected;
  for (const key of Object.keys(localStorage)) {
    if (!BACKUP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    const value = localStorage.getItem(key);
    if (value !== null) collected[key] = value;
  }
  return collected;
}

function restoreNamespaces(entries: unknown): number {
  if (!entries || typeof entries !== "object") return 0;
  let restored = 0;
  for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    if (!BACKUP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    localStorage.setItem(key, value);
    restored += 1;
  }
  return restored;
}

function progressKey(drill: DrillType) {
  return `${PROGRESS_PREFIX}${drill}`;
}

function syncedSessionIdsKey(userId: string) {
  return `${SYNCED_SESSION_IDS_PREFIX}${userId}`;
}

function syncedSessionIds(userId: string): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(syncedSessionIdsKey(userId)) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function markSessionsSynced(ids: string[], userId = getCurrentUser()?.id) {
  if (typeof window === "undefined" || !userId || !ids.length) return;
  const known = syncedSessionIds(userId);
  ids.forEach((id) => known.add(id));
  // Sessions are locally capped at 500, so this remains tiny and bounded.
  localStorage.setItem(syncedSessionIdsKey(userId), JSON.stringify([...known].slice(-500)));
}

function scheduleSessionReplay() {
  if (typeof window === "undefined" || replayRetryScheduled) return;
  replayRetryScheduled = true;
  setTimeout(() => {
    replayRetryScheduled = false;
    void storage.pushLocalToRemote();
  }, 61_000);
}

type SessionPushOutcome = "synced" | "rate_limited" | "failed" | "skipped";

function pushSession(s: Session): Promise<SessionPushOutcome> {
  const user = getCurrentUser();
  if (!user) return Promise.resolve("skipped");
  return observeApiRequest("supabase", "drill_session_upsert", supabase
    .from("drill_sessions")
    .upsert({
      id: s.id,
      user_id: user.id,
      drill: s.drill,
      questions: s.questions,
      correct: s.correct,
      accuracy: s.accuracy,
      average_response_time: s.averageResponseTime,
      best_streak: s.bestStreak,
      date: s.date,
      mistakes: s.mistakes,
      categories: s.categories ?? null,
      metrics: s.metrics ?? null,
      tags: s.tags ?? null,
    }))
    .then(({ error }) => {
      if (error) {
        console.error("[countlab] failed to sync drill session", error);
        if (error.code === "P0001") {
          scheduleSessionReplay();
          return "rate_limited";
        }
        return "failed";
      }
      markSessionsSynced([s.id], user.id);
      return "synced";
    });
}

function pushProgress(p: DrillProgress) {
  const user = getCurrentUser();
  if (!user) return Promise.resolve();
  return observeApiRequest("supabase", "drill_progress_upsert", supabase
    .from("drill_progress")
    .upsert({ user_id: user.id, drill: p.drill, state: p.state, updated_at: p.updatedAt }))
    .then(({ error }) => {
      if (error) console.error("[countlab] failed to sync drill progress", error);
    });
}

function pushProgressClear(drill: DrillType) {
  const user = getCurrentUser();
  if (!user) return;
  observeApiRequest("supabase", "drill_progress_delete", supabase
    .from("drill_progress")
    .delete()
    .eq("user_id", user.id)
    .eq("drill", drill))
    .then(({ error }) => {
      if (error) console.error("[countlab] failed to clear drill progress", error);
    });
}

function pushSettings(s: Settings) {
  const user = getCurrentUser();
  if (!user) return Promise.resolve();
  return observeApiRequest("supabase", "settings_upsert", supabase
    .from("settings")
    .upsert({ user_id: user.id, data: s, updated_at: new Date().toISOString() }))
    .then(({ error }) => {
      if (error) console.error("[countlab] failed to sync settings", error);
    });
}

export const storage = {
  sessions(): Session[] {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "[]") as Session[];
    } catch {
      return [];
    }
  },
  addSession(s: Session) {
    const all = [s, ...this.sessions()].slice(0, 500);
    localStorage.setItem(SESSION_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("hilo-storage"));
    pushSession(s);
    const elapsedSeconds = typeof s.metrics?.elapsedSeconds === "number" ? s.metrics.elapsedSeconds : undefined;
    track("drill_session_completed", {
      drill: s.drill,
      questions: s.questions,
      correct: s.correct,
      accuracy: s.accuracy,
      bestStreak: s.bestStreak,
      averageResponseTime: s.averageResponseTime,
      durationMs: elapsedSeconds === undefined ? s.averageResponseTime * s.questions : Math.round(elapsedSeconds * 1000),
    });
  },
  settings(): Settings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      return {
        ...DEFAULT_SETTINGS,
        ...(JSON.parse(
          localStorage.getItem(SETTINGS_KEY) || "{}",
        ) as Partial<Settings>),
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
  saveSettings(s: Settings) {
    const previous = this.settings();
    const changedKeys = (Object.keys(s) as Array<keyof Settings>).filter((key) => previous[key] !== s[key]);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("hilo-storage"));
    pushSettings(s);
    if (changedKeys.length) track("settings_saved", { changedKeys, decks: s.decks });
  },
  progress<T = unknown>(drill: DrillType): DrillProgress<T> | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(progressKey(drill));
      return raw ? (JSON.parse(raw) as DrillProgress<T>) : null;
    } catch {
      return null;
    }
  },
  saveProgress<T>(drill: DrillType, state: T) {
    const progress: DrillProgress<T> = { drill, state, updatedAt: new Date().toISOString() };
    localStorage.setItem(progressKey(drill), JSON.stringify(progress));
    pushProgress(progress);
  },
  clearProgress(drill: DrillType) {
    localStorage.removeItem(progressKey(drill));
    pushProgressClear(drill);
  },
  /** Merge progress pulled from Supabase into the local cache, keeping whichever copy is newer. */
  mergeRemoteProgress(remote: DrillProgress[]) {
    if (typeof window === "undefined") return;
    for (const p of remote) {
      const local = this.progress(p.drill);
      if (!local || new Date(p.updatedAt) > new Date(local.updatedAt)) {
        localStorage.setItem(progressKey(p.drill), JSON.stringify(p));
      }
    }
    window.dispatchEvent(new Event("hilo-storage"));
  },
  /** Merge sessions pulled from Supabase into the local cache without re-pushing them. */
  mergeRemoteSessions(remote: Session[]) {
    const merged = [...remote, ...this.sessions()]
      .filter((session, index, all) => all.findIndex((candidate) => candidate.id === session.id) === index)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 500);
    localStorage.setItem(SESSION_KEY, JSON.stringify(merged));
    markSessionsSynced(remote.map((session) => session.id));
    window.dispatchEvent(new Event("hilo-storage"));
  },
  /** Apply settings pulled from Supabase to the local cache without re-pushing them. */
  applyRemoteSettings(remote: Settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(remote));
    window.dispatchEvent(new Event("hilo-storage"));
  },
  clearAll() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PROGRESS_PREFIX)) localStorage.removeItem(key);
    }
    window.dispatchEvent(new Event("hilo-storage"));
  },
  exportData() {
    track("data_exported", { scope: "full" });
    return JSON.stringify(
      {
        version: 2,
        exportedAt: new Date().toISOString(),
        settings: this.settings(),
        sessions: this.sessions(),
        local: backupNamespaces(),
      },
      null,
      2,
    );
  },
  /** Accepts both the version 1 (settings + sessions) and version 2 (full) shapes. */
  importData(raw: string) {
    const parsed = JSON.parse(raw) as { settings?: Partial<Settings>; sessions?: Session[]; local?: unknown };
    if (!Array.isArray(parsed.sessions)) throw new Error("The backup does not contain a session list");
    const valid = parsed.sessions.every(
      (session) => session && typeof session.id === "string" && typeof session.drill === "string" && Number.isFinite(session.questions),
    );
    if (!valid) throw new Error("The backup contains invalid sessions");
    localStorage.setItem(SESSION_KEY, JSON.stringify(parsed.sessions.slice(0, 500)));
    if (parsed.settings) this.saveSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
    const restored = restoreNamespaces(parsed.local);
    window.dispatchEvent(new Event("hilo-storage"));
    track("data_imported", { sessions: parsed.sessions.length, namespaces: restored });
    return { sessions: parsed.sessions.length, namespaces: restored };
  },
  /** Spreadsheet-friendly, export-only summary. Mistakes/categories are nested and don't fit a flat row; JSON stays the only import path. */
  exportCsv() {
    track("data_exported", { scope: "sessions_csv" });
    const rows = this.sessions().map((session) => ({
      date: session.date,
      drill: session.drill,
      questions: session.questions,
      correct: session.correct,
      accuracy: session.accuracy,
      averageResponseTime: session.averageResponseTime,
      bestStreak: session.bestStreak,
    }));
    return toCsv(rows, ["date", "drill", "questions", "correct", "accuracy", "averageResponseTime", "bestStreak"]);
  },
  clearSessions() {
    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event("hilo-storage"));
    track("data_cleared", { scope: "sessions" });
  },
  /** Pushes everything cached locally (e.g. from browsing as a guest) up to the newly signed-in account. Resolves only once every row has actually been upserted. */
  async pushLocalToRemote() {
    if (typeof window === "undefined") return;
    const pending = [pushSettings(this.settings())];
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PROGRESS_PREFIX)) continue;
      const progress = this.progress(key.slice(PROGRESS_PREFIX.length) as DrillType);
      if (progress) pending.push(pushProgress(progress));
    }
    await Promise.all(pending);

    const user = getCurrentUser();
    if (!user) return;
    const knownSyncedIds = syncedSessionIds(user.id);
    const sessions = this.sessions().filter((session) => !knownSyncedIds.has(session.id));
    for (let index = 0; index < sessions.length; index += 1) {
      if (index > 0) await new Promise<void>((resolve) => setTimeout(resolve, DRILL_SESSION_REPLAY_INTERVAL_MS));
      const outcome = await pushSession(sessions[index]);
      // Continuing after a rejected row only creates console noise and extends
      // the rolling rate-limit window. A single delayed retry resumes safely.
      if (outcome === "rate_limited" || outcome === "failed") break;
    }
  },
};
export function makeSession(
  drill: DrillType,
  questions: number,
  correct: number,
  totalMs: number,
  bestStreak: number,
  mistakes: Mistake[],
  categories?: Record<string, { correct: number; total: number }>,
  metrics?: Record<string, string | number | boolean>,
  tags?: string[],
): Session {
  return {
    id: crypto.randomUUID(),
    drill,
    questions,
    correct,
    accuracy: questions ? Math.round((correct / questions) * 100) : 0,
    averageResponseTime: questions ? Math.round(totalMs / questions) : 0,
    bestStreak,
    date: new Date().toISOString(),
    mistakes,
    categories,
    metrics,
    tags,
  };
}
