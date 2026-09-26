import { describe, expect, it } from "vitest";
import { RAMPS, type RampPoint } from "./advantage";
import {
  addStep,
  allowedStarts,
  applySteps,
  canAddStep,
  expandHands,
  expandRamp,
  handsSummary,
  moveStepStart,
  removeStep,
  sameRamp,
  setStepHands,
  setStepUnits,
  stepRangeLabel,
  stepsSummary,
  tcLabel,
  toSteps,
  TRUE_COUNTS,
  unitLabel,
} from "./rampSteps";

const ramp = (units: number[]): RampPoint[] => TRUE_COUNTS.map((trueCount, index) => ({ trueCount, units: units[index] }));
const oneToTwelve = expandRamp(RAMPS["1-12"]);

describe("expandRamp", () => {
  it("fills a sparse preset into one point per true count", () => {
    const expanded = expandRamp(RAMPS["1-12"]);
    expect(expanded).toHaveLength(17);
    expect(expanded.map((point) => point.units)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 4, 8, 12, 12, 12, 12, 12]);
  });

  it("leaves a full ramp unchanged", () => {
    const full = ramp([0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 3, 3, 6, 6, 6, 6, 9]);
    expect(expandRamp(full)).toEqual(full);
  });
});

describe("expandHands", () => {
  it("defaults counts a schedule omits to one hand", () => {
    const hands = expandHands([{ trueCount: 3, hands: 2 }]);
    expect(hands.map((point) => point.hands)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1]);
    expect(expandHands(undefined).every((point) => point.hands === 1)).toBe(true);
  });
});

describe("sameRamp", () => {
  it("compares by value, not by reference", () => {
    expect(sameRamp(RAMPS["1-12"], oneToTwelve)).toBe(true);
    expect(sameRamp(oneToTwelve, oneToTwelve.map((point) => ({ ...point })))).toBe(true);
    expect(sameRamp(oneToTwelve, oneToTwelve.map((point) => (point.trueCount === 3 ? { ...point, units: 7.5 } : point)))).toBe(false);
  });

  it("ignores floating-point noise", () => {
    expect(sameRamp(oneToTwelve, oneToTwelve.map((point) => ({ ...point, units: point.units + 1e-12 })))).toBe(true);
  });
});

describe("toSteps", () => {
  it("groups runs of equal bets", () => {
    expect(toSteps(RAMPS["1-12"])).toEqual([
      { from: -8, to: 0, units: 1, hands: 1 },
      { from: 1, to: 1, units: 2, hands: 1 },
      { from: 2, to: 2, units: 4, hands: 1 },
      { from: 3, to: 3, units: 8, hands: 1 },
      { from: 4, to: 8, units: 12, hands: 1 },
    ]);
  });

  it("keeps non-monotonic ramps and zero-unit runs exactly", () => {
    const odd = ramp([0, 0, 0, 1, 1, 0, 0, 2, 2, 5, 3, 3, 8, 8, 8, 4, 4]);
    const steps = toSteps(odd);
    expect(steps.map((step) => [step.from, step.to, step.units])).toEqual([
      [-8, -6, 0], [-5, -4, 1], [-3, -2, 0], [-1, 0, 2], [1, 1, 5], [2, 3, 3], [4, 6, 8], [7, 8, 4],
    ]);
  });

  it("starts a new step where the hand count changes", () => {
    const hands = expandHands([{ trueCount: 4, hands: 2 }, { trueCount: 5, hands: 2 }, { trueCount: 6, hands: 2 }, { trueCount: 7, hands: 2 }, { trueCount: 8, hands: 2 }]);
    const steps = toSteps(RAMPS["1-8"], hands);
    expect(steps.at(-1)).toEqual({ from: 4, to: 8, units: 8, hands: 2 });
    const oneHand = toSteps(RAMPS["1-12"], hands.map((point) => (point.trueCount === 6 ? { ...point, hands: 1 } : point)));
    expect(oneHand.slice(-3).map((step) => [step.from, step.to, step.hands])).toEqual([[4, 5, 2], [6, 6, 1], [7, 8, 2]]);
  });

  it("covers only the counts from the start point", () => {
    const steps = toSteps(RAMPS["1-12"], undefined, { start: 1 });
    expect(steps[0]).toEqual({ from: 1, to: 1, units: 2, hands: 1 });
    expect(steps).toHaveLength(4);
  });

  it("keeps equal neighbours apart at requested boundaries", () => {
    const steps = toSteps(RAMPS["1-12"], undefined, { boundaries: [-3, 6] });
    expect(steps.map((step) => [step.from, step.to])).toEqual([[-8, -4], [-3, 0], [1, 1], [2, 2], [3, 3], [4, 5], [6, 8]]);
  });

  it("round-trips any ramp losslessly", () => {
    const samples = [
      oneToTwelve,
      ramp([0, 0, 0, 1, 1, 0, 0, 2, 2, 5, 3, 3, 8, 8, 8, 4, 4]),
      ramp([1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 2.25, 4.75, 7, 9.5, 12, 12, 12, 12]),
      ramp(Array(17).fill(0)),
    ];
    for (const sample of samples) {
      const hands = expandHands(TRUE_COUNTS.map((trueCount) => ({ trueCount, hands: trueCount > 3 ? 2 : 1 })));
      const back = applySteps(sample, hands, toSteps(sample, hands));
      expect(back.ramp).toEqual(sample);
      expect(back.hands).toEqual(hands);
    }
  });
});

