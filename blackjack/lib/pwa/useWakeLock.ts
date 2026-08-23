"use client";

import { useEffect } from "react";

/** Hold the display awake during active drills; unsupported browsers simply no-op. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let released = false;
    const acquire = async () => {
      if (released || document.visibilityState !== "visible") return;
      try { sentinel = await navigator.wakeLock.request("screen"); } catch { /* Low Power Mode can reject. */ }
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
