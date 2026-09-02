"use client";

import { useEffect, useMemo, useState } from "react";
import ChartGrid from "@/components/ChartGrid";
import { Panel, Select, Switch, Tabs } from "@/components/ui";
import { deviationGridCells } from "@/lib/blackjack/deviationChart";
import type { DeviationCell as DeviationMarker } from "@/lib/blackjack/deviationChart";
import { DEVIATION_RANKING, DEVIATION_RANKING_METADATA } from "@/lib/blackjack/deviationRanking";
import type { DeviationRankingProfile } from "@/lib/blackjack/deviationRanking";
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

function indexLabel(index: number, atOrBelow: boolean) {
  return (index > 0 ? "+" : "") + String(index) + (atOrBelow ? "−" : "+");
}

function rankingProfile(rules: StrategyChartRules): DeviationRankingProfile {
  return (rules.dealerHitsSoft17 ? "h17" : "s17") + (rules.surrender === "none" ? "-no-ls" : "-ls") as DeviationRankingProfile;
}

function deviationTitle(marker: DeviationMarker, profile: DeviationRankingProfile) {
  const transition = marker.row.transition;
  const rankingId = (marker.row.row as { id?: string }).id;
  const ranking = rankingId ? DEVIATION_RANKING[profile][rankingId] : undefined;
  const index = "TC " + indexLabel(marker.index, marker.atOrBelow);
  const play = transition.departure + " at " + index + "; otherwise " + transition.baseline + ".";
  if (!ranking) return play + " EV impact has not yet been measured.";
  return play + " EV impact " + (ranking[0] >= 0 ? "+" : "") + ranking[0].toFixed(3) + " units per 100 rounds; fires " + ranking[2].toFixed(2) + " times per 100 rounds.";
}

function settingsRules(): StrategyChartRules {
  const settings = storage.settings();
  return {
    ...DEFAULT_RULES,
    decks: [1, 2, 4, 6, 8].includes(settings.decks) ? settings.decks : 6,
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
  marker,
  profile,
}: {
  rules: StrategyChartRules;
  section: StrategySectionId;
  row: string;
  dealer: string;
  marker?: DeviationMarker;
  profile: DeviationRankingProfile;
}) {
  const cell = chartCell(rules, section, row, dealer);
  const fallback = cell.fallback ? "; otherwise " + ACTION_LABEL[cell.fallback].toLowerCase() : "";

  return (
    <div
      aria-label={row + " versus dealer " + dealer + ": " + ACTION_LABEL[cell.action] + fallback}
      className={["relative grid h-11 min-w-11 place-items-center rounded-md border font-data text-base font-bold", ACTION_STYLE[cell.action]].join(" ")}
      title={marker ? deviationTitle(marker, profile) : ACTION_LABEL[cell.action] + fallback}
    >
      <span>
        {cell.action}
        {cell.fallback && <sub className="ml-px text-[0.62em] font-semibold">{cell.fallback.toLowerCase()}</sub>}
      </span>
      {marker && <span className="absolute right-0.5 top-0.5 text-[0.58rem] leading-none text-[var(--ink-muted)]" aria-hidden="true">•</span>}
    </div>
  );
}

function DeviationGridCell({ marker, profile }: { marker?: DeviationMarker; profile: DeviationRankingProfile }) {
  if (!marker) {
    return <div className="grid h-11 min-w-11 place-items-center rounded-md border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-muted)]">—</div>;
  }
  const action = marker.row.transition.departure as Action;
  return (
    <div
      className={["grid h-11 min-w-11 place-items-center rounded-md border font-data font-bold", ACTION_STYLE[action]].join(" ")}
      title={deviationTitle(marker, profile)}
    >
      <span>{action} <small className="text-[0.6em] font-semibold">{indexLabel(marker.index, marker.atOrBelow)}</small></span>
    </div>
  );
}

