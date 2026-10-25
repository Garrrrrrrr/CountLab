import { describe, expect, it } from "vitest";
import { betJumps } from "./cover";

const rounds = (...bets: number[]) => bets.map((bet, index) => ({ round: index + 1, bet }));

describe("bet jumps", () => {
  it("flags a total bet that more than doubles from the round before", () => {
    expect(betJumps(rounds(10, 20, 40, 100, 100, 10, 1000), 10)).toEqual([
      { round: 4, from: 40, to: 100, entered: false },
      { round: 7, from: 10, to: 1000, entered: false },
    ]);
  });

  it("compares the first bet after sitting out with the table minimum", () => {
    expect(betJumps(rounds(0, 0, 60, 60, 0, 20), 10)).toEqual([{ round: 3, from: 10, to: 60, entered: true }]);
    expect(betJumps(rounds(25), 10)).toEqual([{ round: 1, from: 10, to: 25, entered: true }]);
  });

  it("leaves a ramp that never more than doubles alone", () => {
    expect(betJumps(rounds(10, 20, 40, 80, 80, 40, 10), 10)).toEqual([]);
  });
});
