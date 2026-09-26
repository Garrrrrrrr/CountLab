"use client";

import { useEffect, useMemo, useState } from "react";
import { CUSTOM_RAMP_NAME, isPresetName, OPTIMAL_RAMP_NAME, PRESET_NAMES, rampSpread } from "@/lib/blackjack/labConfig";
import { money, percent, riskLabel } from "@/lib/blackjack/labFormat";
import { playedSpread } from "@/lib/blackjack/labModel";
import { handsSummary, stepsSummary, toSteps, unitLabel } from "@/lib/blackjack/rampSteps";
import { BetSpreadTable } from "@/components/BetSpreadTable";
import { Callout, GhostButton, HelpTip, NumberField, SegmentedControl, Term } from "@/components/ui";
import { LabSelect, StatusMark, StepCard } from "./parts";
import { RampChart } from "./RampChart";
import { focusStepUnits, RampSteps } from "./RampSteps";
import type { Lab } from "./useLab";

type RampView = "steps" | "table";
const VIEW_KEY = "countlab:lab-ramp-view";
const ROUNDING = [
  { value: 0, label: "Exact units", phrase: "exact units" },
  { value: 0.25, label: "Quarter units", phrase: "quarter units" },
  { value: 0.5, label: "Half units", phrase: "half units" },
  { value: 1, label: "Whole units", phrase: "whole units" },
] as const;
const presetLabel = (name: string) => name.replace("-", "–");
const spreadLabel = (spread: { min: number; max: number } | null) => (spread ? `${unitLabel(spread.min)}–${unitLabel(spread.max)}` : "no bets");

