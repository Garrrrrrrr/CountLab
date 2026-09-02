"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ChartGrid from "@/components/ChartGrid";
import { Panel, Select, Switch, Tabs } from "@/components/ui";
import { BJA_H17_SECTIONS, CHART_DEALERS, chartToken, formatToken } from "@/lib/blackjack/bjaH17Chart";
import type { ChartSectionId } from "@/lib/blackjack/bjaH17Chart";
import { explainToken } from "@/lib/blackjack/chartEntry";
import { deviationGridCells } from "@/lib/blackjack/deviationChart";
import type { DeviationCell as DeviationMarker } from "@/lib/blackjack/deviationChart";
import { DEVIATION_RANKING, DEVIATION_RANKING_METADATA } from "@/lib/blackjack/deviationRanking";
import type { DeviationRankingProfile } from "@/lib/blackjack/deviationRanking";
import { deviationSentence } from "@/lib/blackjack/deviations";
import { chartCell } from "@/lib/blackjack/strategyChart";
import type { StrategyChartRules, StrategySectionId } from "@/lib/blackjack/strategyChart";
import type { Action } from "@/lib/blackjack/types";
import { storage } from "@/lib/statistics/storage";

type ChartTab = "strategy" | "deviations" | "h17";
type SectionTab = StrategySectionId;

const DEFAULT_RULES: StrategyChartRules = {
  decks: 6,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  surrender: "late",
  doubleRule: "any",
  europeanNoHoleCard: false,
};

const SECTIONS: Array<{ id: StrategySectionId; label: string; description: string }> = [
  { id: "hard", label: "Hard totals", description: "Hands with no usable ace" },
  { id: "soft", label: "Soft totals", description: "Hands containing an ace counted as 11" },
  { id: "pairs", label: "Pairs", description: "Split decisions" },
];

const ACTION_STYLE: Record<Action, string> = {
  H: "border-sky-800 bg-sky-700 text-white",
  S: "border-slate-800 bg-slate-700 text-white",
  D: "border-amber-600 bg-amber-400 text-slate-950",
  P: "border-violet-800 bg-violet-700 text-white",
  R: "border-rose-800 bg-rose-700 text-white",
};

const INDEX_TAG_STYLE: Record<Action, string> = {
  H: "bg-sky-950 text-white ring-1 ring-white/80",
  S: "bg-slate-950 text-white ring-1 ring-white/80",
  D: "bg-amber-950 text-amber-100 ring-1 ring-white/80",
  P: "bg-violet-950 text-violet-100 ring-1 ring-white/80",
  R: "bg-rose-950 text-rose-100 ring-1 ring-white/80",
};

const ACTION_LABEL: Record<Action, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
};

const H17_TOKEN_STYLE: Record<string, string> = {
  Y: "border-violet-800 bg-violet-700 text-white",
  N: "border-slate-700 bg-slate-800 text-white",
  "Y/N": "border-violet-700 bg-violet-950 text-violet-100",
  H: ACTION_STYLE.H,
  S: ACTION_STYLE.S,
  D: ACTION_STYLE.D,
  Ds: "border-amber-700 bg-amber-950 text-amber-100",
  SUR: ACTION_STYLE.R,
  index: "border-[var(--count-warm)] bg-[var(--count-warm)] text-slate-950",
};

const H17_LEGEND = [
  ["Y", "Split"],
  ["N", "Do not split / surrender"],
  ["H", "Hit"],
  ["S", "Stand"],
  ["D", "Double"],
  ["Ds", "Double, otherwise stand"],
  ["SUR", "Surrender"],
] as const;

function indexLabel(index: number, atOrBelow: boolean) {
  return (index > 0 ? "+" : "") + String(index) + (atOrBelow ? "−" : "+");
}

function rankingProfile(rules: StrategyChartRules): DeviationRankingProfile {
  return (rules.dealerHitsSoft17 ? "h17" : "s17") + (rules.surrender === "none" ? "-no-ls" : "-ls") as DeviationRankingProfile;
}

