import type { AdvantageRules, HandCountPoint, RampPoint } from "./advantage";
import { supabase } from "../supabase/client";
import { getCurrentUser } from "../supabase/currentUser";
import { track } from "../analytics/track";
import { observeApiRequest } from "../analytics/api";
import { toCsv, parseCsv } from "./csv";

export interface Bankroll {
  id: string;
  createdAt: string;
  name: string;
  startingAmount?: number;
  archived?: boolean;
}

export interface JournalSession {
  id: string;
  createdAt: string;
  bankrollId: string;
  date: string;
  location?: string;
  hours: number;
  handsPerHour: number;
  playerHands: number;
  /** Per-true-count override of playerHands; counts absent from this schedule fall back to playerHands. */
  handsByTrueCount?: HandCountPoint[];
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
  bankrollId: string;
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

const BANKROLLS_KEY = "countlab:journal-bankrolls:v1";
const SESSIONS_KEY = "countlab:journal-sessions:v1";
const TRANSACTIONS_KEY = "countlab:journal-transactions:v1";
const JOURNAL_EVENT = "countlab-journal";
export const JOURNAL_SYNC_ERROR_EVENT = "countlab-journal-sync-error";
const MAX_BANKROLLS = 20;
const MAX_SESSIONS = 500;
const MAX_TRANSACTIONS = 500;
/** Leave a margin below Supabase's 30 journal-insert/minute limit when importing a backup. */
const IMPORT_WRITE_INTERVAL_MS = 2_100;

const SESSION_CSV_COLUMNS = ["date", "bankroll", "location", "hours", "handsPerHour", "playerHands", "handsByTrueCount", "bettingUnit", "decks", "penetration", "dealerHitsSoft17", "doubleAfterSplit", "resplitAces", "lateSurrender", "blackjackPayout", "useIndices", "indexPolicy", "ramp", "netResult", "expenses", "notes"];
const TRANSACTION_CSV_COLUMNS = ["date", "bankroll", "type", "amount", "note"];
const encodeRampCsv = (ramp: RampPoint[]) => ramp.map((point) => `${point.trueCount}:${point.units}`).join(";");
const decodeRampCsv = (value: string): RampPoint[] => value.split(";").filter(Boolean).map((chunk) => {
  const [trueCount, units] = chunk.split(":").map(Number);
  return { trueCount, units };
}).filter((point) => finite(point.trueCount) && finite(point.units));
const encodeHandsCsv = (schedule: HandCountPoint[]) => schedule.map((point) => `${point.trueCount}:${point.hands}`).join(";");
const decodeHandsCsv = (value: string): HandCountPoint[] => value.split(";").filter(Boolean).map((chunk) => {
  const [trueCount, hands] = chunk.split(":").map(Number);
  return { trueCount, hands };
}).filter((point) => finite(point.trueCount) && finite(point.hands));

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
const validBankroll = (value: unknown): value is Bankroll => {
  if (!value || typeof value !== "object") return false;
  const bankroll = value as Partial<Bankroll>;
  return typeof bankroll.id === "string"
    && typeof bankroll.createdAt === "string"
    && typeof bankroll.name === "string"
    && (bankroll.startingAmount === undefined || finite(bankroll.startingAmount))
    && (bankroll.archived === undefined || typeof bankroll.archived === "boolean");
};
// bankrollId is intentionally not required here: sessions/transactions written before
// multi-bankroll support don't have it, and readers backfill it to the default bankroll.
type LegacySession = Omit<JournalSession, "bankrollId"> & { bankrollId?: string };
type LegacyTransaction = Omit<BankrollTransaction, "bankrollId"> & { bankrollId?: string };
const validSession = (value: unknown): value is LegacySession => {
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
    && session.ramp.every((point) => finite(point?.trueCount) && finite(point?.units))
    && (session.handsByTrueCount === undefined
      || (Array.isArray(session.handsByTrueCount) && session.handsByTrueCount.every((point) => finite(point?.trueCount) && finite(point?.hands))));
};
const validTransaction = (value: unknown): value is LegacyTransaction => {
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

/** Surface background-write failures to the signed-in UI instead of silently claiming that data is synced. */
function reportJournalSyncError(operation: string, error: { message: string }) {
  console.error(`[countlab] failed to ${operation}`, error);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(JOURNAL_SYNC_ERROR_EVENT, { detail: error.message }));
}

const createId = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const normalizedBankrollName = (name: string) => name.trim().toLocaleLowerCase();
const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Returns every saved bankroll, seeding an implicit "Main" bankroll on first access. */
function ensureBankrolls(store?: StorageLike): Bankroll[] {
  const existing = read(BANKROLLS_KEY, validBankroll, store);
  if (existing.length > 0) return existing;
  const seeded: Bankroll = { id: createId(), createdAt: new Date(0).toISOString(), name: "Main" };
  write(BANKROLLS_KEY, [seeded], store);
  pushBankroll(seeded);
  return [seeded];
}

/** The oldest bankroll is the implicit default: where pre-multi-bankroll data lives and where orphaned records land. */
function defaultBankrollId(store?: StorageLike): string {
  return [...ensureBankrolls(store)].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].id;
}

