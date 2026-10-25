"use client";
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { CUSTOM_RAMP_NAME, isPresetName, OPTIMAL_RAMP_NAME, PRESET_NAMES } from "@/lib/blackjack/labConfig";
import { money, percent } from "@/lib/blackjack/labFormat";
import { labRules, playedSpread, roundsPerShoe, wongOutChoices } from "@/lib/blackjack/labModel";
import { handsSummary, stepsSummary, tcLabel, toSteps, unitLabel } from "@/lib/blackjack/rampSteps";
import { Badge, Button, Callout, Segmented, SelectField } from "@/components/ui";
import { CountTable } from "./CountTable";
import { InlineUndo, Note, NumberField, Panel } from "./parts";
import { RampChart } from "./RampChart";
import { focusStepUnits, RampSteps } from "./RampSteps";
import { presetLabel, type Calc } from "./useCalculator";

type RampView = "steps" | "table";
const VIEW_KEY = "countlab:lab-ramp-view";
const spreadLabel = (spread: { min: number; max: number }) => `${unitLabel(spread.min)}–${unitLabel(spread.max)}`;

/** Step 3: how much to bet at each true count, from a preset, a suggestion, or by hand. */
export function RampCard({ calc, onSuggest, className }: { calc: Calc; onSuggest: () => void; className?: string }) {
  const { config, pricing, edit } = calc;
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
  // With a leave point, counts below the entry are played some of the time, so none are shown as sat out.
  const sitOutBelow = config.wongOutAt === null ? config.wongInAt : null;
  const perShoe = roundsPerShoe(config, labRules(config));
  const steps = useMemo(() => toSteps(config.ramp, config.hands, { start, boundaries: calc.stepBoundaries ?? [] }), [config.ramp, config.hands, start, calc.stepBoundaries]);
  const spread = playedSpread(pricing.activeRamp);
  const name = isPresetName(config.rampName) ? `${presetLabel(config.rampName)} spread`
    : config.rampName === OPTIMAL_RAMP_NAME ? "Kelly-weighted ramp"
      : config.rampName === CUSTOM_RAMP_NAME ? "Custom ramp" : config.rampName;
  const summary = spread
    ? `${name}${isPresetName(config.rampName) ? "" : ` (${spreadLabel(spread)})`} · ${money(spread.min * config.baseBet)}–${money(spread.max * config.baseBet)} · plays ${percent(pricing.result.playedFrequency, 0)} of rounds`
    : `${name} · not betting at any count`;

  const selectCount = (trueCount: number) => {
    if (view === "table") {
      document.querySelector<HTMLInputElement>(`#ramp input[data-analytics-field="bet_per_count"][aria-label$=" ${trueCount <= -8 ? "≤ −8" : trueCount >= 8 ? "≥ +8" : tcLabel(trueCount)}"]`)?.focus();
      return;
    }
    const step = steps.find((item) => trueCount >= item.from && trueCount <= item.to);
    if (step) focusStepUnits(step.from);
  };

  return (
    <Panel id="ramp" eyebrow="Step 3" title="Bet ramp" sub="How many units you bet at each true count: the running count divided by the decks left. Betting more when it is high is where the edge comes from." className={className}>
      <p className="tnum -mt-2 mb-4 text-sm font-medium text-ink">{summary}</p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <Segmented
            label="Start from a preset"
            name="preset"
            className="w-56"
            value={isPresetName(config.rampName) ? config.rampName : ""}
            onChange={calc.setPreset}
            options={PRESET_NAMES.map((preset) => ({ value: preset, label: presetLabel(preset), hint: `Bets 1 unit at low counts rising to ${preset.split("-")[1]} units` }))}
          />
          {!isPresetName(config.rampName) && <span className="mb-2.5"><Badge>{config.rampName === OPTIMAL_RAMP_NAME ? "Kelly-weighted" : "Custom"}</Badge></span>}
          <InlineUndo calc={calc} source="preset" className="mb-0.5" />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/[0.07] p-3">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-sm font-semibold">Not sure what to bet?</p>
            <p className="text-sm leading-5 text-ink-2">Get spreads sized to your bankroll and risk, with what each earns and risks.</p>
          </div>
          <Button size="md" onClick={onSuggest} aria-haspopup="dialog" icon={<Sparkles size={17} aria-hidden />}>Suggest a ramp</Button>
          <InlineUndo calc={calc} source="suggest" />
        </div>

        {pricing.staleOptimal && (
          <Callout tone="info" action={<Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={calc.buildOptimal}>Rebuild for this game</Button>}>
            Your game or settings changed since this Kelly-weighted ramp was built.
          </Callout>
        )}

        {/* The card is narrow beside the results above 1280px, so the columns follow its width, not the screen's. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4 [&>*]:min-w-0">
          <SelectField
            label="When you play"
            hint="Sitting out low counts (back-counting, or “wonging”) skips your worst bets. It assumes you may join mid-shoe."
            data-analytics-field="enter_the_game_at"
            value={config.wongInAt ?? "every"}
            onChange={(event) => {
              const wongInAt = event.target.value === "every" ? null : Number(event.target.value);
              edit({ wongInAt, wongOutAt: config.wongOutAt !== null && wongOutChoices(wongInAt).includes(config.wongOutAt) ? config.wongOutAt : null });
            }}
          >
            <option value="every">Every round</option>
            <option value={-1}>True count −1 and up</option>
            <option value={0}>0 and up</option>
            <option value={1}>+1 and up</option>
            <option value={2}>+2 and up</option>
            <option value={3}>+3 and up</option>
          </SelectField>
          <SelectField
            label="When you leave"
            hint={config.wongInAt === null ? "Leave the table when the count drops, and find a fresh shoe." : "Once seated, stay until the count drops this far, then watch again."}
            data-analytics-field="leave_the_game_at"
            value={config.wongOutAt ?? "stay"}
            onChange={(event) => edit({ wongOutAt: event.target.value === "stay" ? null : Number(event.target.value) })}
          >
            <option value="stay">{config.wongInAt === null ? "Never: play the whole shoe" : "As soon as it is below your entry"}</option>
            {wongOutChoices(config.wongInAt).map((exit) => <option key={exit} value={exit}>At {tcLabel(exit)} or lower</option>)}
          </SelectField>
          {perShoe !== undefined && (
            <NumberField
              label="Time to find a fresh shoe"
              value={config.shoeMoveMinutes}
              min={0}
              max={60}
              step="any"
              suffix="min"
              field="shoe_move_minutes"
              hint="Walking to another table and waiting for its shuffle or a seat. Counted as time without play."
              onChange={(shoeMoveMinutes) => edit({ shoeMoveMinutes })}
            />
          )}
          <NumberField
            label="Table maximum"
            value={config.tableMax ?? 0}
            min={0}
            prefix="$"
            field="table_maximum"
            hint={config.tableMax === null ? "0 means no limit. Bets above it are capped." : `Caps each hand at ${money(config.tableMax)}, ${unitLabel(config.tableMax / config.baseBet)} units.`}
            onChange={(tableMax) => edit({ tableMax: tableMax > 0 ? tableMax : null })}
          />
        </div>
        {config.wongOutAt !== null && (
          <Note>
            Leaving at a count is priced from simulated shoes: how often each count is watched and played under this rule. Rounds per hour count every round you watch.
            {perShoe !== undefined && <> You play about {perShoe < 10 ? perShoe.toFixed(1) : Math.round(perShoe)} rounds a shoe, and each move to a fresh shoe counts as {config.shoeMoveMinutes.toLocaleString("en-US", { maximumFractionDigits: 1 })} {config.shoeMoveMinutes === 1 ? "minute" : "minutes"} without play.</>}
          </Note>
        )}

        <RampChart rows={pricing.result.rows} unit={config.baseBet} sittingOutBelow={sitOutBelow} summary={stepsSummary(steps, config.wongInAt)} onSelect={selectCount} />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <Segmented<RampView> label="Edit as" name="ramp_view" className="w-60" value={view} onChange={chooseView} options={[{ value: "steps", label: "Steps" }, { value: "table", label: "Every count" }]} />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Change the whole ramp">
            <Button variant="secondary" size="sm" className="min-h-11 min-w-11 sm:min-h-9" aria-label="Halve every bet" onClick={() => calc.scaleRamp(0.5)}>½×</Button>
            <Button variant="secondary" size="sm" className="min-h-11 min-w-11 sm:min-h-9" aria-label="Double every bet" onClick={() => calc.scaleRamp(2)}>2×</Button>
            <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" aria-label={`Reset the bet ramp to ${presetLabel(isPresetName(config.rampName) ? config.rampName : "1-8")}`} onClick={calc.resetRamp} icon={<RotateCcw size={15} aria-hidden />}>Reset</Button>
            <InlineUndo calc={calc} source="ramp" />
          </div>
        </div>

        {view === "steps" ? (
          <>
            <RampSteps steps={steps} unit={config.baseBet} sittingOutBelow={sitOutBelow} onChange={calc.setSteps} />
            <Note>Hands per round: {handsSummary(config.hands, start)}. Two or three hands are priced as correlated, since they all play against one dealer hand.</Note>
          </>
        ) : (
          <CountTable rows={pricing.result.rows} unit={config.baseBet} sittingOutBelow={sitOutBelow} onBetChange={calc.setBet} onHandsChange={calc.setHands} />
        )}
      </div>
    </Panel>
  );
}
