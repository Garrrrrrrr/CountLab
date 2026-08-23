import { DrillType, Session } from "@/lib/statistics/storage";

/**
 * A daily practice checklist, modelled on the training routine in Blackjack
 * Apprenticeship's "Card-Counting Motivator Checklist" (2019).
 *
 * Only the routine's *targets* are reproduced here — how much of which drill
 * counts as a day's work — restated in CountLab's own wording as data. The
 * source document's prose is not copied. See THIRD_PARTY_NOTICES.md.
 *
 * The checklist carries the repeated-daily practice only. One-off items from
 * the source (settle your bankroll strategy, back-count a real casino) are
 * deliberately absent: an item you can never tick again would read as a
 * permanent daily failure.
 *
 * `auto` items are measured from finished drill sessions, so they cannot be
 * faked; `manual` items are things happening away from the app — reciting
 * aloud, counting a physical deck — and are the only ones a tick can satisfy.
 */

export type ChecklistKind = "auto" | "manual";

/** Whether a target is the source checklist's number or one CountLab chose. */
export type TargetSource = "bja" | "countlab";

export interface ChecklistItem {
  id: string;
  /** The source checklist's own grouping, kept so the page reads like it. */
  section: string;
  label: string;
  kind: ChecklistKind;
  /** Sessions to finish, or questions to answer, before today's item is met. */
  target: number;
  /** `runs` counts sessions; `hands` sums the questions inside them. */
  unit: "runs" | "hands";
  /** Which drill's sessions count. Auto items only. */
  drill?: DrillType;
  href?: string;
  detail?: string;
  targetSource: TargetSource;
}

export interface ChecklistEntry {
  item: ChecklistItem;
  /** Progress toward `target`, clamped so a progress bar cannot overflow. */
  current: number;
  target: number;
  done: boolean;
}

export interface ChecklistDay {
  /** UTC `YYYY-MM-DD`, the same day key the practice streak counts in. */
  dayKey: string;
  items: ChecklistEntry[];
  completed: number;
  total: number;
}

export const DAILY_CHECKLIST: readonly ChecklistItem[] = [
  {
    id: "basic-strategy-hands",
    section: "Basic strategy",
    label: "Play 200 hands of basic strategy",
    kind: "auto",
    target: 200,
    unit: "hands",
    drill: "Basic Strategy",
    href: "/training/basic-strategy",
    detail: "The foundation. Everything else is built on top of it.",
    targetSource: "bja",
  },
  {
    id: "blank-charts",
    section: "Basic strategy",
    label: "Fill in two blank charts",
    kind: "auto",
    target: 2,
    unit: "runs",
    drill: "H17 Chart",
    href: "/training/h17-chart",
    detail: "Two full passes of the chart from memory.",
    targetSource: "bja",
  },
  {
    id: "recite-basic-strategy",
    section: "Basic strategy",
    label: "Recite basic strategy aloud, twice",
    kind: "manual",
    target: 1,
    unit: "runs",
    detail: "Away from the app. More times is better.",
    targetSource: "bja",
  },
  {
    id: "counting-shoes",
    section: "Card counting",
    label: "Count down two shoes",
    kind: "auto",
    target: 2,
    unit: "runs",
    drill: "Running Count",
    href: "/training/running-count",
    detail: "Two is the floor, not the goal.",
    targetSource: "bja",
  },
  {
    id: "physical-deck-countdown",
    section: "Card counting",
    label: "Count down a physical deck under 30 seconds",
    kind: "manual",
    target: 1,
    unit: "runs",
    detail: "Pull one card face down first, then check your count against it at the end.",
    targetSource: "bja",
  },
  {
    id: "full-shoe-free-play",
    section: "Basic strategy + counting",
    label: "Play a full shoe",
    kind: "auto",
    target: 1,
    unit: "runs",
    drill: "Full Shoe",
    href: "/training/full-shoe",
    detail: "Both skills at once, checking the count every round.",
    // The source sets no daily number here, only "practice until perfect".
    targetSource: "countlab",
  },
  {
    id: "true-count-practice",
    section: "True count conversion",
    label: "Run a true count set",
    kind: "auto",
    target: 1,
    unit: "runs",
    drill: "True Count",
    href: "/training/true-count",
    detail: "Start on full decks; move to half-deck divisors once that is easy.",
    // The source sets no daily number here, only "practice until perfect".
    targetSource: "countlab",
  },
  {
    id: "deviation-hands",
    section: "Deviations",
    label: "Play 100 deviation hands",
    kind: "auto",
    target: 100,
    unit: "hands",
    drill: "Deviations",
    href: "/training/deviations",
    detail: "Aim to play them perfectly, not merely to finish them.",
    targetSource: "bja",
  },
  {
    id: "recite-deviations",
    section: "Deviations",
    label: "Recite deviations as full sentences",
    kind: "manual",
    target: 1,
    unit: "runs",
    detail: "“Basic strategy says never split tens against a six, but at a true count of four or higher, split them.”",
    targetSource: "bja",
  },
];

/** UTC `YYYY-MM-DD`, matching how the practice streak buckets its days. */
export const dayKey = (iso: string) => iso.slice(0, 10);

export function evaluateChecklist(
  sessions: readonly Session[],
  tickedIds: readonly string[],
  now: Date = new Date(),
): ChecklistDay {
  const key = dayKey(now.toISOString());
  const todays = sessions.filter((entry) => dayKey(entry.date) === key);
  const ticked = new Set(tickedIds);

  const items = DAILY_CHECKLIST.map<ChecklistEntry>((item) => {
    const raw = item.kind === "manual"
      // Only manual items are tickable: an auto item is evidence of drilling,
      // so a stray tick must never be able to stand in for the work.
      ? (ticked.has(item.id) ? 1 : 0)
      : todays
        .filter((entry) => entry.drill === item.drill)
        .reduce((sum, entry) => sum + (item.unit === "hands" ? entry.questions : 1), 0);
    const current = Math.min(raw, item.target);
    return { item, current, target: item.target, done: current >= item.target };
  });

  return { dayKey: key, items, completed: items.filter((entry) => entry.done).length, total: items.length };
}
