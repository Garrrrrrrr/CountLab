"use client";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { rampSpread } from "@/lib/blackjack/labConfig";
import { count, DASH, money, percent, riskLabel } from "@/lib/blackjack/labFormat";
import { suggestSpreads, type SpreadSuggestion, type SuggestionStatus } from "@/lib/blackjack/labModel";
import { sameRamp, unitLabel } from "@/lib/blackjack/rampSteps";
import { Badge, Button, Callout, cx, SelectField, Sheet } from "@/components/ui";
import { TargetRiskField } from "./BankrollCard";
import { Disclosure, Figure, InlineUndo, Note, NumberField } from "./parts";
import type { Calc } from "./useCalculator";

const ROUNDING = [
  { value: 0, label: "Exact units", phrase: "exact units" },
  { value: 0.25, label: "Quarter units", phrase: "quarter units" },
  { value: 0.5, label: "Half units", phrase: "half units" },
  { value: 1, label: "Whole units", phrase: "whole units" },
] as const;

const STATUS: Record<SuggestionStatus, { label: string; tone: "pos" | "warn" | "neg" }> = {
  met: { label: "Meets both targets", tone: "pos" },
  "risk-limited": { label: "Short of the goal at this risk", tone: "warn" },
  "minimum-too-high": { label: "Table minimum is too risky", tone: "neg" },
};

