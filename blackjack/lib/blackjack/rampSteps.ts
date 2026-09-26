import { unitsAt, type HandCountPoint, type RampPoint } from "./advantage";

/**
 * A bet ramp as counters write it: "from +3 bet 8 units". The saved format
 * stays the seventeen-point RampPoint[] (one point per audited true-count
 * bucket); steps are only a view over it, so turning a ramp into steps and
 * back never changes a count the player did not edit.
 */

export const MIN_TC = -8;
export const MAX_TC = 8;
/** The seventeen true-count buckets the audited coefficients are keyed on: −8 and below to +8 and above. */
export const TRUE_COUNTS: readonly number[] = Array.from({ length: MAX_TC - MIN_TC + 1 }, (_, index) => index + MIN_TC);

/** A run of consecutive true counts that share one bet size and one hand count. */
export interface RampStep {
  from: number;
  to: number;
  units: number;
  hands: number;
}

/** One point per true count, including older saves that stored only the points where the bet changes. */
export function expandRamp(ramp: readonly RampPoint[]): RampPoint[] {
  const points = [...ramp];
  return TRUE_COUNTS.map((trueCount) => ({ trueCount, units: unitsAt(trueCount, points) }));
}

/** One hand count per true count; counts a schedule does not mention play one hand. */
export function expandHands(schedule: readonly HandCountPoint[] | undefined): HandCountPoint[] {
  const byCount = new Map((schedule ?? []).map((point) => [point.trueCount, point.hands]));
  return TRUE_COUNTS.map((trueCount) => ({ trueCount, hands: byCount.get(trueCount) ?? 1 }));
}

/** Whether two ramps bet the same at every count (compared by value, never by reference). */
export function sameRamp(first: readonly RampPoint[], second: readonly RampPoint[], tolerance = 1e-9) {
  const a = expandRamp(first), b = expandRamp(second);
  return a.every((point, index) => Math.abs(point.units - b[index].units) < tolerance);
}

/**
 * Groups the counts from `start` up into steps. A new step begins wherever the
 * bet or the hand count changes, and at every count listed in `boundaries`, so
 * an editor can keep two equal neighbouring steps apart while someone types.
 */
export function toSteps(
  ramp: readonly RampPoint[],
  hands?: readonly HandCountPoint[],
  { start = MIN_TC, boundaries = [] }: { start?: number; boundaries?: readonly number[] } = {},
): RampStep[] {
  const units = expandRamp(ramp), handCounts = expandHands(hands);
  const first = Math.max(MIN_TC, Math.min(MAX_TC, start));
  const steps: RampStep[] = [];
  for (let trueCount = first; trueCount <= MAX_TC; trueCount++) {
    const index = trueCount - MIN_TC;
    const current = { units: units[index].units, hands: handCounts[index].hands };
    const last = steps.at(-1);
    if (last && last.units === current.units && last.hands === current.hands && !boundaries.includes(trueCount)) last.to = trueCount;
    else steps.push({ from: trueCount, to: trueCount, ...current });
  }
  return steps;
}

/** Writes steps back as a full seventeen-point ramp and hand schedule. Counts no step covers keep their values. */
export function applySteps(
  ramp: readonly RampPoint[],
  hands: readonly HandCountPoint[] | undefined,
  steps: readonly RampStep[],
): { ramp: RampPoint[]; hands: HandCountPoint[] } {
  const stepAt = (trueCount: number) => steps.find((step) => trueCount >= step.from && trueCount <= step.to);
  return {
    ramp: expandRamp(ramp).map((point) => {
      const step = stepAt(point.trueCount);
      return step ? { ...point, units: step.units } : point;
    }),
    hands: expandHands(hands).map((point) => {
      const step = stepAt(point.trueCount);
      return step ? { ...point, hands: step.hands } : point;
    }),
  };
}

const replaceAt = (steps: readonly RampStep[], index: number, patch: Partial<RampStep>) =>
  steps.map((step, position) => (position === index ? { ...step, ...patch } : step));

export function setStepUnits(steps: readonly RampStep[], index: number, units: number): RampStep[] {
  if (!steps[index] || !Number.isFinite(units)) return [...steps];
  return replaceAt(steps, index, { units: Math.max(0, units) });
}

export function setStepHands(steps: readonly RampStep[], index: number, hands: number): RampStep[] {
  if (!steps[index] || !Number.isFinite(hands)) return [...steps];
  return replaceAt(steps, index, { hands: Math.min(3, Math.max(1, Math.round(hands))) });
}

