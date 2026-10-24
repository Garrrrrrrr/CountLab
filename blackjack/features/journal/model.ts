/**
 * Pure helpers for the journal screen: the date, venue and bankroll filters,
 * month grouping for the sessions list, and the bulk delete. Nothing here
 * changes how records are stored; writes go through journalLibrary.
 */
import { isJournalDate, journalLibrary, sessionsInRange, type BankrollTransaction, type JournalSession } from "@/lib/blackjack/journal";
import { money, shortDate } from "@/lib/blackjack/journalFormat";
import { newestFirst } from "@/lib/blackjack/journalView";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/* ------------------------------------------------------------------------ */
/* Date range                                                                */
/* ------------------------------------------------------------------------ */

export type PeriodKey = "7" | "30" | "90" | "year" | "all" | "custom";

export interface DateFilter {
  period: PeriodKey;
  /** Inclusive YYYY-MM-DD bounds, used only by "custom". Either may be blank for an open end. */
  from: string;
  to: string;
}

export const ALL_TIME: DateFilter = { period: "all", from: "", to: "" };

export const PERIOD_OPTIONS: readonly { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

export const isPeriodKey = (value: string): value is PeriodKey => PERIOD_OPTIONS.some((option) => option.value === value);

/** A custom range with its ends in order, so typing the later date first still means what it says. */
export function orderedRange(filter: DateFilter): { from: string; to: string } {
  const from = isJournalDate(filter.from) ? filter.from : "";
  const to = isJournalDate(filter.to) ? filter.to : "";
  return from && to && from > to ? { from: to, to: from } : { from, to };
}

/**
 * The sessions inside a date filter. The rolling windows reuse sessionsInRange
 * so they match the old journal to the day. Sessions with a legacy invalid date
 * always stay visible, so they can be found and repaired.
 */
export function filterByDate(sessions: JournalSession[], filter: DateFilter, now = new Date()): JournalSession[] {
  switch (filter.period) {
    case "all": return sessions;
    case "7": case "30": case "90": return sessionsInRange(sessions, Number(filter.period), now);
    case "year": {
      const year = String(now.getFullYear());
      return sessions.filter((session) => !isJournalDate(session.date) || session.date.slice(0, 4) === year);
    }
    case "custom": {
      const { from, to } = orderedRange(filter);
      return sessions.filter((session) => !isJournalDate(session.date) || ((!from || session.date >= from) && (!to || session.date <= to)));
    }
  }
}

/** "all time", "the last 30 days", "2026", "Sep 1 to Oct 20", for use mid-sentence. */
export function dateFilterPhrase(filter: DateFilter, now = new Date()): string {
  switch (filter.period) {
    case "all": return "all time";
    case "7": case "30": case "90": return `the last ${filter.period} days`;
    case "year": return String(now.getFullYear());
    case "custom": {
      const { from, to } = orderedRange(filter);
      if (from && to) return from === to ? shortDate(from, now) : `${shortDate(from, now)} to ${shortDate(to, now)}`;
      if (from) return `since ${shortDate(from, now)}`;
      if (to) return `until ${shortDate(to, now)}`;
      return "all time";
    }
  }
}

/** Whether the filter actually narrows anything (a custom range with no dates does not). */
export const isNarrowed = (filter: DateFilter) => filter.period === "custom" ? Boolean(orderedRange(filter).from || orderedRange(filter).to) : filter.period !== "all";

/* ------------------------------------------------------------------------ */
/* Venue                                                                     */
/* ------------------------------------------------------------------------ */

/** Casinos are matched without regard to case or stray spaces; "" is "no casino recorded". */
export const venueKey = (location: string | undefined) => location?.trim().toLocaleLowerCase() ?? "";

export interface VenueChoice {
  key: string;
  /** The spelling used most recently. */
  name: string;
  count: number;
}

/** Every casino in these sessions, busiest first, with sessions that name none grouped last. */
export function venueChoices(sessions: JournalSession[]): VenueChoice[] {
  const choices = new Map<string, VenueChoice>();
  for (const session of newestFirst(sessions)) {
    const key = venueKey(session.location);
    const current = choices.get(key);
    if (current) current.count += 1;
    else choices.set(key, { key, name: session.location?.trim() || "No casino recorded", count: 1 });
  }
  return [...choices.values()].sort((a, b) => Number(a.key === "") - Number(b.key === "") || b.count - a.count || a.name.localeCompare(b.name));
}

/** `venue` null means every venue. */
export const filterByVenue = (sessions: JournalSession[], venue: string | null) =>
  venue === null ? sessions : sessions.filter((session) => venueKey(session.location) === venue);

/* ------------------------------------------------------------------------ */
/* Months                                                                    */
/* ------------------------------------------------------------------------ */

export interface MonthGroup {
  /** YYYY-MM, or "invalid" for legacy rows whose date needs repair. */
  key: string;
  label: string;
  sessions: JournalSession[];
  total: number;
  hours: number;
}

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/**
 * Sessions grouped by the month they were played, newest month first and
 * newest session first inside each. Rows with an invalid date come first so
 * they are noticed and fixed.
 */
export function groupByMonth(sessions: JournalSession[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const session of newestFirst(sessions)) {
    const valid = isJournalDate(session.date);
    const key = valid ? session.date.slice(0, 7) : "invalid";
    let group = groups.get(key);
    if (!group) {
      group = { key, label: valid ? monthFormat.format(new Date(`${key}-15T12:00:00`)) : "Date needs fixing", sessions: [], total: 0, hours: 0 };
      groups.set(key, group);
    }
    group.sessions.push(session);
    group.total += session.netResult;
    group.hours += session.hours;
  }
  return [...groups.values()].sort((a, b) => a.key === "invalid" ? -1 : b.key === "invalid" ? 1 : b.key.localeCompare(a.key));
}

/* ------------------------------------------------------------------------ */
/* Money and labels                                                          */
/* ------------------------------------------------------------------------ */

/** Green for a gain, red for a loss, ink for zero. Signs are always written too, so colour is never the only cue. */
export const toneClass = (value: number) => value > 0 ? "text-pos" : value < 0 ? "text-neg" : "text-ink";

/** Units under $10 keep their cents, so a small unit never reads as "$0". */
export const unitMoney = (value: number) => money(value, value < 10 && value % 1 ? 2 : 0);

/** An amount as entered: cents only when there are cents. */
export const exactMoney = (value: number) => money(value, value % 1 ? 2 : 0);

/** A deposit adds to the bankroll and a withdrawal takes from it. */
export const signedCash = (transaction: Pick<BankrollTransaction, "type" | "amount">) => transaction.type === "deposit" ? transaction.amount : -transaction.amount;

/** "deposit of $250 from Oct 2": names one cash movement exactly, for buttons and confirmations. */
export const cashLabel = (transaction: Pick<BankrollTransaction, "type" | "amount" | "date">) =>
  `${transaction.type} of ${exactMoney(transaction.amount)} from ${shortDate(transaction.date)}`;

/* ------------------------------------------------------------------------ */
/* Simulation                                                                */
/* ------------------------------------------------------------------------ */

/** The most hands the details sheet simulates: enough to show several shoes, quick enough to run in the page. */
export const SIMULATION_HAND_CAP = 2000;

/** Hands a session's game would deal, capped for the in-page simulation; 0 when there is nothing to simulate. */
export function simulationHands(session: Pick<JournalSession, "handsPerHour" | "hours" | "ramp">): number {
  const hands = Math.round(session.handsPerHour * session.hours);
  if (!(hands >= 1) || !session.ramp.some((point) => point.units > 0)) return 0;
  return Math.min(hands, SIMULATION_HAND_CAP);
}

/* ------------------------------------------------------------------------ */
/* Delete everything                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Deletes every session, cash movement and extra bankroll through the
 * library's own delete calls. That records a deletion for each, which syncs to
 * the account and stops a later pull from bringing the records back, unlike
 * clearing the cache. The oldest bankroll stays, because one always must.
 */
export function deleteAllJournalRecords(store?: StorageLike, now = new Date()) {
  const sessions = journalLibrary.sessions(store);
  const transactions = journalLibrary.transactions(store);
  for (const transaction of transactions) journalLibrary.deleteTransaction(transaction.id, store, now);
  for (const session of sessions) journalLibrary.deleteSession(session.id, store, now);
  const keep = journalLibrary.defaultBankrollId(store);
  const extra = journalLibrary.bankrolls(store).filter((bankroll) => bankroll.id !== keep);
  for (const bankroll of extra) journalLibrary.deleteBankroll(bankroll.id, store);
  return { sessions: sessions.length, transactions: transactions.length, bankrolls: extra.length };
}
