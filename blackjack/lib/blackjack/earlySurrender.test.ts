import { describe, expect, it } from "vitest";
import { getBasicStrategyDecision } from "./basicStrategy";
import type { Card, Rank } from "./types";
import { EARLY_SURRENDER_VS_TEN } from "./earlySurrender";
import { getDeviationCatalog, resolveDeviation, deviationTransition } from "./deviations";
import type { Deviation, DeviationRules } from "./deviations";
import { H17_PRO_DEVIATIONS } from "./h17Pro";
import { S17_PRO_DEVIATIONS } from "./s17Pro";

const early: DeviationRules = { dealerHitsSoft17: true, lateSurrender: true, earlySurrenderVsTen: true };
const late: DeviationRules = { dealerHitsSoft17: true, lateSurrender: true };

/** Wong, Professional Blackjack, table 32 (p. 91), ten column. */
const TABLE_32_VS_TEN: ReadonlyArray<readonly [hand: string, index: number, playedOut: string]> = [
  ["17", 5, "S"],
  ["16", -5, "H"],
  ["8,8", -2, "P"],
  ["15", -2, "H"],
  ["14", 0, "H"],
  ["13", 3, "H"],
  ["12", 8, "H"],
];

describe("early surrender versus a ten", () => {
  it("carries table 32's ten column verbatim", () => {
    for (const [hand, index, playedOut] of TABLE_32_VS_TEN) {
      const row = EARLY_SURRENDER_VS_TEN.h17Pro.find((entry) => entry.hand === hand && entry.dealer === "10");
      expect(row, hand).toBeDefined();
      expect(row!.index, hand).toBe(index);
      expect(row!.deviationAction, hand).toBe("R");
      expect(row!.normalAction, hand).toBe(playedOut);
    }
    expect(EARLY_SURRENDER_VS_TEN.h17Pro).toHaveLength(TABLE_32_VS_TEN.length);
  });

  it("surrenders at the index and plays the hand out one below it", () => {
    // Wong's key: surrender if the count per deck equals or exceeds the number.
    for (const [hand, index, playedOut] of TABLE_32_VS_TEN) {
      const basic = hand === "8,8" ? "P" : hand === "17" ? "S" : "H";
      expect(resolveDeviation(basic, hand, "10", index, early).action, `${hand} at ${index}`).toBe("R");
      expect(resolveDeviation(basic, hand, "10", index - 1, early).action, `${hand} at ${index - 1}`).toBe(playedOut);
    }
  });

  it("reports a transition the chart can render for every row", () => {
    for (const row of EARLY_SURRENDER_VS_TEN.h17Pro) {
      const transition = deviationTransition(row, early);
      expect(transition.changesPlay, `${row.hand} v ${row.dealer}`).toBe(true);
      expect(transition.departure, `${row.hand} v ${row.dealer}`).toBe("R");
    }
  });

  it("leaves the 8 and 9 columns to the late-surrender catalogs", () => {
    // Early and late surrender can only differ where the dealer can hold a
    // natural: Wong's tables 32 and 33 are identical in their 8 and 9 columns.
    // This is the invariant that validated the transcription, so it is pinned.
    for (const set of [EARLY_SURRENDER_VS_TEN.h17Pro, EARLY_SURRENDER_VS_TEN.s17Pro]) {
      expect(set.every((row) => row.dealer === "10")).toBe(true);
    }
    const untouched = (catalog: Deviation[]) => catalog.filter((row) => row.dealer === "8" || row.dealer === "9");
    for (const rules of [early, { ...early, dealerHitsSoft17: false }]) {
      const base = rules.dealerHitsSoft17 ? H17_PRO_DEVIATIONS : S17_PRO_DEVIATIONS;
      expect(untouched(getDeviationCatalog(rules))).toEqual(untouched(base));
    }
  });

  it("replaces the late-surrender ten column rather than competing with it", () => {
    const cell = (row: Deviation) => `${row.hand} ${row.index} ${row.normalAction}->${row.deviationAction}`;
    const surrenders = (catalog: Deviation[]) =>
      catalog.filter((row) => row.dealer === "10" && (row.normalAction === "R" || row.deviationAction === "R")).map(cell).sort();
    expect(surrenders(getDeviationCatalog(early))).toEqual(surrenders(EARLY_SURRENDER_VS_TEN.h17Pro));
  });

  it("keeps ids clear of the ranking artifact's late-surrender keys", () => {
    // A shared id would hand an early-surrender row its late-surrender
    // neighbour's measured EV instead of reporting the cell as unmeasured.
    const lateIds = new Set([...H17_PRO_DEVIATIONS, ...S17_PRO_DEVIATIONS].map((row) => row.id));
    for (const set of [EARLY_SURRENDER_VS_TEN.h17Pro, EARLY_SURRENDER_VS_TEN.s17Pro]) {
      for (const row of set) expect(lateIds.has(row.id), row.id).toBe(false);
    }
  });

  it("changes nothing without the rule", () => {
    expect(getDeviationCatalog(late)).toEqual(H17_PRO_DEVIATIONS);
  });

  /**
   * The drills grade against `getBasicStrategyDecision`, not against the chart
   * page, so the rule has to reach that path too — the flag travels on
   * `BlackjackRules` and is translated in `toChartRules`.
   */
  describe("the decision the drills grade against", () => {
    const rules = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, earlySurrenderVsTen: true };
    const ten = { rank: "10", suit: "diamonds" } as const;
    const decide = (first: Rank, second: Rank, dealer: Card = ten) =>
      getBasicStrategyDecision({ playerCards: [{ rank: first, suit: "spades" }, { rank: second, suit: "hearts" }], dealerUpcard: dealer, rules });

    it("surrenders the fourteens and eights a late-surrender game plays out", () => {
      expect(decide("10", "4").action).toBe("R");
      expect(decide("7", "7").action).toBe("R");
      expect(decide("8", "8").action).toBe("R");
      expect(decide("8", "8").fallback).toBe("P");
    });

    it("keeps the rest of the table on late surrender", () => {
      expect(decide("10", "4", { rank: "9", suit: "diamonds" }).action).toBe("H");
      expect(decide("10", "3").action).toBe("H");
      expect(decide("10", "2", { rank: "A", suit: "diamonds" }).action).toBe("H");
    });

    it("never surrenders a hand already drawn to", () => {
      // The rule is a two-card decision; a drawn fourteen has to play on.
      expect(getBasicStrategyDecision({
        playerCards: [{ rank: "5", suit: "spades" }, { rank: "4", suit: "hearts" }, { rank: "5", suit: "clubs" }],
        dealerUpcard: ten,
        rules,
      }).action).toBe("H");
    });
  });

  it("still surrenders against a ten where the table has no late surrender", () => {
    // A table can offer early surrender against the ten and nothing else.
    const tenOnly: DeviationRules = { dealerHitsSoft17: true, lateSurrender: false, earlySurrenderVsTen: true };
    expect(resolveDeviation("H", "16", "10", 0, tenOnly).action).toBe("R");
    expect(resolveDeviation("H", "15", "9", 5, tenOnly).action).toBe("H");
  });
});