function deviationDescription(marker: DeviationMarker, profile: DeviationRankingProfile) {
  const rankingId = (marker.row.row as { id?: string }).id;
  const ranking = rankingId ? DEVIATION_RANKING[profile][rankingId] : undefined;
  const explanation = deviationSentence(marker.row.row, marker.row.transition);
  if (!ranking) return explanation + " EV impact has not yet been measured.";
  return explanation + " EV impact " + (ranking[0] >= 0 ? "+" : "") + ranking[0].toFixed(3) + " units per 100 rounds; fires " + ranking[2].toFixed(2) + " times per 100 rounds.";
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
  showIndex = false,
}: {
  rules: StrategyChartRules;
  section: StrategySectionId;
  row: string;
  dealer: string;
  marker?: DeviationMarker;
  profile: DeviationRankingProfile;
  showIndex?: boolean;
}) {
  const cell = chartCell(rules, section, row, dealer);
  const fallback = cell.fallback ? "; otherwise " + ACTION_LABEL[cell.fallback].toLowerCase() : "";
  const tooltipId = useId();
  const description = marker ? deviationDescription(marker, profile) : undefined;
  const [tooltip, setTooltip] = useState<{ left: number; top: number; below: boolean } | null>(null);

  const showTooltip = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const halfWidth = width / 2;
    setTooltip({
      left: Math.max(halfWidth + 8, Math.min(window.innerWidth - halfWidth - 8, rect.left + rect.width / 2)),
      top: rect.top < 140 ? rect.bottom + 8 : rect.top - 8,
      below: rect.top < 140,
    });
  };

  return (
    <div
      aria-label={row + " versus dealer " + dealer + ": " + ACTION_LABEL[cell.action] + fallback}
      aria-describedby={tooltip ? tooltipId : undefined}
      className={["relative grid h-8 min-w-8 place-items-center rounded border font-data text-base font-bold", ACTION_STYLE[cell.action]].join(" ")}
      title={marker ? undefined : ACTION_LABEL[cell.action] + fallback}
      tabIndex={marker ? 0 : undefined}
      onMouseEnter={marker ? (event) => showTooltip(event.currentTarget) : undefined}
      onMouseLeave={marker ? () => setTooltip(null) : undefined}
      onFocus={marker ? (event) => showTooltip(event.currentTarget) : undefined}
      onBlur={marker ? () => setTooltip(null) : undefined}
    >
      <span>
        {cell.action}
        {cell.fallback && <sub className="ml-px text-[0.62em] font-semibold">{cell.fallback.toLowerCase()}</sub>}
      </span>
      {marker && (
        <span
          className={showIndex
            ? ["absolute bottom-0.5 right-0.5 rounded-sm px-0.5 py-px text-[0.6rem] font-bold leading-none shadow-sm", INDEX_TAG_STYLE[marker.row.transition.departure as Action]].join(" ")
            : "absolute right-0.5 top-0.5 text-[0.58rem] leading-none text-[var(--ink-muted)]"}
          aria-hidden="true"
        >
          {showIndex ? marker.row.transition.departure + " " + indexLabel(marker.index, marker.atOrBelow) : "•"}
        </span>
      )}
      {tooltip && description && createPortal(
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none fixed z-[100] w-[min(20rem,calc(100vw-1rem))] rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] px-3 py-2 text-left font-sans text-xs font-medium leading-5 text-[var(--ink)] shadow-xl"
          style={{ left: tooltip.left, top: tooltip.top, transform: `translateX(-50%)${tooltip.below ? "" : " translateY(-100%)"}` }}
        >
          {description}
        </span>,
        document.body,
      )}
    </div>
  );
}

function H17Cell({ section, row, dealer }: { section: ChartSectionId; row: string; dealer: string }) {
  const chartSection = BJA_H17_SECTIONS.find((candidate) => candidate.id === section)!;
  const token = chartToken(chartSection, row, dealer);
  const value = formatToken(token);
  const style = token.kind === "index" ? H17_TOKEN_STYLE.index : H17_TOKEN_STYLE[token.value];

  return (
    <div
      aria-label={`${row} versus dealer ${dealer}: ${explainToken(section, token)}`}
      className={["grid h-8 min-w-8 place-items-center rounded border font-data text-sm font-bold", style].join(" ")}
      title={explainToken(section, token)}
    >
      {value}
    </div>
  );
}

