import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import { planTrip } from "./tripPlanning";

const baseInput = {
  bettingUnit: 25,
  playerHands: 1,
  handsPerHour: 100,
  hours: 8,
  rules: DEFAULT_ADVANTAGE_RULES,
  ramp: RAMPS["1-8"],
};

describe("planTrip", () => {
  it("gives near-zero bust probability for a large bankroll with positive EV", () => {
    const plan = planTrip({ ...baseInput, bankroll: 1_000_000 });
    expect(plan.bustProbability).toBeLessThan(0.01);
    expect(plan.tripEv).toBeGreaterThan(0);
  });

  it("gives a high bust probability for a small bankroll", () => {
    const small = planTrip({ ...baseInput, bankroll: 100 });
    const large = planTrip({ ...baseInput, bankroll: 100_000 });
    expect(small.bustProbability).toBeGreaterThan(large.bustProbability);
  });

  it("always predicts ruin for a zero bankroll", () => {
    expect(planTrip({ ...baseInput, bankroll: 0 }).bustProbability).toBe(1);
  });

  it("loss probability increases with the loss threshold decreasing (more likely to lose at least a little than a lot)", () => {
    const plan = planTrip({ ...baseInput, bankroll: 10_000 });
    expect(plan.lossProbability(100)).toBeGreaterThanOrEqual(plan.lossProbability(5000));
  });

  it("goal probability decreases as the goal grows", () => {
    const plan = planTrip({ ...baseInput, bankroll: 10_000 });
    expect(plan.goalProbability(100)).toBeGreaterThanOrEqual(plan.goalProbability(10_000));
  });

  it("expected ending bankroll is bankroll plus trip EV, with a symmetric 95% band", () => {
    const plan = planTrip({ ...baseInput, bankroll: 5000 });
    expect(plan.expectedEndingBankroll).toBeCloseTo(5000 + plan.tripEv, 6);
    const bandWidth = plan.ci95High - plan.expectedEndingBankroll;
    expect(plan.expectedEndingBankroll - plan.ci95Low).toBeCloseTo(bandWidth, 6);
  });
});
