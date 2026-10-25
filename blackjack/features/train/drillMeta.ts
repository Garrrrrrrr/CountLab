import { Coins, Divide, Gauge, Inbox, Layers, LayoutGrid, Spade, Trophy, type LucideIcon } from "lucide-react";
import { DRILLS, type Drill } from "@/lib/routes";
import type { DrillType, Session } from "@/lib/statistics/storage";

/** The history name each drill saves under. Kept from the old site so existing history still counts. */
export const DRILL_TYPE: Record<string, DrillType> = {
  "running-count": "Running Count",
  "deck-estimation": "Deck Estimation",
  "true-count": "True Count",
  "basic-strategy": "Basic Strategy",
  deviations: "Deviations",
  "chart-recall": "H17 Chart",
  "bet-ramp": "Bet Ramp",
  "full-shoe": "Full Shoe",
};

export const DRILL_ICON: Record<string, LucideIcon> = {
  "running-count": Layers,
  "deck-estimation": Inbox,
  "true-count": Divide,
  "basic-strategy": Spade,
  deviations: Gauge,
  "chart-recall": LayoutGrid,
  "bet-ramp": Coins,
  "full-shoe": Trophy,
};

/** Accuracy a drill must hold, over its recent sessions, to count as table-ready. */
export const READY_AT: Record<string, number> = {
  "running-count": 95,
  "deck-estimation": 85,
  "true-count": 95,
  "basic-strategy": 98,
  deviations: 95,
  "chart-recall": 95,
  "bet-ramp": 95,
  "full-shoe": 95,
};

export const drillForType = (type: DrillType): Drill | undefined => DRILLS.find((drill) => DRILL_TYPE[drill.slug] === type);

export interface DrillStats {
  drill: Drill;
  sessions: Session[];
  questions: number;
  /** Accuracy over the most recent sessions (up to five), or null before the first. */
  recent: number | null;
  last?: Session;
  ready: boolean;
}

/** Recent form for every drill, from the stored history (newest session first). */
export function drillStats(all: Session[]): DrillStats[] {
  return DRILLS.map((drill) => {
    const sessions = all.filter((session) => session.drill === DRILL_TYPE[drill.slug]);
    const window = sessions.slice(0, 5);
    const questions = window.reduce((sum, session) => sum + session.questions, 0);
    const correct = window.reduce((sum, session) => sum + session.correct, 0);
    const recent = questions ? Math.round((correct / questions) * 100) : null;
    return {
      drill,
      sessions,
      questions: sessions.reduce((sum, session) => sum + session.questions, 0),
      recent,
      last: sessions[0],
      ready: recent !== null && questions >= 20 && recent >= READY_AT[drill.slug],
    };
  });
}

/** "just now", "3 hours ago", "2 days ago", or a date. */
export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 86_400 * 7) return `${Math.round(seconds / 86_400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The drill to suggest next: the first in learning order that is untried or
 * not yet table-ready. Counting comes first because every later drill uses it.
 */
export function suggestNext(stats: DrillStats[]): DrillStats {
  return stats.find((entry) => !entry.ready) ?? stats.reduce((weakest, entry) => ((entry.recent ?? 0) < (weakest.recent ?? 0) ? entry : weakest));
}
