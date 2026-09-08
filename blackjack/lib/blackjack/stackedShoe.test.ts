import { describe, expect, it } from "vitest";
import { runningCount, trueCount } from "./hiLo";
import { BlackjackShoe } from "./shoe";

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const dealAll = (shoe: BlackjackShoe) => {
  const cards = [];
  while (shoe.cardsRemaining()) cards.push(shoe.deal()!);
  return cards;
};

const cardCounts = (cards: ReturnType<typeof dealAll>) => cards.reduce<Record<string, number>>((counts, card) => {
  const key = `${card.rank}-${card.suit}`;
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});

describe("stacked shoe", () => {
  it("reaches the target true count at the configured depth without changing the card multiset", () => {
    const shoe = new BlackjackShoe(6, mulberry32(42), { targetTrueCount: 6, depth: 0.5 });
    const dealt = dealAll(shoe);
    const depth = Math.round(dealt.length * 0.5);
    expect(trueCount(runningCount(dealt.slice(0, depth)), (dealt.length - depth) / 52, "floor")).toBe(6);
    expect(cardCounts(dealt)).toEqual(cardCounts(dealAll(new BlackjackShoe(6, mulberry32(99)))));
  });

  it("is deterministic for a seed", () => {
    expect(dealAll(new BlackjackShoe(6, mulberry32(17), { targetTrueCount: 6, depth: 0.5 })))
      .toEqual(dealAll(new BlackjackShoe(6, mulberry32(17), { targetTrueCount: 6, depth: 0.5 })));
  });

  it("leaves the legacy shuffled order unchanged when stacking is off", () => {
    expect(dealAll(new BlackjackShoe(2, mulberry32(7))))
      .toEqual(dealAll(new BlackjackShoe(2, mulberry32(7), undefined)));
  });
});
