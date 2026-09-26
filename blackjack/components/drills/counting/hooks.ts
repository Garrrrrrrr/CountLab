"use client";
import { RefObject, useEffect, useRef, useState } from "react";
import { consumePracticeFocus, peekPracticeFocus } from "@/lib/statistics/spacedRepetition";
import { storage, type DrillProgress, type DrillType, type Session } from "@/lib/statistics/storage";
import { useMediaQuery } from "@/lib/useMediaQuery";

/** Saved sessions, newest first, kept current when any drill saves (the "hilo-storage" event). */
export function useStoredSessions(drill?: DrillType) {
  const read = () => {
    const all = storage.sessions();
    return drill ? all.filter((session) => session.drill === drill) : all;
  };
  const [sessions, setSessions] = useState<Session[]>(read);
  useEffect(() => {
    const load = () => setSessions(read());
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
    // `read` only depends on `drill`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill]);
  return sessions;
}

/** The current time, refreshed every `ms` while `active` (for clocks that tick each second). */
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

/**
 * Whether answers are typed on the on-screen keypad. Touch screens get it at
 * any width (a phone in landscape too), and narrow windows get it as well.
 * `coarse` also hides the system keyboard, which would cover the keypad.
 */
export function useKeypad() {
  const keypad = useMediaQuery("(pointer: coarse), (max-width: 639px)");
  const coarse = useMediaQuery("(pointer: coarse)");
  return { keypad, coarse };
}

export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

/**
 * Why the reader arrived: a `?focus=` link (a Benchmark target, which also
 * works in a new tab), the one-shot practice focus a weak spot or the Test
 * Out report leaves in sessionStorage, or `?session=starter`. Pass the params
 * from useSearchParams(): after a client-side navigation `location.search`
 * still shows the previous page during the first render. This only reads;
 * `useConsumeArrival` clears the stored focus once the drill has mounted.
 */
export function readArrival(drill: DrillType, params: { get(name: string): string | null }): { focus?: string; starter: boolean } {
  if (typeof window === "undefined") return { starter: false };
  return { focus: params.get("focus") ?? peekPracticeFocus(drill), starter: params.get("session") === "starter" };
}

/** Clears the one-shot practice focus after mount, so it cannot fire on a later, unrelated visit. */
export function useConsumeArrival(drill: DrillType) {
  useEffect(() => { consumePracticeFocus(drill); }, [drill]);
}

/** Progress older than this opens the setup with a Resume offer instead of dropping the reader mid-question. */
export const STALE_PROGRESS_MS = 30 * 60 * 1000;

export function isRecent(progress: DrillProgress | null) {
  if (!progress) return false;
  const age = Date.now() - new Date(progress.updatedAt).getTime();
  return Number.isFinite(age) && age < STALE_PROGRESS_MS;
}

/** "just now", "12 min ago", "3 h ago", or the date. */
export function relativeTime(iso?: string) {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : days < 7 ? `${days} days ago` : new Date(iso).toLocaleDateString();
}

/**
 * Unfinished progress for this drill that showed up while the setup is open:
 * synced from another device after the page loaded, or already there but too
 * old to resume automatically.
 */
export function useUnfinishedProgress(drill: DrillType, watching: boolean) {
  const [progress, setProgress] = useState<DrillProgress | null>(() => (watching ? storage.progress(drill) : null));
  useEffect(() => {
    if (!watching) return;
    const load = () => setProgress(storage.progress(drill));
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, [drill, watching]);
  return watching ? progress : null;
}

/**
 * Focus for the transitions DrillFrame cannot see: leaving the summary (which
 * renders outside the frame), coming back to the setup, and a remount after
 * Discard. Setup focuses its heading; play focuses the first answer field or
 * the stage. Runs a frame late so it lands after the frame's own focus.
 */
export function useEntryFocus(root: RefObject<HTMLElement | null>, phase: "setup" | "play" | "done", focusOnMount: boolean) {
  const previous = useRef<string | null>(focusOnMount ? null : phase);
  useEffect(() => {
    const from = previous.current;
    previous.current = phase;
    if (from === phase || phase === "done" || (phase === "play" && from === "setup")) return;
    scrollTo({ top: 0 });
    const frame = requestAnimationFrame(() => {
      const scope = root.current;
      if (!scope) return;
      if (phase === "setup") {
        const heading = scope.querySelector<HTMLElement>("h1");
        heading?.setAttribute("tabindex", "-1");
        heading?.focus({ preventScroll: true });
        return;
      }
      (scope.querySelector<HTMLElement>("[data-answer-field]") ?? scope.querySelector<HTMLElement>("[data-drill-focus]"))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, root]);
}

/**
 * Publishes the sticky HUD's height as `--counting-hud` on the page, so the
 * scroll padding (globals.css) clears the app header and the HUD together.
 */
export function useHudClearance(root: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const hud = active ? root.current?.querySelector<HTMLElement>("section[aria-label='Session progress']") : null;
    if (!hud) return;
    const html = document.documentElement;
    const update = () => html.style.setProperty("--counting-hud", `${hud.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(hud);
    return () => { observer.disconnect(); html.style.removeProperty("--counting-hud"); };
  }, [root, active]);
}

/**
 * Fits each play step (a question, a verdict, a new group of cards) between
 * the sticky HUD and the bottom of the screen, which matters on phones: the
 * step's `[data-reveal-bottom]` (the submit key, Continue) is brought into
 * view, and its `[data-reveal-top]` (the tray, the photo) is kept clear of the
 * HUD whenever both fit. When they cannot both fit, the answer entry wins.
 * Runs a frame late, after the answer field or verdict has taken focus.
 */
export function useRevealStep(root: RefObject<HTMLElement | null>, step: string | null) {
  useEffect(() => {
    if (!step) return;
    const frame = requestAnimationFrame(() => {
      const tops = root.current?.querySelectorAll("[data-reveal-top]");
      const top = tops?.[0];
      const bottom = root.current?.querySelector("[data-reveal-bottom]") ?? tops?.[tops.length - 1];
      if (!top || !bottom) return;
      const style = getComputedStyle(document.documentElement);
      const minTop = parseFloat(style.scrollPaddingTop) || 0;
      const maxBottom = innerHeight - (parseFloat(style.scrollPaddingBottom) || 0);
      const topEdge = top.getBoundingClientRect().top, bottomEdge = bottom.getBoundingClientRect().bottom;
      let delta = topEdge < minTop ? topEdge - minTop : 0;
      if (bottomEdge - delta > maxBottom) delta = bottomEdge - maxBottom;
      if (Math.abs(delta) >= 1) scrollBy({ top: delta, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [root, step]);
}
