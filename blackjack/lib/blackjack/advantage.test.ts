import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADVANTAGE_RULES,
  RAMPS,
  calculateAdvantage,
  getCountProfile,
  handsAt,
  simultaneousHandVarianceFactor,
  unitsAt,
  zeroBetsBelow,
} from "./advantage";

describe("advantage model", () => {
  it("uses a complete, auditable true-count distribution", () => {
    const profile = getCountProfile(DEFAULT_ADVANTAGE_RULES);

    expect(profile).toHaveLength(17);
    expect(profile.map((row) => row.tc)).toEqual(Array.from({ length: 17 }, (_, index) => index - 8));
    expect(profile.reduce((sum, row) => sum + row.p, 0)).toBeCloseTo(1, 10);
    expect(profile.every((row) => row.ci95[0] <= row.adv && row.ci95[1] >= row.adv)).toBe(true);
  });

  it("selects the final eligible ramp and hand-count steps without mutating schedules", () => {
    const ramp = [{ trueCount: 3, units: 4 }, { trueCount: -8, units: 1 }, { trueCount: 1, units: 2 }];
    const hands = [{ trueCount: 3, hands: 3 }, { trueCount: 1, hands: 2 }];

    expect(unitsAt(2, ramp)).toBe(2);
    expect(handsAt(2, hands, 1)).toBe(2);
    expect(handsAt(9, [{ trueCount: -8, hands: 12 }], 1)).toBe(7);
    expect(ramp[0].trueCount).toBe(3);
    expect(hands[0].trueCount).toBe(3);
  });

  it("accounts for shared-dealer variance when multiple hands are in play", () => {
    expect(simultaneousHandVarianceFactor(1)).toBe(1);
    expect(simultaneousHandVarianceFactor(2)).toBeCloseTo(2.7448, 8);
    expect(simultaneousHandVarianceFactor(3)).toBeGreaterThan(3);
  });

  it("prices a positive-count spread as a bounded result", () => {
    const result = calculateAdvantage({
      bankroll: 10_000,
      bettingUnit: 25,
      playerHands: 1,
      handsPerHour: 100,
      hours: 4,
      rules: DEFAULT_ADVANTAGE_RULES,
      ramp: RAMPS["1-8"],
    });

    expect(result.rows).toHaveLength(17);
    expect(result.averageBet).toBeGreaterThan(25);
    expect(result.sdPerRound).toBeGreaterThan(0);
    expect(result.riskOfRuin).toBeGreaterThanOrEqual(0);
    expect(result.riskOfRuin).toBeLessThanOrEqual(1);
  });

  it("zeros only the requested low-count ramp steps", () => {
    const ramp = zeroBetsBelow(RAMPS["1-4"], 2);
    expect(ramp.map((point) => point.units)).toEqual([0, 2, 3, 4]);
    expect(RAMPS["1-4"][0].units).toBe(1);
  });
});
