"use client";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ListOrdered, Printer, WalletCards } from "lucide-react";
import type { Action } from "@/lib/blackjack/types";
import { ACTION_FILL, ACTION_NAME } from "@/components/blackjack/actions";
import { Button, ButtonLink, Card, PageHeader, Segmented, Stepper } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { buildChart, cellKey, effectiveSurrender, rulesSummary, signedCount, type CellRef } from "@/lib/strategy";
import { RulesControl } from "./RulesControl";
import { CellSheet } from "./CellSheet";
import { PlayTableView, SurrenderTableView, TableFrame, type ChartMode } from "./StrategyTable";
import { useChartRules } from "./useChartRules";

const MODES = [
  { value: "basic", label: "Basic" },
  { value: "indices", label: "Indices" },
  { value: "count", label: "At a count" },
] as const;

export function ChartsPage() {
  const { rules, setRules, differsFromSaved, saveAsMine, resetToSaved } = useChartRules();
  const [mode, setMode] = useState<ChartMode>("indices");
  const [tc, setTc] = useState(2);
  const [selected, setSelected] = useState<{ ref: CellRef; key: string } | null>(null);
  const chart = useMemo(() => buildChart(rules), [rules]);
  const surrender = effectiveSurrender(rules);
  // Hands basic strategy surrenders but Wong never does with a count: footnoted.
  const neverWithCount = chart.surrender ? [...chart.surrender.cells.entries()].filter(([, rule]) => rule.basic && rule.at === Infinity) : [];
  const select = (ref: CellRef, surrenderTable = false) => setSelected({ ref, key: surrenderTable ? `R:${cellKey(ref)}` : cellKey(ref) });
  const sections = [
    { id: "hard", label: "Hard" },
    { id: "soft", label: "Soft" },
    { id: "pairs", label: "Pairs" },
    ...(chart.surrender ? [{ id: "surrender", label: "Surrender" }] : []),
    { id: "insurance", label: "Insurance" },
  ];
  const tableProps = { rules, mode, tc, selected: selected?.key };

  return (
    <div className="print:text-[11px]">
      <PageHeader
        className="print:hidden"
        title="Strategy charts"
        sub="Basic strategy and Hi-Lo index plays for your exact table rules. Tap any cell for the play at every count."
        actions={
          <div className="no-print hidden items-center gap-2 sm:flex">
            <ButtonLink href="/charts/indices" variant="secondary" size="sm" icon={<ListOrdered size={16} aria-hidden />}>Index list</ButtonLink>
            <ButtonLink href="/charts/pocket" variant="secondary" size="sm" icon={<WalletCards size={16} aria-hidden />}>Pocket chart</ButtonLink>
            <Button variant="secondary" size="sm" icon={<Printer size={16} aria-hidden />} onClick={() => window.print()}>Print</Button>
          </div>
        }
      />
      <p className="print-only mb-2 text-base font-semibold">CountLab strategy chart · <span className="font-mono">{rulesSummary(rules)}</span> · Hi-Lo indices: the strip shows the play the count switches to and the true count where it starts</p>

      <div className="no-print space-y-3">
        <RulesControl rules={rules} onChange={setRules} differsFromSaved={differsFromSaved} onSave={saveAsMine} onReset={resetToSaved} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Segmented label="Show" hideLabel value={mode} onChange={setMode} options={MODES} className="sm:w-96" />
          {mode === "count" && (
            <Stepper label="True count" hideLabel value={tc} onChange={setTc} min={-6} max={10} format={(value) => `TC ${signedCount(value)}`} className="sm:w-52" />
          )}
        </div>
        <p className="text-sm leading-6 text-ink-2" aria-live="polite">
          {mode === "basic" && "The plays without counting. Use these when you are not tracking the count."}
          {mode === "indices" && <>A strip under a play is an <span className="font-semibold text-ink">index</span>: its colour is the play the count changes it to, and the number is the true count where that starts. Cells without a strip never change.</>}
          {mode === "count" && <>Every play at a true count of <span className="font-semibold text-ink">{signedCount(tc)}</span>. Cells ringed in gold are where the count changes basic strategy.</>}
        </p>
      </div>

      <nav aria-label="Chart sections" className="no-print sticky top-[calc(3.5rem+var(--safe-t))] z-20 -mx-4 mt-4 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:hidden">
        <ul className="scrollbar-none flex gap-1.5 overflow-x-auto">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-ink-2 hover:text-ink">{section.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <Legend mode={mode} hasSurrender={Boolean(chart.surrender)} />

      <div className="mt-5 grid gap-6 lg:grid-cols-2 print:mt-2 print:grid-cols-2 print:gap-x-4 print:gap-y-2">
        <TableFrame id="hard" title="Hard totals" sub="No ace, or every ace counted as 1. 18+ always stands; 5–7 always hits.">
          <PlayTableView table={chart.tables.hard} onSelect={(ref) => select(ref)} {...tableProps} />
        </TableFrame>
        <TableFrame id="soft" title="Soft totals" sub="An ace still counted as 11. Soft 21 stands; a soft 12 (A,A unsplit) hits.">
          <PlayTableView table={chart.tables.soft} onSelect={(ref) => select(ref)} {...tableProps} />
        </TableFrame>
        <TableFrame id="pairs" title="Pairs" sub={rules.das ? "Double after split allowed." : "No double after split."}>
          <PlayTableView table={chart.tables.pairs} onSelect={(ref) => select(ref)} {...tableProps} />
        </TableFrame>
        <div className="space-y-6">
          {chart.surrender ? (
            <TableFrame id="surrender" title={surrender === "early" ? "Surrender (early vs 10, late otherwise)" : "Late surrender"} sub="Decide this first, on your first two cards only.">
              <SurrenderTableView table={chart.surrender} onSelect={(ref) => select(ref, true)} {...tableProps} />
              {neverWithCount.length > 0 && (
                <p className="mt-2 text-xs leading-5 text-ink-3">
                  * {neverWithCount.map(([key]) => key.split(":")[1].replace("v", " v ")).join(", ")}: basic strategy surrenders, but Wong prints no surrender number, so with a count {neverWithCount.length > 1 ? "these hands are" : "this hand is"} played out at every count.
                </p>
              )}
            </TableFrame>
          ) : (
            <Card className="text-sm text-ink-2"><span className="font-semibold text-ink">No surrender</span> at this table, so the hard and pair tables are the whole story.</Card>
          )}
          <section id="insurance" className="scroll-mt-28 lg:scroll-mt-6">
            <Card className="flex items-center gap-4 print:p-2">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand/15 font-mono text-lg font-bold text-brand-text">+{chart.insuranceAt}</div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Insurance and even money</h2>
                <p className="mt-0.5 text-sm leading-6 text-ink-2">
                  {mode === "count"
                    ? (tc >= chart.insuranceAt ? `Take it: the true count is ${signedCount(tc)}.` : `Decline: the true count is ${signedCount(tc)}, below +${chart.insuranceAt}.`)
                    : `Never without a count. Take it at a true count of +${chart.insuranceAt} or higher.`}
                </p>
              </div>
            </Card>
          </section>
          <div className="print:hidden"><RuleNotes rules={rules} /></div>
        </div>
      </div>

      <div className="no-print mt-6 flex flex-wrap gap-2 sm:hidden">
        <ButtonLink href="/charts/indices" variant="secondary" icon={<ListOrdered size={16} aria-hidden />}>Index list</ButtonLink>
        <ButtonLink href="/charts/pocket" variant="secondary" icon={<WalletCards size={16} aria-hidden />}>Pocket chart</ButtonLink>
        <Button variant="secondary" icon={<Printer size={16} aria-hidden />} onClick={() => window.print()}>Print</Button>
      </div>

      <CellSheet rules={rules} cell={selected?.ref ?? null} open={Boolean(selected)} onClose={() => setSelected(null)} tc={mode === "count" ? tc : undefined} />
    </div>
  );
}

