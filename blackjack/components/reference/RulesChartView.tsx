"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { announce, ButtonLink, Section, SegmentedControl } from "@/components/ui";
import type { SegmentOption } from "@/components/ui";
import { DEVIATION_RANKING_METADATA } from "@/lib/blackjack/deviationRanking";
import { buildRulesChart, changedCells, rankIndexPlays, rulesSummary, shortCellName, softRowTotal } from "@/lib/blackjack/referenceChartModel";
import type { ChartView, RulesSection } from "@/lib/blackjack/referenceChartModel";
import type { StrategyChartRules } from "@/lib/blackjack/strategyChart";
import type { SurrenderRule } from "@/lib/statistics/storage";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useHydrated } from "@/lib/useMediaQuery";
import { RulesCellCard } from "./CellCard";
import { CellExplainer } from "./CellExplainer";
import type { ExplainerApi } from "./CellExplainer";
import { ChartCell } from "./ChartCell";
import { ChartGrid, softRowLabel } from "./ChartGrid";
import type { CellPosition } from "./ChartGrid";
import { RulesChartKey } from "./ChartKey";
import { ChartHeader, ChartPanel, PrintButton, PrintFooter } from "./ChartPage";
import { IndexRanking } from "./IndexRanking";
import { PracticeLinks } from "./PracticeLinks";
import type { PracticeLink } from "./PracticeLinks";
import { RulesToolbar } from "./RulesToolbar";
import { useChartRules } from "./useChartRules";
import { useChartView, VIEW_PATH } from "./useChartView";

const ANALYTICS_KEY: Record<RulesSection["id"], string> = { hard: "hard_totals", soft: "soft_totals", pairs: "pairs", surrender: "surrender" };
const FLASH_MS = 1600;
const ANNOUNCE_DELAY_MS = 500;
const NO_CELLS: ReadonlySet<string> = new Set();

// Phones drop the icons, and below 400px the short labels keep both options
// inside the switch; the accessible names stay whole.
const VIEW_OPTIONS: ReadonlyArray<SegmentOption<ChartView>> = [
  {
    value: "basic",
    ariaLabel: "Basic strategy",
    label: <span className="inline-flex items-center gap-2"><i className="fa-solid fa-table-cells text-xs max-sm:!hidden" aria-hidden="true" /><span className="max-[399px]:hidden">Basic strategy</span><span className="hidden max-[399px]:inline">Basic</span></span>,
  },
  {
    value: "index",
    ariaLabel: "With index plays",
    label: <span className="inline-flex items-center gap-2"><i className="fa-solid fa-hashtag text-xs max-sm:!hidden" aria-hidden="true" /><span className="max-[399px]:hidden">With index plays</span><span className="hidden max-[399px]:inline">Index plays</span></span>,
  },
];

const PRACTICE: Record<ChartView, PracticeLink[]> = {
  basic: [
    { href: "/training/basic-strategy", title: "Basic Strategy drill", description: "Drill every hand on this chart until it's automatic.", icon: "fa-layer-group" },
    { href: "/training/deviations", title: "Deviations drill", description: "Learn when the true count changes the play.", icon: "fa-code-branch" },
    { href: "/reference/h17-chart", title: "H17 chart (printed style)", description: "The fixed 6-deck H17 chart that the recall drill grades.", icon: "fa-list-ol" },
  ],
  index: [
    { href: "/training/deviations", title: "Deviations drill", description: "Learn when the true count changes the play.", icon: "fa-code-branch" },
    { href: "/training/basic-strategy", title: "Basic Strategy drill", description: "Drill every hand on this chart until it's automatic.", icon: "fa-layer-group" },
    { href: "/reference/h17-chart", title: "H17 chart (printed style)", description: "The fixed 6-deck H17 chart that the recall drill grades.", icon: "fa-list-ol" },
  ],
};

const DOUBLE_NAME: Record<StrategyChartRules["doubleRule"], string> = { any: "any two cards", "9-11": "hard 9–11", "10-11": "hard 10–11" };
const SURRENDER_NAME: Record<SurrenderRule, string> = { none: "none", late: "late", early: "early vs 10" };

