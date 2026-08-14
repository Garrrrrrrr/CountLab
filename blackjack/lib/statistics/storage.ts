import { supabase } from "../supabase/client";
import { getCurrentUser } from "../supabase/currentUser";

export type DrillType =
  | "Running Count"
  | "Missing Card"
  | "Basic Strategy"
  | "Deviations"
  | "True Count"
  | "Deck Estimation"
  | "Full Shoe"
  | "Counting Benchmark"
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
  SETTINGS_KEY = "hilo:settings";

function pushSession(s: Session) {
  const user = getCurrentUser();
  if (!user) return;
  supabase
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
    })
    .then(({ error }) => {
      if (error) console.error("[countlab] failed to sync drill session", error);
    });
}

function pushSettings(s: Settings) {
  const user = getCurrentUser();
  if (!user) return;
  supabase
    .from("settings")
    .upsert({ user_id: user.id, data: s, updated_at: new Date().toISOString() })
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("hilo-storage"));
    pushSettings(s);
  },
  /** Merge sessions pulled from Supabase into the local cache without re-pushing them. */
  mergeRemoteSessions(remote: Session[]) {
    const merged = [...remote, ...this.sessions()]
      .filter((session, index, all) => all.findIndex((candidate) => candidate.id === session.id) === index)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 500);
    localStorage.setItem(SESSION_KEY, JSON.stringify(merged));
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
    window.dispatchEvent(new Event("hilo-storage"));
  },
  exportData() {
    return JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), settings: this.settings(), sessions: this.sessions() },
      null,
      2,
    );
  },
  importData(raw: string) {
    const parsed = JSON.parse(raw) as { settings?: Partial<Settings>; sessions?: Session[] };
    if (!Array.isArray(parsed.sessions)) throw new Error("The backup does not contain a session list");
    const valid = parsed.sessions.every(
      (session) => session && typeof session.id === "string" && typeof session.drill === "string" && Number.isFinite(session.questions),
    );
    if (!valid) throw new Error("The backup contains invalid sessions");
    localStorage.setItem(SESSION_KEY, JSON.stringify(parsed.sessions.slice(0, 500)));
    if (parsed.settings) this.saveSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
    window.dispatchEvent(new Event("hilo-storage"));
  },
  clearSessions() {
    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event("hilo-storage"));
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
