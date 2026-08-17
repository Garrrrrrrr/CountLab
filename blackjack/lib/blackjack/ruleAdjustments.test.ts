import { describe, expect, it } from "vitest";
import { calculateAdvantage, DEFAULT_ADVANTAGE_RULES, getCountProfile, RAMPS } from "./advantage";
import { H17_PRO_COEFFICIENTS } from "./h17ProCoefficients";
import { NO_INDEX_COEFFICIENTS } from "./noIndexCoefficients";
import { RULE_DELTAS, sumRuleAdjustment, isEstimated } from "./ruleAdjustments";

const baseInput = {
  bankroll: 10_000,
  bettingUnit: 10,
  handsPerHour: 100,
  hours: 4,
  rules: DEFAULT_ADVANTAGE_RULES,
  ramp: RAMPS["1-8"],
};

describe("rule-adjustment defaults", () => {
  it("leaves calculateAdvantage unchanged when ruleAdjustment/deviationSkill are omitted", () => {
    const withoutFields = calculateAdvantage(baseInput);
    const withDefaults = calculateAdvantage({ ...baseInput, ruleAdjustment: 0, deviationSkill: 1 });
    expect(withDefaults.evPerRound).toBeCloseTo(withoutFields.evPerRound, 12);
    expect(withDefaults.rows).toEqual(withoutFields.rows);
  });

  it("shifts every row's advantage by exactly the rule delta", () => {
    const base = calculateAdvantage(baseInput);
    const adjusted = calculateAdvantage({ ...baseInput, ruleAdjustment: RULE_DELTAS.blackjackPays6to5 });
    for (let index = 0; index < base.rows.length; index += 1) {
      expect(adjusted.rows[index].advantage).toBeCloseTo(base.rows[index].advantage + RULE_DELTAS.blackjackPays6to5, 12);
    }
  });

  it("uses separately audited H17 Pro and basic-strategy curves", () => {
    const measured = H17_PRO_COEFFICIENTS["6-4.5"];
    for (const skill of [undefined, 0, 0.5, 1]) {
      const result = calculateAdvantage({ ...baseInput, deviationSkill: skill });
      result.rows.forEach((row, index) => {
        expect(row.advantage).toBeCloseTo(measured[index][1], 12);
        expect(row.frequency).toBeCloseTo(measured[index][0], 12);
        expect(row.sdUnits).toBeCloseTo(measured[index][2], 12);
      });
    }
    const basic = calculateAdvantage({ ...baseInput, rules: { ...DEFAULT_ADVANTAGE_RULES, useIndices: false } });
    basic.rows.forEach((row, index) => expect(row.advantage).toBeCloseTo(NO_INDEX_COEFFICIENTS["6-4.5"][index][1], 12));
    expect(calculateAdvantage(baseInput).rows.at(-1)!.advantage).toBeGreaterThan(0.03);
  });

  it("keeps the count distribution normalized", () => {
    expect(getCountProfile(DEFAULT_ADVANTAGE_RULES).reduce((sum, row) => sum + row.p, 0)).toBeCloseTo(1, 10);
  });

  it("does not change hourly EV when a legacy deviation skill is supplied", () => {
    const baseline = calculateAdvantage(baseInput).hourlyEv;
    for (const skill of [0, 0.7, 0.92, 1]) {
      expect(calculateAdvantage({ ...baseInput, deviationSkill: skill }).hourlyEv).toBeCloseTo(baseline, 12);
    }
  });

});

describe("sumRuleAdjustment", () => {
  it("sums only the active deltas", () => {
    expect(sumRuleAdjustment({})).toBe(0);
    expect(sumRuleAdjustment({ blackjackPays6to5: true })).toBeCloseTo(RULE_DELTAS.blackjackPays6to5, 12);
    expect(sumRuleAdjustment({ blackjackPays6to5: true, noDoubleAfterSplit: true })).toBeCloseTo(
      RULE_DELTAS.blackjackPays6to5 + RULE_DELTAS.noDoubleAfterSplit,
      12,
    );
  });

  it("applies the restricted-doubling delta matching the selected restriction", () => {
    expect(sumRuleAdjustment({ doubleOnly9to11: true })).toBeCloseTo(RULE_DELTAS.doubleOnly9to11, 12);
    expect(sumRuleAdjustment({ doubleOnly10to11: true })).toBeCloseTo(RULE_DELTAS.doubleOnly10to11, 12);
  });
});

describe("isEstimated", () => {
  it("is false at the audited baseline", () => {
    expect(isEstimated({})).toBe(false);
  });
  it("is true when a rule adjustment is active", () => {
    expect(isEstimated({ noLateSurrender: true })).toBe(true);
  });
});