function H17Grid({ section }: { section: ChartSectionId }) {
  const chartSection = BJA_H17_SECTIONS.find((candidate) => candidate.id === section)!;
  return (
    <div className="relative">
      <div className="-mx-1 snap-x snap-mandatory overflow-x-auto scroll-pl-10 px-1" data-testid={`h17-reference-rail-${section}`}>
        <table className="w-full min-w-[31rem] table-fixed border-separate border-spacing-px text-center text-xs xl:min-w-0">
          <caption className="sr-only">{chartSection.label} H17 deviation chart</caption>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-10 bg-[var(--paper-raised)] px-1 text-left text-[0.65rem] font-semibold uppercase tracking-[.12em] text-[var(--ink-muted)]">Hand</th>
              {CHART_DEALERS.map((dealer) => <th key={dealer} className="px-0.5 pb-0.5 text-xs font-semibold text-[var(--ink-muted)]">{dealer}</th>)}
            </tr>
          </thead>
          <tbody>
            {chartSection.rows.map((row) => (
              <tr key={row}>
                <th scope="row" className="sticky left-0 z-20 w-10 bg-[var(--paper-raised)] px-1 text-left text-xs font-medium text-[var(--ink)]">{row}</th>
                {CHART_DEALERS.map((dealer) => (
                  <td key={dealer} className="snap-start scroll-ml-10">
                    <H17Cell section={section} row={row} dealer={dealer} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function StrategyChartPage({ initialTab = "strategy" }: { initialTab?: ChartTab }) {
  const [tab, setTab] = useState<ChartTab>(initialTab);
  const [section, setSection] = useState<SectionTab>("hard");
  const [h17Section, setH17Section] = useState<ChartSectionId>("hard");
  const [rules, setRules] = useState<StrategyChartRules>(DEFAULT_RULES);

  useEffect(() => {
    setRules(settingsRules());
  }, []);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

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
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[100rem] flex-col px-3 py-4 sm:px-5 lg:px-6">
      <h1 className="mb-3 font-display text-2xl text-[var(--ink)] sm:text-3xl">{tab === "strategy" ? "Basic strategy chart" : tab === "deviations" ? "Index deviation chart" : "H17 deviation chart"}</h1>

      {tab !== "h17" && <details className="surface mb-3 rounded-[1.35rem]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm marker:hidden sm:px-5">
          <span className="font-semibold text-[var(--ink)]">Table rules</span>
          <span className="font-data text-xs text-[var(--ink-muted)]">{rules.decks}D · {rules.dealerHitsSoft17 ? "H17" : "S17"} · {rules.doubleAfterSplit ? "DAS" : "No DAS"} · {rules.surrender} surrender</span>
        </summary>
        <div className="border-t border-[var(--rule)] p-4 sm:p-5">
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
        </div>
      </details>}

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "strategy", label: "Strategy" },
          { value: "deviations", label: "Index deviations" },
          { value: "h17", label: "H17 chart" },
        ]}
        className="mb-3"
      />
      {tab === "h17" ? (
        <Tabs
          value={h17Section}
          onChange={setH17Section}
          label="H17 chart section"
          items={BJA_H17_SECTIONS.map(({ id, label }) => ({ value: id, label }))}
          className="mb-3"
        />
      ) : (
        <Tabs
          value={section}
          onChange={setSection}
          label="Hand type"
          items={SECTIONS.map(({ id, label }) => ({ value: id, label }))}
          className="mb-3"
        />
      )}

      {tab === "strategy" ? (
        <div className="space-y-4">
          <Panel className="flex flex-wrap gap-x-4 gap-y-1.5 p-3 text-xs text-[var(--ink-muted)]">
            {(["H", "S", "D", "P", "R"] as Action[]).map((action) => (
              <span key={action} className="inline-flex items-center gap-2">
                <span className={["grid size-6 place-items-center rounded border font-data font-bold", ACTION_STYLE[action]].join(" ")}>{action}</span>
                {ACTION_LABEL[action]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1"><span className="font-data font-bold">D<sub className="text-[0.62em]">s</sub></span> double, otherwise stand</span>
          </Panel>

          {SECTIONS.filter(({ id }) => id === section).map((section) => (
            <Panel key={section.id} className="overflow-hidden p-3 sm:p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
                <h2 className="font-display text-xl text-[var(--ink)]">{section.label}</h2>
                <p className="text-xs text-[var(--ink-muted)]">{section.description}</p>
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
      ) : tab === "deviations" ? (
        <div className="space-y-4">
          <Panel className="p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-display text-xl text-[var(--ink)]">Index deviations</h2>
              <p className="text-xs text-[var(--ink-muted)]">Every cell keeps its basic-strategy action. Badge: departure and true-count index.</p>
            </div>
            <p className="mt-2 rounded-lg border border-[var(--count-warm)]/25 bg-[color:color-mix(in_srgb,var(--count-warm)_10%,transparent)] px-3 py-2 text-sm text-[var(--ink)]">
              Insurance: take at TC +3 or above.
            </p>
            <p className="mt-2 text-xs text-[var(--ink-muted)]"><span className="font-data font-bold text-sky-700 dark:text-sky-300">H</span> = basic strategy; <span className="rounded-sm bg-slate-950 px-0.5 py-px font-data font-bold text-white ring-1 ring-white/80">S +2</span> = stand at TC +2 or above.</p>
            {rules.decks !== 6 && <p className="mt-2 text-xs text-[var(--ink-muted)]">The indices shown are the 4–8 deck sets.</p>}
          </Panel>

          {SECTIONS.filter(({ id }) => id === section).map((section) => (
            <Panel key={section.id} className="overflow-hidden p-3 sm:p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
                <h2 className="font-display text-xl text-[var(--ink)]">{section.label}</h2>
                <p className="text-xs text-[var(--ink-muted)]">{section.description}</p>
              </div>
              <ChartGrid
                section={section.id}
                label={section.label + " index deviations"}
                renderCell={(row, dealer) => (
                  <StrategyCell
                    rules={rules}
                    section={section.id}
                    row={row}
                    dealer={dealer}
                    marker={deviationCells.get(section.id + ":" + row + "v" + dealer)}
                    profile={profile}
                    showIndex
                  />
                )}
              />
            </Panel>
          ))}

          <Panel className="space-y-2 p-3 text-xs leading-5 text-[var(--ink-muted)]">
            <p>
              <b className="text-[var(--ink)]">EV impact</b> is units won per 100 rounds by adding that one departure to basic strategy, on {DEVIATION_RANKING_METADATA.game.toLowerCase()} with a {DEVIATION_RANKING_METADATA.ramp} bet ramp. <b className="text-[var(--ink)]">Fires</b> is how often in 100 rounds it actually changes a decision.
            </p>
            <p>
              Measured over {DEVIATION_RANKING_METADATA.rounds.toLocaleString()} rounds per profile with {DEVIATION_RANKING_METADATA.replications} paired replications per triggered decision — {DEVIATION_RANKING_METADATA.method}. Widest 95% interval on this table: ±{widestInterval.toFixed(3)}.
            </p>
            <p>{DEVIATION_RANKING_METADATA.limit}, so treat the column total as close but not exact.</p>
          </Panel>
        </div>
      ) : (
        <div className="space-y-4">
          <Panel className="p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-display text-xl text-[var(--ink)]">Complete H17 chart</h2>
              <p className="text-xs text-[var(--ink-muted)]">The answer key for the H17 chart recall drill.</p>
            </div>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">Fixed 6-deck H17 rules with DAS and late surrender. Gold cells are Hi-Lo deviations; the suffix shows whether the play changes at that count or beyond.</p>
            <p className="mt-2 rounded-lg border border-[var(--count-warm)]/25 bg-[color:color-mix(in_srgb,var(--count-warm)_10%,transparent)] px-3 py-2 text-sm text-[var(--ink)]">Insurance or even money: take at TC +3 or above.</p>
          </Panel>

          <Panel className="flex flex-wrap gap-x-4 gap-y-1.5 p-3 text-xs text-[var(--ink-muted)]">
            {H17_LEGEND.map(([token, label]) => (
              <span key={token} className="inline-flex items-center gap-2">
                <span className={["grid min-h-6 min-w-6 place-items-center rounded border px-1 font-data font-bold", H17_TOKEN_STYLE[token]].join(" ")}>{token}</span>
                {label}
              </span>
            ))}
            <span className="inline-flex items-center gap-2"><span className={["grid min-h-6 min-w-6 place-items-center rounded border px-1 font-data font-bold", H17_TOKEN_STYLE.index].join(" ")}>4+</span>At TC +4 or above</span>
          </Panel>

          <Panel className="overflow-hidden p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="font-display text-xl text-[var(--ink)]">{BJA_H17_SECTIONS.find(({ id }) => id === h17Section)?.label}</h2>
              <p className="text-xs text-[var(--ink-muted)]">Read your hand across to the dealer&apos;s upcard.</p>
            </div>
            <H17Grid section={h17Section} />
          </Panel>

          <p className="text-xs leading-5 text-[var(--ink-muted)]">Chart source: Blackjack Apprenticeship, H17 Deviation Chart (2018), with one house addition: soft 20 doubles versus 4, 5 and 6 at +6, +5 and +4.</p>
        </div>
      )}
    </main>
  );
}
