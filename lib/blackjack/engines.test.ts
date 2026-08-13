import { describe, expect, it } from "vitest";
import { hiLoValue, runningCount, trueCount } from "./hiLo";
import { BlackjackShoe } from "./shoe";
import { calculateHandValue, isBlackjack, isPair, isSoft } from "./hand";
import { getBasicStrategyDecision } from "./basicStrategy";
import { DEVIATIONS, deviationDecision } from "./deviations";
import { Card, DEFAULT_RULES, RANKS, SUITS } from "./types";
import {
  calculateAdvantage,
  DEFAULT_ADVANTAGE_RULES,
  getCountProfile,
  RAMPS,
  recommendUnit,
  unitsAt,
  zeroNegativeCountBets,
} from "./advantage";
import { COEFFICIENT_METADATA } from "./coefficients";
const c = (rank: Card["rank"], suit: Card["suit"] = "spades"): Card => ({
  rank,
  suit,
});
describe("Hi-Lo", () => {
  it("maps ranks", () => {
    for (const r of ["2", "3", "4", "5", "6"] as const)
      expect(hiLoValue(r)).toBe(1);
    for (const r of ["7", "8", "9"] as const) expect(hiLoValue(r)).toBe(0);
    for (const r of ["10", "J", "Q", "K", "A"] as const)
      expect(hiLoValue(r)).toBe(-1);
  });
  it("balances one and six decks", () => {
    const deck = SUITS.flatMap((s) => RANKS.map((r) => c(r, s)));
    expect(runningCount(deck)).toBe(0);
    expect(runningCount(Array.from({ length: 6 }, () => deck).flat())).toBe(0);
  });
  it("rounds true counts", () => {
    expect(trueCount(7, 2, "floor")).toBe(3);
    expect(trueCount(-7, 2, "floor")).toBe(-4);
    expect(trueCount(-7, 2, "truncate")).toBe(-3);
    expect(trueCount(7, 2, "nearest")).toBe(4);
  });
});
describe("shoe", () => {
  it("contains and removes exact cards", () => {
    const shoe = new BlackjackShoe(6);
    expect(shoe.cardsRemaining()).toBe(312);
    shoe.deal();
    expect(shoe.cardsRemaining()).toBe(311);
    expect(shoe.dealtCards()).toHaveLength(1);
    shoe.reset();
    expect(shoe.cardsRemaining()).toBe(312);
    expect(shoe.runningCount()).toBe(0);
  });
});
describe("hands", () => {
  it("handles soft aces", () => {
    const h = [c("A"), c("6")];
    expect(calculateHandValue(h)).toBe(17);
    expect(isSoft(h)).toBe(true);
    expect(calculateHandValue([c("A"), c("A"), c("9")])).toBe(21);
  });
  it("detects blackjack and pairs", () => {
    expect(isBlackjack([c("A"), c("K")])).toBe(true);
    expect(isPair([c("8"), c("8", "hearts")])).toBe(true);
  });
});
describe("strategy", () => {
  it("uses late-surrender H17 defaults", () =>
    expect(
      getBasicStrategyDecision({
        playerCards: [c("10"), c("6")],
        dealerUpcard: c("10"),
        rules: DEFAULT_RULES,
      }).action,
    ).toBe("R"));
  it("splits aces", () =>
    expect(
      getBasicStrategyDecision({
        playerCards: [c("A"), c("A")],
        dealerUpcard: c("7"),
        rules: DEFAULT_RULES,
      }).action,
    ).toBe("P"));
  it.each([
    ["9", "P"],
    ["10", "P"],
    ["A", "R"],
  ] as const)("plays 8,8 vs %s as %s", (dealer, action) =>
    expect(
      getBasicStrategyDecision({
        playerCards: [c("8"), c("8", "hearts")],
        dealerUpcard: c(dealer),
        rules: DEFAULT_RULES,
      }).action,
    ).toBe(action));
  it("doubles eleven", () =>
    expect(
      getBasicStrategyDecision({
        playerCards: [c("6"), c("5")],
        dealerUpcard: c("6"),
        rules: DEFAULT_RULES,
      }).action,
    ).toBe("D"));
  it("applies the H17-only 15 vs Ace surrender rule", () => {
    const hand = [c("10"), c("5")];
    expect(getBasicStrategyDecision({ playerCards: hand, dealerUpcard: c("A"), rules: DEFAULT_RULES }).action).toBe("R");
    expect(getBasicStrategyDecision({ playerCards: hand, dealerUpcard: c("A"), rules: { ...DEFAULT_RULES, dealerHitsSoft17: false } }).action).toBe("H");
  });
});
describe("deviations", () => {
  it("uses thresholds", () => {
    const d = DEVIATIONS.find((x) => x.hand === "16" && x.dealer === "10")!;
    expect(deviationDecision(d, -1)).toBe("H");
    expect(deviationDecision(d, 0)).toBe("S");
  });
  it("models insurance as its own decision", () => {
    const insurance = DEVIATIONS.find((x) => x.hand === "Insurance")!;
    expect(deviationDecision(insurance, 2)).toBe("N");
    expect(deviationDecision(insurance, 3)).toBe("I");
  });
});
describe("advantage model", () => {
  it("selects the matching shoe and penetration coefficients", () => {
    const profile = getCountProfile({
      ...DEFAULT_ADVANTAGE_RULES,
      decks: 8,
      penetration: 0.75,
    });
    expect(profile).toHaveLength(17);
    expect(profile.reduce((sum, row) => sum + row.p, 0)).toBeCloseTo(1, 10);
    const neutral = profile.find((row) => row.tc === 0)!;
    expect(neutral.p).toBeCloseTo(0.28426959002, 10);
    expect(neutral.samples).toBeGreaterThan(1_000_000_000);
    expect(neutral.standardError).toBeLessThan(0.00003);
    expect(COEFFICIENT_METADATA.totalRounds).toBe(46_734_162_152);
  });
  it("applies ramp thresholds", () => {
    expect(unitsAt(0, RAMPS["1-8"])).toBe(1);
    expect(unitsAt(3, RAMPS["1-8"])).toBe(6);
  });
  it("can zero every negative-count wager without changing nonnegative bets", () => {
    const ramp = zeroNegativeCountBets([
      { trueCount: -8, units: 1 },
      { trueCount: -1, units: 1 },
      { trueCount: 0, units: 1 },
      { trueCount: 1, units: 2 },
    ]);
    expect(unitsAt(-8, ramp)).toBe(0);
    expect(unitsAt(-1, ramp)).toBe(0);
    expect(unitsAt(0, ramp)).toBe(1);
    expect(unitsAt(1, ramp)).toBe(2);
  });
  it("returns finite risk and scales units with risk tolerance", () => {
    const result = calculateAdvantage({
      bankroll: 1000,
      handsPerHour: 100,
      hours: 4,
      rules: DEFAULT_ADVANTAGE_RULES,
      ramp: RAMPS["1-8"],
    });
    expect(Number.isFinite(result.riskOfRuin)).toBe(true);
    expect(result.averageBet).toBeGreaterThan(1);
    expect(
      recommendUnit(1000, 0.01, DEFAULT_ADVANTAGE_RULES, RAMPS["1-8"]),
    ).toBeLessThan(
      recommendUnit(1000, 0.1, DEFAULT_ADVANTAGE_RULES, RAMPS["1-8"]),
    );
    expect(recommendUnit(1000, 1, DEFAULT_ADVANTAGE_RULES, RAMPS["1-8"])).toBe(
      Infinity,
    );
  });
});
