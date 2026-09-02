import { describe, expect, it } from "vitest";
import { deviationSentence, deviationTransition, DeviationRules } from "./deviations";
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

  it("reads the reversed 15 v 10 surrender window in the direction it actually plays", () => {
    const row = findH17("15", "10", "R");
    const sentence = deviationSentence(row, deviationTransition(row, h17LateSurrender));
    expect(sentence).toBe(
      "Surrender when the true count is 0 or lower; otherwise hit.",
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
