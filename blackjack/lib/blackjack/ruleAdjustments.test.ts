import { describe, expect, it } from "vitest";
import { calculateAdvantage, DEFAULT_ADVANTAGE_RULES, estimateOffTopEdge, RAMPS } from "./advantage";
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

  it("collapses every row's advantage to the flat off-top edge when deviationSkill is 0", () => {
    const offTop = estimateOffTopEdge(DEFAULT_ADVANTAGE_RULES);
    const result = calculateAdvantage({ ...baseInput, deviationSkill: 0 });
    for (const row of result.rows) {
      expect(row.advantage).toBeCloseTo(offTop, 12);
    }
  });

  it("partially regresses advantage toward off-top edge for intermediate skill", () => {
    const offTop = estimateOffTopEdge(DEFAULT_ADVANTAGE_RULES);
    const base = calculateAdvantage(baseInput);
    const half = calculateAdvantage({ ...baseInput, deviationSkill: 0.5 });
    for (let index = 0; index < base.rows.length; index += 1) {
      const expected = offTop + 0.5 * (base.rows[index].advantage - offTop);
      expect(half.rows[index].advantage).toBeCloseTo(expected, 12);
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
});

describe("isEstimated", () => {
  it("is false at the audited baseline", () => {
    expect(isEstimated({}, 1)).toBe(false);
  });
  it("is true when any flag is active or skill is imperfect", () => {
    expect(isEstimated({ noLateSurrender: true }, 1)).toBe(true);
    expect(isEstimated({}, 0.92)).toBe(true);
  });
});
