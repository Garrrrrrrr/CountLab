"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics/track";
import { cvcxLibrary, type CvcxTemplate } from "@/lib/blackjack/cvcxLibrary";
import { JOURNAL_PRUNED_EVENT, journalLibrary, type Bankroll, type BankrollTransaction, type JournalSession } from "@/lib/blackjack/journal";
import { simulationLibrary, type SimulationTemplate } from "@/lib/blackjack/simulationLibrary";
import { venuePresetLibrary, type VenuePreset } from "@/lib/blackjack/venuePresets";

export interface JournalData {
  /** False until the first read from storage, so the page never flashes an empty journal. */
  ready: boolean;
  bankrolls: Bankroll[];
  sessions: JournalSession[];
  transactions: BankrollTransaction[];
  presets: VenuePreset[];
  /** Calculator scenarios and Simulator setups, offered as games to start a session from. */
  scenarios: CvcxTemplate[];
  setups: SimulationTemplate[];
  /** Duplicate bankroll names merged on arrival. */
  merged: number;
  /** Oldest records dropped for space, from the storage-limit event. */
  pruned: number | null;
}

const EMPTY: JournalData = { ready: false, bankrolls: [], sessions: [], transactions: [], presets: [], scenarios: [], setups: [], merged: 0, pruned: null };

/**
 * Reads the journal and every library it draws games from, and keeps them
 * current as other tabs, tools and sync pulls write. `pause` holds re-reads
 * during a bulk change so a delete-all re-renders once, not once per record.
 */
export function useJournalData() {
  const [data, setData] = useState<JournalData>(EMPTY);
  const paused = useRef(false);
  const readJournal = useCallback(() => {
    if (paused.current) return;
    setData((current) => ({ ...current, ready: true, sessions: journalLibrary.sessions(), transactions: journalLibrary.transactions(), bankrolls: journalLibrary.bankrolls() }));
  }, []);
  useEffect(() => {
    // Legacy and import-created duplicates ("Main" and "main") collapse into one.
    const merged = journalLibrary.mergeDuplicateBankrollNames();
    const readPresets = () => setData((current) => ({ ...current, presets: venuePresetLibrary.presets() }));
    const readScenarios = () => setData((current) => ({ ...current, scenarios: cvcxLibrary.templates() }));
    const readSetups = () => setData((current) => ({ ...current, setups: simulationLibrary.templates() }));
    // Storage used to be capped and could prune the oldest records; say so rather than let a total shrink silently.
    const warnPruned = (event: Event) => setData((current) => ({ ...current, pruned: (event as CustomEvent<number>).detail }));
    setData((current) => ({ ...current, merged }));
    readJournal();
    readPresets();
    readScenarios();
    readSetups();
    const listeners: [string, (event: Event) => void][] = [
      [journalLibrary.event, readJournal],
      [JOURNAL_PRUNED_EVENT, warnPruned],
      [venuePresetLibrary.event, readPresets],
      [cvcxLibrary.event, readScenarios],
      [simulationLibrary.event, readSetups],
      // Another tab wrote to storage.
      ["storage", () => { readJournal(); readPresets(); readScenarios(); readSetups(); }],
    ];
    listeners.forEach(([name, listener]) => addEventListener(name, listener));
    track("journal_history_viewed", { kind: "sessions" });
    return () => listeners.forEach(([name, listener]) => removeEventListener(name, listener));
  }, [readJournal]);

  const dismiss = (notice: "merged" | "pruned") => setData((current) => notice === "merged" ? { ...current, merged: 0 } : { ...current, pruned: null });
  /** Runs a burst of writes with re-reads held, then reads once. */
  const batch = useCallback(<T,>(work: () => T): T => {
    paused.current = true;
    try { return work(); } finally {
      paused.current = false;
      readJournal();
    }
  }, [readJournal]);
  return { data, dismiss, batch };
}
