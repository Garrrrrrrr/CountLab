"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { chance, count, dealtPercent, DASH, deckLabel, money, percent, signedMoney } from "@/lib/blackjack/labFormat";
import { compareGames, compareRules, playedSpread, priceTemplate, type CompareBasis, type GameComparison, type LabPricing, type TripOutlook } from "@/lib/blackjack/labModel";
import { unitLabel } from "@/lib/blackjack/rampSteps";
import { Badge, Button, cx, EmptyState, Segmented } from "@/components/ui";
import { InlineUndo, Note, Panel } from "./parts";
import type { Calc } from "./useCalculator";

type Mode = "games" | "rules" | "scenarios";
const gameName = (row: GameComparison) => `${deckLabel(row.decks)}, ${row.dealt} dealt`;
const MAX_COMPARED = 3;

/**
 * Every simulated deck and penetration choice ranked by SCORE for this
 * bankroll and unit, and saved scenarios side by side with the current setup.
 */
export function CompareCard({ calc, trip, onSave, className }: { calc: Calc; trip: TripOutlook; onSave: () => void; className?: string }) {
  const [mode, setMode] = useState<Mode>("games");
  return (
    <Panel id="compare" title="Compare" sub="Other penetrations and shoes, other table rules, or your saved scenarios side by side." className={className}>
      <Segmented<Mode> label="Compare with" name="compare_mode" value={mode} onChange={setMode} options={[{ value: "games", label: "Other games" }, { value: "rules", label: "Rules" }, { value: "scenarios", label: "Saved" }]} />
      <div className="mt-4">
        {mode === "games" ? <OtherGames calc={calc} /> : mode === "rules" ? <OtherRules calc={calc} /> : <SavedScenarios calc={calc} trip={trip} onSave={onSave} />}
      </div>
    </Panel>
  );
}

