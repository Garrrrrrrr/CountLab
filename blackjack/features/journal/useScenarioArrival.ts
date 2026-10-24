"use client";
import { useEffect, useState } from "react";
import { cvcxLibrary, type CvcxTemplate } from "@/lib/blackjack/cvcxLibrary";
import { unsupportedScenario } from "@/lib/blackjack/scenarios";

export type ScenarioArrival =
  | { status: "none" }
  | { status: "loaded"; scenario: CvcxTemplate }
  | { status: "unsupported"; scenario: CvcxTemplate; reason: string }
  | { status: "missing"; id: string };

/** Where a saved scenario opens in the Calculator, which also reads `?scenario=`. */
export const calculatorHref = (id: string) => `/calculator?scenario=${encodeURIComponent(id)}`;

/**
 * Reads `?scenario=<id>` once, after the journal has loaded: the Calculator
 * links here with a saved scenario so a session can be logged on that game.
 * Read from location rather than useSearchParams, so the page needs no
 * Suspense boundary and the static export stays one page.
 */
export function useScenarioArrival(ready: boolean): ScenarioArrival {
  const [arrival, setArrival] = useState<ScenarioArrival>({ status: "none" });
  useEffect(() => {
    if (!ready) return;
    const id = new URLSearchParams(location.search).get("scenario");
    if (!id) return;
    const scenario = cvcxLibrary.templates().find((entry) => entry.id === id);
    if (!scenario) { setArrival({ status: "missing", id }); return; }
    const reason = unsupportedScenario(scenario.config);
    setArrival(reason ? { status: "unsupported", scenario, reason } : { status: "loaded", scenario });
  }, [ready]);
  return arrival;
}

/** Drops `?scenario=` once its form is saved or dismissed, so a reload doesn't open it again. */
export function stripScenarioParam() {
  const params = new URLSearchParams(location.search);
  if (!params.has("scenario")) return;
  params.delete("scenario");
  const search = params.toString();
  // Next's own state rides along, so its router doesn't re-resolve the page (see routerState).
  history.replaceState(history.state, "", `${location.pathname}${search ? `?${search}` : ""}${location.hash === "#log" ? "" : location.hash}`);
}