/** How a rule change reads when it is announced. */
function describeChange(key: keyof StrategyChartRules, value: StrategyChartRules[keyof StrategyChartRules]) {
  switch (key) {
    case "decks": return `Decks: ${value}`;
    case "dealerHitsSoft17": return `Soft 17: ${value ? "H17" : "S17"}`;
    case "doubleAfterSplit": return `Double after split: ${value ? "yes" : "no"}`;
    case "surrender": return `Surrender: ${SURRENDER_NAME[value as SurrenderRule]}`;
    case "doubleRule": return `Double on: ${DOUBLE_NAME[value as StrategyChartRules["doubleRule"]]}`;
    default: return `Hole card: ${value ? "no hole card" : "dealer peeks"}`;
  }
}

function SectionFootnotes({ section, rules }: { section: RulesSection["id"]; rules: StrategyChartRules }) {
  if (section === "hard") return <p>Not shown: hard 5–7 always hit; hard 18–21 always stand.</p>;
  if (section !== "surrender" || rules.surrender === "none") return null;
  return (
    <>
      <p>Check this table first. Anything it does not take, play out from the hand tables.</p>
      {rules.surrender === "early" && <p>Early surrender is taken before the dealer checks the hole card, so it only changes the ten column; the ace stays on late surrender.</p>}
      {rules.surrender === "early" && rules.decks <= 2 && (
        <p>Two published exceptions depend on the cards, not the total, so this grid cannot show them: do not surrender a fourteen made of 4+10 or 5+9 in single deck, nor 4+10 in double deck.</p>
      )}
    </>
  );
}

function Methodology({ widestInterval }: { widestInterval: number }) {
  const meta = DEVIATION_RANKING_METADATA;
  const limit = meta.limit.charAt(0).toLowerCase() + meta.limit.slice(1);
  return (
    <div className="no-print mt-4">
      <Section
        id="how-values-were-measured"
        title="How these values were measured"
        summary={`${meta.rounds / 1_000_000}M rounds per rule set · ${meta.ramp.replace("-", "–")} spread · ${meta.game}`}
        icon="fa-flask"
        open={false}
        analyticsSection="ev_methodology"
      >
        <div className="max-w-3xl space-y-2 text-sm leading-6 text-[var(--ink-muted)]">
          <p><b className="text-[var(--ink)]">Value</b> is the units won per 100 rounds by adding that one play to basic strategy, on {meta.game} with a {meta.ramp.replace("-", "–")} bet ramp. <b className="text-[var(--ink)]">Changes the play</b> is how often in 100 rounds it actually changes a decision.</p>
          <p>Measured over {meta.rounds.toLocaleString("en-US")} rounds per rule set with {meta.replications} paired replications per triggered decision: {meta.method}. Widest 95% interval in this list: &plusmn;{widestInterval.toFixed(3)}.</p>
          <p>These are {limit}, so treat the total as close but not exact. Values were measured for 6 decks with double after split; at other rules they are a guide rather than a measurement.</p>
        </div>
      </Section>
    </div>
  );
}

/**
 * The strategy chart for the reader's table rules: /reference (basic
 * strategy) and /reference/deviations (with index plays) are one page whose
 * view switch changes the address without remounting.
 */
