"use client";

import { useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { announce, Badge, Button, ButtonLink, SegmentedControl } from "@/components/ui";
import type { SegmentOption } from "@/components/ui";
import { buildH17Chart, softRowTotal } from "@/lib/blackjack/referenceChartModel";
import type { H17Section } from "@/lib/blackjack/referenceChartModel";
import type { ChartSurrenderRule } from "@/lib/blackjack/es10Chart";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useHydrated } from "@/lib/useMediaQuery";
import { H17CellCard } from "./CellCard";
import { CellExplainer } from "./CellExplainer";
import { H17Cell } from "./ChartCell";
import { ChartGrid, softRowLabel } from "./ChartGrid";
import type { CellPosition } from "./ChartGrid";
import { H17ChartKey } from "./ChartKey";
import { ChartHeader, ChartPanel, PrintButton, PrintFooter } from "./ChartPage";
import { ChartToolbar, JumpRail, RulesPanelButton, useRulesPanel } from "./ChartToolbar";
import { PracticeLinks } from "./PracticeLinks";
import { SavedRuleNote } from "./SavedRuleNote";
import { useSavedSurrender } from "./useChartRules";

const ANALYTICS_KEY: Record<H17Section["id"], string> = { pairs: "pair_splitting", soft: "soft_totals", hard: "hard_totals", surrender: "late_surrender" };
const FIXED_RULES = "6 decks · Dealer hits soft 17 · Double after split";

const SURRENDER_OPTIONS: ReadonlyArray<SegmentOption<ChartSurrenderRule>> = [
  { value: "late", label: "Late", ariaLabel: "Late surrender (LS)" },
  { value: "early10", label: "Early vs 10", ariaLabel: "Early surrender vs 10 (ES10)" },
];

const PRACTICE = [
  { href: "/training/h17-chart", title: "H17 Chart drill", description: "Fill in this chart from memory, cell by cell.", icon: "fa-table-cells" },
  { href: "/training/deviations", title: "Deviations drill", description: "Learn when the true count changes the play.", icon: "fa-code-branch" },
] as const;

/**
 * The Blackjack Apprenticeship H17 chart as printed: the answer key for the
 * H17 chart recall drill. Its rules are fixed except surrender, which is the
 * reader's saved rule; a saved "no surrender" still shows the late-surrender
 * tables, with a note, and is never rewritten unless the reader picks one.
 */
