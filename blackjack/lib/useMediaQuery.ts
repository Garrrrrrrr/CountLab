"use client";
import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, read without a hydration mismatch: the
 * prerendered HTML and the first client render both use `serverValue`.
 */
export function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    (onChange) => {
      const media = matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => matchMedia(query).matches,
    () => serverValue,
  );
}

const noSubscription = () => () => {};
/** False in prerendered HTML and during hydration, true once the client has taken over. */
export function useHydrated() {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}