describe("step edits", () => {
  const steps = toSteps(RAMPS["1-12"]);

  it("sets a step's units for every count in it", () => {
    const edited = setStepUnits(steps, 4, 16);
    expect(applySteps(oneToTwelve, undefined, edited).ramp.slice(12).map((point) => point.units)).toEqual([16, 16, 16, 16, 16]);
    expect(setStepUnits(steps, 1, -3)[1].units).toBe(0);
  });

  it("sets a step's hands between one and three", () => {
    expect(setStepHands(steps, 3, 2)[3].hands).toBe(2);
    expect(setStepHands(steps, 3, 7)[3].hands).toBe(3);
  });

  it("offers start points after the previous step's start and up to the step's end", () => {
    expect(allowedStarts(steps, 4)).toEqual([4, 5, 6, 7, 8]);
    expect(allowedStarts(steps, 1)).toEqual([-7, -6, -5, -4, -3, -2, -1, 0, 1]);
    expect(allowedStarts(steps, 0)).toEqual([]);
  });

  it("moves a step's start later, giving the freed counts the previous bet", () => {
    const moved = moveStepStart(steps, 4, 6);
    expect(moved.slice(3)).toEqual([{ from: 3, to: 5, units: 8, hands: 1 }, { from: 6, to: 8, units: 12, hands: 1 }]);
  });

  it("moves a step's start earlier, giving the joined counts this step's bet", () => {
    const moved = moveStepStart(steps, 1, -2);
    expect(moved.slice(0, 2)).toEqual([{ from: -8, to: -3, units: 1, hands: 1 }, { from: -2, to: 1, units: 2, hands: 1 }]);
  });

  it("clamps a moved start to the allowed range", () => {
    expect(moveStepStart(steps, 4, 20)[4].from).toBe(8);
    expect(moveStepStart(steps, 4, -20)[4].from).toBe(4);
    expect(moveStepStart(steps, 0, 3)).toEqual(steps);
  });

  it("adds a step by splitting the last one a count higher with one more unit", () => {
    const added = addStep(steps);
    expect(added.slice(-2)).toEqual([{ from: 4, to: 4, units: 12, hands: 1 }, { from: 5, to: 8, units: 13, hands: 1 }]);
  });

  it("does not add a step when the last one starts at +8", () => {
    const full = moveStepStart(steps, 4, 8);
    expect(canAddStep(full)).toBe(false);
    expect(addStep(full)).toEqual(full);
    expect(canAddStep(steps)).toBe(true);
  });

  it("removes a step into the one before it", () => {
    const removed = removeStep(steps, 2);
    expect(removed.map((step) => [step.from, step.to, step.units])).toEqual([[-8, 0, 1], [1, 2, 2], [3, 3, 8], [4, 8, 12]]);
    expect(removeStep(steps, 0)).toEqual(steps);
  });

  it("writes steps that start above the sit-out point without touching counts below it", () => {
    const partial = setStepUnits(toSteps(oneToTwelve, undefined, { start: 2 }), 0, 5);
    const back = applySteps(oneToTwelve, undefined, partial).ramp;
    expect(back.slice(0, 10)).toEqual(oneToTwelve.slice(0, 10));
    expect(back[10].units).toBe(5);
  });
});

describe("labels", () => {
  it("writes true counts with signs", () => {
    expect([tcLabel(3), tcLabel(0), tcLabel(-2)]).toEqual(["+3", "0", "−2"]);
    expect([unitLabel(12), unitLabel(1.5), unitLabel(0.1 + 0.2)]).toEqual(["12", "1.5", "0.3"]);
  });

  it("names step ranges the way counters say them", () => {
    expect(stepRangeLabel({ from: -8, to: 0 })).toBe("0 and below");
    expect(stepRangeLabel({ from: 2, to: 3 })).toBe("+2 to +3");
    expect(stepRangeLabel({ from: 4, to: 8 })).toBe("+4 and up");
    expect(stepRangeLabel({ from: 1, to: 1 })).toBe("+1");
    expect(stepRangeLabel({ from: -8, to: 8 })).toBe("Every count");
  });

  it("summarizes the ramp in one sentence", () => {
    expect(stepsSummary(toSteps(RAMPS["1-12"]))).toBe("1 unit at 0 and below, 2 at +1, 4 at +2, 8 at +3, 12 at +4 and up.");
    expect(stepsSummary(toSteps(RAMPS["1-12"], undefined, { start: 1 }), 1)).toBe("2 units at +1, 4 at +2, 8 at +3, 12 at +4 and up. Sitting out below +1.");
    expect(stepsSummary([{ from: -8, to: 8, units: 0, hands: 1 }])).toBe("sit out at every count.");
  });

  it("summarizes hands per count", () => {
    expect(handsSummary(undefined)).toBe("1 hand at every count");
    expect(handsSummary(undefined, 1)).toBe("1 hand at every count you play");
    const hands = TRUE_COUNTS.map((trueCount) => ({ trueCount, hands: trueCount >= 3 ? 2 : 1 }));
    expect(handsSummary(hands)).toBe("1 hand at +2 and below · 2 hands at +3 and up");
  });
});