/** The counts a step may start at: after the previous step's first count, up to its own last count. */
export function allowedStarts(steps: readonly RampStep[], index: number): number[] {
  const step = steps[index], previous = steps[index - 1];
  if (!step || !previous) return [];
  return TRUE_COUNTS.filter((trueCount) => trueCount > previous.from && trueCount <= step.to);
}

/**
 * Moves the boundary in front of a step. Counts that leave the step take the
 * previous step's bet; counts that join it take this step's bet.
 */
export function moveStepStart(steps: readonly RampStep[], index: number, from: number): RampStep[] {
  const options = allowedStarts(steps, index);
  if (!options.length) return [...steps];
  const start = Math.min(options.at(-1)!, Math.max(options[0], Math.round(from)));
  return steps.map((step, position) =>
    position === index - 1 ? { ...step, to: start - 1 } : position === index ? { ...step, from: start } : step,
  );
}

/** Whether another step fits after the last one. */
export const canAddStep = (steps: readonly RampStep[]) => (steps.at(-1)?.from ?? MAX_TC) < MAX_TC;

/** Splits the last step one count above its start, betting one unit more from there. */
export function addStep(steps: readonly RampStep[]): RampStep[] {
  const last = steps.at(-1);
  if (!last || !canAddStep(steps)) return [...steps];
  return [...steps.slice(0, -1), { ...last, to: last.from }, { from: last.from + 1, to: last.to, units: last.units + 1, hands: last.hands }];
}

/** Removes a step; its counts join the step before it and take that step's bet. */
export function removeStep(steps: readonly RampStep[], index: number): RampStep[] {
  if (index <= 0 || index >= steps.length) return [...steps];
  return steps.flatMap((step, position) =>
    position === index ? [] : position === index - 1 ? [{ ...step, to: steps[index].to }] : [step],
  );
}

/** "+3", "0" or "−3", with a true minus sign. */
export const tcLabel = (trueCount: number) => (trueCount > 0 ? `+${trueCount}` : trueCount < 0 ? `−${-trueCount}` : "0");

/** Units without float noise: 1, 1.5, 0.25. */
export const unitLabel = (units: number) => String(Number(units.toFixed(2)));

/** "0 and below", "+2 to +3", "+4 and up", or "Every count". */
export function stepRangeLabel(step: Pick<RampStep, "from" | "to">) {
  if (step.from <= MIN_TC && step.to >= MAX_TC) return "Every count";
  if (step.from <= MIN_TC) return `${tcLabel(step.to)} and below`;
  if (step.to >= MAX_TC) return `${tcLabel(step.from)} and up`;
  if (step.from === step.to) return tcLabel(step.from);
  return `${tcLabel(step.from)} to ${tcLabel(step.to)}`;
}

/** A plain sentence for the ramp, for screen readers and summaries. */
export function stepsSummary(steps: readonly RampStep[], sittingOutBelow: number | null = null) {
  const parts = steps.map((step, index) => {
    const range = stepRangeLabel(step).replace(/^Every count$/, "every count");
    if (step.units <= 0) return `sit out at ${range}`;
    const units = unitLabel(step.units);
    return index === 0 ? `${units} unit${step.units === 1 ? "" : "s"} at ${range}` : `${units} at ${range}`;
  });
  const sittingOut = sittingOutBelow === null ? "" : ` Sitting out below ${tcLabel(sittingOutBelow)}.`;
  return `${parts.join(", ")}.${sittingOut}`;
}

/** "1 hand at every count", or "1 hand at +2 and below · 2 hands at +3 and up". */
export function handsSummary(hands: readonly HandCountPoint[] | undefined, start = MIN_TC) {
  const runs: RampStep[] = [];
  for (const point of expandHands(hands)) {
    if (point.trueCount < start) continue;
    const last = runs.at(-1);
    if (last && last.hands === point.hands) last.to = point.trueCount;
    else runs.push({ from: point.trueCount, to: point.trueCount, units: 0, hands: point.hands });
  }
  const noun = (count: number) => `${count} hand${count === 1 ? "" : "s"}`;
  if (runs.length === 1) return `${noun(runs[0].hands)} at every count${start > MIN_TC ? " you play" : ""}`;
  return runs.map((run) => `${noun(run.hands)} at ${stepRangeLabel(run)}`).join(" · ");
}
