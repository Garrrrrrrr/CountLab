import { describe, expect, it } from "vitest";
import { calculateHandValue, isPair, isSoft } from "@/lib/blackjack/hand";
import { DEALERS, dealerOf, DEFAULT_TABLE_RULES } from "@/lib/strategy";
import { drawnHand, insuranceHand, sitsOn, totalLabel, twoCardHand, upcardFor } from "./cards";
import { chartFor } from "./chartRow";
import { seeded } from "./testRules";

const chart = chartFor(DEFAULT_TABLE_RULES);

describe("hands for chart cells", () => {
  it("deals every chart row as a two-card hand the engine places on that row", () => {
    const rng = seeded(1);
    for (const section of ["hard", "soft", "pairs"] as const) {
      for (const row of chart.tables[section].rows) {
        for (let draw = 0; draw < 25; draw += 1) {
          const cards = twoCardHand(section, row, rng);
          expect(cards).toHaveLength(2);
          expect(sitsOn(cards, section, row), `${section} ${row}: ${cards.map((card) => card.rank)}`).toBe(true);
          if (section === "pairs") {
            expect(cards[0].rank).toBe(cards[1].rank);
            expect(cards[0].suit).not.toBe(cards[1].suit);
          } else expect(isPair(cards)).toBe(false);
        }
      }
    }
  });

  it("deals drawn hands of three or more cards that stay hard or soft as asked", () => {
    const rng = seeded(2);
    for (const section of ["hard", "soft"] as const) {
      for (const row of chart.tables[section].rows) {
        for (let draw = 0; draw < 20; draw += 1) {
          const cards = drawnHand(section, row, rng, draw % 4 === 0 ? 4 : 3);
          const target = section === "hard" ? Number(row) : 11 + Number(row.slice(2));
          if (section === "soft" && target < 15) { expect(cards).toBeNull(); continue; }
          if (!cards) continue;
          expect(cards.length).toBeGreaterThanOrEqual(3);
          expect(calculateHandValue(cards)).toBe(target);
          expect(isSoft(cards)).toBe(section === "soft");
          expect(sitsOn(cards, section, row)).toBe(true);
        }
      }
    }
    // Every hard row and soft 15 up can actually be drawn.
    for (const row of chart.tables.hard.rows) expect(drawnHand("hard", row, seeded(3))).not.toBeNull();
    for (const row of ["A,4", "A,5", "A,6", "A,7", "A,8", "A,9"]) expect(drawnHand("soft", row, seeded(4))).not.toBeNull();
  });

  it("randomises the ten-value card and maps every upcard back to its column", () => {
    const rng = seeded(5);
    const tens = new Set<string>();
    for (let draw = 0; draw < 80; draw += 1) {
      for (const dealer of DEALERS) {
        const card = upcardFor(dealer, rng);
        expect(dealerOf(card)).toBe(dealer);
        if (dealer === "10") tens.add(card.rank);
      }
    }
    expect([...tens].sort()).toEqual(["10", "J", "K", "Q"]);
  });

  it("names hands as players say them and never deals a blackjack for insurance", () => {
    expect(totalLabel([{ rank: "A", suit: "spades" }, { rank: "2", suit: "hearts" }, { rank: "5", suit: "clubs" }])).toBe("Soft 18");
    expect(totalLabel([{ rank: "8", suit: "spades" }, { rank: "8", suit: "hearts" }])).toBe("Pair of 8s");
    expect(totalLabel([{ rank: "K", suit: "spades" }, { rank: "Q", suit: "hearts" }])).toBe("Pair of tens");
    const rng = seeded(6);
    for (let draw = 0; draw < 200; draw += 1) { const total = calculateHandValue(insuranceHand(rng)); expect(total).toBeGreaterThanOrEqual(12); expect(total).toBeLessThan(21); }
  });
});
