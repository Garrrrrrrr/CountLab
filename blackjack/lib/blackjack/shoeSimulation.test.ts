import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS, unitsAt } from "./advantage";
import { calculateHandValue, isBlackjack } from "./hand";
import { ShoeSimulationConfig, simulateShoeSession } from "./shoeSimulation";

const baseConfig = (overrides: Partial<ShoeSimulationConfig> = {}): ShoeSimulationConfig => ({
  bankroll: 10_000,
  bettingUnit: 25,
  playerHands: 1,
  roundsPerHour: 100,
  handsToSimulate: 2_000,
  highSpeed: false,
  seed: 12345,
  rules: DEFAULT_ADVANTAGE_RULES,
  ramp: RAMPS["1-8"],
  deviationGroups: [],
  ...overrides,
});

describe("simulateShoeSession", () => {
  it("is deterministic for a fixed seed", async () => {
    const [first, second] = await Promise.all([
      simulateShoeSession(baseConfig()),
      simulateShoeSession(baseConfig()),
    ]);
    expect(second.totalProfit).toBe(first.totalProfit);
    expect(second.endingBankroll).toBe(first.endingBankroll);
    expect(second.shoes[0].hands[0].dealerCards).toEqual(first.shoes[0].hands[0].dealerCards);
  });

  it("starts each recorded shoe with a fresh running count", async () => {
    const result = await simulateShoeSession(baseConfig());
    expect(result.shoes.length).toBeGreaterThan(1);
    for (const shoe of result.shoes) {
      expect(shoe.hands[0].runningCountBefore).toBe(0);
    }
  });

  it("sizes every bet according to the ramp", async () => {
    const config = baseConfig();
    const result = await simulateShoeSession(config);
    for (const shoe of result.shoes) {
      for (const hand of shoe.hands) {
        expect(hand.bet).toBe(config.bettingUnit * unitsAt(hand.trueCountBefore, config.ramp));
      }
    }
  });

  it("pays a player blackjack at the configured payout", async () => {
    const result = await simulateShoeSession(baseConfig({ handsToSimulate: 8_000 }));
    let checked = 0;
    for (const shoe of result.shoes) {
      for (const hand of shoe.hands) {
        // A split hand's 2-card 21 is never a natural blackjack, so only check unsplit rounds
        // (with playerHands: 1, a split always produces exactly 2 box entries for the round).
        if (hand.playerHands.length !== 1) continue;
        const dealerBlackjack = isBlackjack(hand.dealerCards);
        for (const box of hand.playerHands) {
          if (box.cards.length === 2 && isBlackjack(box.cards) && !dealerBlackjack) {
            expect(box.net).toBeCloseTo(hand.bet * DEFAULT_ADVANTAGE_RULES.blackjackPayout, 6);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("keeps each shoe within the deck size, respecting the cut card", async () => {
    const config = baseConfig({ handsToSimulate: 5_000 });
    const result = await simulateShoeSession(config);
    const maxCardsPerShoe = config.rules.decks * 52;
    for (const shoe of result.shoes) {
      const cardsUsed = shoe.hands.reduce(
        (sum, hand) => sum + hand.dealerCards.length + hand.playerHands.reduce((boxSum, box) => boxSum + box.cards.length, 0),
        0,
      );
      expect(cardsUsed).toBeLessThan(maxCardsPerShoe);
    }
  });

  it("in high-speed mode keeps aggregate totals but drops per-hand shoe data", async () => {
    const result = await simulateShoeSession(baseConfig({ highSpeed: true, handsToSimulate: 3_000 }));
    expect(result.totalHands).toBe(3_000);
    expect(result.shoes.every((shoe) => shoe.hands.length === 0)).toBe(true);
    expect(result.shoes.some((shoe) => shoe.totalHands > 0)).toBe(true);
  });

  it("resolves every dealt round to a hand with a valid total", async () => {
    const result = await simulateShoeSession(baseConfig({ handsToSimulate: 1_000 }));
    for (const shoe of result.shoes) {
      for (const hand of shoe.hands) {
        for (const box of hand.playerHands) {
          if (!box.surrendered) expect(calculateHandValue(box.cards)).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });
});
