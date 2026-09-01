import { describe, expect, it } from "vitest";
import { exactStateEv, freshComposition } from "./exactEv";

describe("exact DDM state EV", () => {
  it("builds rank compositions with sixteen ten-value cards per deck", () => {
    expect(freshComposition(6)).toEqual([0, 24, 24, 24, 24, 24, 24, 24, 24, 24, 96]);
  });

  it("matches the audited Python exact solver for hard 14 versus 3", () => {
    const result = exactStateEv({ decks: 6, player: [8, 6], dealerUp: 3 });
    expect(result.action).toBe("S");
    expect(result.actionEv.S).toBeCloseTo(-0.33960214114470016, 13);
    expect(result.actionEv.H).toBeCloseTo(-0.4023626055195879, 13);
    expect(result.actionEv.D).toBeCloseTo(-0.8047252110391758, 13);
  });

  it("matches the Python solver for a composition-dependent soft hand", () => {
    const result = exactStateEv({ decks: 6, player: [1, 2, 5], dealerUp: 5 });
    expect(result.action).toBe("D");
    expect(result.actionEv.S).toBeCloseTo(0.10720210823318944, 13);
    expect(result.actionEv.H).toBeCloseTo(0.05919629367084957, 13);
    expect(result.actionEv.D).toBeCloseTo(0.11839258734169913, 13);
  });

  it("conditions action EV on a completed peek and reports pre-peek EV separately", () => {
    const result = exactStateEv({ decks: 6, player: [10], dealerUp: 1 });
    const dealerBlackjack = 95 / 310;
    expect(result.action).toBe("D");
    expect(result.dealerBlackjackProbability).toBeCloseTo(dealerBlackjack, 14);
    expect(result.actionEv.D).toBeCloseTo(0.08905905242107098, 13);
    expect(result.prePeekActionEv?.D).toBeCloseTo(dealerBlackjack * -1 + (1 - dealerBlackjack) * 0.08905905242107098, 13);
    expect(result.insuranceEvPerBaseUnit).toBeCloseTo(1.5 * dealerBlackjack - 0.5, 14);
  });

  it("matches the Python solver after exact dead-card removal", () => {
    const result = exactStateEv({
      decks: 6,
      player: [9],
      dealerUp: 5,
      deadCards: [2, 0, 0, 0, 2, 1, 0, 0, 0, 1],
    });
    expect(result.action).toBe("D");
    expect(result.actionEv.S).toBeCloseTo(-0.24828112470372343, 13);
    expect(result.actionEv.H).toBeCloseTo(0.09339140923829639, 13);
    expect(result.actionEv.D).toBeCloseTo(0.18678281847659278, 13);
  });

  it("enforces the strict one-card ace rule", () => {
    const result = exactStateEv({ decks: 6, player: [1], dealerUp: 6 });
    expect(result.actionEv.S).toBeUndefined();
    expect(result.actionEv.H).toBeCloseTo(0.5016385466362575, 13);
    expect(result.actionEv.D).toBeCloseTo(1.003277093272515, 13);
  });

  it("matches the Python solver under ten-upcard peek conditioning", () => {
    const result = exactStateEv({ decks: 6, player: [10, 6], dealerUp: 10 });
    expect(result.action).toBe("H");
    expect(result.actionEv.S).toBeCloseTo(-0.5975007510073211, 13);
    expect(result.actionEv.H).toBeCloseTo(-0.5566013230461386, 13);
    expect(result.actionEv.D).toBeCloseTo(-1.1132026460922773, 13);
  });

  it("remains exact in a heavily depleted one-deck composition", () => {
    const result = exactStateEv({ decks: 1, player: [2, 2, 3], dealerUp: 10, deadCards: Array(10).fill(2) });
    expect(result.action).toBe("H");
    expect(result.actionEv.S).toBeCloseTo(-0.634600043830813, 13);
    expect(result.actionEv.H).toBeCloseTo(-0.4543579536611867, 13);
    expect(result.actionEv.D).toBeCloseTo(-0.9087159073223734, 13);
  });

  it("rejects impossible and terminal inputs instead of approximating", () => {
    expect(() => exactStateEv({ decks: 1, player: [1], dealerUp: 1, deadCards: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0] })).toThrow(/exceed/i);
    expect(() => exactStateEv({ decks: 6, player: [10, 10, 2], dealerUp: 6 })).toThrow(/busted/i);
    expect(() => exactStateEv({ decks: 6, player: [1, 10], dealerUp: 6 })).toThrow(/blackjack/i);
  });
});
