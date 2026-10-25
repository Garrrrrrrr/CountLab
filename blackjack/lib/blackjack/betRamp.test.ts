import { describe, expect, it } from "vitest";
import { answerText, drawTrueCount, explainBet, gradeBet, PRESET_RAMP, rampAnswer, rampFromConfig, spreadsHands } from "./betRamp";

describe("bet ramp drill", () => {
  it("reads the preset 1-8 ramp on a $25 unit, leaving below −1", () => {
    expect(rampAnswer(PRESET_RAMP, -2)).toEqual({ leave: true });
    expect(rampAnswer(PRESET_RAMP, -1)).toEqual({ leave: false, bet: 25, hands: 1 });
    expect(rampAnswer(PRESET_RAMP, 2)).toEqual({ leave: false, bet: 100, hands: 1 });
    expect(rampAnswer(PRESET_RAMP, 12)).toEqual({ leave: false, bet: 200, hands: 1 });
  });

  it("uses a Calculator ramp with its unit, its hands and its sit-out", () => {
    const ramp = rampFromConfig({ baseBet: 10, wongInAt: 1, ramp: [{ trueCount: -8, units: 1 }, { trueCount: 3, units: 5 }], hands: [{ trueCount: 4, hands: 2 }] }, "Vegas trip");
    expect(rampAnswer(ramp, 0)).toEqual({ leave: true });
    expect(rampAnswer(ramp, 3)).toEqual({ leave: false, bet: 50, hands: 1 });
    expect(rampAnswer(ramp, 4)).toEqual({ leave: false, bet: 50, hands: 2 });
    expect(spreadsHands(ramp)).toBe(true);
    expect(spreadsHands(PRESET_RAMP)).toBe(false);
  });

  it("grades the bet, the hands only when asked, and leaving", () => {
    const ramp = rampFromConfig({ baseBet: 10, wongInAt: null, ramp: [{ trueCount: -8, units: 1 }, { trueCount: 4, units: 6 }], hands: [{ trueCount: 4, hands: 2 }] }, "x");
    expect(gradeBet(ramp, 4, { leave: false, bet: 60, hands: 1 }, false).ok).toBe(true);
    expect(gradeBet(ramp, 4, { leave: false, bet: 60, hands: 1 }, true).ok).toBe(false);
    expect(gradeBet(ramp, 4, { leave: false, bet: 60, hands: 2 }, true).ok).toBe(true);
    expect(gradeBet(PRESET_RAMP, -3, { leave: true }, false).ok).toBe(true);
    expect(gradeBet(PRESET_RAMP, -3, { leave: false, bet: 25, hands: 1 }, false).ok).toBe(false);
    expect(answerText({ leave: false, bet: 60, hands: 2 }, true)).toBe("2 hands of $60");
  });

  it("explains the multiplication and the sit-out", () => {
    expect(explainBet(PRESET_RAMP, 3, false)).toBe("At +3 the ramp bets 6 units: 6 × $25 = $150.");
    expect(explainBet(PRESET_RAMP, 6, false)).toMatch(/8 units \(\+4 and up\): 8 × \$25 = \$200\./);
    expect(explainBet(PRESET_RAMP, -3, false)).toMatch(/plays from −1 up, so at −3 you leave the table/);
  });

  it("asks mostly where the bet changes, never the same count twice running", () => {
    let rng = 0;
    const seq = () => ((rng = (rng * 9301 + 49297) % 233280) / 233280);
    let last: number | undefined;
    for (let draw = 0; draw < 200; draw += 1) {
      const tc = drawTrueCount(PRESET_RAMP, seq, last);
      expect(tc).not.toBe(last);
      expect(tc).toBeGreaterThanOrEqual(-4);
      expect(tc).toBeLessThanOrEqual(8);
      last = tc;
    }
  });
});
