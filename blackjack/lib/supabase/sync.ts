import { accountGeneration, accountStorage } from "./accountStorage";
import { getCurrentUser } from "./currentUser";
import { supabase } from "./client";
import { storage, type DrillProgress, type Session, type Settings } from "../statistics/storage";
import { journalLibrary, type Bankroll, type JournalSession, type BankrollTransaction } from "../blackjack/journal";
import { shoeLibrary, type SavedShoeHeader } from "../blackjack/shoeLibrary";
import { observeApiRequest } from "../analytics";


async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const data: T[] = [];
  for (let from = 0; ; from += 1000) {
    const response = await query(from, from + 999);
    if (response.error) throw new Error(response.error.message);
    data.push(...(response.data ?? []));
    if ((response.data?.length ?? 0) < 1000) return { data, error: null };
  }
}

/** Pulls this user's rows from Supabase and merges them into the local cache. Called once on sign-in. */
export async function pullRemoteData(userId: string): Promise<void> {
  const generation = accountGeneration();
  const settingsBeforeRead = accountStorage.getItem("hilo:settings");
  const [settingsRes, sessionsRes, progressRes, bankrollsRes, journalSessionsRes, transactionsRes, shoeHeadersRes] = await Promise.all([
    observeApiRequest("supabase", "sync_settings_read", supabase.from("settings").select("data").eq("user_id", userId).maybeSingle(), { trackSuccess: false }),
    allRows((from, to) => observeApiRequest("supabase", "sync_drill_sessions_read", supabase.from("drill_sessions").select("*").eq("user_id", userId).order("id").range(from, to), { trackSuccess: false })),
    allRows((from, to) => observeApiRequest("supabase", "sync_drill_progress_read", supabase.from("drill_progress").select("*").eq("user_id", userId).order("drill").range(from, to), { trackSuccess: false })),
    allRows((from, to) => observeApiRequest("supabase", "sync_journal_bankrolls_read", supabase.from("journal_bankrolls").select("*").eq("user_id", userId).order("id").range(from, to), { trackSuccess: false })),
    allRows((from, to) => observeApiRequest("supabase", "sync_journal_sessions_read", supabase.from("journal_sessions").select("*").eq("user_id", userId).order("id").range(from, to), { trackSuccess: false })),
    allRows((from, to) => observeApiRequest("supabase", "sync_journal_transactions_read", supabase.from("journal_transactions").select("*").eq("user_id", userId).order("id").range(from, to), { trackSuccess: false })),
    // Headers only: `rounds` holds every card and decision of a shoe, so it is
    // fetched one row at a time when a shoe is actually opened for review.
    allRows((from, to) => observeApiRequest("supabase", "sync_full_shoe_reviews_read", supabase.from("full_shoe_reviews").select("id, saved_at, mode, completion_reason, table_rules, report").eq("user_id", userId).order("id").range(from, to), { trackSuccess: false })),
  ]);

  if (generation !== accountGeneration() || getCurrentUser()?.id !== userId) return;
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (settingsRes.data?.data) storage.applyRemoteSettings(settingsRes.data.data as Settings, settingsBeforeRead);

  if (sessionsRes.data) {
    const sessions: Session[] = sessionsRes.data.map((row) => ({
      id: row.id,
      drill: row.drill,
      questions: row.questions,
      correct: row.correct,
      accuracy: row.accuracy,
      averageResponseTime: row.average_response_time,
      bestStreak: row.best_streak,
      date: row.date,
      mistakes: row.mistakes ?? [],
      categories: row.categories ?? undefined,
      metrics: row.metrics ?? undefined,
      tags: row.tags ?? undefined,
    }));
    storage.mergeRemoteSessions(sessions);
  }

  if (progressRes.data) {
    const progress: DrillProgress[] = progressRes.data.map((row) => ({
      drill: row.drill,
      state: row.state,
      updatedAt: row.updated_at,
    }));
    storage.mergeRemoteProgress(progress);
  }

  if (bankrollsRes.data) {
    const bankrolls: Bankroll[] = bankrollsRes.data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      name: row.name,
      startingAmount: row.starting_amount ?? undefined,
      archived: row.archived ?? undefined,
    }));
    journalLibrary.mergeRemoteBankrolls(bankrolls);
  }

  // Rows written before multi-bankroll support (or orphaned by a deleted bankroll) have no bankroll_id.
  const fallbackBankrollId = journalLibrary.defaultBankrollId();

  if (journalSessionsRes.data) {
    const sessions: JournalSession[] = journalSessionsRes.data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      bankrollId: row.bankroll_id ?? fallbackBankrollId,
      date: row.date,
      location: row.location ?? undefined,
      hours: row.hours,
      handsPerHour: row.hands_per_hour,
      playerHands: row.player_hands,
      handsByTrueCount: row.hands_by_true_count ?? undefined,
      bettingUnit: row.betting_unit,
      rules: row.rules,
      ramp: row.ramp,
      netResult: row.net_result,
      expenses: row.expenses,
      notes: row.notes ?? undefined,
    }));
    journalLibrary.mergeRemoteSessions(sessions);
  }

  if (transactionsRes.data) {
    const transactions: BankrollTransaction[] = transactionsRes.data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      bankrollId: row.bankroll_id ?? fallbackBankrollId,
      date: row.date,
      type: row.type,
      amount: row.amount,
      note: row.note ?? undefined,
    }));
    journalLibrary.mergeRemoteTransactions(transactions);
  }

  if (shoeHeadersRes.data) {
    const headers: SavedShoeHeader[] = shoeHeadersRes.data.map((row) => ({
      id: row.id,
      savedAt: row.saved_at,
      mode: row.mode,
      completionReason: row.completion_reason,
      table: row.table_rules,
      report: row.report,
    }));
    shoeLibrary.mergeRemoteHeaders(headers);
  }
}

