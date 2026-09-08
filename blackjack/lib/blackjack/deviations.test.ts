import { describe, expect, it } from "vitest";
import { deviationRulesForHand, deviationSentence, deviationTransition, DeviationRules, resolveDeviation } from "./deviations";
import { H17_PRO_DEVIATIONS } from "./h17Pro";
import { S17_PRO_DEVIATIONS } from "./s17Pro";

const h17LateSurrender: DeviationRules = { dealerHitsSoft17: true, lateSurrender: true };
const h17NoSurrender: DeviationRules = { dealerHitsSoft17: true, lateSurrender: false };
const s17LateSurrender: DeviationRules = { dealerHitsSoft17: false, lateSurrender: true };
const s17NoSurrender: DeviationRules = { dealerHitsSoft17: false, lateSurrender: false };

const findH17 = (hand: string, dealer: string, deviationAction?: string) =>
  H17_PRO_DEVIATIONS.find((row) => row.hand === hand && row.dealer === dealer && (!deviationAction || row.deviationAction === deviationAction))!;

describe("deviationSentence", () => {
  it("builds every H17 and S17 row into a sentence, under every rules combination the reference page offers", () => {
    for (const [catalog, rulesets] of [
      [H17_PRO_DEVIATIONS, [h17LateSurrender, h17NoSurrender]],
      [S17_PRO_DEVIATIONS, [s17LateSurrender, s17NoSurrender]],
    ] as const) {
      for (const row of catalog) {
        for (const rules of rulesets) {
          const sentence = deviationSentence(row, deviationTransition(row, rules));
          expect(sentence.length, `${row.hand} v ${row.dealer}`).toBeGreaterThan(0);
          expect(sentence.endsWith(".")).toBe(true);
        }
      }
    }
  });

  it("reads the 15 v 10 cell as a surrender the low counts take away", () => {
    const row = findH17("15", "10", "H");
    const sentence = deviationSentence(row, deviationTransition(row, h17LateSurrender));
    expect(sentence).toBe(
      "Hit when the true count is 0 or lower; otherwise surrender.",
    );
  });

  it("reads 16 v 9 the same way, at the index the chart prints", () => {
    const row = findH17("16", "9", "H");
    const sentence = deviationSentence(row, deviationTransition(row, h17LateSurrender));
    expect(sentence).toBe(
      "Hit when the true count is -1 or lower; otherwise surrender.",
    );
  });

  it("reads a two-sided cell (13 v 2) on the side its printed index belongs to", () => {
    const row = findH17("13", "2");
    const sentence = deviationSentence(row, deviationTransition(row, h17LateSurrender));
    expect(sentence).toBe(
      "Hit when the true count is -1 or lower; otherwise stand.",
    );
  });

  it("states upward indices from the simpler below-index play", () => {
    const row = findH17("12", "6");
    const sentence = deviationSentence(row, deviationTransition(row, h17LateSurrender));
    expect(sentence).toBe("Hit when the true count is below -3; otherwise stand.");
  });

  it("phrases an unconditional late-surrender play as a rule-availability condition, not a count", () => {
    const row = findH17("17", "A");
    const live = deviationSentence(row, deviationTransition(row, h17LateSurrender));
    expect(live).toBe(
      "Surrender when late surrender is available; otherwise stand.",
    );
    const dormant = deviationSentence(row, deviationTransition(row, h17NoSurrender));
    expect(dormant).toBe(
      "No change: basic strategy always says stand.",
    );
  });

  it("explains insurance without a redundant dealer clause", () => {
    const row = findH17("Insurance", "A");
    const sentence = deviationSentence(row, deviationTransition(row, h17LateSurrender));
    expect(sentence).toBe("Decline insurance when the true count is below +3; otherwise take insurance.");
  });

  it("appends the surrender-precedence caveat to starred stand indices", () => {
    const row = findH17("16", "10", "S");
    const sentence = deviationSentence(row, deviationTransition(row, h17NoSurrender));
    expect(sentence).toBe(
      "Hit when the true count is below 0; otherwise stand. "
      + "Use surrender instead when it is available on the original two-card hand.",
    );
  });
});

describe("hand-level surrender eligibility", () => {
  it("uses the no-surrender stand indices after a hit under every table rule", () => {
    const cases = [
      [h17LateSurrender, "16", "9", 4],
      [h17LateSurrender, "16", "10", 0],
      [h17LateSurrender, "16", "A", 3],
      [h17LateSurrender, "15", "10", 4],
      [h17LateSurrender, "15", "A", 5],
      [s17LateSurrender, "16", "9", 5],
      [s17LateSurrender, "16", "10", 0],
      [s17LateSurrender, "16", "A", 5],
      [s17LateSurrender, "15", "10", 4],
    ] as const;

    for (const [tableRules, hand, dealer, index] of cases) {
      const rules = deviationRulesForHand(tableRules, false);
      expect(resolveDeviation("H", hand, dealer, index, rules).action, `${tableRules.dealerHitsSoft17 ? "H17" : "S17"} ${hand} v ${dealer}`)
        .toBe("S");
    }
  });

  it("restores the no-surrender ten-column catalog after early surrender has expired", () => {
    for (const dealerHitsSoft17 of [true, false]) {
      const tableRules: DeviationRules = {
        dealerHitsSoft17,
        lateSurrender: true,
        earlySurrenderVsTen: true,
      };
      const rules = deviationRulesForHand(tableRules, false);
      expect(rules).toMatchObject({ lateSurrender: false, earlySurrenderVsTen: false });
      expect(resolveDeviation("H", "16", "10", 0, rules).action).toBe("S");
      expect(resolveDeviation("H", "15", "10", 4, rules).action).toBe("S");
    }
  });

  it("never returns surrender for any surrender-related cell once the hand is ineligible", () => {
    const tableRulesets: DeviationRules[] = [
      h17LateSurrender,
      s17LateSurrender,
      { ...h17LateSurrender, earlySurrenderVsTen: true },
      { ...s17LateSurrender, earlySurrenderVsTen: true },
    ];
    const cells = [
      ["17", "A"], ["16", "8"], ["16", "9"], ["16", "10"], ["16", "A"],
      ["15", "9"], ["15", "10"], ["15", "A"], ["14", "10"], ["13", "10"], ["12", "10"],
    ] as const;

    for (const tableRules of tableRulesets) {
      const rules = deviationRulesForHand(tableRules, false);
      for (const [hand, dealer] of cells) {
        for (let trueCount = -10; trueCount <= 10; trueCount++) {
          expect(resolveDeviation(hand === "17" ? "S" : "H", hand, dealer, trueCount, rules).action, `${hand} v ${dealer} at ${trueCount}`)
            .not.toBe("R");
        }
      }
    }
  });
});
