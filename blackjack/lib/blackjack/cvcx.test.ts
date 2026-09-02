import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import {
  analyzeCvcx,
  createOptimalRamp,
  finiteHorizonRisk,
  goalByHorizonProbability,
  normalCdf,
  requiredBankroll,
  resultPercentile,
} from "./cvcx";

describe("CVCX calculations", () => {
  it("keeps normal-distribution helpers within their mathematical bounds", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(-2)).toBeLessThan(0.03);
    expect(normalCdf(2)).toBeGreaterThan(0.97);
    expect(resultPercentile(12, 10, 2)).toBeGreaterThan(0.8);
    expect(resultPercentile(10, 10, 0)).toBe(1);
  });

  it("handles invalid bankroll targets explicitly", () => {
    expect(requiredBankroll(0, 1, 0.1)).toBe(Infinity);
    expect(requiredBankroll(1, 0, 0.1)).toBe(Infinity);
    expect(requiredBankroll(1, 1, 1)).toBe(0);
    expect(requiredBankroll(1, 1, 0)).toBe(Infinity);
  });

  it("produces a ramp for every count bucket with the Wong-out region at zero", () => {
    const ramp = createOptimalRamp(DEFAULT_ADVANTAGE_RULES, 8, 1);

    expect(ramp).toHaveLength(17);
    expect(ramp.filter((point) => point.trueCount < 1).every((point) => point.units === 0)).toBe(true);
    expect(ramp.filter((point) => point.trueCount >= 1).every((point) => point.units >= 1 && point.units <= 8)).toBe(true);
  });

  it("returns bounded finite-horizon outcomes for a complete scenario", () => {
    const result = analyzeCvcx({
      bankroll: 10_000,
      minimumBet: 25,
      handsPerHour: 100,
      hours: 8,
      targetRisk: 0.135,
      maxSpread: 8,
      wongInAt: null,
      rules: DEFAULT_ADVANTAGE_RULES,
    }, RAMPS["1-8"]);

    expect(result.playedFrequency).toBeCloseTo(1, 10);
    expect(result.chanceOfProfit).toBeGreaterThanOrEqual(0);
    expect(result.chanceOfProfit).toBeLessThanOrEqual(1);
    expect(result.tripRiskOfRuin).toBeGreaterThanOrEqual(0);
    expect(result.tripRiskOfRuin).toBeLessThanOrEqual(1);
    expect(finiteHorizonRisk(0, 1, 1, 10)).toBe(1);
    expect(goalByHorizonProbability(0, 0, 1, 10)).toBe(1);
  });
});
