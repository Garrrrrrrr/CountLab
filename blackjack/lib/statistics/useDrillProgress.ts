import { useEffect, useRef } from "react";
import { DrillType, storage } from "./storage";

/**
 * Reads any progress saved for `drill` once, synchronously, so components can
 * seed their initial useState values from it (avoids a setup-then-resume flash).
 */
export function loadDrillProgress<T>(drill: DrillType): T | undefined {
  return storage.progress<T>(drill)?.state;
}

/**
 * Debounced auto-save of `state` while `active` is true, so a reload or a
 * switch to another device picks the drill back up mid-session. Call
 * `storage.clearProgress(drill)` when a session finishes or is ended early.
 */
export function useDrillProgress<T>(drill: DrillType, active: boolean, state: T) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const serialized = JSON.stringify(state);
  useEffect(() => {
    if (!active) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => storage.saveProgress(drill, JSON.parse(serialized)), 400);
    return () => clearTimeout(timer.current);
  }, [drill, active, serialized]);
}
