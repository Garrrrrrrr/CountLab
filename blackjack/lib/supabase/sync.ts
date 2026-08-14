import { supabase } from "./client";
import { storage, type Session, type Settings } from "../statistics/storage";
import { journalLibrary, type JournalSession, type BankrollTransaction } from "../blackjack/journal";

/** Pulls this user's rows from Supabase and merges them into the local cache. Called once on sign-in. */
export async function pullRemoteData(userId: string): Promise<void> {
  const [settingsRes, sessionsRes, journalSessionsRes, transactionsRes] = await Promise.all([
    supabase.from("settings").select("data").eq("user_id", userId).maybeSingle(),
    supabase.from("drill_sessions").select("*").eq("user_id", userId),
    supabase.from("journal_sessions").select("*").eq("user_id", userId),
    supabase.from("journal_transactions").select("*").eq("user_id", userId),
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

  if (journalSessionsRes.data) {
    const sessions: JournalSession[] = journalSessionsRes.data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      date: row.date,
      location: row.location ?? undefined,
      hours: row.hours,
      handsPerHour: row.hands_per_hour,
      playerHands: row.player_hands,
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