export function H17ChartView() {
  const hydrated = useHydrated();
  const { user, loading } = useAuth();
  const { surrender, choose, savedAt } = useSavedSurrender();
  const rule: ChartSurrenderRule = surrender === "early" ? "early10" : "late";
  const sections = useMemo(() => buildH17Chart(rule), [rule]);
  const cells = useMemo(() => new Map(sections.flatMap((section) => section.cells.flat().map((cell) => [cell.key, cell] as const))), [sections]);
  const charts = useRef<HTMLDivElement>(null);
  const panel = useRulesPanel();

  const onSurrender = useCallback((value: ChartSurrenderRule) => {
    if (!choose(value === "early10" ? "early" : "late")) return;
    announce(`${value === "early10" ? "Early surrender vs 10" : "Late surrender"} tables shown. Saved ${user ? "to your account" : "on this device"}.`);
  }, [choose, user]);

  const renderers = useMemo(() => Object.fromEntries(sections.map((section) => [
    section.id,
    (row: string, dealer: string, position: CellPosition) => <H17Cell cell={cells.get(`${section.id}:${row}v${dealer}`)!} position={position} />,
  ])) as Record<H17Section["id"], (row: string, dealer: string, position: CellPosition) => ReactNode>, [sections, cells]);

  const noSurrenderNote = hydrated && surrender === "none"
    ? <p className="text-xs text-[var(--ink-muted)]">Your saved table has no surrender; skip the surrender table.</p>
    : null;

  return (
    <div data-reference-page="">
      <ChartHeader
        title="H17 deviation chart"
        description="The answer key for the H17 chart recall drill: 6 decks, dealer hits soft 17, double after split. White cells with an amber edge are Hi-Lo index plays; select any cell to see what it means."
        shortDescription="The printed chart the H17 drill grades. Tap any cell to see what it means."
        printLine={`Rules: ${FIXED_RULES.toLowerCase()} · ${rule === "early10" ? "early surrender vs 10" : "late surrender"}`}
        actions={(
          <>
            <ButtonLink href="/reference/deviations" variant="quiet" className="min-w-0 flex-1 gap-2 text-sm sm:flex-none">
              <i className="fa-solid fa-sliders text-xs" aria-hidden="true" />Chart for your rules
            </ButtonLink>
            <PrintButton />
          </>
        )}
      />
      <ChartToolbar label="Table rules" sticky="phone">
        <JumpRail
          label="Chart sections"
          className="md:hidden"
          items={[{ href: "#pairs", label: "Pairs" }, { href: "#soft", label: "Soft" }, { href: "#hard", label: "Hard" }, { href: "#surrender", label: "Surrender" }]}
          leading={<RulesPanelButton panelId="h17-rules" summary={`6D \u00b7 H17 \u00b7 DAS \u00b7 ${rule === "early10" ? "ES10" : "LS"}`} open={panel.open} onToggle={panel.toggle} button={panel.button} disabled={!hydrated} />}
        />
        <div id="h17-rules" className={`${panel.open ? "flex" : "hidden"} flex-col gap-2.5 pb-2 pt-2.5 md:flex md:flex-row md:flex-wrap md:items-center md:gap-x-5 md:gap-y-2 md:p-0`}>
          <p className="text-sm font-semibold">{FIXED_RULES}</p>
          <Badge className="self-start md:self-auto">Fixed for this chart</Badge>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:border-l md:border-[var(--rule)] md:pl-5">
            <SegmentedControl
              label="Surrender"
              size="compact"
              className="grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 max-md:w-full md:grid-cols-[auto_auto] md:gap-x-2"
              value={surrender === "none" ? null : rule}
              onChange={onSurrender}
              options={SURRENDER_OPTIONS.map((option) => ({ ...option, disabled: !hydrated || loading }))}
              help="Saved to your table rules; the H17 Chart drill uses it too."
            />
            <SavedRuleNote savedAt={savedAt} signedIn={Boolean(user)} />
          </div>
          {noSurrenderNote}
          <div className="flex justify-end md:hidden">
            <Button size="compact" enterAction={false} onClick={panel.close} className="[@media(pointer:coarse)]:min-h-11">Done</Button>
          </div>
        </div>
      </ChartToolbar>
      <div ref={charts} className="ref-charts">
        <div className="ref-charts-grid grid items-start gap-3 md:gap-4 print:gap-1.5">
          <div className="ref-key-slot col-span-full"><H17ChartKey /></div>
          {sections.map((section) => (
            <ChartPanel
              key={section.id}
              id={section.id}
              label={section.label}
              analyticsSection={section.id === "surrender" && rule === "early10" ? "early_surrender_vs_10" : ANALYTICS_KEY[section.id]}
              className={`ref-panel-${section.id}`}
              footnotes={section.id === "hard" ? <p>Not shown: hard 5–7 always hit; hard 18–21 always stand.</p> : undefined}
            >
              <ChartGrid
                testId={`h17-reference-rail-${section.id}`}
                caption={`${section.label} — H17 deviation chart`}
                rows={section.rows}
                rowLabel={section.id === "soft" ? (row) => softRowLabel(row, softRowTotal(row)) : undefined}
                renderCell={renderers[section.id]}
              />
            </ChartPanel>
          ))}
        </div>
      </div>
      <p className="mt-4 max-w-4xl text-xs leading-5 text-[var(--ink-muted)] print:mt-2 print:text-[8px] print:leading-3">
        Chart source: Blackjack Apprenticeship, H17 Deviation Chart (2018), with house additions: soft 20 doubles versus 4, 5 and 6 at +6, +5 and +4, and six Illustrious 18 / Fab 4 plays the printed chart leaves at basic strategy (9,9 v 7 at 3+, 13 v 3 at -2+, 12 v 5 at -2+, 12 v 6 at -3+, 11 v A at -1+, and surrender 14 v 10 at 3+).
        {rule === "early10" && " Under early surrender the ten column of the surrender table is Stanford Wong, Professional Blackjack, table 32; the 8, 9 and ace columns are the Blackjack Apprenticeship chart as printed, since the two rules only differ where the dealer can hold a natural."}
      </p>
      <PracticeLinks items={PRACTICE} />
      <PrintFooter path="/reference/h17-chart/" />
      <CellExplainer
        containerRef={charts}
        render={(key, source) => {
          const cell = cells.get(key);
          return cell ? <H17CellCard cell={cell} source={source} /> : null;
        }}
      />
    </div>
  );
}
