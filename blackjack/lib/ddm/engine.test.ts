import { describe, expect, it } from "vitest";
import {
  createShoe,
  dealerShouldHit,
  handValue,
  hiLoTag,
  insuranceRecommended,
  isBlackjack,
  rampUnits,
  recommendAction,
  settleRound,
  shuffled,
  trueCount,
  type DDMCard,
  type DDMRank,
  type DDMSuit,
} from "./engine";

let id = 0;
const card = (rank: DDMRank, suit: DDMSuit = "s"): DDMCard => ({ id: id++, rank, suit });

describe("Double Down Madness engine", () => {
  it("builds a complete six-deck shoe with blackjack rank frequencies", () => {
    const shoe = createShoe();
    expect(shoe).toHaveLength(312);
    expect(new Set(shoe.map((item) => item.id)).size).toBe(312);
    expect(shoe.filter((item) => item.rank === 1)).toHaveLength(24);
    expect(shoe.filter((item) => item.rank === 10)).toHaveLength(96);
  });

  it("supports deterministic shuffles through an injected random source", () => {
    let seed = 7;
    const rng = () => ((seed = seed * 48271 % 2147483647) - 1) / 2147483646;
    const first = shuffled(createShoe(1), rng).map((item) => item.id);
    seed = 7;
    const second = shuffled(createShoe(1), rng).map((item) => item.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(52);
  });

  it("uses standard Hi-Lo tags and floors negative true counts", () => {
    expect([1, 2, 6, 7, 9, 10].map((rank) => hiLoTag(rank as DDMRank))).toEqual([-1, 1, 1, 0, 0, -1]);
    expect(trueCount(-1, 104)).toBe(-1);
    expect(trueCount(-3, 104)).toBe(-2);
    expect(trueCount(5, 104)).toBe(2);
  });

  it("values soft hands, hard hands, busts, and blackjacks", () => {
    expect(handValue([card(1), card(6)])).toMatchObject({ total: 17, soft: true, bust: false });
    expect(handValue([card(1), card(6), card(10)])).toMatchObject({ total: 17, soft: false, bust: false });
    expect(handValue([card(10), card(10), card(2)])).toMatchObject({ hardTotal: 22, bust: true });
    expect(isBlackjack([card(1), card(10)])).toBe(true);
    expect(isBlackjack([card(1), card(5), card(5)])).toBe(false);
  });

  it("uses distinct one-card, ace, and continued-play strategy planes", () => {
    expect(recommendAction([card(1)], 10, 0)).toMatchObject({ plane: "ace", action: "D" });
    expect(recommendAction([card(10)], 1, 0)).toMatchObject({ plane: "first", action: "D" });
    expect(recommendAction([card(6), card(4)], 1, 0)).toMatchObject({ plane: "hard", row: 10, action: "H" });
    expect(recommendAction([card(1), card(7)], 5, 0)).toMatchObject({ plane: "soft", row: 18, action: "D" });
  });

  it("applies deviations only at the solved threshold", () => {
    expect(recommendAction([card(8), card(6)], 3, -4)).toMatchObject({ action: "S", baseAction: "S" });
    expect(recommendAction([card(8), card(6)], 3, -5)).toMatchObject({ action: "H", baseAction: "S" });
    expect(recommendAction([card(10), card(6)], 10, 6)).toMatchObject({ action: "H", baseAction: "H" });
    expect(recommendAction([card(10), card(6)], 10, 7)).toMatchObject({ action: "S", baseAction: "H" });
  });

  it("uses the selected insurance index and 1-16 betting ramp", () => {
    expect(insuranceRecommended(3)).toBe(false);
    expect(insuranceRecommended(4)).toBe(true);
    expect([-2, 0, 1, 2, 3, 4, 5, 12].map(rampUnits)).toEqual([1, 1, 3, 7, 11, 15, 16, 16]);
  });

  it("implements H17", () => {
    expect(dealerShouldHit([card(1), card(6)])).toBe(true);
    expect(dealerShouldHit([card(10), card(7)])).toBe(false);
    expect(dealerShouldHit([card(1), card(6), card(10)])).toBe(false);
  });

  it("pushes dealer 22 unless the player busted or has blackjack", () => {
    expect(settleRound({ player: [card(10), card(8)], dealer: [card(10), card(6), card(6)], wager: 20, baseBet: 10 }).main).toBe(0);
    expect(settleRound({ player: [card(10), card(8), card(5)], dealer: [card(10), card(6), card(6)], wager: 20, baseBet: 10 }).main).toBe(-20);
    expect(settleRound({ player: [card(1, "h"), card(10, "h")], dealer: [card(10), card(6), card(6)], wager: 10, baseBet: 10 }).main).toBe(20);
  });

  it("pays unsuited blackjack 3:2 and settles insurance independently", () => {
    expect(settleRound({ player: [card(1, "h"), card(10, "s")], dealer: [card(10), card(7)], wager: 10, baseBet: 10 }).main).toBe(15);
    const insured = settleRound({ player: [card(8)], dealer: [card(1), card(10)], wager: 10, baseBet: 10, insuranceTaken: true });
    expect(insured).toMatchObject({ main: -10, insurance: 10, net: 0, result: "Push" });
    expect(settleRound({ player: [card(10), card(8)], dealer: [card(1), card(9)], wager: 10, baseBet: 10, insuranceTaken: true }).insurance).toBe(-5);
  });
});
