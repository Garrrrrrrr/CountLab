export type DrillType =
  | "Running Count"
  | "Missing Card"
  | "Basic Strategy"
  | "Deviations"
  | "True Count"
  | "Deck Estimation"
  | "Full Shoe";
export interface Mistake {
  question: string;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
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
};
const SESSION_KEY = "hilo:sessions",
  SETTINGS_KEY = "hilo:settings";
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
  },
  settings(): Settings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      return {
        ...DEFAULT_SETTINGS,
        ...(JSON.parse(
          localStorage.getItem(SETTINGS_KEY) || "{}",
        ) as Partial<Settings>),
        dealerHitsSoft17: true,
        doubleAfterSplit: true,
        resplitAces: true,
        lateSurrender: true,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
  saveSettings(s: Settings) {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...s,
        dealerHitsSoft17: true,
        doubleAfterSplit: true,
        resplitAces: true,
        lateSurrender: true,
      }),
    );
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
  };
}
