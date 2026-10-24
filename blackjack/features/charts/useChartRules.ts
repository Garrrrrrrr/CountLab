"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "@/lib/hooks/useSettings";
import { DEFAULT_TABLE_RULES, rulesFromSettings, type TableRules } from "@/lib/strategy";

const SURRENDERS = ["none", "late", "early"] as const;
const DOUBLINGS = ["any", "9-11", "10-11"] as const;

/** Rules in the query string, so a chart for a particular game can be bookmarked or shared. */
export function rulesFromQuery(query: URLSearchParams): Partial<TableRules> {
  const rules: Partial<TableRules> = {};
  const decks = Number(query.get("decks"));
  if ([1, 2, 4, 6, 8].includes(decks)) rules.decks = decks;
  if (query.get("soft17") === "s17") rules.hitSoft17 = false;
  if (query.get("soft17") === "h17") rules.hitSoft17 = true;
  if (query.get("das") === "0") rules.das = false;
  if (query.get("das") === "1") rules.das = true;
  const surrender = query.get("surrender");
  if (surrender && (SURRENDERS as readonly string[]).includes(surrender)) rules.surrender = surrender as TableRules["surrender"];
  const doubling = query.get("double");
  if (doubling && (DOUBLINGS as readonly string[]).includes(doubling)) rules.doubling = doubling as TableRules["doubling"];
  if (query.get("enhc") === "1") rules.noHoleCard = true;
  return rules;
}

export function rulesToQuery(rules: TableRules): string {
  const query = new URLSearchParams({
    decks: String(rules.decks),
    soft17: rules.hitSoft17 ? "h17" : "s17",
    das: rules.das ? "1" : "0",
    surrender: rules.surrender,
  });
  if (rules.doubling !== "any") query.set("double", rules.doubling);
  if (rules.noHoleCard) query.set("enhc", "1");
  return query.toString();
}

const sameRules = (a: TableRules, b: TableRules) => (Object.keys(a) as (keyof TableRules)[]).every((key) => a[key] === b[key]);

/**
 * The rules a chart page shows. They start from the link if it names any,
 * otherwise from the reader's saved table rules, and edits stay on the page
 * (and in its URL) until the reader chooses to save them as their own.
 */
export function useChartRules() {
  const { settings, ready, update } = useSettings();
  const saved = useMemo(() => rulesFromSettings(settings), [settings]);
  const [rules, setRulesState] = useState<TableRules>(DEFAULT_TABLE_RULES);
  const initialised = useRef(false);

  useEffect(() => {
    if (!ready || initialised.current) return;
    initialised.current = true;
    const fromLink = rulesFromQuery(new URLSearchParams(window.location.search));
    setRulesState({ ...saved, ...fromLink });
  }, [ready, saved]);

  const setRules = useCallback((next: TableRules) => {
    setRulesState(next);
    const url = `${window.location.pathname}?${rulesToQuery(next)}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, []);

  /** Saves the four rules Settings stores. Doubling restrictions and ENHC stay chart-only. */
  const saveAsMine = useCallback(() => {
    update({ decks: rules.decks, dealerHitsSoft17: rules.hitSoft17, doubleAfterSplit: rules.das, surrender: rules.surrender });
  }, [rules, update]);

  const differsFromSaved = ready && !sameRules({ ...rules, doubling: "any", noHoleCard: false }, saved);
  return { rules, setRules, saved, ready, differsFromSaved, saveAsMine, resetToSaved: () => setRules(saved) };
}
