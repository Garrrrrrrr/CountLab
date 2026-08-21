import { describe, expect, it } from "vitest";
import { deviationHandRanks } from "./deviations";
import { H17_PRO_DEVIATIONS } from "./h17Pro";
import { S17_PRO_DEVIATIONS } from "./s17Pro";
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
});
