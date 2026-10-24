"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { accountStorage } from "@/lib/supabase/accountStorage";
import { consumePracticeFocus, peekPracticeFocus } from "@/lib/statistics/spacedRepetition";
import { storage, type DrillProgress, type DrillType } from "@/lib/statistics/storage";
import { useMediaQuery } from "@/lib/useMediaQuery";

/**
 * Why the reader arrived: a `?focus=` link (a benchmark target, which also
 * works in a new tab), the one-shot practice focus a weak spot leaves in
 * sessionStorage, or `?session=starter`. Read once; the stored focus is
 * cleared after mount so it cannot fire again on an unrelated visit.
 * Needs a <Suspense> boundary above it (useSearchParams).
 */
export function useArrival(drill: DrillType): { focus?: string; starter: boolean } {
  const params = useSearchParams();
  const [arrival] = useState(() => ({
    focus: params.get("focus") ?? (typeof window === "undefined" ? undefined : peekPracticeFocus(drill)),
    starter: params.get("session") === "starter",
  }));
  useEffect(() => { consumePracticeFocus(drill); }, [drill]);
  return arrival;
}

/** The current time, refreshed every `ms` while `active`, for clocks. */
export function useNow(active: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}

export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

/**
 * A drill's last setup on this device and account: a convenience, so a
 * counter's custom session comes back next time. Read synchronously (the
 * drills mount after hydration) and never required.
 */
export function readSetupMemory<T extends object>(key: string): Partial<T> | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(accountStorage.getItem(key) ?? "null");
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : undefined;
  } catch {
    return undefined;
  }
}
export function writeSetupMemory<T extends object>(key: string, value: T) {
  try { accountStorage.setItem(key, JSON.stringify(value)); } catch { /* remembered for this visit only */ }
}

/** Saved progress for a drill, kept current while the setup screen is open (sync can bring it in later). */
export function useSavedProgress<T>(drill: DrillType, watching: boolean, usable: (state: T) => boolean) {
  const usableRef = useRef(usable);
  useEffect(() => { usableRef.current = usable; });
  const read = useCallback(() => {
    const progress = storage.progress<T>(drill);
    return progress && progress.state && usableRef.current(progress.state) ? progress : null;
  }, [drill]);
  const [progress, setProgress] = useState<DrillProgress<T> | null>(() => (watching ? read() : null));
  useEffect(() => {
    if (!watching) return;
    const load = () => setProgress(read());
    load();
    window.addEventListener("hilo-storage", load);
    return () => window.removeEventListener("hilo-storage", load);
  }, [watching, read]);
  return watching ? progress : null;
}

/**
 * The size of an element, kept current as the layout changes. Used to fit
 * a tray photo into whatever space the screen has left above the keypad.
 */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const width = node.clientWidth, height = node.clientHeight;
      setSize((current) => (current && current.width === width && current.height === height ? current : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * Keeps a callback's latest version in a ref, so timers and window listeners
 * set up once always call the current one.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; });
  return ref;
}

/** True when a key press should be left alone: typing in a field, a modifier held, or a dialog open. */
export function ignoreKey(event: KeyboardEvent, alsoButtons = false) {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return true;
  const target = event.target as Element | null;
  if (target?.closest(`input, textarea, select, [contenteditable='true']${alsoButtons ? ", button, a, [role='radio']" : ""}`)) return true;
  return Boolean(document.querySelector("[aria-modal='true']"));
}
