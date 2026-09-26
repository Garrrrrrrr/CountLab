/**
 * How the Session Journal slices its records for display: the period and
 * bankroll scopes, search, balances, and what an import is about to do.
 */
import type { Bankroll, BankrollTransaction, JournalSession } from "./journal";
import { currentBankroll } from "./journalAnalysis";
import { dateSearchText } from "./journalFormat";

export type Period = 7 | 30 | 90 | "all";
export const PERIODS: readonly { value: Period; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: "all", label: "All time" },
];
/** "All time" or "Last 30 days". */
export const periodTitle = (period: Period) => period === "all" ? "All time" : `Last ${period} days`;
/** "all time" or "the last 30 days", for use mid-sentence. */
export const periodPhrase = (period: Period) => period === "all" ? "all time" : `the last ${period} days`;

export type ResultFilter = "all" | "win" | "loss";

/** Newest first: by date, then by when it was logged. */
export const newestFirst = <T extends { date: string; createdAt: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date));

/**
 * Search covers the date as stored and as displayed (so "Sep 8" finds it),
 * the casino and the notes. Wins and losses are strictly above or below zero,
 * as the win rate counts them; a breakeven shows only under All.
 */
export function sessionMatches(session: JournalSession, query: string, filter: ResultFilter) {
  if (filter === "win" && session.netResult <= 0) return false;
  if (filter === "loss" && session.netResult >= 0) return false;
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return `${dateSearchText(session.date)} ${session.location ?? ""} ${session.notes ?? ""}`.toLocaleLowerCase().includes(needle);
}

/** Each bankroll's balance: its session results plus deposits minus withdrawals. */
export function bankrollBalances(bankrolls: Bankroll[], sessions: JournalSession[], transactions: BankrollTransaction[]) {
  return new Map(bankrolls.map((bankroll) => [
    bankroll.id,
    currentBankroll(sessions.filter((session) => session.bankrollId === bankroll.id), transactions.filter((transaction) => transaction.bankrollId === bankroll.id)),
  ]));
}

/** The bankroll new records default to: the one being viewed, or the default one under All. */
export const targetBankrollId = (selected: string | "all", defaultId: string) => selected === "all" ? defaultId : selected;

export function cashTotals(transactions: Pick<BankrollTransaction, "type" | "amount">[]) {
  const deposits = transactions.filter((item) => item.type === "deposit").reduce((sum, item) => sum + item.amount, 0);
  const withdrawals = transactions.filter((item) => item.type === "withdrawal").reduce((sum, item) => sum + item.amount, 0);
  return { deposits, withdrawals, net: deposits - withdrawals };
}

/** Where focus goes after a row is removed: the next row, else the previous one, else nowhere. */
export function neighbourId(ids: readonly string[], removed: string): string | null {
  const index = ids.indexOf(removed);
  if (index === -1) return null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}

export interface ImportPreview {
  sessions: number;
  transactions: number;
  /** Records in the file whose id already exists here; importing replaces the local copy, edits and all. */
  replacing: number;
}

/**
 * Reads a JSON backup far enough to say what importing it will do, without
 * writing anything. Full validation stays with journalLibrary.importData.
 */
export function previewJsonImport(raw: string, existing: { sessions: Pick<JournalSession, "id">[]; transactions: Pick<BankrollTransaction, "id">[] }): ImportPreview {
  let parsed: { version?: unknown; sessions?: unknown; transactions?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("This file isn't valid JSON, so it can't be a CountLab journal backup.");
  }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.transactions)) throw new Error("This is not a valid CountLab journal backup.");
  const ids = new Set([...existing.sessions, ...existing.transactions].map((item) => item.id));
  const idOf = (item: unknown) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : undefined;
  const replacing = [...parsed.sessions, ...parsed.transactions].filter((item) => { const id = idOf(item); return id !== undefined && ids.has(id); }).length;
  return { sessions: parsed.sessions.length, transactions: parsed.transactions.length, replacing };
}
