import { describe, expect, it } from "vitest";
import { deviationHandRanks, deviationTrainingRows, deviationTransition } from "./deviations";
import { H17_PRO_DEVIATIONS } from "./apToolboxH17Pro";
import { S17_PRO_DEVIATIONS } from "./apToolboxS17Pro";
import { calculateHandValue, isPair, isSoft } from "./hand";
import type { Card } from "./types";

const cards = (hand: string): Card[] =>
  deviationHandRanks(hand).map((rank, index) => ({ rank, suit: index ? "hearts" : "spades" }));

describe("deviation drill hands", () => {
  it("deals a hand actually matching every chart label in both catalogs", () => {
    for (const row of [...H17_PRO_DEVIATIONS, ...S17_PRO_DEVIATIONS]) {
      if (row.hand === "Insurance") continue;
      const dealt = cards(row.hand);
      const pairMatch = /^(A|\d{1,2}),(A|\d{1,2})$/.exec(row.hand);
      const softMatch = /^Soft (\d{1,2})$/.exec(row.hand);
      if (pairMatch) {
        expect(isPair(dealt), row.hand).toBe(true);
        expect(dealt[0].rank, row.hand).toBe(pairMatch[1]);
      } else if (softMatch) {
        expect(isSoft(dealt), row.hand).toBe(true);
        expect(calculateHandValue(dealt), row.hand).toBe(Number(softMatch[1]));
      } else {
        expect(calculateHandValue(dealt), row.hand).toBe(Number(row.hand));
        expect(isSoft(dealt), row.hand).toBe(false);
        // A pair would make basic strategy answer the split question instead.
        expect(isPair(dealt), row.hand).toBe(false);
      }
    }
  });

  it.each([
    ["H17 with surrender", H17_PRO_DEVIATIONS, true, true],
    ["H17 without surrender", H17_PRO_DEVIATIONS, true, false],
    ["S17 with surrender", S17_PRO_DEVIATIONS, false, true],
    ["S17 without surrender", S17_PRO_DEVIATIONS, false, false],
  ] as const)("uses exactly the live chart transitions for %s", (_label, catalog, dealerHitsSoft17, lateSurrender) => {
    const rules = { dealerHitsSoft17, lateSurrender };
    const expected = catalog
      .map((row) => ({ row, transition: deviationTransition(row, rules) }))
      .filter(({ transition }) => transition.changesPlay);

    expect(deviationTrainingRows(rules, 6, [...catalog])).toEqual(expected);
  });

  it("trains reverse-side chart indices in the displayed direction", () => {
    const row = deviationTrainingRows(
      { dealerHitsSoft17: true, lateSurrender: true },
    ).find(({ row }) => row.hand === "13" && row.dealer === "2");

    expect(row?.row.index).toBe(-1);
    expect(row?.transition).toMatchObject({
      baseline: "S",
      departure: "H",
      atOrBelow: true,
      changesPlay: true,
    });
  });
});
