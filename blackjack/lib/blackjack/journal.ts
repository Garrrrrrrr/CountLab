import { accountStorage, accountGeneration, scopedStorage, accountScope } from "@/lib/supabase/accountStorage";
import type { AdvantageRules, HandCountPoint, RampPoint } from "./advantage";
import { supabase } from "../supabase/client";
import { getCurrentUser } from "../supabase/currentUser";
import { track } from "../analytics/track";
import { observeApiRequest } from "../analytics/api";
import { toCsv, parseCsv } from "./csv";

export interface Bankroll {
  id: string;
  createdAt: string;
  /** Stamp of the last local edit. Absent on records written before conflict resolution existed, which fall back to createdAt. */
  updatedAt?: string;
  /** Set only on a record pulled back from Supabase after another device deleted it. Never stored locally. */
  deletedAt?: string;
  name: string;
  startingAmount?: number;
  archived?: boolean;
}

export interface JournalSession {
  id: string;
  createdAt: string;
  /** Stamp of the last local edit. Absent on records written before conflict resolution existed, which fall back to createdAt. */
  updatedAt?: string;
  /** Set only on a record pulled back from Supabase after another device deleted it. Never stored locally. */
  deletedAt?: string;
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
  /** Stamp of the last local edit. Absent on records written before conflict resolution existed, which fall back to createdAt. */
  updatedAt?: string;
  /** Set only on a record pulled back from Supabase after another device deleted it. Never stored locally. */
  deletedAt?: string;
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
/** Ids this device has deleted, so a later pull cannot resurrect them. Records the id only; the record itself is gone. */
const DELETIONS_KEY = "countlab:journal-deletions:v1";
const JOURNAL_EVENT = "countlab-journal";
export const JOURNAL_SYNC_ERROR_EVENT = "countlab-journal-sync-error";
export const JOURNAL_PRUNED_EVENT = "countlab-journal-pruned";
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

const availableStorage = (): StorageLike | undefined => typeof window === "undefined" ? undefined : accountStorage;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
/** Accepts only real calendar dates in the browser/database's shared YYYY-MM-DD format. */
export const isJournalDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
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

function write<T>(key: string, items: T[], store = availableStorage(), pending = true) {
  if (!store) return;
  store.setItem(key, JSON.stringify({ version: 1, items } satisfies StoredCollection<T>));
  if (pending && typeof window !== "undefined") window.dispatchEvent(new Event("countlab:sync-pending"));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(JOURNAL_EVENT));
}

interface Tombstone {
  id: string;
  kind: "session" | "transaction" | "bankroll";
  deletedAt: string;
  record?: Bankroll | JournalSession | BankrollTransaction;
}

const validTombstone = (value: unknown): value is Tombstone => {
  if (!value || typeof value !== "object") return false;
  const tombstone = value as Partial<Tombstone>;
  return typeof tombstone.id === "string"
    && typeof tombstone.deletedAt === "string"
    && (tombstone.kind === "session" || tombstone.kind === "transaction" || tombstone.kind === "bankroll");
};

function tombstones(store?: StorageLike): Tombstone[] {
  return read(DELETIONS_KEY, validTombstone, store);
}

/** Remembers that this device deleted a record, so a pull that still carries it cannot bring it back. Newest kept first. */
function recordTombstone(id: string, kind: Tombstone["kind"], store?: StorageLike, deletedAt = new Date().toISOString(), pending = true) {
  const existing = tombstones(store).filter((tombstone) => tombstone.id !== id);
  const collection = kind === "bankroll" ? read(BANKROLLS_KEY, validBankroll, store) : kind === "session" ? read(SESSIONS_KEY, validSession, store) : read(TRANSACTIONS_KEY, validTransaction, store);
  const record = collection.find((entry) => entry.id === id) ?? tombstones(store).find((entry) => entry.id === id)?.record;
  write(DELETIONS_KEY, [{ id, kind, deletedAt, record }, ...existing], store, pending);
}