function OtherGames({ calc }: { calc: Calc }) {
  const { config } = calc;
  const [basis, setBasis] = useState<CompareBasis>("yours");
  const rows = useMemo(() => compareGames(config, basis), [config, basis]);
  const rank = rows.findIndex((row) => row.current) + 1;
  return (
    <div>
      <p className="text-sm leading-6 text-ink-2">
        Ranked by SCORE, which compares games whatever the stakes, with your {money(config.baseBet)} unit and {money(config.bankroll)} bankroll. Price each game with your own ramp to see what switching tables alone would do, or give each its own Kelly-weighted ramp, capped at your {unitLabel(config.maxSpread)}× top bet.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
        <Segmented<CompareBasis> label="Price each game with" name="compare_basis" className="w-full max-w-xs" value={basis} onChange={setBasis} options={[{ value: "yours", label: "Your ramp" }, { value: "optimal", label: "Its Kelly ramp" }]} />
        <InlineUndo calc={calc} source="compare" />
      </div>
      {rank > 0 && <p className="tnum mt-3 text-sm font-medium">Your game ranks #{rank} of {rows.length}.</p>}
      <ol className="mt-2 grid gap-2" aria-label="Games ranked by SCORE">
        {rows.map((row, index) => (
          <li key={`${row.decks}-${row.dealt}`} className={cx("flex min-w-0 items-center gap-3 rounded-xl border p-3", row.current ? "border-brand bg-brand/[0.06]" : "border-line")}>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 font-semibold"><span className="tnum text-ink-3">#{index + 1}</span> {deckLabel(row.decks)} · <span className="tnum">{row.dealt}</span> dealt <span className="tnum font-normal text-ink-3">({dealtPercent(row.decks, row.dealt)}%)</span></span>
                <span className="tnum shrink-0 font-semibold"><span className="mr-1 text-[0.6875rem] font-medium uppercase tracking-wide text-ink-3">SCORE</span>{row.result.cScore > 0 ? money(row.result.cScore, 2) : DASH}</span>
              </p>
              <p className="tnum mt-0.5 text-xs text-ink-3">{money(row.result.hourlyEv, 2)}/hr · ruin {percent(row.result.riskOfRuin)} · N₀ {count(row.result.nZeroRounds)}</p>
            </div>
            <div className="shrink-0">
              {row.current ? <Badge tone="brand">Yours</Badge> : (
                <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={() => calc.switchGame(row, basis === "optimal")} aria-label={`Use ${gameName(row)}${basis === "optimal" ? " with its Kelly-weighted ramp" : ""}`}>
                  Use
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <Note className="mt-2">SCORE is the win per 100 rounds with a $10,000 bankroll at 13.5% risk, so games compare whatever the stakes. The Kelly-weighted ramp is the highest-SCORE ramp within your top bet.</Note>
    </div>
  );
}

/** The current game beside each one-rule change, so "is the S17 table down the street better?" has an answer. */
function OtherRules({ calc }: { calc: Calc }) {
  const { config } = calc;
  const [basis, setBasis] = useState<CompareBasis>("yours");
  const rows = useMemo(() => compareRules(config, basis), [config, basis]);
  return (
    <div>
      <p className="text-sm leading-6 text-ink-2">
        Your game with one rule changed at a time, same shoe, bankroll and {money(config.baseBet)} unit, ranked by SCORE. Rules outside the simulations are estimates, as in the Game step.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
        <Segmented<CompareBasis> label="Price each with" name="compare_rules_basis" className="w-full max-w-xs" value={basis} onChange={setBasis} options={[{ value: "yours", label: "Your ramp" }, { value: "optimal", label: "Its Kelly ramp" }]} />
        <InlineUndo calc={calc} source="compare" />
      </div>
      <ol className="mt-3 grid gap-2" aria-label="Rule changes ranked by SCORE">
        {rows.map((row, index) => (
          <li key={row.key} className={cx("flex min-w-0 items-center gap-3 rounded-xl border p-3", row.current ? "border-brand bg-brand/[0.06]" : "border-line")}>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 font-semibold"><span className="tnum text-ink-3">#{index + 1}</span> {row.label}</span>
                <span className="tnum shrink-0 font-semibold"><span className="mr-1 text-[0.6875rem] font-medium uppercase tracking-wide text-ink-3">SCORE</span>{row.result.cScore > 0 ? money(row.result.cScore, 2) : DASH}</span>
              </p>
              <p className="tnum mt-0.5 text-xs text-ink-3">{money(row.result.hourlyEv, 2)}/hr · edge {percent(row.result.playerEdge, 2)} · ruin {percent(row.result.riskOfRuin)}</p>
            </div>
            <div className="shrink-0">
              {row.current ? <Badge tone="brand">Yours</Badge> : (
                <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={() => calc.switchRules(row, basis === "optimal")} aria-label={`Use ${row.label.toLowerCase()}`}>
                  Use
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

type Column = { id: string; name: string; current?: boolean; pricing: LabPricing; trip: TripOutlook; spread: string; game: string };

const ROWS: { label: string; value: (column: Column) => ReactNode; best?: (column: Column) => number }[] = [
  { label: "Game", value: (column) => column.game },
  { label: "Spread", value: (column) => column.spread },
  { label: "Win an hour", value: (column) => money(column.pricing.result.hourlyEv, 2), best: (column) => column.pricing.result.hourlyEv },
  { label: "SD an hour", value: (column) => `±${money(column.pricing.result.sdPerHour)}` },
  { label: "Risk of ruin", value: (column) => percent(column.pricing.result.riskOfRuin), best: (column) => -column.pricing.result.riskOfRuin },
  { label: "Bankroll needed", value: (column) => money(column.pricing.result.requiredBankroll) },
  { label: "N₀ (hours)", value: (column) => count(column.pricing.result.nZeroHours) },
  { label: "SCORE", value: (column) => (column.pricing.result.cScore > 0 ? money(column.pricing.result.cScore, 2) : DASH), best: (column) => column.pricing.result.cScore },
  { label: "Trip result", value: (column) => signedMoney(column.trip.expected) },
  { label: "Trip ahead", value: (column) => percent(column.trip.chanceAhead, 1) },
  { label: "Trip ruin", value: (column) => chance(column.trip.riskOfRuin) },
];

const describe = (pricing: LabPricing, decks: number, dealt: number, unit: number) => {
  const spread = playedSpread(pricing.activeRamp);
  return {
    game: `${decks}D · ${dealtPercent(decks, dealt)}%`,
    spread: spread ? `${money(spread.min * unit)}–${money(spread.max * unit)}` : "No bets",
  };
};

function SavedScenarios({ calc, trip, onSave }: { calc: Calc; trip: TripOutlook; onSave: () => void }) {
  const { templates, config, pricing, active } = calc;
  const [picked, setPicked] = useState<string[]>([]);
  const chosen = picked.filter((id) => templates.some((template) => template.id === id));
  // By default: the two newest saves, leaving out the open scenario unless it has been edited (then its saved copy is worth comparing).
  const selected = chosen.length ? chosen : templates.filter((template) => template.id !== active?.id || calc.edited).slice(0, 2).map((template) => template.id);
  const columns: Column[] = (() => {
    const current: Column = { id: "current", name: active ? `${active.name}${calc.edited ? " (edited)" : ""}` : "This setup", current: true, pricing, trip, ...describe(pricing, config.decks, config.dealt, config.baseBet) };
    const saved = selected.map((id) => templates.find((template) => template.id === id)).filter((template) => template !== undefined).map((template) => {
      const priced = priceTemplate(template);
      return { id: template.id, name: template.name, pricing: priced.pricing, trip: priced.trip, ...describe(priced.pricing, priced.config.decks, priced.config.dealt, priced.config.baseBet) };
    });
    return [current, ...saved];
  })();

  if (!templates.length) {
    return (
      <EmptyState title="No saved scenarios yet" action={<Button variant="secondary" onClick={onSave} icon={<Save size={16} aria-hidden />}>Save this setup</Button>}>
        Save a setup, change the game or ramp, and compare the two here.
      </EmptyState>
    );
  }

  const toggle = (id: string) => {
    const base = chosen.length ? chosen : selected;
    setPicked(base.includes(id) ? base.filter((item) => item !== id) : [...base, id].slice(-MAX_COMPARED));
  };
  const sameAsCurrent = (id: string) => active?.id === id && !calc.edited;

  return (
    <div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-2">Scenarios to compare (up to {MAX_COMPARED})</legend>
        <div className="flex flex-wrap gap-1.5">
          {templates.map((template) => {
            const on = selected.includes(template.id);
            return (
              <button key={template.id} type="button" aria-pressed={on} onClick={() => toggle(template.id)}
                className={cx("h-11 max-w-full truncate rounded-full border px-3.5 text-sm font-semibold sm:h-9", on ? "border-brand bg-brand/15 text-ink" : "border-line bg-surface-2 text-ink-2 hover:text-ink")}>
                {template.name}{sameAsCurrent(template.id) ? " · open" : ""}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[20rem] text-sm">
          <caption className="sr-only">Scenarios side by side</caption>
          <thead>
            <tr className="bg-surface-2/60 text-left">
              <th scope="col" className="sticky left-0 z-[1] bg-surface-2 py-2 pl-3 pr-2 text-xs font-medium text-ink-3"><span className="sr-only">Figure</span></th>
              {columns.map((column) => (
                <th key={column.id} scope="col" className="min-w-[7.5rem] px-3 py-2 align-bottom text-xs font-semibold">
                  <span className="line-clamp-2 break-words">{column.name}</span>
                  {column.current ? <span className="block font-normal text-ink-3">now</span> : (
                    <button type="button" className="mt-0.5 block min-h-11 font-semibold text-brand-text underline-offset-2 hover:underline sm:min-h-9" onClick={() => { const template = templates.find((item) => item.id === column.id); if (template) calc.loadTemplate(template); }} aria-label={`Load ${column.name}`}>Load</button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ROWS.map((row) => {
              const bestValue = row.best && columns.length > 1 ? Math.max(...columns.map(row.best)) : undefined;
              return (
                <tr key={row.label}>
                  <th scope="row" className="sticky left-0 z-[1] bg-surface py-2 pl-3 pr-2 text-left text-xs font-medium text-ink-3">{row.label}</th>
                  {columns.map((column) => (
                    <td key={column.id} className={cx("tnum px-3 py-2", bestValue !== undefined && row.best!(column) === bestValue ? "font-semibold text-pos" : "text-ink")}>{row.value(column)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Note className="mt-2">Each column is priced exactly as loading it would price it. The best value in a row is in green.</Note>
    </div>
  );
}
