"use client";
import { useMemo } from "react";
import { sessionsInRange } from "@/lib/blackjack/journal";
import { aggregateJournal, bankrollHealth, currentBankroll, journalByVenue, journalCumulativeSeries, theoreticalSessionOutcome, type TheoreticalOutcome } from "@/lib/blackjack/journalAnalysis";
import { bankrollBalances, cashTotals, type Period } from "@/lib/blackjack/journalView";
import type { JournalData } from "./useJournalData";

/**
 * Everything the page shows, scoped to one bankroll (or all of them) and,
 * for results, sessions and venues, to a period. Bankroll health and
 * long-run progress always use all history: a short window can only hide
 * money and hours, never change them.
 */
export function useJournalScope(data: JournalData, bankrollId: string | "all", period: Period) {
  const { sessions, transactions, bankrolls } = data;
  const defaultBankrollId = useMemo(() => [...bankrolls].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ?? "", [bankrolls]);
  const scopedSessions = useMemo(() => bankrollId === "all" ? sessions : sessions.filter((session) => session.bankrollId === bankrollId), [sessions, bankrollId]);
  const scopedTransactions = useMemo(() => bankrollId === "all" ? transactions : transactions.filter((transaction) => transaction.bankrollId === bankrollId), [transactions, bankrollId]);
  const inRange = useMemo(() => sessionsInRange(scopedSessions, period), [scopedSessions, period]);
  const aggregate = useMemo(() => aggregateJournal(inRange), [inRange]);
  const lifetime = useMemo(() => aggregateJournal(scopedSessions), [scopedSessions]);
  const venues = useMemo(() => journalByVenue(inRange), [inRange]);
  const cumulative = useMemo(() => journalCumulativeSeries(inRange), [inRange]);
  const bankroll = useMemo(() => currentBankroll(scopedSessions, scopedTransactions), [scopedSessions, scopedTransactions]);
  const cash = useMemo(() => cashTotals(scopedTransactions), [scopedTransactions]);
  const health = useMemo(() => bankrollHealth(scopedSessions, bankroll), [scopedSessions, bankroll]);
  const balances = useMemo(() => bankrollBalances(bankrolls, sessions, transactions), [bankrolls, sessions, transactions]);
  // Priced once per change to the journal and shared by every list, badge and sheet.
  const outcomes = useMemo(() => new Map<string, TheoreticalOutcome>(sessions.map((session) => [session.id, theoreticalSessionOutcome(session)])), [sessions]);
  const bankrollNames = useMemo(() => new Map(bankrolls.map((item) => [item.id, item.name])), [bankrolls]);
  return { defaultBankrollId, scopedSessions, scopedTransactions, inRange, aggregate, lifetime, venues, cumulative, bankroll, cash, health, balances, outcomes, bankrollNames };
}

export type JournalScope = ReturnType<typeof useJournalScope>;
