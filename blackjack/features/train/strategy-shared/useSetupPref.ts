"use client";
import { useCallback, useState } from "react";
import { accountStorage } from "@/lib/supabase/accountStorage";

/**
 * A drill's last setup choices (focus, round length, explain mode), kept per
 * account on this device so the next visit opens where the reader left off.
 * Drill pages mount only after sign-in has settled, never during hydration,
 * so reading storage in the initializer cannot mismatch prerendered markup.
 */
export function useSetupPref<T extends object>(slug: string, defaults: T, clean: (raw: Partial<T>) => T): [T, (patch: Partial<T>) => void] {
  const key = `countlab:drill-setup:${slug}`;
  const [pref, setPref] = useState<T>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      return clean({ ...defaults, ...(JSON.parse(accountStorage.getItem(key) ?? "{}") as Partial<T>) });
    } catch {
      return defaults;
    }
  });
  const remember = useCallback((patch: Partial<T>) => {
    setPref((current) => {
      const next = { ...current, ...patch };
      try { accountStorage.setItem(key, JSON.stringify(next)); } catch { /* A full or blocked store only loses the preference. */ }
      return next;
    });
  }, [key]);
  return [pref, remember];
}
