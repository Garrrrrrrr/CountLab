"use client";
import { useEffect, useState } from "react";
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
  /** Lab scenarios and Simulator setups, offered as games to start a session from. */
  scenarios: CvcxTemplate[];
  setups: SimulationTemplate[];
  /** Duplicate bankroll names merged on arrival. */
  merged: number;
  /** Oldest records dropped for space, from the storage-limit event. */
  pruned: number | null;
}

const EMPTY: JournalData = { ready: false, bankrolls: [], sessions: [], transactions: [], presets: [], scenarios: [], setups: [], merged: 0, pruned: null };

/** Reads the journal and every library it draws games from, and keeps them current as other tabs and tools write. */
export function useJournalData() {
  const [data, setData] = useState<JournalData>(EMPTY);
  useEffect(() => {
    const merged = journalLibrary.mergeDuplicateBankrollNames();
    const readJournal = () => setData((current) => ({ ...current, ready: true, sessions: journalLibrary.sessions(), transactions: journalLibrary.transactions(), bankrolls: journalLibrary.bankrolls() }));
    const readPresets = () => setData((current) => ({ ...current, presets: venuePresetLibrary.presets() }));
    const readScenarios = () => setData((current) => ({ ...current, scenarios: cvcxLibrary.templates() }));
    const readSetups = () => setData((current) => ({ ...current, setups: simulationLibrary.templates() }));
    // Storage is capped, so the oldest records can be pruned to make room.
    // Say so: a silently shrinking career total reads as lost data.
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
    ];
    listeners.forEach(([name, listener]) => addEventListener(name, listener));
    track("journal_history_viewed", { kind: "sessions" });
    return () => listeners.forEach(([name, listener]) => removeEventListener(name, listener));
  }, []);
  const dismiss = (notice: "merged" | "pruned") => setData((current) => notice === "merged" ? { ...current, merged: 0 } : { ...current, pruned: null });
  return { data, dismiss };
}
