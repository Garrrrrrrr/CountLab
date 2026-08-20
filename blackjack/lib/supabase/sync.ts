import { supabase } from "./client";
import { storage, type DrillProgress, type Session, type Settings } from "../statistics/storage";
import { journalLibrary, type Bankroll, type JournalSession, type BankrollTransaction } from "../blackjack/journal";
import { observeApiRequest } from "../analytics";

/** Pulls this user's rows from Supabase and merges them into the local cache. Called once on sign-in. */
export async function pullRemoteData(userId: string): Promise<void> {
  const [settingsRes, sessionsRes, progressRes, bankrollsRes, journalSessionsRes, transactionsRes] = await Promise.all([
    observeApiRequest("supabase", "sync_settings_read", supabase.from("settings").select("data").eq("user_id", userId).maybeSingle()),
    observeApiRequest("supabase", "sync_drill_sessions_read", supabase.from("drill_sessions").select("*").eq("user_id", userId)),
    observeApiRequest("supabase", "sync_drill_progress_read", supabase.from("drill_progress").select("*").eq("user_id", userId)),
    observeApiRequest("supabase", "sync_journal_bankrolls_read", supabase.from("journal_bankrolls").select("*").eq("user_id", userId)),
    observeApiRequest("supabase", "sync_journal_sessions_read", supabase.from("journal_sessions").select("*").eq("user_id", userId)),
    observeApiRequest("supabase", "sync_journal_transactions_read", supabase.from("journal_transactions").select("*").eq("user_id", userId)),
  ]);

  if (settingsRes.data?.data) storage.applyRemoteSettings(settingsRes.data.data as Settings);

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
      bankrollId: row.bankroll_id ?? fallbackBankrollId,
      date: row.date,
      type: row.type,
      amount: row.amount,
      note: row.note ?? undefined,
    }));
    journalLibrary.mergeRemoteTransactions(transactions);
  }
}

/** Clears the local cache so the next account signed in on this device doesn't see stale data. */
export function clearLocalUserData(): void {
  storage.clearAll();
  journalLibrary.clear();
}

/** Pushes locally cached data (e.g. recorded while browsing as a guest) to the just-signed-in account. Resolves only once every row has actually been upserted, so callers can rely on completion before pulling remote state back. */
export async function pushLocalDataToRemote(): Promise<void> {
  await Promise.all([storage.pushLocalToRemote(), journalLibrary.pushAllToRemote()]);
}
