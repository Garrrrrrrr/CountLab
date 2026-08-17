import { describe, expect, it } from "vitest";
import { calculateAdvantage, DEFAULT_ADVANTAGE_RULES, getCountProfile, RAMPS } from "./advantage";
import { NO_INDEX_COEFFICIENTS } from "./noIndexCoefficients";
import { RAW_COEFFICIENTS } from "./coefficients";
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

  it("reproduces the audited basic-strategy curve when deviationSkill is 0", () => {
    // The old model shrank every count toward the neutral-count edge, which
    // claimed a +8 shoe was worth about -0.2% to a basic-strategy player. The
    // measured value is around +4.2%. Skill 0 must now BE the audited no-index
    // run, not an invented anchor.
    const result = calculateAdvantage({ ...baseInput, deviationSkill: 0 });
    const measured = NO_INDEX_COEFFICIENTS["6-4.5"];
    result.rows.forEach((row, index) => {
      expect(row.advantage).toBeCloseTo(measured[index][1], 12);
      expect(row.frequency).toBeCloseTo(measured[index][0], 12);
      expect(row.sdUnits).toBeCloseTo(measured[index][2], 12);
    });
    expect(result.rows.at(-1)!.advantage).toBeGreaterThan(0.03);
  });

  it("reproduces the audited full-index curve when deviationSkill is 1", () => {
    const result = calculateAdvantage({ ...baseInput, deviationSkill: 1 });
    const measured = RAW_COEFFICIENTS["6-4.5"];
    result.rows.forEach((row, index) => {
      expect(row.advantage).toBeCloseTo(measured[index][1], 12);
      expect(row.frequency).toBeCloseTo(measured[index][0], 12);
      expect(row.sdUnits).toBeCloseTo(measured[index][2], 12);
    });
  });

  it("interpolates linearly between the two measured curves", () => {
    const plain = calculateAdvantage({ ...baseInput, deviationSkill: 0 });
    const indexed = calculateAdvantage({ ...baseInput, deviationSkill: 1 });
    const half = calculateAdvantage({ ...baseInput, deviationSkill: 0.5 });
    half.rows.forEach((row, index) => {
      expect(row.advantage).toBeCloseTo(
        (plain.rows[index].advantage + indexed.rows[index].advantage) / 2,
        12,
      );
    });
    // Index play is worth more at the counts where the money goes in, so
    // partial skill must sit strictly between the two curves at high counts.
    const top = half.rows.length - 1;
    expect(half.rows[top].advantage).toBeGreaterThan(plain.rows[top].advantage);
    expect(half.rows[top].advantage).toBeLessThan(indexed.rows[top].advantage);
  });

  it("keeps the count distribution normalized at every skill level", () => {
    for (const skill of [0, 0.7, 0.82, 0.92, 1]) {
      const total = getCountProfile(DEFAULT_ADVANTAGE_RULES, skill).reduce(
        (sum, row) => sum + row.p,
        0,
      );
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it("lowers hourly EV as deviation skill drops", () => {
    const evs = [0, 0.7, 0.92, 1].map(
      (skill) => calculateAdvantage({ ...baseInput, deviationSkill: skill }).hourlyEv,
    );
    for (let index = 1; index < evs.length; index += 1) {
      expect(evs[index]).toBeGreaterThan(evs[index - 1]);
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
    expect(isEstimated({}, 1)).toBe(false);
  });
  it("is true when any flag is active or skill is imperfect", () => {
    expect(isEstimated({ noLateSurrender: true }, 1)).toBe(true);
    expect(isEstimated({}, 0.92)).toBe(true);
  });
});
