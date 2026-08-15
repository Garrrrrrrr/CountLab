import { Session } from "./storage";

export interface StreakSummary {
  currentStreakDays: number;
  bestStreakDays: number;
  practiceDaysThisWeek: number;
  practiceDays: string[];
}

const toDayKey = (iso: string) => iso.slice(0, 10);
const DAY_MS = 86_400_000;

/** Pure derived view over drill session history — no separate raw data, just consecutive practice-day math. */
export function computeStreak(sessions: Session[], now = new Date()): StreakSummary {
  const practiceDays = Array.from(new Set(sessions.map((session) => toDayKey(session.date)))).sort();
  if (practiceDays.length === 0) return { currentStreakDays: 0, bestStreakDays: 0, practiceDaysThisWeek: 0, practiceDays: [] };

  let bestStreakDays = 1;
  let run = 1;
  for (let i = 1; i < practiceDays.length; i++) {
    const previous = new Date(`${practiceDays[i - 1]}T00:00:00Z`).getTime();
    const current = new Date(`${practiceDays[i]}T00:00:00Z`).getTime();
    run = current - previous === DAY_MS ? run + 1 : 1;
    bestStreakDays = Math.max(bestStreakDays, run);
  }

  const daySet = new Set(practiceDays);
  const todayKey = toDayKey(now.toISOString());
  let currentStreakDays = 0;
  const cursor = new Date(now);
  if (!daySet.has(todayKey)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  for (;;) {
    const key = toDayKey(cursor.toISOString());
    if (!daySet.has(key)) break;
    currentStreakDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const weekAgo = now.getTime() - 7 * DAY_MS;
  const practiceDaysThisWeek = practiceDays.filter((day) => new Date(`${day}T00:00:00Z`).getTime() >= weekAgo).length;

  return { currentStreakDays, bestStreakDays, practiceDaysThisWeek, practiceDays };
}

export interface Milestone {
  id: string;
  label: string;
  metric: "streak" | "sessions";
  threshold: number;
}

export const MILESTONES: Milestone[] = [
  { id: "streak-3", label: "3-day streak", metric: "streak", threshold: 3 },
  { id: "streak-7", label: "7-day streak", metric: "streak", threshold: 7 },
  { id: "streak-30", label: "30-day streak", metric: "streak", threshold: 30 },
  { id: "sessions-10", label: "10 drills logged", metric: "sessions", threshold: 10 },
  { id: "sessions-50", label: "50 drills logged", metric: "sessions", threshold: 50 },
  { id: "sessions-200", label: "200 drills logged", metric: "sessions", threshold: 200 },
];

export function unlockedMilestones(sessions: Session[], streak: StreakSummary): Milestone[] {
  return MILESTONES.filter((milestone) => milestone.metric === "streak" ? streak.bestStreakDays >= milestone.threshold : sessions.length >= milestone.threshold);
}

/** Builds a `weeks`-wide, Sun-Sat calendar grid ending on `now`'s week, for a GitHub-style contribution heatmap. */
export function practiceHeatmap(practiceDays: string[], weeks = 12, now = new Date()) {
  const daySet = new Set(practiceDays);
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (weeks * 7 - 1));
  const columns: { date: string; practiced: boolean }[][] = [];
  for (let week = 0; week < weeks; week++) {
    const column: { date: string; practiced: boolean }[] = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + week * 7 + day);
      const key = toDayKey(date.toISOString());
      column.push({ date: key, practiced: daySet.has(key) });
    }
    columns.push(column);
  }
  return columns;
}