/** Step 3: how much to bet at each true count, built from a preset, the optimal ramp, or by hand. */
export function RampCard({ lab, onInteract }: { lab: Lab; onInteract?: () => void }) {
  const { config, model, edit } = lab;
  const [view, setView] = useState<RampView>("steps");
  // The preferred editor is a per-viewer convenience, read after mount.
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === "table") setView("table"); } catch { /* storage unavailable */ }
  }, []);
  const chooseView = (next: RampView) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* storage unavailable */ }
  };

  const start = config.wongInAt ?? -8;
  const steps = useMemo(() => toSteps(config.ramp, config.hands, { start, boundaries: lab.stepBoundaries ?? [] }), [config.ramp, config.hands, start, lab.stepBoundaries]);
  const spread = playedSpread(model.activeRamp);
  const label = isPresetName(config.rampName) ? `${presetLabel(config.rampName)} spread`
    : config.rampName === OPTIMAL_RAMP_NAME ? `Optimal ramp (${spreadLabel(spread)})`
      : `${config.rampName === CUSTOM_RAMP_NAME ? "Custom ramp" : config.rampName} (${spreadLabel(spread)})`;
  const summary = spread
    ? `${label} · ${money(spread.min * config.baseBet)}–${money(spread.max * config.baseBet)} · plays ${percent(model.result.playedFrequency, 0)} of rounds`
    : `${label} · not betting at any count`;
  const rounding = ROUNDING.find((option) => option.value === config.chipIncrement);
  const topUnits = rampSpread(model.activeRamp);
  const optimalUnitNote = Number.isFinite(model.optimalUnit) && model.optimalUnit > 0
    ? `Sized for your ${riskLabel(config.targetRisk)} risk target, it suits a ${money(model.optimalUnit, 2)} unit.`
    : "This game has no edge to size a unit against.";
  const maxBet = lab.directoryHints?.maxBet ?? null;

  const selectCount = (trueCount: number) => {
    if (view === "table") {
      const row = model.result.rows.find((item) => item.trueCount === trueCount);
      if (row) document.querySelector<HTMLInputElement>(`#ramp input[aria-label="Bet at true count ${row.label}"]`)?.focus();
      return;
    }
    const step = steps.find((item) => trueCount >= item.from && trueCount <= item.to);
    if (step) focusStepUnits(step.from);
  };

  return (
    <StepCard id="ramp" step={3} title="Bet ramp" summary={summary} onInteract={onInteract}>
      <p className="-mt-1 mb-4 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
        How many units you bet at each <Term definition="The running count divided by the decks still to be dealt. The higher it is, the richer the rest of the shoe is in tens and aces, and the bigger your edge.">true count</Term>. Raising your bet when the count is high is where your edge comes from.
      </p>

      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <SegmentedControl
            label="Start from"
            name="ramp-preset"
            analyticsField="preset"
            className="lab-seg"
            value={isPresetName(config.rampName) ? config.rampName : null}
            onChange={lab.setPreset}
            options={PRESET_NAMES.map((name) => ({ value: name, label: presetLabel(name), ariaLabel: `${presetLabel(name)} spread` }))}
          />
          {!isPresetName(config.rampName) && <span className="mb-2.5"><StatusMark tone="neutral">{config.rampName === OPTIMAL_RAMP_NAME ? "Optimal" : "Custom"}</StatusMark></span>}
        </div>

        <div className="rounded-xl border border-[var(--rule)] p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <GhostButton size="compact" onClick={lab.buildOptimal}>
              <i className="fa-solid fa-wand-magic-sparkles mr-2" aria-hidden="true" />Build optimal ramp
            </GhostButton>
            <p className="min-w-0 flex-1 basis-64 text-xs leading-5 text-[var(--ink-muted)]">
              A <span className="whitespace-nowrap">Kelly-weighted<HelpTip label="a Kelly-weighted ramp">Each count&apos;s bet grows with your edge there, divided by how much that count swings. It is the betting pattern that grows a bankroll fastest.</HelpTip></span> ramp for this game, capped at your {unitLabel(config.maxSpread)}× maximum spread and rounded to {rounding?.phrase ?? `${config.chipIncrement} units`}. It changes only the ramp. {optimalUnitNote}
            </p>
          </div>
          {model.staleOptimal && (
            <Callout tone="info" className="mt-3" action={<GhostButton size="compact" onClick={lab.buildOptimal}>Rebuild optimal ramp</GhostButton>}>
              Your game or settings changed since this ramp was built.
            </Callout>
          )}
          <details data-analytics-section="optimizer_settings" className="group mt-2 min-w-0">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-semibold text-[var(--ink)] outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-[var(--focus)] [&::-webkit-details-marker]:hidden">
              <i className="fa-solid fa-chevron-right text-[.65rem] text-[var(--ink-muted)] transition-transform group-open:rotate-90" aria-hidden="true" />
              Optimizer settings
            </summary>
            <div className="lab-fields mt-2">
              <NumberField label="Maximum spread for Optimal and Compare" value={config.maxSpread} min={1} max={100} inputStep="any" suffix="×" analyticsField="maximum_spread" help="Your largest bet in units. 12 means bets from 1 to 12 units." onValueChange={(maxSpread) => edit({ maxSpread })} />
              <LabSelect label="Round bets to" analyticsField="bet_rounding" value={config.chipIncrement} onChange={(value) => edit({ chipIncrement: Number(value) })}>
                {ROUNDING.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </LabSelect>
            </div>
            {topUnits > config.maxSpread && (
              <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">Your ramp tops out at {unitLabel(topUnits)}×; Optimal and Compare cap at {unitLabel(config.maxSpread)}×.</p>
            )}
          </details>
        </div>

        <div className="max-w-md">
          <LabSelect
            label="When you play"
            helpLabel="sitting out low counts"
            help="Sitting out low counts (back-counting, or “wonging”) removes your worst bets. You watch the shoe and join when the count reaches your entry point. It assumes the casino lets you join mid-shoe."
            hint={lab.directoryHints?.midShoeUnverified ? "This casino's mid-shoe entry rule is unverified. Check it before you plan to sit out low counts." : undefined}
            analyticsField="enter_the_game_at"
            value={config.wongInAt ?? "every"}
            onChange={(value) => edit({ wongInAt: value === "every" ? null : Number(value) })}
          >
            <option value="every">Every round</option>
            <option value={0}>True count 0 and up</option>
            <option value={1}>+1 and up</option>
            <option value={2}>+2 and up</option>
            <option value={3}>+3 and up</option>
          </LabSelect>
        </div>

        <RampChart rows={model.result.rows} unit={config.baseBet} sittingOutBelow={config.wongInAt} summary={stepsSummary(steps, config.wongInAt)} onSelect={selectCount} />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <SegmentedControl<RampView> label="Edit as" name="ramp-view" size="compact" analyticsField="ramp_view" value={view} onChange={chooseView} options={[{ value: "steps", label: "Steps" }, { value: "table", label: "Every count" }]} />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Change the whole ramp">
            <GhostButton size="compact" aria-label="Halve every bet" onClick={() => lab.scaleRamp(0.5)}>½×</GhostButton>
            <GhostButton size="compact" aria-label="Double every bet" onClick={() => lab.scaleRamp(2)}>2×</GhostButton>
            <GhostButton size="compact" aria-label={`Reset the bet ramp to ${presetLabel(isPresetName(config.rampName) ? config.rampName : "1-8")}`} onClick={lab.resetRamp}>Reset ramp</GhostButton>
          </div>
        </div>

        {view === "steps" ? (
          <>
            <RampSteps steps={steps} unit={config.baseBet} sittingOutBelow={config.wongInAt} onChange={lab.setSteps} />
            <p className="text-xs leading-5 text-[var(--ink-muted)]">Hands per round: {handsSummary(config.hands, start)}.</p>
          </>
        ) : (
          <BetSpreadTable
            rows={model.result.rows}
            onBetChange={lab.setBet}
            onHandsChange={lab.setHands}
            layout="container"
            unit={config.baseBet}
            showFrequencyBars
            lockedReason={(trueCount) => (config.wongInAt !== null && trueCount < config.wongInAt ? `Sitting out: When you play starts at ${config.wongInAt === 0 ? "0" : `+${config.wongInAt}`}.` : undefined)}
          />
        )}

        {maxBet !== null && (
          <p className={`text-xs leading-5 ${topUnits * config.baseBet > maxBet ? "text-[var(--warning)]" : "text-[var(--ink-muted)]"}`}>
            <i className="fa-solid fa-circle-info mr-1.5" aria-hidden="true" />
            This table&apos;s maximum bet is {money(maxBet)}; your top bet is {money(topUnits * config.baseBet)} a hand. The Lab doesn&apos;t enforce table maximums.
          </p>
        )}
      </div>
    </StepCard>
  );
}
