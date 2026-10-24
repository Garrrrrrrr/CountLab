"use client";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, storage, type Settings } from "@/lib/statistics/storage";

/**
 * The reader's saved settings, kept current with sync and other tabs.
 *
 * The first render uses the defaults so server and client markup agree; the
 * saved values arrive in an effect. `ready` says which one you are looking at,
 * for the rare caller that must not act on defaults (a drill choosing its shoe).
 */
export function useSettings(): { settings: Settings; ready: boolean; update: (patch: Partial<Settings>) => void } {
  const [state, setState] = useState<{ settings: Settings; ready: boolean }>({ settings: DEFAULT_SETTINGS, ready: false });
  useEffect(() => {
    const load = () => setState({ settings: storage.settings(), ready: true });
    load();
    window.addEventListener("hilo-storage", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("hilo-storage", load);
      window.removeEventListener("storage", load);
    };
  }, []);
  const update = useCallback((patch: Partial<Settings>) => {
    const current = storage.settings();
    if ("theme" in patch && patch.theme && Object.keys(patch).length === 1) {
      storage.saveTheme(patch.theme);
      return;
    }
    storage.saveSettings({ ...current, ...patch });
  }, []);
  return { ...state, update };
}