/** The point a record was last known to be correct. Pre-conflict-resolution records have no updatedAt, so their creation stands in and any stamped copy wins. */
const revisionOf = (record: { createdAt: string; updatedAt?: string }) => record.updatedAt ?? record.createdAt;
const revisionTime = (value: string) => new Date(value).getTime();

/**
 * Reconciles a pull against what is already on this device. Remote no longer
 * simply wins: whichever copy was edited last does, so an edit that has not
 * finished pushing survives a refresh. Records this device deleted, and records
 * another device soft-deleted, are dropped rather than merged back in.
 */
function mergeRemote<T extends { id: string; createdAt: string; date?: string; updatedAt?: string; deletedAt?: string }>(
  remote: T[],
  local: T[],
  kind: Tombstone["kind"],
  store?: StorageLike,
): T[] {
  const deletedLocally = new Map(tombstones(store).filter((tombstone) => tombstone.kind === kind).map((tombstone) => [tombstone.id, tombstone.deletedAt]));
  const merged = new Map(local.map((record) => [record.id, record]));
  for (const incoming of remote) {
    if (incoming.deletedAt) {
      const localRecord = merged.get(incoming.id);
      if (localRecord && revisionTime(revisionOf(localRecord)) > revisionTime(incoming.deletedAt)) continue;
      // Another device deleted this. Drop it and remember the deletion, so the
      // next pull does not have to re-derive it.
      merged.delete(incoming.id);
      const knownDeletion = deletedLocally.get(incoming.id);
      if (!knownDeletion || revisionTime(incoming.deletedAt) > revisionTime(knownDeletion)) recordTombstone(incoming.id, kind, store, incoming.deletedAt, false);
      continue;
    }
    // A record re-created or edited after this device deleted it is a genuine
    // later revision, not a resurrection, so only an older copy is suppressed.
    const deletedAt = deletedLocally.get(incoming.id);
    if (deletedAt !== undefined && revisionTime(revisionOf(incoming)) <= revisionTime(deletedAt)) continue;
    const current = merged.get(incoming.id);
    if (deletedAt !== undefined && revisionTime(revisionOf(incoming)) > revisionTime(deletedAt)) write(DELETIONS_KEY, tombstones(store).filter((entry) => entry.id !== incoming.id), store, false);
    if (!current || revisionTime(revisionOf(incoming)) >= revisionTime(revisionOf(current))) merged.set(incoming.id, { ...incoming, deletedAt: undefined });
  }
  return [...merged.values()];
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

const nextUploadAt = new Map<number, number>();
const activeUploads = new Map<string, Promise<boolean>>();
async function sendRecord(table: string, payload: Record<string, unknown>): Promise<boolean> {
  const user = getCurrentUser();
  if (!user) return true;
  const generation = accountGeneration();
  const store = scopedStorage(accountScope());
  const key = `countlab:journal-ack:${table}:${payload.id}`;
  const signature = JSON.stringify(payload);
  if (store.getItem(key) === signature) return true;
  const flight = `${generation}:${key}:${signature}`;
  if (activeUploads.has(flight)) return activeUploads.get(flight)!;
  const work = (async () => {
    try {
      const scheduled = Math.max(Date.now(), nextUploadAt.get(generation) ?? 0);
      nextUploadAt.set(generation, scheduled + IMPORT_WRITE_INTERVAL_MS);
      if (scheduled > Date.now()) await wait(scheduled - Date.now());
      if (generation !== accountGeneration() || getCurrentUser()?.id !== user.id) return true;
      const deletion = tombstones().find((entry) => entry.id === payload.id);
      if (!payload.deleted_at && deletion && revisionTime(deletion.deletedAt) >= revisionTime(String(payload.updated_at))) return true;
      const { error } = await observeApiRequest("supabase", "journal_record_upsert", supabase.from(table).upsert(payload));
      if (error) throw new Error(error.message);
      store.setItem(key, signature);
      return true;
    } catch (error) {
      if (generation === accountGeneration()) reportJournalSyncError("save journal", error instanceof Error ? error : { message: "Upload failed" });
      return false;
    } finally { activeUploads.delete(flight); }
  })();
  activeUploads.set(flight, work);
  return work;
}

async function sendDeletion(kind: Tombstone["kind"], id: string, deletedAt: string): Promise<boolean> {
  const user = getCurrentUser();
  if (!user) return true;
  const store = scopedStorage(accountScope());
  const key = `countlab:journal-delete-ack:${kind}:${id}`;
  if (store.getItem(key) === deletedAt) return true;
  const generation = accountGeneration();
  const snapshot = tombstones().find((entry) => entry.id === id)?.record;
  const table = kind === "bankroll" ? "journal_bankrolls" : kind === "session" ? "journal_sessions" : "journal_transactions";
  try {
    if (snapshot) {
      // Upsert the deleted revision itself: an update of a not-yet-uploaded row
      // can succeed with zero matches and otherwise lose the deletion forever.
      const deleted = { ...snapshot, updatedAt: deletedAt, deletedAt };
      const sent = kind === "bankroll" ? await pushBankroll(deleted as Bankroll)
        : kind === "session" ? await pushJournalSession(deleted as JournalSession)
        : await pushTransaction(deleted as BankrollTransaction);
      if (!sent) return false;
    } else {
      const pending = [...activeUploads.entries()].filter(([flight]) => flight.startsWith(`${generation}:`) && flight.includes(`:${id}:`));
      await Promise.all(pending.map(([, work]) => work));
      if (generation !== accountGeneration()) return true;
      const { error } = await supabase.from(table).update({ deleted_at: deletedAt, updated_at: deletedAt }).eq("id", id).eq("user_id", user.id);
      if (error) throw new Error(error.message);
    }
    if (generation !== accountGeneration()) return false;
    store.setItem(key, deletedAt);
    return true;
  } catch (error) {
    if (generation === accountGeneration()) reportJournalSyncError("delete journal record", error instanceof Error ? error : { message: "Deletion failed" });
    return false;
  }
}

function pushBankroll(bankroll: Bankroll) {
  const user = getCurrentUser();
  if (!user) return Promise.resolve(true);
  return sendRecord("journal_bankrolls", {
      id: bankroll.id,
      user_id: user.id,
      created_at: bankroll.createdAt,
      updated_at: revisionOf(bankroll),
      deleted_at: bankroll.deletedAt ?? null,
      name: bankroll.name,
      starting_amount: bankroll.startingAmount ?? null,
      archived: bankroll.archived ?? false,
    });
}

/**
 * Marks the row deleted rather than removing it. A hard delete is invisible to
 * every other device — its next pull just sees a row it still has locally and
 * merges it straight back in — so deletions have to be represented, not absent.
 */
function deleteRemoteBankroll(id: string, deletedAt: string) {
  return sendDeletion("bankroll", id, deletedAt);
}

function pushJournalSession(session: JournalSession) {
  const user = getCurrentUser();
  // Legacy clients could save the date input's temporary empty value locally.
  // Keep that row repairable on-device, but never hammer Postgres with a value
  // its date column must reject.
  if (!user || !isJournalDate(session.date)) return Promise.resolve(true);
  return sendRecord("journal_sessions", {
      id: session.id,
      user_id: user.id,
      bankroll_id: session.bankrollId,
      created_at: session.createdAt,
      updated_at: revisionOf(session),
      deleted_at: session.deletedAt ?? null,
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
    });
}

/** Soft delete — see deleteRemoteBankroll for why the row has to stay. */
function deleteRemoteJournalSession(id: string, deletedAt: string) {
  return sendDeletion("session", id, deletedAt);
}

function pushTransaction(transaction: BankrollTransaction) {
  const user = getCurrentUser();
  if (!user || !isJournalDate(transaction.date)) return Promise.resolve(true);
  return sendRecord("journal_transactions", {
      id: transaction.id,
      user_id: user.id,
      bankroll_id: transaction.bankrollId,
      created_at: transaction.createdAt,
      updated_at: revisionOf(transaction),
      deleted_at: transaction.deletedAt ?? null,
      date: transaction.date,
      type: transaction.type,
      amount: transaction.amount,
      note: transaction.note ?? null,
    });
}

/** Soft delete — see deleteRemoteBankroll for why the row has to stay. */
function deleteRemoteTransaction(id: string, deletedAt: string) {
  return sendDeletion("transaction", id, deletedAt);
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
    const record: Bankroll = { id: createId(), createdAt: now.toISOString(), updatedAt: now.toISOString(), name };
    const next = [...this.bankrolls(store), record];
    write(BANKROLLS_KEY, next, store);
    pushBankroll(record);
    track("journal_bankroll_added");
    return record;
  },
  renameBankroll(id: string, name: string, store?: StorageLike, now = new Date()) {
    const next = this.bankrolls(store).map((bankroll) => bankroll.id === id ? { ...bankroll, name, updatedAt: now.toISOString() } : bankroll);
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
    const mergedAt = new Date().toISOString();
    for (const duplicateId of remap.keys()) recordTombstone(duplicateId, "bankroll", store, mergedAt);
    const remappedSessions = this.sessions(store).filter((session) => remap.has(session.bankrollId));
    const remappedTransactions = this.transactions(store).filter((transaction) => remap.has(transaction.bankrollId));
    const sessions = this.sessions(store).map((session) => remap.has(session.bankrollId) ? { ...session, bankrollId: remap.get(session.bankrollId)!, updatedAt: mergedAt } : session);
    const transactions = this.transactions(store).map((transaction) => remap.has(transaction.bankrollId) ? { ...transaction, bankrollId: remap.get(transaction.bankrollId)!, updatedAt: mergedAt } : transaction);
    write(SESSIONS_KEY, sessions, store);
    write(TRANSACTIONS_KEY, transactions, store);
    write(BANKROLLS_KEY, current.filter((bankroll) => !remap.has(bankroll.id)), store);
    for (const session of remappedSessions) pushJournalSession({ ...session, bankrollId: remap.get(session.bankrollId)!, updatedAt: mergedAt });
    for (const transaction of remappedTransactions) pushTransaction({ ...transaction, bankrollId: remap.get(transaction.bankrollId)!, updatedAt: mergedAt });
    for (const duplicateId of remap.keys()) {
      deleteRemoteBankroll(duplicateId, mergedAt);
    }
    return remap.size;
  },
  /** Reassigns the bankroll's sessions/transactions to the default bankroll, then removes it. Refuses to delete the last remaining bankroll. */
  deleteBankroll(id: string, store?: StorageLike) {
    const deletedAt = new Date().toISOString();
    const remaining = this.bankrolls(store).filter((bankroll) => bankroll.id !== id);
    if (remaining.length === 0) return false;
    const fallback = [...remaining].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].id;
    const movedSessionIds = new Set(this.sessions(store).filter((session) => session.bankrollId === id).map((session) => session.id));
    const movedTransactionIds = new Set(this.transactions(store).filter((transaction) => transaction.bankrollId === id).map((transaction) => transaction.id));
    const reassignedSessions = this.sessions(store).map((session) => movedSessionIds.has(session.id) ? { ...session, bankrollId: fallback, updatedAt: deletedAt } : session);
    const reassignedTransactions = this.transactions(store).map((transaction) => movedTransactionIds.has(transaction.id) ? { ...transaction, bankrollId: fallback, updatedAt: deletedAt } : transaction);
    write(SESSIONS_KEY, reassignedSessions, store);
    write(TRANSACTIONS_KEY, reassignedTransactions, store);
    recordTombstone(id, "bankroll", store, deletedAt);
    write(BANKROLLS_KEY, remaining, store);
    for (const session of reassignedSessions) if (movedSessionIds.has(session.id)) pushJournalSession(session);
    for (const transaction of reassignedTransactions) if (movedTransactionIds.has(transaction.id)) pushTransaction(transaction);
    deleteRemoteBankroll(id, deletedAt);
    track("journal_bankroll_deleted");
    return true;
  },
  addSession(session: Omit<JournalSession, "id" | "createdAt" | "bankrollId"> & { bankrollId?: string }, store?: StorageLike, now = new Date()) {
    if (!isJournalDate(session.date)) throw new Error("Session date must be a complete YYYY-MM-DD calendar date.");
    const record: JournalSession = { ...session, bankrollId: session.bankrollId ?? defaultBankrollId(store), id: createId(), createdAt: now.toISOString(), updatedAt: now.toISOString() };
    const next = [record, ...this.sessions(store)];
    write(SESSIONS_KEY, next, store);
    pushJournalSession(record);
    track("journal_session_added", { netResult: record.netResult, hours: record.hours });
    return record;
  },
  /** Replaces an existing session's editable fields, keeping its id, createdAt, and bankrollId. Returns the updated record, or undefined if no session has that id. */
  updateSession(id: string, updates: Omit<JournalSession, "id" | "createdAt" | "bankrollId"> & { bankrollId?: string }, store?: StorageLike, now = new Date()) {
    if (!isJournalDate(updates.date)) throw new Error("Session date must be a complete YYYY-MM-DD calendar date.");
    const existing = this.sessions(store).find((session) => session.id === id);
    if (!existing) return undefined;
    // bankrollId stays put unless the caller deliberately moves the session.
    const record: JournalSession = { ...updates, id: existing.id, createdAt: existing.createdAt, updatedAt: now.toISOString(), bankrollId: updates.bankrollId ?? existing.bankrollId };
    write(SESSIONS_KEY, this.sessions(store).map((session) => session.id === id ? record : session), store);
    pushJournalSession(record);
    track("journal_session_updated", { netResult: record.netResult, hours: record.hours });
    return record;
  },
  deleteSession(id: string, store?: StorageLike, now = new Date()) {
    const deletedAt = now.toISOString();
    recordTombstone(id, "session", store, deletedAt);
    write(SESSIONS_KEY, this.sessions(store).filter((session) => session.id !== id), store);
    deleteRemoteJournalSession(id, deletedAt);
    track("journal_session_deleted");
  },
  addTransaction(transaction: Omit<BankrollTransaction, "id" | "createdAt" | "bankrollId"> & { bankrollId?: string }, store?: StorageLike, now = new Date()) {
    if (!isJournalDate(transaction.date)) throw new Error("Transaction date must be a complete YYYY-MM-DD calendar date.");
    const record: BankrollTransaction = { ...transaction, bankrollId: transaction.bankrollId ?? defaultBankrollId(store), id: createId(), createdAt: now.toISOString(), updatedAt: now.toISOString() };
    const next = [record, ...this.transactions(store)];
    write(TRANSACTIONS_KEY, next, store);
    pushTransaction(record);
    track("journal_transaction_added", { type: record.type, amount: record.amount });
    return record;
  },
  deleteTransaction(id: string, store?: StorageLike, now = new Date()) {
    const deletedAt = now.toISOString();
    recordTombstone(id, "transaction", store, deletedAt);
    write(TRANSACTIONS_KEY, this.transactions(store).filter((transaction) => transaction.id !== id), store);
    deleteRemoteTransaction(id, deletedAt);
    track("journal_transaction_deleted");
  },
  /** Merge rows pulled from Supabase into the local cache without re-pushing them. */
  mergeRemoteBankrolls(remote: Bankroll[], store?: StorageLike) {
    write(BANKROLLS_KEY, mergeRemote(remote, read(BANKROLLS_KEY, validBankroll, store), "bankroll", store), store, false);
  },
  mergeRemoteSessions(remote: JournalSession[], store?: StorageLike) {
    write(SESSIONS_KEY, mergeRemote(remote, this.sessions(store), "session", store), store, false);
  },
  mergeRemoteTransactions(remote: BankrollTransaction[], store?: StorageLike) {
    write(TRANSACTIONS_KEY, mergeRemote(remote, this.transactions(store), "transaction", store), store, false);
  },
  /** Pushes pending revisions in the active account cache. Bankrolls go first so sessions/transactions can reference them. Resolves only once every row has actually been upserted, so callers can rely on completion before reading remote state back. */
  async pushAllToRemote(store?: StorageLike) {
    const generation = accountGeneration();
    const owner = getCurrentUser()?.id;
    if (!owner) return;
    const records = [
      ...read(BANKROLLS_KEY, validBankroll, store).map((record) => () => pushBankroll(record)),
      ...this.sessions(store).map((record) => () => pushJournalSession(record)),
      ...this.transactions(store).map((record) => () => pushTransaction(record)),
      ...tombstones(store).map((record) => () => sendDeletion(record.kind, record.id, record.deletedAt)),
    ];
    for (const send of records) {
      if (generation !== accountGeneration() || getCurrentUser()?.id !== owner) return;
      if (!await send()) throw new Error("Some journal changes are waiting to sync. Retry when connected.");
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
        additions.push({ ...imported, updatedAt: new Date().toISOString(), deletedAt: undefined });
      }
    }
    const bankrolls = [...existingBankrolls, ...additions];
    const remapBankroll = (bankrollId: string | undefined) => bankrollId ? (importedIdMap.get(bankrollId) ?? bankrollId) : defaultBankrollId(store);
    const importedSessions = parsed.sessions.map((session) => ({ ...session, updatedAt: new Date().toISOString(), deletedAt: undefined, bankrollId: remapBankroll(session.bankrollId) }));
    const importedTransactions = parsed.transactions.map((transaction) => ({ ...transaction, updatedAt: new Date().toISOString(), deletedAt: undefined, bankrollId: remapBankroll(transaction.bankrollId) }));
    // Restoring a backup is a deliberate act, so it outranks any earlier
    // delete of the same record: clear those tombstones or the restore would
    // silently drop exactly the rows the user is trying to get back.
    const restoredIds = new Set([...importedSessions.map((session) => session.id), ...importedTransactions.map((transaction) => transaction.id), ...importedBankrolls.map((bankroll) => bankroll.id)]);
    write(DELETIONS_KEY, tombstones(store).filter((tombstone) => !restoredIds.has(tombstone.id)), store);
    const allSessions = [...importedSessions, ...this.sessions(store)].filter((session, index, all) => all.findIndex((candidate) => candidate.id === session.id) === index);
    const allTransactions = [...importedTransactions, ...this.transactions(store)].filter((transaction, index, all) => all.findIndex((candidate) => candidate.id === transaction.id) === index);
    const sessions = allSessions;
    const transactions = allTransactions;
    const dropped = (allSessions.length - sessions.length) + (allTransactions.length - transactions.length);
    write(BANKROLLS_KEY, bankrolls, store);
    write(SESSIONS_KEY, sessions, store);
    write(TRANSACTIONS_KEY, transactions, store);
    if (getCurrentUser()) void this.pushAllToRemote(store).catch((error) => reportJournalSyncError("sync imported journal data", error instanceof Error ? error : { message: "Unknown import sync error" }));
    track("data_imported", { scope: "journal", sessions: sessions.length, transactions: transactions.length });
    // `dropped` counts the oldest records that did not fit under the storage
    // cap. The caller is expected to say so rather than report a clean import.
    return { sessions: sessions.length, transactions: transactions.length, dropped };
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
      if (![decks, penetration, bettingUnit, hours, handsPerHour, playerHands, netResult, expenses].every(finite) || ramp.length === 0 || !isJournalDate(row.date)) continue;
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
    target?.removeItem(DELETIONS_KEY);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(JOURNAL_EVENT));
    track("data_cleared", { scope: "journal" });
  },
};

export function sessionsInRange(sessions: JournalSession[], days: number | "all", now = new Date()) {
  if (days === "all") return sessions;
  const cutoff = now.getTime() - days * 86400000;
  // Invalid legacy dates stay visible in the log so the user can edit and
  // repair them; hiding the row would make the failed edit look like data loss.
  // Midday local anchors the comparison the same way isJournalDate does, so a
  // session does not drop out of the window on a timezone boundary.
  return sessions.filter((session) => !isJournalDate(session.date) || new Date(`${session.date}T12:00:00`).getTime() >= cutoff);
}
