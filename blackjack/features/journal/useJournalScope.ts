"use client";
import { useMemo } from "react";
import { aggregateJournal, bankrollHealth, currentBankroll, journalByVenue, journalCumulativeSeries, theoreticalSessionOutcome, type TheoreticalOutcome } from "@/lib/blackjack/journalAnalysis";
import { bankrollBalances, cashTotals } from "@/lib/blackjack/journalView";
import { filterByDate, filterByVenue, venueChoices, type DateFilter } from "./model";
import type { JournalData } from "./useJournalData";

export interface JournalFilters {
  bankroll: string | "all";
  dates: DateFilter;
  /** A venueKey, or null for every venue. */
  venue: string | null;
}

/**
 * Everything the page shows, scoped by the three filters:
 *
 * - bankroll scopes everything, money included;
 * - dates and venue narrow results, the chart, the session list and venues;
 * - bankroll health, cash movements and long-run progress always use the
 *   bankroll's whole history, because a short window can hide money and
 *   hours but never changes them.
 */
export function useJournalScope(data: JournalData, filters: JournalFilters) {
  const { sessions, transactions, bankrolls } = data;
  const { dates } = filters;
  // A bankroll deleted elsewhere (another tab, a sync) falls back to All, and a casino no longer in view to every casino.
  const bankrollId = filters.bankroll !== "all" && !bankrolls.some((bankroll) => bankroll.id === filters.bankroll) ? "all" : filters.bankroll;
  const defaultBankrollId = useMemo(() => [...bankrolls].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ?? "", [bankrolls]);
  const scopedSessions = useMemo(() => bankrollId === "all" ? sessions : sessions.filter((session) => session.bankrollId === bankrollId), [sessions, bankrollId]);
  const scopedTransactions = useMemo(() => bankrollId === "all" ? transactions : transactions.filter((transaction) => transaction.bankrollId === bankrollId), [transactions, bankrollId]);
  const inDates = useMemo(() => filterByDate(scopedSessions, dates), [scopedSessions, dates]);
  const venues = useMemo(() => venueChoices(scopedSessions), [scopedSessions]);
  const venue = filters.venue !== null && venues.some((choice) => choice.key === filters.venue) ? filters.venue : null;
  const inRange = useMemo(() => filterByVenue(inDates, venue), [inDates, venue]);
  const aggregate = useMemo(() => aggregateJournal(inRange), [inRange]);
  const lifetime = useMemo(() => aggregateJournal(scopedSessions), [scopedSessions]);
  const byVenue = useMemo(() => journalByVenue(inDates), [inDates]);
  const cumulative = useMemo(() => journalCumulativeSeries(inRange), [inRange]);
  const bankroll = useMemo(() => currentBankroll(scopedSessions, scopedTransactions), [scopedSessions, scopedTransactions]);
  const cash = useMemo(() => cashTotals(scopedTransactions), [scopedTransactions]);
  const health = useMemo(() => bankrollHealth(scopedSessions, bankroll), [scopedSessions, bankroll]);
  const balances = useMemo(() => bankrollBalances(bankrolls, sessions, transactions), [bankrolls, sessions, transactions]);
  // Priced once per change to the journal and shared by every list, badge and sheet.
  const outcomes = useMemo(() => new Map<string, TheoreticalOutcome>(sessions.map((session) => [session.id, theoreticalSessionOutcome(session)])), [sessions]);
  const bankrollNames = useMemo(() => new Map(bankrolls.map((item) => [item.id, item.name])), [bankrolls]);
  /** The filters as applied, after falling back from a bankroll or casino that no longer exists. */
  const applied = useMemo<JournalFilters>(() => ({ bankroll: bankrollId, dates, venue }), [bankrollId, dates, venue]);
  return { applied, defaultBankrollId, scopedSessions, scopedTransactions, inRange, venues, aggregate, lifetime, byVenue, cumulative, bankroll, cash, health, balances, outcomes, bankrollNames };
}

export type JournalScope = ReturnType<typeof useJournalScope>;
