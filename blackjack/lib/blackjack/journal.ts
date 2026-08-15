import type { AdvantageRules, RampPoint } from "./advantage";
import { supabase } from "../supabase/client";
import { getCurrentUser } from "../supabase/currentUser";
import { track } from "../analytics/track";

export interface JournalSession {
  id: string;
  createdAt: string;
  date: string;
  location?: string;
  hours: number;
  handsPerHour: number;
  playerHands: number;
  bettingUnit: number;
  rules: AdvantageRules;
  ramp: RampPoint[];
  netResult: number;
  expenses: number;
  notes?: string;
}

export interface BankrollTransaction {
  id: string;
  createdAt: string;
  date: string;
  type: "deposit" | "withdrawal";
  amount: number;
  note?: string;
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

const SESSIONS_KEY = "countlab:journal-sessions:v1";
const TRANSACTIONS_KEY = "countlab:journal-transactions:v1";
const JOURNAL_EVENT = "countlab-journal";
const MAX_SESSIONS = 500;
const MAX_TRANSACTIONS = 500;

const availableStorage = (): StorageLike | undefined => typeof window === "undefined" ? undefined : window.localStorage;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validRules = (value: unknown): value is AdvantageRules => {
  if (!value || typeof value !== "object") return false;
  const rules = value as Partial<AdvantageRules>;
  return finite(rules.decks)
    && typeof rules.dealerHitsSoft17 === "boolean"
    && typeof rules.doubleAfterSplit === "boolean"
    && typeof rules.resplitAces === "boolean"
    && typeof rules.lateSurrender === "boolean"
    && (rules.blackjackPayout === 1.5 || rules.blackjackPayout === 1.2)
    && finite(rules.penetration);
};
const validSession = (value: unknown): value is JournalSession => {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<JournalSession>;
  return typeof session.id === "string"
    && typeof session.createdAt === "string"
    && typeof session.date === "string"
    && finite(session.hours)
    && finite(session.handsPerHour)
    && finite(session.playerHands)
    && finite(session.bettingUnit)
    && finite(session.netResult)
    && finite(session.expenses)
    && validRules(session.rules)
    && Array.isArray(session.ramp)
    && session.ramp.every((point) => finite(point?.trueCount) && finite(point?.units));
};
const validTransaction = (value: unknown): value is BankrollTransaction => {
  if (!value || typeof value !== "object") return false;
  const transaction = value as Partial<BankrollTransaction>;
  return typeof transaction.id === "string"
    && typeof transaction.createdAt === "string"
    && typeof transaction.date === "string"
    && (transaction.type === "deposit" || transaction.type === "withdrawal")
    && finite(transaction.amount);
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
  if (typeof window !== "undefined") window.dispatchEvent(new Event(JOURNAL_EVENT));
}

const createId = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function pushJournalSession(session: JournalSession) {
  const user = getCurrentUser();
  if (!user) return;
  supabase
    .from("journal_sessions")
    .upsert({
      id: session.id,
      user_id: user.id,
      created_at: session.createdAt,
      date: session.date,
      location: session.location ?? null,
      hours: session.hours,
      hands_per_hour: session.handsPerHour,
      player_hands: session.playerHands,
      betting_unit: session.bettingUnit,
      rules: session.rules,
      ramp: session.ramp,
      net_result: session.netResult,
      expenses: session.expenses,
      notes: session.notes ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[countlab] failed to sync journal session", error);
    });
}

function deleteRemoteJournalSession(id: string) {
  const user = getCurrentUser();
  if (!user) return;
  supabase.from("journal_sessions").delete().eq("id", id).eq("user_id", user.id).then(({ error }) => {
    if (error) console.error("[countlab] failed to delete remote journal session", error);
  });
}

function pushTransaction(transaction: BankrollTransaction) {
  const user = getCurrentUser();
  if (!user) return;
  supabase
    .from("journal_transactions")
    .upsert({
      id: transaction.id,
      user_id: user.id,
      created_at: transaction.createdAt,
      date: transaction.date,
      type: transaction.type,
      amount: transaction.amount,
      note: transaction.note ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[countlab] failed to sync bankroll transaction", error);
    });
}

function deleteRemoteTransaction(id: string) {
  const user = getCurrentUser();
  if (!user) return;
  supabase.from("journal_transactions").delete().eq("id", id).eq("user_id", user.id).then(({ error }) => {
    if (error) console.error("[countlab] failed to delete remote bankroll transaction", error);
  });
}

export const journalLibrary = {
  event: JOURNAL_EVENT,
  sessions(store?: StorageLike) {
    return read(SESSIONS_KEY, validSession, store);
  },
  transactions(store?: StorageLike) {
    return read(TRANSACTIONS_KEY, validTransaction, store);
  },
  addSession(session: Omit<JournalSession, "id" | "createdAt">, store?: StorageLike, now = new Date()) {
    const record: JournalSession = { ...session, id: createId(), createdAt: now.toISOString() };
    const next = [record, ...this.sessions(store)].slice(0, MAX_SESSIONS);
    write(SESSIONS_KEY, next, store);
    pushJournalSession(record);
    track("journal_session_added", { netResult: record.netResult, hours: record.hours });
    return record;
  },
  deleteSession(id: string, store?: StorageLike) {
    write(SESSIONS_KEY, this.sessions(store).filter((session) => session.id !== id), store);
    deleteRemoteJournalSession(id);
    track("journal_session_deleted");
  },
  addTransaction(transaction: Omit<BankrollTransaction, "id" | "createdAt">, store?: StorageLike, now = new Date()) {
    const record: BankrollTransaction = { ...transaction, id: createId(), createdAt: now.toISOString() };
    const next = [record, ...this.transactions(store)].slice(0, MAX_TRANSACTIONS);
    write(TRANSACTIONS_KEY, next, store);
    pushTransaction(record);
    track("journal_transaction_added", { type: record.type, amount: record.amount });
    return record;
  },
  deleteTransaction(id: string, store?: StorageLike) {
    write(TRANSACTIONS_KEY, this.transactions(store).filter((transaction) => transaction.id !== id), store);
    deleteRemoteTransaction(id);
    track("journal_transaction_deleted");
  },
  /** Merge rows pulled from Supabase into the local cache without re-pushing them. */
  mergeRemoteSessions(remote: JournalSession[], store?: StorageLike) {
    const merged = [...remote, ...this.sessions(store)]
      .filter((session, index, all) => all.findIndex((candidate) => candidate.id === session.id) === index)
      .slice(0, MAX_SESSIONS);
    write(SESSIONS_KEY, merged, store);
  },
  mergeRemoteTransactions(remote: BankrollTransaction[], store?: StorageLike) {
    const merged = [...remote, ...this.transactions(store)]
      .filter((transaction, index, all) => all.findIndex((candidate) => candidate.id === transaction.id) === index)
      .slice(0, MAX_TRANSACTIONS);
    write(TRANSACTIONS_KEY, merged, store);
  },
  /** Pushes everything cached locally (e.g. from browsing as a guest) up to the newly signed-in account. */
  pushAllToRemote(store?: StorageLike) {
    for (const session of this.sessions(store)) pushJournalSession(session);
    for (const transaction of this.transactions(store)) pushTransaction(transaction);
  },
  exportData(store?: StorageLike) {
    track("data_exported", { scope: "journal" });
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: this.sessions(store),
      transactions: this.transactions(store),
    }, null, 2);
  },
  importData(raw: string, store?: StorageLike) {
    const parsed = JSON.parse(raw) as { version?: unknown; sessions?: unknown; transactions?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.transactions)) throw new Error("This is not a valid CountLab journal backup.");
    if (!parsed.sessions.every(validSession) || !parsed.transactions.every(validTransaction)) throw new Error("The journal backup contains invalid or incomplete records.");
    const sessions = [...parsed.sessions, ...this.sessions(store)].filter((session, index, all) => all.findIndex((candidate) => candidate.id === session.id) === index).slice(0, MAX_SESSIONS);
    const transactions = [...parsed.transactions, ...this.transactions(store)].filter((transaction, index, all) => all.findIndex((candidate) => candidate.id === transaction.id) === index).slice(0, MAX_TRANSACTIONS);
    write(SESSIONS_KEY, sessions, store);
    write(TRANSACTIONS_KEY, transactions, store);
    track("data_imported", { scope: "journal", sessions: sessions.length, transactions: transactions.length });
    return { sessions: sessions.length, transactions: transactions.length };
  },
  clear(store?: StorageLike) {
    const target = store ?? availableStorage();
    target?.removeItem(SESSIONS_KEY);
    target?.removeItem(TRANSACTIONS_KEY);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(JOURNAL_EVENT));
    track("data_cleared", { scope: "journal" });
  },
};

export function sessionsInRange(sessions: JournalSession[], days: number | "all", now = new Date()) {
  if (days === "all") return sessions;
  const cutoff = now.getTime() - days * 86400000;
  return sessions.filter((session) => new Date(session.date).getTime() >= cutoff);
}