export default function StrategyChartPage() {
  const [tab, setTab] = useState<ChartTab>("strategy");
  const [rules, setRules] = useState<StrategyChartRules>(DEFAULT_RULES);

  useEffect(() => {
    setRules(settingsRules());
  }, []);

  const profile = rankingProfile(rules);
  const deviationCells = useMemo(
    () => deviationGridCells({ dealerHitsSoft17: rules.dealerHitsSoft17, lateSurrender: rules.surrender === "late" }),
    [rules.dealerHitsSoft17, rules.surrender],
  );
  const widestInterval = useMemo(
    () => Math.max(0, ...Object.values(DEVIATION_RANKING[profile]).map((entry) => 1.96 * entry[1])),
    [profile],
  );

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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Select
            label="Decks"
            value={String(rules.decks)}
            onChange={(event) => setRules((current) => ({ ...current, decks: Number(event.target.value) }))}
          >
            <option value="1">1 deck</option>
            <option value="2">2 decks</option>
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
          <Select
            label="Surrender"
            value={rules.surrender}
            onChange={(event) => setRules((current) => ({ ...current, surrender: event.target.value as StrategyChartRules["surrender"] }))}
          >
            <option value="none">No surrender</option>
            <option value="late">Late surrender</option>
            <option value="early">Early surrender</option>
          </Select>
          <Select
            label="Double rule"
            value={rules.doubleRule}
            onChange={(event) => setRules((current) => ({ ...current, doubleRule: event.target.value as StrategyChartRules["doubleRule"] }))}
          >
            <option value="any">Any two cards</option>
            <option value="9-11">Hard 9–11 only</option>
            <option value="10-11">Hard 10–11 only</option>
          </Select>
          <Switch
            label="European no-hole-card (ENHC)"
            checked={rules.europeanNoHoleCard}
            onChange={(europeanNoHoleCard) => setRules((current) => ({ ...current, europeanNoHoleCard }))}
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
                renderCell={(row, dealer) => (
                  <StrategyCell
                    rules={rules}
                    section={section.id}
                    row={row}
                    dealer={dealer}
                    marker={deviationCells.get(section.id + ":" + row + "v" + dealer)}
                    profile={profile}
                  />
                )}
              />
            </Panel>
          ))}

          <p className="text-sm text-[var(--ink-muted)]">
            Hard totals 5–7 always hit; hard totals 18–21 always stand.{rules.surrender === "early" ? " With early surrender, hard 5–7 versus an ace surrender." : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <Panel>
            <h2 className="font-display text-2xl text-[var(--ink)]">Index deviations</h2>
            <p className="mt-2 text-[var(--ink-muted)]">The action and signed true-count index in each marked cell are the departure from basic strategy.</p>
            <p className="mt-4 rounded-lg border border-[var(--count-warm)]/25 bg-[color:color-mix(in_srgb,var(--count-warm)_10%,transparent)] px-3 py-2 text-sm text-[var(--ink)]">
              Insurance: take at TC +3 or above.
            </p>
            {rules.decks !== 6 && <p className="mt-3 text-sm text-[var(--ink-muted)]">The indices shown are the 4–8 deck sets.</p>}
          </Panel>

          {SECTIONS.map((section) => (
            <Panel key={section.id} className="overflow-hidden">
              <div className="mb-4">
                <h2 className="font-display text-2xl text-[var(--ink)]">{section.label}</h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{section.description}</p>
              </div>
              <ChartGrid
                section={section.id}
                label={section.label + " index deviations"}
                renderCell={(row, dealer) => (
                  <DeviationGridCell marker={deviationCells.get(section.id + ":" + row + "v" + dealer)} profile={profile} />
                )}
              />
            </Panel>
          ))}

          <Panel className="space-y-2 text-xs leading-5 text-[var(--ink-muted)]">
            <p>
              <b className="text-[var(--ink)]">EV impact</b> is units won per 100 rounds by adding that one departure to basic strategy, on {DEVIATION_RANKING_METADATA.game.toLowerCase()} with a {DEVIATION_RANKING_METADATA.ramp} bet ramp. <b className="text-[var(--ink)]">Fires</b> is how often in 100 rounds it actually changes a decision.
            </p>
            <p>
              Measured over {DEVIATION_RANKING_METADATA.rounds.toLocaleString()} rounds per profile with {DEVIATION_RANKING_METADATA.replications} paired replications per triggered decision — {DEVIATION_RANKING_METADATA.method}. Widest 95% interval on this table: ±{widestInterval.toFixed(3)}.
            </p>
            <p>{DEVIATION_RANKING_METADATA.limit}, so treat the column total as close but not exact.</p>
          </Panel>
        </div>
      )}
    </main>
  );
}