function withDefaultBankroll<T extends { bankrollId?: string }>(items: T[], store?: StorageLike): (T & { bankrollId: string })[] {
  if (items.every((item) => item.bankrollId)) return items as (T & { bankrollId: string })[];
  const fallback = defaultBankrollId(store);
  return items.map((item) => item.bankrollId ? (item as T & { bankrollId: string }) : { ...item, bankrollId: fallback });
}

function pushBankroll(bankroll: Bankroll) {
  const user = getCurrentUser();
  if (!user) return Promise.resolve();
  return observeApiRequest("supabase", "journal_bankroll_upsert", supabase
    .from("journal_bankrolls")
    .upsert({
      id: bankroll.id,
      user_id: user.id,
      created_at: bankroll.createdAt,
      name: bankroll.name,
      starting_amount: bankroll.startingAmount ?? null,
      archived: bankroll.archived ?? false,
    }))
    .then(({ error }) => { if (error) reportJournalSyncError("sync bankroll", error); });
}

function deleteRemoteBankroll(id: string) {
  const user = getCurrentUser();
  if (!user) return;
  observeApiRequest("supabase", "journal_bankroll_delete", supabase.from("journal_bankrolls").delete().eq("id", id).eq("user_id", user.id)).then(({ error }) => {
    if (error) console.error("[countlab] failed to delete remote bankroll", error);
  });
}

function pushJournalSession(session: JournalSession) {
  const user = getCurrentUser();
  if (!user) return Promise.resolve();
  return observeApiRequest("supabase", "journal_session_upsert", supabase
    .from("journal_sessions")
    .upsert({
      id: session.id,
      user_id: user.id,
      bankroll_id: session.bankrollId,
      created_at: session.createdAt,
      date: session.date,
      location: session.location ?? null,
      hours: session.hours,
      hands_per_hour: session.handsPerHour,
      player_hands: session.playerHands,
      hands_by_true_count: session.handsByTrueCount ?? null,
      betting_unit: session.bettingUnit,
      rules: session.rules,
      ramp: session.ramp,
      net_result: session.netResult,
      expenses: session.expenses,
      notes: session.notes ?? null,
    }))
    .then(({ error }) => { if (error) reportJournalSyncError("sync journal session", error); });
}

function deleteRemoteJournalSession(id: string) {
  const user = getCurrentUser();
  if (!user) return;
  observeApiRequest("supabase", "journal_session_delete", supabase.from("journal_sessions").delete().eq("id", id).eq("user_id", user.id)).then(({ error }) => {
    if (error) console.error("[countlab] failed to delete remote journal session", error);
  });
}