function SuggestionCard({ suggestion, recommended, current, onUse }: { suggestion: SpreadSuggestion; recommended: boolean; current: boolean; onUse: () => void }) {
  const { result } = suggestion;
  const status = STATUS[suggestion.status];
  return (
    <li className={cx("rounded-2xl border p-3.5", recommended ? "border-brand bg-brand/[0.06]" : "border-line")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="min-w-0 text-base font-semibold">{suggestion.name}</h3>
        {recommended && <Badge tone="brand">Recommended</Badge>}
        {current && <Badge>Your setup</Badge>}
      </div>
      <p className="tnum mt-0.5 text-sm text-ink-2">
        {money(suggestion.baseBet)} unit · bets {money(suggestion.minBet)}–{money(suggestion.maxBet)}
      </p>
      <p className={cx("mt-1 text-xs font-semibold", status.tone === "pos" ? "text-pos" : status.tone === "warn" ? "text-warn" : "text-neg")}>{status.label}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
        <Figure label="Win an hour" value={money(result.hourlyEv, 2)} />
        <Figure label="Risk of ruin" value={percent(result.riskOfRuin)} />
        <Figure label="SD an hour" value={`±${money(result.sdPerHour)}`} />
        <Figure label="N₀" value={Number.isFinite(result.nZeroHours) ? `${count(result.nZeroHours)} h` : DASH} />
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="tnum text-xs text-ink-3">SCORE {result.cScore > 0 ? money(result.cScore, 2) : DASH}</p>
        <Button variant={recommended ? "primary" : "secondary"} size="sm" className="min-h-11 sm:min-h-9" disabled={current} onClick={onUse} aria-label={`Use ${suggestion.name} with a ${money(suggestion.baseBet)} unit`}>
          {current ? "In use" : "Use this"}
        </Button>
      </div>
    </li>
  );
}

/**
 * Suggest a ramp: the Bet Spread Recommender folded into the Calculator. Given
 * the bankroll, the risk you accept, the table minimum and what you want to
 * earn, every spread gets the whole-dollar unit that fits, with its trade-offs.
 * The Kelly-weighted ramp for this game is one of them, and can also be built
 * on its own while keeping your unit.
 */
export function SuggestSheet({ calc, open, onClose }: { calc: Calc; open: boolean; onClose: () => void }) {
  const { config, pricing, edit } = calc;
  const [tableMinimum, setTableMinimum] = useState(config.baseBet);
  const [hourlyGoal, setHourlyGoal] = useState(50);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTableMinimum(Math.max(1, Math.floor(config.baseBet)));
  }
  const { suggestions, recommended } = useMemo(() => suggestSpreads(config, { tableMinimum, hourlyGoal }), [config, tableMinimum, hourlyGoal]);
  const rounding = ROUNDING.find((option) => option.value === config.chipIncrement);
  const yourScore = pricing.noBets ? 0 : pricing.result.cScore;
  const ratio = yourScore > 0 ? pricing.optimalScore / yourScore : Infinity;
  const tradeOff = ratio < 0.98 ? "less than" : ratio > 1.02 ? "more than" : "about the same as";
  const topUnits = rampSpread(pricing.activeRamp);
  const isCurrent = (suggestion: SpreadSuggestion) => suggestion.baseBet === config.baseBet && sameRamp(suggestion.ramp, config.ramp);

  return (
    <Sheet open={open} onClose={onClose} size="lg" title="Suggest a ramp" initialFocus={'[data-sheet-close="true"]'}
      description="Choose the risk you accept and what you would like to earn. Each spread gets the whole-dollar unit that fits your bankroll, priced on this game.">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Bankroll" value={config.bankroll} min={1} prefix="$" field="available_bankroll" onChange={(bankroll) => edit({ bankroll })} />
        <TargetRiskField calc={calc} />
        <NumberField label="Table minimum" value={tableMinimum} min={1} prefix="$" field="table_minimum" hint="The smallest unit you can bet." onChange={setTableMinimum} />
        <NumberField label="Hourly goal" value={hourlyGoal} min={0} prefix="$" suffix="an hour" field="desired_hourly_ev" hint="What you would like to win an hour on average." onChange={setHourlyGoal} />
      </div>

      <div className="mt-5" role="status" aria-live="polite">
        {recommended ? (
          <Callout tone={recommended.feasible ? "pos" : "warn"} title={`${recommended.name} with a ${money(recommended.baseBet)} unit`}>
            {recommended.feasible
              ? <>Earns {money(recommended.result.hourlyEv, 2)} an hour at {percent(recommended.result.riskOfRuin)} risk of ruin, with the smallest top bet ({money(recommended.maxBet)}) of the spreads that meet both targets.</>
              : <>No spread reaches {money(hourlyGoal)} an hour within {riskLabel(config.targetRisk)} risk. This one comes closest: {money(recommended.result.hourlyEv, 2)} an hour at {percent(recommended.result.riskOfRuin)} risk. A bigger bankroll, more risk, or a better game would close the gap.</>}
          </Callout>
        ) : (
          <Callout tone="neg" title="No spread fits">
            The table minimum alone is over {riskLabel(config.targetRisk)} risk for every spread. Add to the bankroll, accept more risk, or find a lower minimum.
          </Callout>
        )}
      </div>

      <ul className="mt-4 grid gap-2.5" aria-label="Spreads for your bankroll">
        {suggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.key} suggestion={suggestion} recommended={suggestion.key === recommended?.key} current={isCurrent(suggestion)}
            onUse={() => { calc.applySuggestion(suggestion); onClose(); }} />
        ))}
      </ul>
      <Note className="mt-2">Risk of ruin can sit under your target because units are whole dollars, rounded down. Counts below your When you play point are sat out in every spread.</Note>

      <div className="mt-5 rounded-2xl border border-line p-3.5">
        <h3 className="flex items-center gap-2 text-base font-semibold"><Sparkles size={17} aria-hidden className="text-brand-text" />Kelly-weighted ramp</h3>
        <p className="mt-1 text-sm leading-6 text-ink-2">
          Each count&apos;s bet grows with your edge there divided by how much that count swings, from 1 unit at the first count with an edge, capped at {unitLabel(config.maxSpread)}× and rounded to {rounding?.phrase ?? `${config.chipIncrement} units`}. Smooth, but not always the top earner: a steeper ramp can earn more at the same risk.
        </p>
        {!pricing.usingOptimal && pricing.optimalScore > 0 && (
          <p className="mt-1.5 text-sm leading-6 text-ink-2" data-testid="optimal-trade-off">
            Its SCORE is <b className="tnum text-ink">{money(pricing.optimalScore, 2)}</b>
            {yourScore > 0
              ? <> against <b className="tnum text-ink">{money(yourScore, 2)}</b> for your ramp, so it earns {tradeOff} your ramp at the same risk.</>
              : pricing.noBets ? "; you are not betting at any count yet." : "; your current ramp loses in this game."}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" disabled={pricing.usingOptimal} onClick={() => { calc.buildOptimal(); onClose(); }}>
            {pricing.usingOptimal ? "Already in use" : `Use it with my ${money(config.baseBet, config.baseBet % 1 ? 2 : 0)} unit`}
          </Button>
          <InlineUndo calc={calc} source="suggest" />
        </div>
        <Disclosure summary="Kelly ramp settings" section="optimizer_settings" className="mt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Top bet, in units" value={config.maxSpread} min={1} max={100} suffix="×" field="maximum_spread" hint="Caps the Kelly ramp and the Compare card. 12 means 1 to 12 units." onChange={(maxSpread) => edit({ maxSpread })} />
            <SelectField label="Round bets to" data-analytics-field="bet_rounding" value={config.chipIncrement} onChange={(event) => edit({ chipIncrement: Number(event.target.value) })}>
              {ROUNDING.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectField>
          </div>
          {topUnits > config.maxSpread && <Note className="mt-2">Your ramp tops out at {unitLabel(topUnits)}×; the Kelly ramp and Compare cap at {unitLabel(config.maxSpread)}×.</Note>}
        </Disclosure>
      </div>
    </Sheet>
  );
}