export function RulesChartView({ initialView }: { initialView: ChartView }) {
  const hydrated = useHydrated();
  const { user } = useAuth();
  const [view, chooseView] = useChartView(initialView);
  const { rules, saved, hasSavedRules, setRule, chooseSurrender, reset, differences, moreRulesChanged, savedAt } = useChartRules();
  const chart = useMemo(() => buildRulesChart(rules, view), [rules, view]);
  const ranking = useMemo(() => (view === "index" ? rankIndexPlays(rules, chart) : null), [rules, chart, view]);
  const charts = useRef<HTMLDivElement>(null);
  const explainer = useRef<ExplainerApi | null>(null);

  // Flash the cells a rule change repaints and say what changed, once the
  // reader pauses. While the phone rules panel covers the chart the flash
  // waits for it to close.
  const pendingChange = useRef<{ label: string; at: number } | null>(null);
  const previous = useRef(chart);
  const panelOpen = useRef(false);
  const deferred = useRef(new Set<string>());
  const [flash, setFlash] = useState<ReadonlySet<string>>(NO_CELLS);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startFlash = useCallback((keys: ReadonlySet<string>) => {
    clearTimeout(flashTimer.current);
    setFlash(keys);
    flashTimer.current = setTimeout(() => setFlash(NO_CELLS), FLASH_MS);
  }, []);
  useEffect(() => () => { clearTimeout(flashTimer.current); clearTimeout(announceTimer.current); }, []);
  useEffect(() => {
    const before = previous.current;
    previous.current = chart;
    const change = pendingChange.current;
    pendingChange.current = null;
    if (!change || Date.now() - change.at > 1000 || before.view !== chart.view) return;
    const changed = changedCells(before, chart);
    const keys = new Set(changed.map((cell) => cell.key));
    if (panelOpen.current) keys.forEach((key) => deferred.current.add(key));
    else startFlash(keys);
    const examples = changed.slice(0, 3).map((cell) => shortCellName(cell.section, cell.row, cell.dealer)).join(", ");
    const count = changed.length ? `${changed.length} ${changed.length === 1 ? "cell" : "cells"} changed (${examples}${changed.length > 3 ? ", …" : ""})` : "No cells changed";
    const savedNote = change.label.startsWith("Surrender") ? ` Saved ${user ? "to your account" : "on this device"}.` : "";
    clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => announce(`${change.label}. ${count}.${savedNote}`), ANNOUNCE_DELAY_MS);
  }, [chart, startFlash, user]);

  const onRule = useCallback(<K extends keyof StrategyChartRules>(key: K, value: StrategyChartRules[K]) => {
    pendingChange.current = { label: describeChange(key, value), at: Date.now() };
    if (key === "surrender") chooseSurrender(value as SurrenderRule);
    else setRule(key as Exclude<K, "surrender">, value as never);
  }, [chooseSurrender, setRule]);
  const onReset = useCallback(() => {
    pendingChange.current = { label: hasSavedRules ? "Reset to your rules" : "Reset to the default rules", at: Date.now() };
    reset();
  }, [hasSavedRules, reset]);
  const onPanelChange = useCallback((open: boolean) => {
    panelOpen.current = open;
    if (!open && deferred.current.size) {
      startFlash(new Set(deferred.current));
      deferred.current.clear();
    }
  }, [startFlash]);

  // N and Shift+N step through the index plays across every table.
  const onChartsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (view !== "index" || event.key.toLowerCase() !== "n" || event.ctrlKey || event.metaKey || event.altKey) return;
    const from = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    const plays = Array.from(charts.current?.querySelectorAll<HTMLElement>("[data-index-play]") ?? []);
    if (!from || !plays.length) return;
    event.preventDefault();
    // Where the focused cell sits among the index plays (or would, if it has
    // none), then one step either way, wrapping at the ends.
    const count = plays.length;
    const here = plays.indexOf(from);
    const after = plays.findIndex((cell) => from.compareDocumentPosition(cell) & Node.DOCUMENT_POSITION_FOLLOWING);
    const start = here >= 0 ? here : after < 0 ? count : after;
    const step = event.shiftKey ? -1 : here >= 0 ? 1 : 0;
    const next = plays[(((start + step) % count) + count) % count];
    next.focus();
    next.scrollIntoView({ block: "nearest" });
  };

  const renderCell = useCallback((row: string, dealer: string, position: CellPosition, section: RulesSection["id"]) => {
    const cell = chart.cells.get(`${section}:${row}v${dealer}`)!;
    return <ChartCell cell={cell} view={view} position={position} changed={flash.has(cell.key)} />;
  }, [chart, view, flash]);
  const renderers = useMemo(() => Object.fromEntries(chart.sections.map((section) => [
    section.id,
    (row: string, dealer: string, position: CellPosition) => renderCell(row, dealer, position, section.id),
  ])) as Record<RulesSection["id"], (row: string, dealer: string, position: CellPosition) => ReactNode>, [chart, renderCell]);

  const summary = rulesSummary(rules, "short");
  const title = view === "index" ? "Index deviation chart" : "Basic strategy chart";

  return (
    <div data-reference-page="">
      <ChartHeader
        title={title}
        description={view === "index"
          ? "Basic strategy plus every Hi-Lo index play (also called a deviation): the hands where the true count changes the best play, and what each one is worth."
          : "The best play for every starting hand under your table rules. Find your hand on the left and the dealer's upcard across the top; select any cell to see the play in plain words."}
        shortDescription={view === "index" ? "Basic strategy plus the count-based plays. Tap any cell to see why." : "Find your hand, then the dealer's card. Tap any cell to see why."}
        printLine={`Rules: ${rulesSummary(rules, "long")}`}
        actions={(
          <>
            <SegmentedControl
              label="Chart view"
              hideLabel
              fullWidth
              className="min-w-0 flex-1 sm:flex-none"
              value={view}
              onChange={chooseView}
              options={VIEW_OPTIONS.map((option) => ({ ...option, disabled: !hydrated }))}
            />
            <ButtonLink href="/reference/h17-chart" variant="quiet" className="hidden shrink-0 gap-2 text-sm sm:inline-flex">
              <i className="fa-solid fa-list-ol text-xs" aria-hidden="true" />Printed H17 chart
            </ButtonLink>
            <PrintButton />
          </>
        )}
      />
      <RulesToolbar
        view={view}
        rules={rules}
        savedDecks={saved.decks}
        hasSavedRules={hasSavedRules}
        differences={differences}
        moreRulesChanged={moreRulesChanged}
        savedAt={savedAt}
        onRule={onRule}
        onSurrender={(value) => onRule("surrender", value)}
        onReset={onReset}
        onPanelChange={onPanelChange}
      />
      <div ref={charts} className="ref-charts" onKeyDown={onChartsKeyDown}>
        <div className="ref-charts-grid grid items-start gap-3 md:gap-4 print:gap-1.5">
          <div className="ref-key-slot col-span-full">
            <RulesChartKey view={view} rules={rules} indexCount={chart.indexCount} />
          </div>
          {chart.sections.map((section) => (
            <ChartPanel
              key={section.id}
              id={section.id}
              label={section.label}
              description={section.description}
              analyticsSection={ANALYTICS_KEY[section.id]}
              className={`ref-panel-${section.id} ${section.id === "surrender" ? "min-h-[12rem] print:min-h-0" : ""}`}
              footnotes={<SectionFootnotes section={section.id} rules={rules} />}
            >
              {section.rows.length ? (
                <ChartGrid
                  testId={`chart-rail-${section.id}`}
                  caption={`${section.label} — ${view === "index" ? "with index plays" : "basic strategy"} for ${summary}`}
                  rows={section.rows}
                  rowLabel={section.id === "soft" ? (row) => softRowLabel(row, softRowTotal(row)) : undefined}
                  renderCell={renderers[section.id]}
                />
              ) : (
                <p className="px-1 py-6 text-sm text-[var(--ink-muted)]">This table offers no surrender. Play every hand out from the hand tables.</p>
              )}
            </ChartPanel>
          ))}
        </div>
      </div>
      {ranking && (
        <div className="mt-6">
          <IndexRanking ranking={ranking} rules={rules} disabled={!hydrated} onShow={(key) => explainer.current?.show(key)} />
          <Methodology widestInterval={ranking.widestInterval} />
        </div>
      )}
      <PracticeLinks items={PRACTICE[view]} />
      <PrintFooter path={VIEW_PATH[view]} />
      <CellExplainer
        containerRef={charts}
        apiRef={explainer}
        render={(key, source) => {
          const cell = chart.cells.get(key);
          return cell ? <RulesCellCard cell={cell} view={view} source={source} /> : null;
        }}
      />
    </div>
  );
}
