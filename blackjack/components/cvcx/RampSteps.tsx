"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics/track";
import { money } from "@/lib/blackjack/labFormat";
import {
  addStep,
  allowedStarts,
  canAddStep,
  MAX_TC,
  moveStepStart,
  removeStep,
  setStepHands,
  setStepUnits,
  stepRangeLabel,
  tcLabel,
  type RampStep,
} from "@/lib/blackjack/rampSteps";
import { announce, GhostButton, SegmentedControl, Stepper } from "@/components/ui";

/** Focuses the units field of the step that starts at `from`. */
export function focusStepUnits(from: number) {
  document.querySelector<HTMLInputElement>(`[data-step-from="${from}"] input[type="number"]`)?.focus();
}

/**
 * The bet ramp as a short list of steps ("+3 to +3: 8 units, 1 hand"). Each
 * step has its start, its bet in units and its hands; steps can be added
 * above the last one and removed into the one before.
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
        <p className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-[var(--rule)] px-3 text-sm text-[var(--ink-muted)]">
          <i className="fa-solid fa-person-walking-arrow-right text-xs" aria-hidden="true" />
          <span><b className="font-data text-[var(--ink)]">Below {tcLabel(sittingOutBelow)}</b>: sitting out (set by When you play)</span>
        </p>
      )}
      <div className="lab-steps">
        <div className="lab-steps-head pb-1 text-xs font-medium text-[var(--ink-muted)]" aria-hidden="true">
          <span>True count</span><span>Units per hand</span><span>Bet per hand</span><span>Hands</span>
        </div>
        <ol className="grid gap-2">
          {steps.map((step, index) => {
            const bet = step.units * unit;
            const range = stepRangeLabel(step);
            const rest = step.to >= MAX_TC ? "and up" : step.to === step.from ? "only" : `to ${tcLabel(step.to)}`;
            return (
              <li key={step.from}>
                <fieldset data-step-from={step.from} className="m-0 min-w-0 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-2.5">
                  <legend className="sr-only">Step {index + 1}: true count {range}</legend>
                  <div className="lab-step">
                    <div className="flex min-h-11 min-w-0 items-center gap-2 font-data text-sm font-semibold [grid-area:range]">
                      {index === 0 ? range : (
                        <>
                          <select
                            aria-label={`Step ${index + 1} starts at`}
                            value={step.from}
                            data-analytics-field="ramp_step_start"
                            onChange={(event) => onChange(moveStepStart(steps, index, Number(event.target.value)))}
                            className="field min-h-11 rounded-lg px-2.5 font-data text-[.9rem] font-semibold text-[var(--ink)] outline-none"
                          >
                            {allowedStarts(steps, index).map((trueCount) => <option key={trueCount} value={trueCount}>{tcLabel(trueCount)}</option>)}
                          </select>
                          <span className="font-normal text-[var(--ink-muted)]">{rest}</span>
                        </>
                      )}
                    </div>
                    <div className="[grid-area:units]" onClickCapture={(event) => { if ((event.target as Element).closest("button")) track("cvcx_input_changed", { input: "ramp_step_units" }); }}>
                      <Stepper hideLabel label={`Units at ${range}`} value={step.units} min={0} step={1} analyticsField="ramp_step_units" className="lab-stepper w-36" onValueChange={(units) => onChange(setStepUnits(steps, index, units))} />
                    </div>
                    <p className="min-w-0 font-data text-sm text-[var(--ink-muted)] [grid-area:bet]">
                      {step.units > 0 ? <>{money(bet, bet % 1 ? 2 : 0)}<span className="lab-step-caption"> a hand</span></> : "Sit out"}
                    </p>
                    <div className="flex items-center gap-2 [grid-area:hands]">
                      <span aria-hidden="true" className="lab-step-caption text-xs font-medium text-[var(--ink-muted)]">Hands</span>
                      <SegmentedControl
                        label={`Hands at ${range}`}
                        hideLabel
                        name={`step-hands-${step.from}`}
                        size="compact"
                        analyticsField="hands_per_count"
                        value={String(step.hands)}
                        onChange={(value) => onChange(setStepHands(steps, index, Number(value)))}
                        options={[1, 2, 3].map((hands) => ({ value: String(hands), label: String(hands), ariaLabel: `${hands} hand${hands === 1 ? "" : "s"} at ${range}` }))}
                      />
                    </div>
                    {index > 0 && (
                      <button type="button" onClick={() => remove(index)} aria-label={`Remove step starting at ${tcLabel(step.from)}`} className="pressable grid h-11 w-11 shrink-0 place-items-center justify-self-end rounded-lg border border-[var(--rule)] text-sm text-[var(--ink-muted)] outline-none [grid-area:remove] hover:border-[var(--ink-muted)] hover:text-[var(--negative)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <GhostButton size="compact" disabled={!canAddStep(steps)} onClick={add}>
          <i className="fa-solid fa-plus mr-2" aria-hidden="true" />Add a step
        </GhostButton>
        {!canAddStep(steps) && <p className="text-xs text-[var(--ink-muted)]">The last step starts at +8. Change a step&apos;s start to make room.</p>}
      </div>
    </div>
  );
}
