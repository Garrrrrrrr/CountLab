import { useEffect, useMemo, useRef } from "react";
import { createProgressScheduler, type ProgressScheduler } from "./progressScheduler";
import { DrillType, storage } from "./storage";

/**
 * Reads any progress saved for `drill` once, synchronously, so components can
 * seed their initial useState values from it (avoids a setup-then-resume flash).
 */
export function loadDrillProgress<T>(drill: DrillType): T | undefined {
  return storage.progress<T>(drill)?.state;
}

/**
 * Auto-save of `state` while `active` is true, so a reload or a switch to
 * another device picks the drill back up mid-session. Saves are debounced by
 * 400 ms, or, with `throttleMs`, written at most that often for state that
 * changes continuously. Pending state is also written when the tab is hidden,
 * the page is closed, or the drill unmounts mid-session.
 *
 * When a session finishes or is discarded, call the returned `cancel()` in the
 * same handler as `storage.clearProgress(drill)`, so no pending write can
 * bring the finished session back.
 */
export function useDrillProgress<T>(drill: DrillType, active: boolean, state: T, options: { throttleMs?: number } = {}) {
  const { throttleMs } = options;
  const scheduler = useRef<ProgressScheduler<string> | null>(null);
  const activeNow = useRef(active);
  const serialized = JSON.stringify(state);
  useEffect(() => { activeNow.current = active; });
  useEffect(() => {
    const current = createProgressScheduler<string>({
      mode: throttleMs ? "throttle" : "debounce",
      ms: throttleMs ?? 400,
      save: (json) => storage.saveProgress(drill, JSON.parse(json)),
    });
    scheduler.current = current;
    const onVisibility = () => { if (document.visibilityState === "hidden") current.flush(); };
    const onPageHide = () => current.flush();
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", onPageHide);
      if (activeNow.current) current.flush();
      else current.cancel();
      if (scheduler.current === current) scheduler.current = null;
    };
  }, [drill, throttleMs]);
  useEffect(() => {
    const current = scheduler.current;
    if (!current) return;
    if (active) current.push(serialized);
    else current.cancel();
  }, [active, serialized]);
  return useMemo(() => ({
    /** Write pending state now, e.g. right after an answer is graded. */
    flush: () => scheduler.current?.flush(),
    /** Drop pending state; call it with storage.clearProgress(drill). */
    cancel: () => scheduler.current?.cancel(),
  }), []);
}
