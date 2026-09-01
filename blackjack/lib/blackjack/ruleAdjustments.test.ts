import { describe, expect, it } from "vitest";
import { calculateAdvantage, DEFAULT_ADVANTAGE_RULES, getCountProfile, RAMPS } from "./advantage";
import { H17_PRO_COEFFICIENTS } from "./h17ProCoefficients";
import { NO_INDEX_COEFFICIENTS } from "./noIndexCoefficients";
import { RULE_DELTAS, sumRuleAdjustment, isEstimated, ruleAdjustmentFlagsFromRules } from "./ruleAdjustments";

const baseInput = {
  bankroll: 10_000,
  bettingUnit: 10,
  handsPerHour: 100,
  hours: 4,
  rules: DEFAULT_ADVANTAGE_RULES,
  ramp: RAMPS["1-8"],
};

describe("rule-adjustment defaults", () => {
  it("leaves calculateAdvantage unchanged when ruleAdjustment is omitted", () => {
    const withoutFields = calculateAdvantage(baseInput);
    const withDefaults = calculateAdvantage({ ...baseInput, ruleAdjustment: 0 });
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
    calculateAdvantage(baseInput).rows.forEach((row, index) => {
      expect(row.advantage).toBeCloseTo(measured[index][1], 12);
      expect(row.frequency).toBeCloseTo(measured[index][0], 12);
      expect(row.sdUnits).toBeCloseTo(measured[index][2], 12);
    });
    const basic = calculateAdvantage({ ...baseInput, rules: { ...DEFAULT_ADVANTAGE_RULES, useIndices: false } });
    basic.rows.forEach((row, index) => expect(row.advantage).toBeCloseTo(NO_INDEX_COEFFICIENTS["6-4.5"][index][1], 12));
    expect(calculateAdvantage(baseInput).rows.at(-1)!.advantage).toBeGreaterThan(0.03);
  });

  it("prices rules carried on the rules object without being asked to", () => {
    // Compare Scenarios and the Trip Planner render these switches and never
    // passed a ruleAdjustment, so a 6:5 no-DAS game used to price identically
    // to a liberal 3:2 one.
    const liberal = calculateAdvantage(baseInput);
    const stingy = calculateAdvantage({
      ...baseInput,
      rules: { ...DEFAULT_ADVANTAGE_RULES, doubleAfterSplit: false, resplitAces: false, lateSurrender: false, blackjackPayout: 1.2 },
    });
    const expected = RULE_DELTAS.noDoubleAfterSplit + RULE_DELTAS.noResplitAces + RULE_DELTAS.noLateSurrender + RULE_DELTAS.blackjackPays6to5;
    expect(stingy.rows[0].advantage).toBeCloseTo(liberal.rows[0].advantage + expected, 12);
    expect(stingy.hourlyEv).toBeLessThan(liberal.hourlyEv);
    // An explicit ruleAdjustment stacks on top rather than replacing it.
    const enhc = calculateAdvantage({ ...baseInput, ruleAdjustment: RULE_DELTAS.europeanNoHoleCard });
    expect(enhc.rows[0].advantage).toBeCloseTo(liberal.rows[0].advantage + RULE_DELTAS.europeanNoHoleCard, 12);
  });

  it("keeps the count distribution normalized", () => {
    expect(getCountProfile(DEFAULT_ADVANTAGE_RULES).reduce((sum, row) => sum + row.p, 0)).toBeCloseTo(1, 10);
  });

  it("switches curves on rules.useIndices rather than shrinking one toward the other", () => {
    const withIndices = calculateAdvantage(baseInput);
    const basicOnly = calculateAdvantage({ ...baseInput, rules: { ...DEFAULT_ADVANTAGE_RULES, useIndices: false } });
    expect(basicOnly.hourlyEv).toBeLessThan(withIndices.hourlyEv);
    // A +8 shoe is worth over 4% to a pure basic-strategy player, not near zero.
    expect(basicOnly.rows.at(-1)!.advantage).toBeGreaterThan(0.03);
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

describe("ruleAdjustmentFlagsFromRules", () => {
  it("maps the audited baseline rules to no active flags", () => {
    expect(ruleAdjustmentFlagsFromRules(DEFAULT_ADVANTAGE_RULES)).toEqual({
      dealerStandsSoft17: false,
      noDoubleAfterSplit: false,
      noResplitAces: false,
      noLateSurrender: false,
      blackjackPays6to5: false,
    });
  });

  it("flags each rule that departs from baseline", () => {
    const flags = ruleAdjustmentFlagsFromRules({
      ...DEFAULT_ADVANTAGE_RULES,
      dealerHitsSoft17: false,
      doubleAfterSplit: false,
      resplitAces: false,
      lateSurrender: false,
      blackjackPayout: 1.2,
    });
    expect(flags).toEqual({
      dealerStandsSoft17: true,
      noDoubleAfterSplit: true,
      noResplitAces: true,
      noLateSurrender: true,
      blackjackPays6to5: true,
    });
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