function pushTransaction(transaction: BankrollTransaction) {
  const user = getCurrentUser();
  if (!user) return Promise.resolve();
  return observeApiRequest("supabase", "journal_transaction_upsert", supabase
    .from("journal_transactions")
    .upsert({
      id: transaction.id,
      user_id: user.id,
      bankroll_id: transaction.bankrollId,
      created_at: transaction.createdAt,
      date: transaction.date,
      type: transaction.type,
      amount: transaction.amount,
      note: transaction.note ?? null,
    }))
    .then(({ error }) => { if (error) reportJournalSyncError("sync bankroll transaction", error); });
}

function deleteRemoteTransaction(id: string) {
  const user = getCurrentUser();
  if (!user) return;
  observeApiRequest("supabase", "journal_transaction_delete", supabase.from("journal_transactions").delete().eq("id", id).eq("user_id", user.id)).then(({ error }) => {
    if (error) console.error("[countlab] failed to delete remote bankroll transaction", error);
  });
}

export const journalLibrary = {
  event: JOURNAL_EVENT,
  bankrolls(store?: StorageLike): Bankroll[] {
    return ensureBankrolls(store);
  },
  defaultBankrollId(store?: StorageLike): string {
    return defaultBankrollId(store);
  },
  sessions(store?: StorageLike): JournalSession[] {
    return withDefaultBankroll(read(SESSIONS_KEY, validSession, store), store);
  },
  transactions(store?: StorageLike): BankrollTransaction[] {
    return withDefaultBankroll(read(TRANSACTIONS_KEY, validTransaction, store), store);
  },
  addBankroll(name: string, store?: StorageLike, now = new Date()) {
    const record: Bankroll = { id: createId(), createdAt: now.toISOString(), name };
    const next = [...this.bankrolls(store), record].slice(0, MAX_BANKROLLS);
    write(BANKROLLS_KEY, next, store);
    pushBankroll(record);
    track("journal_bankroll_added");
    return record;
  },
  renameBankroll(id: string, name: string, store?: StorageLike) {
    const next = this.bankrolls(store).map((bankroll) => bankroll.id === id ? { ...bankroll, name } : bankroll);
    write(BANKROLLS_KEY, next, store);
    const renamed = next.find((bankroll) => bankroll.id === id);
    if (renamed) pushBankroll(renamed);
  },
  /** Collapses legacy/import-created bankroll duplicates that differ only by ID or capitalization. */
  mergeDuplicateBankrollNames(store?: StorageLike) {
    const current = this.bankrolls(store);
    const canonicalByName = new Map<string, Bankroll>();
    const remap = new Map<string, string>();
    for (const bankroll of [...current].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const canonical = canonicalByName.get(normalizedBankrollName(bankroll.name));
      if (canonical) remap.set(bankroll.id, canonical.id);
      else canonicalByName.set(normalizedBankrollName(bankroll.name), bankroll);
    }
    if (remap.size === 0) return 0;
    const remappedSessions = this.sessions(store).filter((session) => remap.has(session.bankrollId));
    const remappedTransactions = this.transactions(store).filter((transaction) => remap.has(transaction.bankrollId));
    const sessions = this.sessions(store).map((session) => remap.has(session.bankrollId) ? { ...session, bankrollId: remap.get(session.bankrollId)! } : session);
    const transactions = this.transactions(store).map((transaction) => remap.has(transaction.bankrollId) ? { ...transaction, bankrollId: remap.get(transaction.bankrollId)! } : transaction);
    write(SESSIONS_KEY, sessions, store);
    write(TRANSACTIONS_KEY, transactions, store);
    write(BANKROLLS_KEY, current.filter((bankroll) => !remap.has(bankroll.id)), store);
    for (const session of remappedSessions) pushJournalSession({ ...session, bankrollId: remap.get(session.bankrollId)! });
    for (const transaction of remappedTransactions) pushTransaction({ ...transaction, bankrollId: remap.get(transaction.bankrollId)! });
    for (const duplicateId of remap.keys()) deleteRemoteBankroll(duplicateId);
    return remap.size;
  },
  /** Reassigns the bankroll's sessions/transactions to the default bankroll, then removes it. Refuses to delete the last remaining bankroll. */
  deleteBankroll(id: string, store?: StorageLike) {
    const remaining = this.bankrolls(store).filter((bankroll) => bankroll.id !== id);
    if (remaining.length === 0) return false;
    const fallback = [...remaining].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].id;
    const movedSessionIds = new Set(this.sessions(store).filter((session) => session.bankrollId === id).map((session) => session.id));
    const movedTransactionIds = new Set(this.transactions(store).filter((transaction) => transaction.bankrollId === id).map((transaction) => transaction.id));
    const reassignedSessions = this.sessions(store).map((session) => movedSessionIds.has(session.id) ? { ...session, bankrollId: fallback } : session);
    const reassignedTransactions = this.transactions(store).map((transaction) => movedTransactionIds.has(transaction.id) ? { ...transaction, bankrollId: fallback } : transaction);
    write(SESSIONS_KEY, reassignedSessions, store);
    write(TRANSACTIONS_KEY, reassignedTransactions, store);
    write(BANKROLLS_KEY, remaining, store);
    for (const session of reassignedSessions) if (movedSessionIds.has(session.id)) pushJournalSession(session);
    for (const transaction of reassignedTransactions) if (movedTransactionIds.has(transaction.id)) pushTransaction(transaction);
    deleteRemoteBankroll(id);
    track("journal_bankroll_deleted");
    return true;
  },
  addSession(session: Omit<JournalSession, "id" | "createdAt" | "bankrollId"> & { bankrollId?: string }, store?: StorageLike, now = new Date()) {
    const record: JournalSession = { ...session, bankrollId: session.bankrollId ?? defaultBankrollId(store), id: createId(), createdAt: now.toISOString() };
    const next = [record, ...this.sessions(store)].slice(0, MAX_SESSIONS);
    write(SESSIONS_KEY, next, store);
    pushJournalSession(record);
    track("journal_session_added", { netResult: record.netResult, hours: record.hours });
    return record;
  },
  /** Replaces an existing session's editable fields, keeping its id, createdAt, and bankrollId. Returns the updated record, or undefined if no session has that id. */
  updateSession(id: string, updates: Omit<JournalSession, "id" | "createdAt" | "bankrollId">, store?: StorageLike) {
    const existing = this.sessions(store).find((session) => session.id === id);
    if (!existing) return undefined;
    const record: JournalSession = { ...updates, id: existing.id, createdAt: existing.createdAt, bankrollId: existing.bankrollId };
    write(SESSIONS_KEY, this.sessions(store).map((session) => session.id === id ? record : session), store);
    pushJournalSession(record);
    track("journal_session_updated", { netResult: record.netResult, hours: record.hours });
    return record;
  },
  deleteSession(id: string, store?: StorageLike) {
    write(SESSIONS_KEY, this.sessions(store).filter((session) => session.id !== id), store);
    deleteRemoteJournalSession(id);
    track("journal_session_deleted");
  },
  addTransaction(transaction: Omit<BankrollTransaction, "id" | "createdAt" | "bankrollId"> & { bankrollId?: string }, store?: StorageLike, now = new Date()) {
    const record: BankrollTransaction = { ...transaction, bankrollId: transaction.bankrollId ?? defaultBankrollId(store), id: createId(), createdAt: now.toISOString() };
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
  mergeRemoteBankrolls(remote: Bankroll[], store?: StorageLike) {
    const merged = [...remote, ...read(BANKROLLS_KEY, validBankroll, store)]
      .filter((bankroll, index, all) => all.findIndex((candidate) => candidate.id === bankroll.id) === index)
      .slice(0, MAX_BANKROLLS);
    write(BANKROLLS_KEY, merged, store);
  },
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
  /** Pushes everything cached locally (e.g. from browsing as a guest) up to the newly signed-in account. Bankrolls go first so sessions/transactions can reference them. Resolves only once every row has actually been upserted, so callers can rely on completion before reading remote state back. */
  async pushAllToRemote(store?: StorageLike) {
    for (const bankroll of this.bankrolls(store)) await pushBankroll(bankroll);
    const records = [
      ...this.sessions(store).map((session) => () => pushJournalSession(session)),
      ...this.transactions(store).map((transaction) => () => pushTransaction(transaction)),
    ];
    for (let index = 0; index < records.length; index++) {
      await records[index]();
      if (index < records.length - 1) await wait(IMPORT_WRITE_INTERVAL_MS);
    }
  },
  exportData(store?: StorageLike) {
    track("data_exported", { scope: "journal" });
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      bankrolls: this.bankrolls(store),
      sessions: this.sessions(store),
      transactions: this.transactions(store),
    }, null, 2);
  },
  importData(raw: string, store?: StorageLike) {
    const parsed = JSON.parse(raw) as { version?: unknown; bankrolls?: unknown; sessions?: unknown; transactions?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.transactions)) throw new Error("This is not a valid CountLab journal backup.");
    const importedBankrolls = Array.isArray(parsed.bankrolls) ? parsed.bankrolls : [];
    if (!importedBankrolls.every(validBankroll) || !parsed.sessions.every(validSession) || !parsed.transactions.every(validTransaction)) throw new Error("The journal backup contains invalid or incomplete records.");
    // Backups from another device carry different UUIDs. Reuse a bankroll with
    // the same human-facing name so importing cannot create a second "Main".
    const existingBankrolls = this.bankrolls(store);
    const canonicalByName = new Map(existingBankrolls.map((bankroll) => [normalizedBankrollName(bankroll.name), bankroll]));
    const importedIdMap = new Map<string, string>();
    const additions: Bankroll[] = [];
    for (const imported of importedBankrolls) {
      const key = normalizedBankrollName(imported.name);
      const canonical = canonicalByName.get(key);
      if (canonical) importedIdMap.set(imported.id, canonical.id);
      else {
        canonicalByName.set(key, imported);
        importedIdMap.set(imported.id, imported.id);
        additions.push(imported);
      }
    }
    const bankrolls = [...existingBankrolls, ...additions].slice(0, MAX_BANKROLLS);
    const remapBankroll = (bankrollId: string | undefined) => bankrollId ? (importedIdMap.get(bankrollId) ?? bankrollId) : defaultBankrollId(store);
    const importedSessions = parsed.sessions.map((session) => ({ ...session, bankrollId: remapBankroll(session.bankrollId) }));
    const importedTransactions = parsed.transactions.map((transaction) => ({ ...transaction, bankrollId: remapBankroll(transaction.bankrollId) }));
    const sessions = [...importedSessions, ...this.sessions(store)].filter((session, index, all) => all.findIndex((candidate) => candidate.id === session.id) === index).slice(0, MAX_SESSIONS);
    const transactions = [...importedTransactions, ...this.transactions(store)].filter((transaction, index, all) => all.findIndex((candidate) => candidate.id === transaction.id) === index).slice(0, MAX_TRANSACTIONS);
    write(BANKROLLS_KEY, bankrolls, store);
    write(SESSIONS_KEY, sessions, store);
    write(TRANSACTIONS_KEY, transactions, store);
    if (getCurrentUser()) void this.pushAllToRemote(store).catch((error) => reportJournalSyncError("sync imported journal data", error instanceof Error ? error : { message: "Unknown import sync error" }));
    track("data_imported", { scope: "journal", sessions: sessions.length, transactions: transactions.length });
    return { sessions: sessions.length, transactions: transactions.length };
  },
  /** Spreadsheet-friendly export. Round-trips through importSessionsCsv, but re-imported rows always become new records (no id to dedupe on). */
  exportSessionsCsv(store?: StorageLike) {
    track("data_exported", { scope: "journal_sessions_csv" });
    const bankrollNames = new Map(this.bankrolls(store).map((bankroll) => [bankroll.id, bankroll.name]));
    const rows = this.sessions(store).map((session) => ({
      date: session.date,
      bankroll: bankrollNames.get(session.bankrollId) ?? "",
      location: session.location ?? "",
      hours: session.hours,
      handsPerHour: session.handsPerHour,
      playerHands: session.playerHands,
      handsByTrueCount: session.handsByTrueCount ? encodeHandsCsv(session.handsByTrueCount) : "",
      bettingUnit: session.bettingUnit,
      decks: session.rules.decks,
      penetration: session.rules.penetration,
      dealerHitsSoft17: session.rules.dealerHitsSoft17,
      doubleAfterSplit: session.rules.doubleAfterSplit,
      resplitAces: session.rules.resplitAces,
      lateSurrender: session.rules.lateSurrender,
      blackjackPayout: session.rules.blackjackPayout,
      useIndices: session.rules.useIndices,
      indexPolicy: session.rules.indexPolicy ?? "h17-pro",
      ramp: encodeRampCsv(session.ramp),
      netResult: session.netResult,
      expenses: session.expenses,
      notes: session.notes ?? "",
    }));
    return toCsv(rows, SESSION_CSV_COLUMNS);
  },
  exportTransactionsCsv(store?: StorageLike) {
    track("data_exported", { scope: "journal_transactions_csv" });
    const bankrollNames = new Map(this.bankrolls(store).map((bankroll) => [bankroll.id, bankroll.name]));
    const rows = this.transactions(store).map((transaction) => ({
      date: transaction.date,
      bankroll: bankrollNames.get(transaction.bankrollId) ?? "",
      type: transaction.type,
      amount: transaction.amount,
      note: transaction.note ?? "",
    }));
    return toCsv(rows, TRANSACTION_CSV_COLUMNS);
  },
  /** Imports session summary rows from a CSV built by exportSessionsCsv. Each row becomes a new session; a bankroll name with no local match is created. */
  importSessionsCsv(raw: string, store?: StorageLike) {
    const rows = parseCsv(raw);
    const bankrollIdByName = new Map(this.bankrolls(store).map((bankroll) => [bankroll.name, bankroll.id]));
    let imported = 0;
    for (const row of rows) {
      const decks = Number(row.decks);
      const penetration = Number(row.penetration);
      const bettingUnit = Number(row.bettingUnit);
      const hours = Number(row.hours);
      const handsPerHour = Number(row.handsPerHour);
      const playerHands = Number(row.playerHands);
      const netResult = Number(row.netResult);
      const expenses = Number(row.expenses);
      const ramp = decodeRampCsv(row.ramp ?? "");
      const handsByTrueCount = decodeHandsCsv(row.handsByTrueCount ?? "");
      if (![decks, penetration, bettingUnit, hours, handsPerHour, playerHands, netResult, expenses].every(finite) || ramp.length === 0 || !row.date) continue;
      let bankrollId = row.bankroll ? bankrollIdByName.get(row.bankroll) : undefined;
      if (!bankrollId && row.bankroll) {
        bankrollId = this.addBankroll(row.bankroll, store).id;
        bankrollIdByName.set(row.bankroll, bankrollId);
      }
      this.addSession({
        date: row.date,
        location: row.location || undefined,
        hours,
        handsPerHour,
        playerHands,
        handsByTrueCount: handsByTrueCount.length > 0 ? handsByTrueCount : undefined,
        bettingUnit,
        rules: {
          decks,
          penetration,
          dealerHitsSoft17: row.dealerHitsSoft17 === "true",
          doubleAfterSplit: row.doubleAfterSplit === "true",
          resplitAces: row.resplitAces === "true",
          lateSurrender: row.lateSurrender === "true",
          blackjackPayout: Number(row.blackjackPayout) === 1.2 ? 1.2 : 1.5,
          useIndices: row.useIndices !== "false",
          indexPolicy: "h17-pro",
        },
        ramp,
        netResult,
        expenses,
        notes: row.notes || undefined,
        bankrollId,
      }, store);
      imported++;
    }
    track("data_imported", { scope: "journal_sessions_csv", sessions: imported });
    return imported;
  },
  clear(store?: StorageLike) {
    const target = store ?? availableStorage();
    target?.removeItem(BANKROLLS_KEY);
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
