"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chartRulesFromSettings, DEFAULT_CHART_RULES } from "@/lib/blackjack/referenceChartModel";
import type { StrategyChartRules } from "@/lib/blackjack/strategyChart";
import { storage } from "@/lib/statistics/storage";
import type { SurrenderRule } from "@/lib/statistics/storage";
import { accountStorage } from "@/lib/supabase/accountStorage";
import { onCurrentUserChange } from "@/lib/supabase/currentUser";

/** Long enough that arrowing across the options saves once, for the option the reader stopped on. */
const SAVE_DELAY_MS = 600;

/** Re-read saved rules whenever they may have changed: another tab, a sync pull, or signing in or out. */
function useSettingsReload(load: () => void) {
  useEffect(() => {
    load();
    addEventListener("hilo-storage", load);
    const stop = onCurrentUserChange(load);
    return () => { removeEventListener("hilo-storage", load); stop(); };
  }, [load]);
}

/**
 * The saved surrender rule, which the chart pages share with every drill.
 *
 * It is the one rule these pages save. Picking the option already chosen
 * saves nothing, and a burst of choices (arrowing across the options) saves
 * once, for the last one, after a short pause or when the page is left.
 * `savedAt` changes each time a save actually lands.
 */
export function useSavedSurrender() {
  const [surrender, setSurrender] = useState<SurrenderRule>(DEFAULT_CHART_RULES.surrender);
  const [savedAt, setSavedAt] = useState(0);
  const shown = useRef<SurrenderRule>(DEFAULT_CHART_RULES.surrender);
  const pending = useRef<SurrenderRule | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(() => {
    // A choice still waiting to be saved outranks the stored one.
    if (pending.current !== null) return;
    shown.current = storage.settings().surrender;
    setSurrender(shown.current);
  }, []);
  useSettingsReload(load);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    const settings = storage.settings();
    if (settings.surrender === value) return;
    storage.saveSettings({ ...settings, surrender: value });
    setSavedAt(Date.now());
  }, []);
  useEffect(() => {
    addEventListener("pagehide", flush);
    return () => { removeEventListener("pagehide", flush); flush(); };
  }, [flush]);

  const choose = useCallback((value: SurrenderRule) => {
    if (value === shown.current) return false;
    shown.current = value;
    setSurrender(value);
    pending.current = value;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
    return true;
  }, [flush]);

  return { surrender, choose, savedAt };
}

type LocalRule = "decks" | "dealerHitsSoft17" | "doubleAfterSplit" | "doubleRule" | "europeanNoHoleCard";

/**
 * The rules the chart is drawn for. Surrender is saved (see above); decks,
 * the soft-17 rule and double after split start from the saved settings but
 * changes to them stay on this page, and the double restriction and hole-card
 * rule are never saved at all. A saved rule the reader has not touched this
 * visit keeps following the saved settings, so signing in or editing Settings
 * in another tab updates the chart.
 */
export function useChartRules() {
  const { surrender, choose: chooseSurrender, savedAt } = useSavedSurrender();
  const [local, setLocal] = useState<Omit<StrategyChartRules, "surrender">>(DEFAULT_CHART_RULES);
  const [saved, setSaved] = useState<StrategyChartRules>(DEFAULT_CHART_RULES);
  const [hasSavedRules, setHasSavedRules] = useState(false);
  const edited = useRef(new Set<LocalRule>());

  const load = useCallback(() => {
    const next = chartRulesFromSettings(storage.settings());
    setSaved(next);
    setHasSavedRules(accountStorage.getItem("hilo:settings") !== null);
    setLocal((current) => ({
      ...current,
      decks: edited.current.has("decks") ? current.decks : next.decks,
      dealerHitsSoft17: edited.current.has("dealerHitsSoft17") ? current.dealerHitsSoft17 : next.dealerHitsSoft17,
      doubleAfterSplit: edited.current.has("doubleAfterSplit") ? current.doubleAfterSplit : next.doubleAfterSplit,
    }));
  }, []);
  useSettingsReload(load);

  const rules = useMemo<StrategyChartRules>(() => ({ ...local, surrender }), [local, surrender]);

  const setRule = useCallback(<K extends LocalRule>(key: K, value: StrategyChartRules[K]) => {
    setLocal((current) => {
      if (current[key] === value) return current;
      edited.current.add(key);
      return { ...current, [key]: value };
    });
  }, []);

  const reset = useCallback(() => {
    edited.current.clear();
    setLocal({ ...chartRulesFromSettings(storage.settings()) });
  }, []);

  /** Rules that differ from the saved table (or, for the unsaved rules, from their defaults). */
  const differences = [
    local.decks !== saved.decks,
    local.dealerHitsSoft17 !== saved.dealerHitsSoft17,
    local.doubleAfterSplit !== saved.doubleAfterSplit,
    local.doubleRule !== DEFAULT_CHART_RULES.doubleRule,
    local.europeanNoHoleCard !== DEFAULT_CHART_RULES.europeanNoHoleCard,
  ].filter(Boolean).length;
  const moreRulesChanged = [local.doubleRule !== "any", local.europeanNoHoleCard].filter(Boolean).length;

  return { rules, saved, hasSavedRules, setRule, chooseSurrender, reset, differences, moreRulesChanged, savedAt };
}