/** Refreshes just the journal while an authenticated tab is open on another device. */
export async function pullRemoteJournalData(userId: string): Promise<void> {
  const generation = accountGeneration();
  const [bankrollsRes, journalSessionsRes, transactionsRes] = await Promise.all([
    allRows((from, to) => observeApiRequest("supabase", "journal_refresh_bankrolls", supabase.from("journal_bankrolls").select("*").eq("user_id", userId).order("id").range(from, to), { trackSuccess: false })),
    allRows((from, to) => observeApiRequest("supabase", "journal_refresh_sessions", supabase.from("journal_sessions").select("*").eq("user_id", userId).order("id").range(from, to), { trackSuccess: false })),
    allRows((from, to) => observeApiRequest("supabase", "journal_refresh_transactions", supabase.from("journal_transactions").select("*").eq("user_id", userId).order("id").range(from, to), { trackSuccess: false })),
  ]);

  if (generation !== accountGeneration() || getCurrentUser()?.id !== userId) return;
  if (bankrollsRes.data) {
    journalLibrary.mergeRemoteBankrolls(bankrollsRes.data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      name: row.name,
      startingAmount: row.starting_amount ?? undefined,
      archived: row.archived ?? undefined,
    })));
  }

  const fallbackBankrollId = journalLibrary.defaultBankrollId();
  if (journalSessionsRes.data) {
    journalLibrary.mergeRemoteSessions(journalSessionsRes.data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      bankrollId: row.bankroll_id ?? fallbackBankrollId,
      date: row.date,
      location: row.location ?? undefined,
      hours: row.hours,
      handsPerHour: row.hands_per_hour,
      playerHands: row.player_hands,
      handsByTrueCount: row.hands_by_true_count ?? undefined,
      bettingUnit: row.betting_unit,
      rules: row.rules,
      ramp: row.ramp,
      netResult: row.net_result,
      expenses: row.expenses,
      notes: row.notes ?? undefined,
    })));
  }

  if (transactionsRes.data) {
    journalLibrary.mergeRemoteTransactions(transactionsRes.data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      bankrollId: row.bankroll_id ?? fallbackBankrollId,
      date: row.date,
      type: row.type,
      amount: row.amount,
      note: row.note ?? undefined,
    })));
  }
}

/** Clears the local cache so the next account signed in on this device doesn't see stale data. */
export function clearLocalUserData(): void {
  storage.clearAll();
  journalLibrary.clear();
  shoeLibrary.clear();
}

/** Pushes the active account cache to its owner. Resolves only once every row has actually been upserted, so callers can rely on completion before pulling remote state back. */
export async function pushLocalDataToRemote(): Promise<void> {
  await Promise.all([storage.pushLocalToRemote(), journalLibrary.pushAllToRemote(), shoeLibrary.pushAllToRemote()]);
}
