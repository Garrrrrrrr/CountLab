import { describe, expect, it } from "vitest";
import { calculateAdvantage, DEFAULT_ADVANTAGE_RULES, getCountProfile, RAMPS } from "./advantage";
import { INDEX_TIER_COEFFICIENTS } from "./indexTierCoefficients";
import { RULE_DELTAS, sumRuleAdjustment, isEstimated } from "./ruleAdjustments";

const baseInput = { bankroll: 10_000, bettingUnit: 10, handsPerHour: 100, hours: 4, rules: DEFAULT_ADVANTAGE_RULES, ramp: RAMPS["1-8"] };

describe("index tiers", () => {
  it("uses the audited none and full tables exactly", () => {
    for (const tier of ["none", "full"] as const) {
      const result = calculateAdvantage({ ...baseInput, indexTier: tier });
      result.rows.forEach((row, index) => {
        const measured = INDEX_TIER_COEFFICIENTS[tier]["6-4.5"][index];
        expect(row.advantage).toBeCloseTo(measured[1], 12);
        expect(row.frequency).toBeCloseTo(measured[0], 12);
      });
    }
  });

  it("keeps every tier's count distribution normalized", () => {
    for (const tier of ["none", "70", "82", "i18fab4", "full"] as const)
      expect(getCountProfile(DEFAULT_ADVANTAGE_RULES, tier).reduce((sum, row) => sum + row.p, 0)).toBeCloseTo(1, 10);
  });

  it("does not blend tier values", () => {
    const row = getCountProfile(DEFAULT_ADVANTAGE_RULES, "70")[12];
    expect(row.adv).toBe(INDEX_TIER_COEFFICIENTS["70"]["6-4.5"][12][1]);
  });
});

describe("rule adjustments", () => {
  it("shifts every row by exactly the selected rule delta", () => {
    const base = calculateAdvantage(baseInput);
    const adjusted = calculateAdvantage({ ...baseInput, ruleAdjustment: RULE_DELTAS.blackjackPays6to5 });
    adjusted.rows.forEach((row, index) => expect(row.advantage).toBeCloseTo(base.rows[index].advantage + RULE_DELTAS.blackjackPays6to5, 12));
  });
  it("sums active deltas", () => {
    expect(sumRuleAdjustment({})).toBe(0);
    expect(sumRuleAdjustment({ blackjackPays6to5: true, noDoubleAfterSplit: true })).toBeCloseTo(RULE_DELTAS.blackjackPays6to5 + RULE_DELTAS.noDoubleAfterSplit, 12);
  });
  it("marks only changed rules as estimated", () => {
    expect(isEstimated({})).toBe(false);
    expect(isEstimated({ noLateSurrender: true })).toBe(true);
  });
});
