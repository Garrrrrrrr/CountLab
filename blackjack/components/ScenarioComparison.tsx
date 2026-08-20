"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_ADVANTAGE_RULES, RAMPS, RampPoint, calculateAdvantage, unitsAt } from "@/lib/blackjack/advantage";
import { GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import { venuePresetLibrary, VenuePreset } from "@/lib/blackjack/venuePresets";
import { GhostButton, Metric, NumberField, Panel, Select, Switch } from "./ui";

const money = (value: number, digits = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "auto" }).format(value);
const percent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const expandRamp = (ramp: RampPoint[]) => Array.from({ length: 17 }, (_, index) => ({ trueCount: index - 8, units: unitsAt(index - 8, ramp) }));

interface ColumnState {
  name: string;
  decks: 6 | 8;
  dealt: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  blackjackPayout: 1.5 | 1.2;
  ramp: RampPoint[];
  bankroll: number;
  bettingUnit: number;
  playerHands: number;
  handsPerHour: number;
  hours: number;
}

let columnCounter = 0;
const makeColumn = (name: string): ColumnState & { id: number } => ({
  id: ++columnCounter,
  name,
  decks: 6,
  dealt: 4.5,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  resplitAces: true,
  lateSurrender: true,
  blackjackPayout: 1.5,
  ramp: expandRamp(RAMPS["1-8"]),
  bankroll: 10000,
  bettingUnit: 25,
  playerHands: 1,
  handsPerHour: 100,
  hours: 4,
});

