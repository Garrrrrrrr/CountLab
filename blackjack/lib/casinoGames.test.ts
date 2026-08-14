import { describe, expect, it } from "vitest";
import { evaluate, parseCard } from "./uth/engine";
import {
  comparePokerRanks,
  pokerHandName,
  shuffledDeck,
  uthTripsNet,
} from "./casinoGames";

const cards = (value: string) => value.split(" ").map(parseCard);

describe("casino table game helpers", () => {
  it("names and compares evaluated poker hands", () => {
    const pair = evaluate(cards("As Ad 9c 7h 5s 3d 2c"));
    const straight = evaluate(cards("As 2d 3c 4h 5s 9d Tc"));
    expect(pokerHandName(pair)).toBe("One pair");
    expect(pokerHandName(straight)).toBe("Straight");
    expect(comparePokerRanks(straight, pair)).toBeGreaterThan(0);
  });

  it("settles every standard UTH Trips tier", () => {
    expect(uthTripsNet(evaluate(cards("Ts Js Qs Ks As 2d 3c")))).toBe(50);
    expect(uthTripsNet(evaluate(cards("9s Ts Js Qs Ks 2d 3c")))).toBe(40);
    expect(uthTripsNet(evaluate(cards("As Ad Ac Ah 9s 3d 2c")))).toBe(30);
    expect(uthTripsNet(evaluate(cards("As Ad Ac 9h 9s 3d 2c")))).toBe(8);
    expect(uthTripsNet(evaluate(cards("As Js 9s 5s 3s Kd 2c")))).toBe(7);
    expect(uthTripsNet(evaluate(cards("As 2d 3c 4h 5s 9d Tc")))).toBe(4);
    expect(uthTripsNet(evaluate(cards("As Ad Ac 9h 5s 3d 2c")))).toBe(3);
    expect(uthTripsNet(evaluate(cards("As Ad 9c 7h 5s 3d 2c")))).toBe(-1);
  });

  it("produces a complete unique deck", () => {
    const deck = shuffledDeck(() => 0.5);
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
    expect(Math.min(...deck)).toBe(0);
    expect(Math.max(...deck)).toBe(51);
  });
});