function Swatch({ action, children }: { action: Action; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cx("inline-grid h-6 w-6 place-items-center rounded-md text-xs font-bold", ACTION_FILL[action])} aria-hidden>{action}</span>
      <span className="text-sm text-ink-2">{children ?? ACTION_NAME[action]}</span>
    </li>
  );
}

function Legend({ mode, hasSurrender }: { mode: ChartMode; hasSurrender: boolean }) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface px-3.5 py-3 print:hidden">
      <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Key">
        <Swatch action="H" />
        <Swatch action="S" />
        <Swatch action="D">Double <span className="text-ink-3">(Ds: else stand)</span></Swatch>
        <Swatch action="P" />
        {hasSurrender && <Swatch action="R" />}
      </ul>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-2.5 text-sm text-ink-2">
        {mode === "indices" && (
          <span className="inline-flex items-center gap-2">
            <span className="relative inline-flex h-7 w-7 items-start justify-center overflow-hidden rounded-md bg-act-h pt-0.5 text-[0.6875rem] font-bold text-act-h-ink" aria-hidden>
              H<span className="absolute inset-x-0 bottom-0 bg-act-s text-center text-[0.5625rem] leading-[0.75rem] text-act-ink">0↑</span>
            </span>
            Hit; stand at 0 or higher (↓ means or lower)
          </span>
        )}
        {hasSurrender && (
          <span className="inline-flex items-center gap-2">
            <span className="relative inline-block h-6 w-6 overflow-hidden rounded-md bg-act-h" aria-hidden><span className="absolute right-0 top-0 h-2.5 w-2.5 bg-act-r [clip-path:polygon(0_0,100%_0,100%_100%)]" /></span>
            Surrender first if you can
          </span>
        )}
      </div>
    </div>
  );
}

function RuleNotes({ rules }: { rules: ReturnType<typeof useChartRules>["rules"] }) {
  const notes: ReactNode[] = [];
  if (rules.decks <= 2) notes.push("The index numbers come from shoe games (4–8 decks). Single- and double-deck values can sit a count away; basic strategy here is the exact grid for your deck count.");
  if (effectiveSurrender(rules) === "early") {
    notes.push("Early surrender against a 10 is decided before the dealer checks for blackjack, so more hands are worth giving up. Against an ace the late-surrender plays apply.");
    if (rules.decks === 1) notes.push("Single deck: play hard 14 against a 10 on (10-4 and 9-5 are worth keeping; only 8-6 should be surrendered).");
    if (rules.decks === 2) notes.push("Double deck: keep a 10-4 against a 10; surrender other fourteens.");
    if (rules.das) notes.push("8,8 against a 10 surrenders from −2 (Wong's no-DAS figure); with double after split the true break-even is slightly higher.");
  }
  if (rules.noHoleCard) notes.push("No hole card: against a 10 or ace, do not double, and split only aces against a 10 — a dealer blackjack would take the extra money.");
  if (rules.doubling !== "any") notes.push(`Doubling on hard ${rules.doubling.replace("-", "–")} only, so other doubles become hits (soft doubles stand or hit).`);
  notes.push("A true count is the running count divided by the decks left. Indices are whole numbers: +4 means a true count of +4 or more.");
  return (
    <Card>
      <h2 className="mb-2 text-base font-semibold">Notes for these rules</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-2">
        {notes.map((note, index) => <li key={index}>{note}</li>)}
      </ul>
      <p className="mt-3 text-sm"><Link href="/charts/indices" className="font-semibold text-brand-text underline underline-offset-2">See every index ranked</Link></p>
    </Card>
  );
}
