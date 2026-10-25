"use client";
import { useEffect, useRef } from "react";
import { Footprints, Plus, X } from "lucide-react";
import { track } from "@/lib/analytics/track";
import { money } from "@/lib/blackjack/labFormat";
import {
  addStep,
  allowedStarts,
  canAddStep,
  MAX_TC,
  MIN_TC,
  moveStepStart,
  removeStep,
  setStepHands,
  setStepUnits,
  stepRangeLabel,
  tcLabel,
  type RampStep,
} from "@/lib/blackjack/rampSteps";
import { announce, Button, Segmented } from "@/components/ui";
import { NumberStepper } from "./parts";

/** Focuses the units field of the step that starts at `from`. */
export function focusStepUnits(from: number) {
  document.querySelector<HTMLInputElement>(`[data-step-from="${from}"] input[type="number"]`)?.focus();
}

/**
 * The bet ramp as a short list of steps ("+3 and up: 8 units, 1 hand"). Each
 * step has its start, its bet in units and its hands; a step can be added
 * above the last one, and removed into the one before.
 */
export function RampSteps({ steps, unit, sittingOutBelow, onChange }: { steps: RampStep[]; unit: number; sittingOutBelow: number | null; onChange: (steps: RampStep[]) => void }) {
  const pendingFocus = useRef<number | null>(null);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    focusStepUnits(pendingFocus.current);
    pendingFocus.current = null;
  });
  const add = () => {
    const next = addStep(steps);
    const created = next.at(-1)!;
    track("cvcx_input_changed", { input: "ramp_step_added" });
    pendingFocus.current = created.from;
    onChange(next);
    announce(`Step added at ${tcLabel(created.from)}.`);
  };
  const remove = (index: number) => {
    track("cvcx_input_changed", { input: "ramp_step_removed" });
    pendingFocus.current = steps[index - 1].from;
    onChange(removeStep(steps, index));
    announce(`Step at ${tcLabel(steps[index].from)} removed.`);
  };
  return (
    <div className="grid gap-2">
      {sittingOutBelow !== null && (
        <p className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 text-sm text-ink-2">
          <Footprints size={16} aria-hidden className="shrink-0 text-ink-3" />
          <span><b className="tnum text-ink">Below {tcLabel(sittingOutBelow)}</b>: sitting out (set by When you play)</span>
        </p>
      )}
      <div aria-hidden className="hidden gap-x-2 px-[0.6875rem] text-xs font-medium text-ink-3 wide-card:grid wide-card:grid-cols-[8rem_8.5rem_minmax(4.5rem,1fr)_9rem_2.75rem]">
        <span className="pl-1">True count</span><span className="text-center">Units</span><span>Bet</span><span className="text-center">Hands</span>
      </div>
      <ol className="grid gap-2">
        {steps.map((step, index) => {
          const bet = step.units * unit;
          const range = stepRangeLabel(step);
          const rest = step.to >= MAX_TC ? "and up" : step.to === step.from ? "only" : `to ${tcLabel(step.to)}`;
          return (
            // Keyed by position: moving a step's start must keep its row, and the focused select in it.
            <li key={index}>
              <fieldset data-step-from={step.from} className="m-0 min-w-0 rounded-xl border border-line bg-surface-2/50 p-2.5">
                <legend className="sr-only">Step {index + 1}: true count {range}</legend>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 wide-card:grid-cols-[8rem_8.5rem_minmax(4.5rem,1fr)_9rem_2.75rem]">
                  <div className="tnum flex min-h-11 min-w-0 items-center gap-2 text-sm font-semibold">
                    <span className="sr-only">True count</span>
                    {index === 0 ? <span className="pl-1">{range}{step.from === step.to && step.from > MIN_TC ? <span className="font-normal text-ink-2"> only</span> : null}</span> : (
                      <>
                        <select
                          aria-label={`Step ${index + 1} starts at`}
                          value={step.from}
                          data-analytics-field="ramp_step_start"
                          onChange={(event) => onChange(moveStepStart(steps, index, Number(event.target.value)))}
                          className="tnum h-11 rounded-lg border border-line bg-surface px-2.5 text-base font-semibold text-ink hover:border-line-strong focus:border-brand focus:outline-none"
                        >
                          {allowedStarts(steps, index).map((trueCount) => <option key={trueCount} value={trueCount}>{tcLabel(trueCount)}</option>)}
                        </select>
                        <span className="whitespace-nowrap font-normal text-ink-2">{rest}</span>
                      </>
                    )}
                  </div>
                  <div className="col-start-2 row-start-1 flex justify-end wide-card:col-start-5">
                    {index > 0 ? (
                      <button type="button" onClick={() => remove(index)} aria-label={`Remove step starting at ${tcLabel(step.from)}`}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-neg/10 hover:text-neg">
                        <X size={18} aria-hidden />
                      </button>
                    ) : <span className="h-11 w-11" aria-hidden />}
                  </div>
                  <div className="col-span-2 flex min-w-0 items-center gap-3 wide-card:col-span-1 wide-card:col-start-2 wide-card:row-start-1">
                    <NumberStepper label={`Units at ${range}`} value={step.units} min={0} max={200} field="ramp_step_units" className="w-36 shrink-0 wide-card:w-full"
                      onChange={(units) => { onChange(setStepUnits(steps, index, units)); track("cvcx_input_changed", { input: "ramp_step_units" }); }} />
                    <p className="tnum min-w-0 text-sm leading-tight wide-card:hidden">{step.units > 0 ? <><span className="font-semibold text-ink">{money(bet, bet % 1 ? 2 : 0)}</span><span className="block text-xs text-ink-3">a hand</span></> : <span className="text-ink-2">Sit out</span>}</p>
                  </div>
                  <p className="tnum hidden min-w-0 whitespace-nowrap text-sm text-ink-2 wide-card:col-start-3 wide-card:row-start-1 wide-card:block">{step.units > 0 ? <>{money(bet, bet % 1 ? 2 : 0)}<span className="text-ink-3"> a hand</span></> : "Sit out"}</p>
                  <div className="col-span-2 flex items-center gap-2 wide-card:col-span-1 wide-card:col-start-4 wide-card:row-start-1">
                    <span aria-hidden className="text-xs font-medium text-ink-3 wide-card:hidden">Hands</span>
                    <Segmented
                      label={`Hands at ${range}`}
                      hideLabel
                      name={`hands_per_count_${step.from}`}
                      value={step.hands}
                      onChange={(hands) => onChange(setStepHands(steps, index, hands))}
                      options={[1, 2, 3].map((hands) => ({ value: hands, label: <span aria-label={`${hands} hand${hands === 1 ? "" : "s"} at ${range}`}>{hands}</span> }))}
                      className="w-36 wide-card:w-full"
                    />
                  </div>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" disabled={!canAddStep(steps)} onClick={add} icon={<Plus size={16} aria-hidden />}>Add a step</Button>
        {!canAddStep(steps) && <p className="text-xs text-ink-3">The last step starts at +8. Move a step&apos;s start to make room.</p>}
      </div>
    </div>
  );
}
