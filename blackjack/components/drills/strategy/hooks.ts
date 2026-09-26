"use client";
import { useEffect, useState } from "react";
import type { BlackjackRules } from "@/lib/blackjack/types";
import { answeredInProgress } from "@/lib/statistics/drillRound";
import { storage, surrenderFlags, type DrillProgress, type DrillType, type Session, type Settings } from "@/lib/statistics/storage";

/**
 * The saved settings, kept current when Settings, the reference chart or
 * another tab saves them (the "hilo-storage" event). Drill pages mount only
 * on the client, after sign-in resolves, so reading storage up front does
 * not differ from any prerendered HTML.
 */
export function useStrategySettings(): Settings {
  const [settings, setSettings] = useState(() => storage.settings());
  useEffect(() => {
    const load = () => setSettings(storage.settings());
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
  return settings;
}

/** Every saved session, newest first, kept current as drills record new ones. */
export function useStoredSessions(): Session[] {
  const [sessions, setSessions] = useState(() => storage.sessions());
  useEffect(() => {
    const load = () => setSessions(storage.sessions());
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
  return sessions;
}

/** The current time, refreshed every `ms` while `active`, for clocks. */
export function useNow(active: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

const PRACTICE_FOCUS_KEY = "countlab:practice-focus";

/**
 * The practice focus a weak-spot list or the exam report left for `drill`,
 * read without clearing it (a render can be discarded). The drill clears it
 * after mount with `consumePracticeFocus`, whether or not it was for this
 * drill, so it cannot surface on a later, unrelated visit.
 */
export function peekPracticeFocus(drill: DrillType): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PRACTICE_FOCUS_KEY) || "null") as { drill?: string; category?: string } | null;
    return parsed?.drill === drill && typeof parsed.category === "string" ? parsed.category : undefined;
  } catch {
    return undefined;
  }
}

/** Resumable progress for a drill: at least one answer, or a queued retry round. */
export function isResumable(progress: DrillProgress<{ q?: number; categories?: Record<string, { correct: number; total: number }>; queue?: unknown[] }> | null) {
  if (!progress?.state) return false;
  return answeredInProgress(progress.state) > 0 || (Array.isArray(progress.state.queue) && progress.state.queue.length > 0);
}

/**
 * Unfinished progress that turned up while Setup was open: synced from
 * another device after the page loaded. Resuming stays the reader's choice.
 */
export function useUnfinishedProgress<T>(drill: DrillType, watching: boolean) {
  const [progress, setProgress] = useState<DrillProgress<T> | null>(null);
  useEffect(() => {
    if (!watching) return;
    const load = () => setProgress(storage.progress<T>(drill));
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, [drill, watching]);
  return watching ? progress : null;
}

/** The table rules the strategy engine wants, from the saved settings. */
export const rulesFromSettings = (settings: Settings): BlackjackRules => ({
  decks: settings.decks,
  dealerHitsSoft17: settings.dealerHitsSoft17,
  doubleAfterSplit: settings.doubleAfterSplit,
  resplitAces: settings.resplitAces,
  ...surrenderFlags(settings.surrender),
  doubleRule: "any",
});

const SURRENDER_TAG = { none: "nls", late: "ls", early: "es10" } as const;

/** The rules part of the drill_started payload, unchanged from the previous drills. */
export const startedRules = (settings: Settings) => ({
  decks: settings.decks,
  rulesPreset: `${settings.decks}d_${settings.dealerHitsSoft17 ? "h17" : "s17"}_${settings.doubleAfterSplit ? "das" : "ndas"}_${settings.resplitAces ? "rsa" : "nrsa"}_${SURRENDER_TAG[settings.surrender]}`,
  dealerRule: settings.dealerHitsSoft17 ? "H17" : "S17",
  das: settings.doubleAfterSplit,
  rsa: settings.resplitAces,
  surrender: settings.surrender,
});

/** The optional right/wrong tone from Settings; never interrupts a drill if audio is unavailable. */
export function playTone(correct: boolean, enabled: boolean) {
  if (!enabled) return;
  try {
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = correct ? 660 : 220;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Sound is optional.
  }
}

/**
 * Scrolls just enough to show `element` between the sticky header (and the
 * round's pinned progress bar, when it is on screen) and the thumb dock.
 * scrollIntoView cannot be trusted here: the phone layout's scroll padding
 * and a dock that changes height as it swaps buttons defeat its "nearest"
 * alignment. When the element is taller than the room, its top wins.
 */
export function reveal(element: Element | null | undefined, gap = 8) {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const header = document.querySelector("body header")?.getBoundingClientRect().bottom ?? 0;
  const hud = document.querySelector("section[aria-label='Session progress']")?.getBoundingClientRect();
  const pinned = hud && getComputedStyle(document.querySelector("section[aria-label='Session progress']")!).position === "sticky" && hud.top <= header + 1 ? hud.bottom : 0;
  const top = Math.max(header, pinned) + gap;
  const docks = Array.from(document.querySelectorAll(".mobile-action-dock")).filter((dock) => dock.getClientRects().length > 0);
  const bottom = Math.min(innerHeight, ...docks.map((dock) => dock.getBoundingClientRect().top)) - gap;
  if (rect.top < top) scrollBy({ top: rect.top - top });
  else if (rect.bottom > bottom) scrollBy({ top: Math.min(rect.bottom - bottom, rect.top - top) });
}
