"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during prerender and the hydrating render, true after. Use it to gate anything read from the browser. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
