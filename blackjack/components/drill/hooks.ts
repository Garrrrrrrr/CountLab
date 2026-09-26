"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "@/lib/statistics/storage";

/** "m:ss" for drill clocks and summary tiles. */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Single-key shortcuts for the active drill (e.g. { h: hit, p: pause }).
 * Ignored while typing in a field, while a dialog is open, with modifier
 * keys, and when the reader turned keyboard shortcuts off in Settings.
 */
export function useDrillKeys(bindings: Record<string, () => void>, enabled = true) {
  const current = useRef(bindings);
  useEffect(() => { current.current = bindings; });
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as Element | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[aria-modal='true']")) return;
      if (!storage.settings().shortcuts) return;
      const action = current.current[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/**
 * A drill's last setup choices on this device. Starts from `defaults` (so the
 * prerendered page and first client render agree) and restores after mount.
 */
export function useDrillSetupPref<T extends object>(key: string, defaults: T): [T, (next: Partial<T>) => void, boolean] {
  const [value, setValue] = useState(defaults);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved && typeof saved === "object") setValue((current) => ({ ...current, ...saved }));
    } catch { /* keep the defaults */ }
    setRestored(true);
  }, [key]);
  const update = useCallback((next: Partial<T>) => {
    setValue((current) => {
      const merged = { ...current, ...next };
      try { localStorage.setItem(key, JSON.stringify(merged)); } catch { /* remembered for this visit only */ }
      return merged;
    });
  }, [key]);
  return [value, update, restored];
}