export function ScenarioComparison() {
  const [columns, setColumns] = useState(() => [makeColumn("Scenario A"), makeColumn("Scenario B")]);
  const [venuePresets, setVenuePresets] = useState<VenuePreset[]>([]);

  useEffect(() => {
    const refresh = () => setVenuePresets(venuePresetLibrary.presets());
    refresh();
    addEventListener(venuePresetLibrary.event, refresh);
    return () => removeEventListener(venuePresetLibrary.event, refresh);
  }, []);

  const results = useMemo(
    () => columns.map((column) => calculateAdvantage({
      bankroll: column.bankroll,
      bettingUnit: column.bettingUnit,
      playerHands: column.playerHands,
      handsPerHour: column.handsPerHour,
      hours: column.hours,
      rules: {
        ...DEFAULT_ADVANTAGE_RULES,
        decks: column.decks,
        penetration: column.dealt / column.decks,
        dealerHitsSoft17: column.dealerHitsSoft17,
        doubleAfterSplit: column.doubleAfterSplit,
        resplitAces: column.resplitAces,
        lateSurrender: column.lateSurrender,
        blackjackPayout: column.blackjackPayout,
      },
      ramp: column.ramp,
    })),
    [columns],
  );

  const updateColumn = (id: number, patch: Partial<ColumnState>) => {
    setColumns((current) => current.map((column) => column.id === id ? { ...column, ...patch } : column));
  };
  const loadVenuePreset = (id: number, presetId: string) => {
    const preset = venuePresets.find((item) => item.id === presetId);
    if (!preset) return;
    const nextDecks = preset.rules.decks === 8 ? 8 : 6;
    updateColumn(id, {
      decks: nextDecks,
      dealt: Number((preset.rules.penetration * nextDecks).toFixed(2)),
      dealerHitsSoft17: preset.rules.dealerHitsSoft17,
      doubleAfterSplit: preset.rules.doubleAfterSplit,
      resplitAces: preset.rules.resplitAces,
      lateSurrender: preset.rules.lateSurrender,
      blackjackPayout: preset.rules.blackjackPayout,
      ramp: expandRamp(preset.ramp),
    });
  };
  const addColumn = () => {
    if (columns.length >= 4) return;
    setColumns((current) => [...current, makeColumn(`Scenario ${String.fromCharCode(65 + current.length)}`)]);
  };
  const removeColumn = (id: number) => {
    setColumns((current) => current.length > 1 ? current.filter((column) => column.id !== id) : current);
  };

  const bestIndex = (pick: (result: (typeof results)[number]) => number) => {
    if (results.length === 0) return -1;
    let bestIdx = 0;
    for (let i = 1; i < results.length; i++) if (pick(results[i]) > pick(results[bestIdx])) bestIdx = i;
    return bestIdx;
  };
  const bestHourlyEv = bestIndex((result) => result.hourlyEv);

  return (
    <>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Analyze · Compare</p>
        <h1 className="mt-2 text-3xl font-semibold">Compare Scenarios</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Set up to four table rules, ramps, and bet sizes side by side and compare their audited hourly EV, trip EV, and risk of ruin on an apples-to-apples basis.
        </p>
      </div>

      <div className="mb-5 flex justify-end">
        <GhostButton onClick={addColumn} disabled={columns.length >= 4}><i className="fa-solid fa-plus mr-2" />Add scenario</GhostButton>
      </div>

      <div className={`grid gap-5 ${columns.length === 1 ? "" : "md:grid-cols-2"} ${columns.length > 2 ? "xl:grid-cols-3" : ""} ${columns.length > 3 ? "2xl:grid-cols-4" : ""}`}>
        {columns.map((column, index) => {
          const result = results[index];
          return (
            <Panel key={column.id}>
              <div className="flex items-center justify-between gap-2">
                <input
                  value={column.name}
                  onChange={(event) => updateColumn(column.id, { name: event.target.value })}
                  className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-zinc-100 outline-none"
                />
                {columns.length > 1 && (
                  <button type="button" aria-label={`Remove ${column.name}`} onClick={() => removeColumn(column.id)} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-red-400/10 hover:text-red-300">
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                )}
              </div>

              {venuePresets.length > 0 && (
                <div className="mt-3">
                  <Select label="Load a venue" defaultValue="" onChange={(event) => event.target.value && loadVenuePreset(column.id, event.target.value)}>
                    <option value="">Choose a venue…</option>
                    {venuePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                  </Select>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Select label="Decks" value={column.decks} onChange={(event) => { const next = Number(event.target.value) as 6 | 8; updateColumn(column.id, { decks: next, dealt: GAME_OPTIONS[next][1].dealt }); }}>
                  <option value={6}>6 decks</option>
                  <option value={8}>8 decks</option>
                </Select>
                <Select label="Penetration" value={column.dealt} onChange={(event) => updateColumn(column.id, { dealt: Number(event.target.value) })}>
                  {GAME_OPTIONS[column.decks].map((option) => <option key={option.dealt} value={option.dealt}>{option.dealt} / {column.decks} dealt</option>)}
                </Select>
                <NumberField label="Bankroll" value={column.bankroll} min={1} prefix="$" onValueChange={(value) => updateColumn(column.id, { bankroll: value })} />
                <NumberField label="Betting unit" value={column.bettingUnit} min={0.01} prefix="$" onValueChange={(value) => updateColumn(column.id, { bettingUnit: value })} />
                <NumberField label="Hours" value={column.hours} min={0.1} step={0.5} onValueChange={(value) => updateColumn(column.id, { hours: value })} />
                <NumberField label="Hands / hour" value={column.handsPerHour} min={1} onValueChange={(value) => updateColumn(column.id, { handsPerHour: value })} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Switch label="H17" checked={column.dealerHitsSoft17} onChange={(value) => updateColumn(column.id, { dealerHitsSoft17: value })} />
                <Switch label="DAS" checked={column.doubleAfterSplit} onChange={(value) => updateColumn(column.id, { doubleAfterSplit: value })} />
                <Switch label="RSA" checked={column.resplitAces} onChange={(value) => updateColumn(column.id, { resplitAces: value })} />
                <Switch label="Late surrender" checked={column.lateSurrender} onChange={(value) => updateColumn(column.id, { lateSurrender: value })} />
              </div>

              <div className="mt-5 space-y-2 border-t border-white/[.07] pt-4">
                <div className={`rounded-xl p-3 ${index === bestHourlyEv ? "bg-emerald-400/10 ring-1 ring-emerald-400/30" : "bg-black/20"}`}>
                  <Metric label="Hourly EV" value={money(result.hourlyEv, 2)} sub={index === bestHourlyEv && columns.length > 1 ? "Best of these scenarios" : undefined} />
                </div>
                <Metric label="Trip EV" value={money(result.tripEv, 0)} sub={`± ${money(result.standardDeviation, 0)} SD`} />
                <Metric label="Player edge" value={percent(result.playerEdge)} />
                <Metric label="Risk of ruin" value={percent(result.riskOfRuin, 1)} />
              </div>
            </Panel>
          );
        })}
      </div>

      <p className="mt-6 text-xs leading-5 text-zinc-600">
        Each column uses the same audited advantage engine as the Game &amp; Bankroll Lab, run independently per scenario. This is a fast analytical comparison, not a full card-level shoe simulation.
      </p>
    </>
  );
}
