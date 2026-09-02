"use client";

import { useEffect, useState } from "react";
import ChartGrid from "@/components/ChartGrid";
import { Panel, Select, Switch, Tabs } from "@/components/ui";
import { chartCell } from "@/lib/blackjack/strategyChart";
import type { StrategyChartRules, StrategySectionId } from "@/lib/blackjack/strategyChart";
import type { Action } from "@/lib/blackjack/types";
import { storage } from "@/lib/statistics/storage";

type ChartTab = "strategy" | "deviations";

const DEFAULT_RULES: StrategyChartRules = {
  decks: 6,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  surrender: "late",
  doubleRule: "any",
  europeanNoHoleCard: false,
};

const SECTIONS: Array<{ id: StrategySectionId; label: string; description: string }> = [
  { id: "pairs", label: "Pairs", description: "Split decisions" },
  { id: "soft", label: "Soft totals", description: "Hands containing an ace counted as 11" },
  { id: "hard", label: "Hard totals", description: "Hands with no usable ace" },
];

const ACTION_STYLE: Record<Action, string> = {
  H: "border-[var(--count-cold)]/30 bg-[color:color-mix(in_srgb,var(--count-cold)_12%,transparent)] text-[var(--count-cold)]",
  S: "border-[var(--ink-muted)]/30 bg-[var(--paper)] text-[var(--ink)]",
  D: "border-[var(--count-warm)]/35 bg-[color:color-mix(in_srgb,var(--count-warm)_14%,transparent)] text-[var(--ink)]",
  P: "border-[var(--count-hot)]/35 bg-[color:color-mix(in_srgb,var(--count-hot)_12%,transparent)] text-[var(--count-hot)]",
  R: "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300",
};

const ACTION_LABEL: Record<Action, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
};

function settingsRules(): StrategyChartRules {
  const settings = storage.settings();
  return {
    ...DEFAULT_RULES,
    decks: settings.decks === 4 || settings.decks === 6 || settings.decks === 8 ? settings.decks : 6,
    dealerHitsSoft17: settings.dealerHitsSoft17,
    doubleAfterSplit: settings.doubleAfterSplit,
    surrender: settings.lateSurrender ? "late" : "none",
  };
}

function StrategyCell({
  rules,
  section,
  row,
  dealer,
}: {
  rules: StrategyChartRules;
  section: StrategySectionId;
  row: string;
  dealer: string;
}) {
  const cell = chartCell(rules, section, row, dealer);
  const fallback = cell.fallback ? "; otherwise " + ACTION_LABEL[cell.fallback].toLowerCase() : "";

  return (
    <div
      aria-label={row + " versus dealer " + dealer + ": " + ACTION_LABEL[cell.action] + fallback}
      className={["grid h-11 min-w-11 place-items-center rounded-md border font-data text-base font-bold", ACTION_STYLE[cell.action]].join(" ")}
      title={ACTION_LABEL[cell.action] + fallback}
    >
      <span>
        {cell.action}
        {cell.fallback && <sub className="ml-px text-[0.62em] font-semibold">{cell.fallback.toLowerCase()}</sub>}
      </span>
    </div>
  );
}

export default function StrategyChartPage() {
  const [tab, setTab] = useState<ChartTab>("strategy");
  const [rules, setRules] = useState<StrategyChartRules>(DEFAULT_RULES);

  useEffect(() => {
    setRules(settingsRules());
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-7 max-w-3xl">
        <p className="mb-2 font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--count-warm)]">Reference</p>
        <h1 className="font-display text-3xl text-[var(--ink)] sm:text-4xl">Basic strategy chart</h1>
        <p className="mt-3 text-[var(--ink-muted)]">
          Set the table rules, then read your hand across to the dealer&apos;s upcard. The chart updates immediately.
        </p>
      </div>

      <Panel className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Decks"
            value={String(rules.decks)}
            onChange={(event) => setRules((current) => ({ ...current, decks: Number(event.target.value) }))}
          >
            <option value="4">4 decks</option>
            <option value="6">6 decks</option>
            <option value="8">8 decks</option>
          </Select>
          <Switch
            label="Dealer hits soft 17 (H17)"
            checked={rules.dealerHitsSoft17}
            onChange={(dealerHitsSoft17) => setRules((current) => ({ ...current, dealerHitsSoft17 }))}
          />
          <Switch
            label="Double after split (DAS)"
            checked={rules.doubleAfterSplit}
            onChange={(doubleAfterSplit) => setRules((current) => ({ ...current, doubleAfterSplit }))}
          />
          <Switch
            label="Late surrender"
            checked={rules.surrender === "late"}
            onChange={(lateSurrender) => setRules((current) => ({ ...current, surrender: lateSurrender ? "late" : "none" }))}
          />
        </div>
      </Panel>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "strategy", label: "Strategy" },
          { value: "deviations", label: "Index deviations" },
        ]}
        className="mb-6"
      />

      {tab === "strategy" ? (
        <div className="space-y-6">
          <Panel className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--ink-muted)]">
            {(["H", "S", "D", "P", "R"] as Action[]).map((action) => (
              <span key={action} className="inline-flex items-center gap-2">
                <span className={["grid size-6 place-items-center rounded border font-data font-bold", ACTION_STYLE[action]].join(" ")}>{action}</span>
                {ACTION_LABEL[action]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1"><span className="font-data font-bold">D<sub className="text-[0.62em]">s</sub></span> double, otherwise stand</span>
          </Panel>

          {SECTIONS.map((section) => (
            <Panel key={section.id} className="overflow-hidden">
              <div className="mb-4">
                <h2 className="font-display text-2xl text-[var(--ink)]">{section.label}</h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{section.description}</p>
              </div>
              <ChartGrid
                section={section.id}
                label={section.label + " basic strategy chart"}
                renderCell={(row, dealer) => <StrategyCell rules={rules} section={section.id} row={row} dealer={dealer} />}
              />
            </Panel>
          ))}

          <p className="text-sm text-[var(--ink-muted)]">Hard totals 5–7 always hit; hard totals 18–21 always stand.</p>
        </div>
      ) : (
        <Panel>
          <h2 className="font-display text-2xl text-[var(--ink)]">Index deviations</h2>
          <p className="mt-2 text-[var(--ink-muted)]">True-count deviations will be available here next.</p>
        </Panel>
      )}
    </main>
  );
}
