import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import {
  analyzeCvcx,
  bankrollForHorizon,
  createOptimalRamp,
  exactOptimalRamp,
  finiteHorizonRisk,
  goalByHorizonProbability,
  goalOrBust,
  normalCdf,
  requiredBankroll,
  resultPercentile,
} from "./cvcx";

describe("CVCX calculations", () => {
  it("keeps normal-distribution helpers within their mathematical bounds", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(-2)).toBeLessThan(0.03);
    expect(normalCdf(2)).toBeGreaterThan(0.97);
    expect(resultPercentile(12, 10, 2)).toBeGreaterThan(0.8);
    expect(resultPercentile(10, 10, 0)).toBe(1);
  });

  it("handles invalid bankroll targets explicitly", () => {
    expect(requiredBankroll(0, 1, 0.1)).toBe(Infinity);
    expect(requiredBankroll(1, 0, 0.1)).toBe(Infinity);
    expect(requiredBankroll(1, 1, 1)).toBe(0);
    expect(requiredBankroll(1, 1, 0)).toBe(Infinity);
  });

  it("produces a ramp for every count bucket with the Wong-out region at zero", () => {
    const ramp = createOptimalRamp(DEFAULT_ADVANTAGE_RULES, 8, 1);

    expect(ramp).toHaveLength(17);
    expect(ramp.filter((point) => point.trueCount < 1).every((point) => point.units === 0)).toBe(true);
    expect(ramp.filter((point) => point.trueCount >= 1).every((point) => point.units >= 1 && point.units <= 8)).toBe(true);
  });

  it("finds Harris's SCORE-maximising ramp within the spread", () => {
    const scenario = { bankroll: 10_000, minimumBet: 1, handsPerHour: 100, hours: 1, targetRisk: 0.135, maxSpread: 8, wongInAt: null, rules: DEFAULT_ADVANTAGE_RULES };
    const score = (ramp: { trueCount: number; units: number }[]) => analyzeCvcx(scenario, ramp, 1).cScore;
    const exact = exactOptimalRamp(DEFAULT_ADVANTAGE_RULES, 8, null);
    expect(exact.every((point) => point.units >= 1 && point.units <= 8)).toBe(true);
    // Bets never fall as the count rises.
    for (let index = 1; index < exact.length; index++) expect(exact[index].units).toBeGreaterThanOrEqual(exact[index - 1].units - 1e-12);
    // No other scale of the same Kelly shape does better, and nor does a preset 1-8 ramp.
    const best = score(exact);
    for (const factor of [0.8, 0.95, 1.05, 1.25]) {
      const scaled = exact.map((point) => ({ ...point, units: Math.min(8, Math.max(1, point.units === 1 || point.units === 8 ? point.units : point.units * factor)) }));
      expect(score(scaled)).toBeLessThanOrEqual(best + 1e-9);
    }
    expect(best).toBeGreaterThan(score(RAMPS["1-8"]));
    // Chip rounding costs a little SCORE, never a lot.
    expect(score(createOptimalRamp(DEFAULT_ADVANTAGE_RULES, 8, null, 0.5))).toBeGreaterThan(best * 0.98);
  });

  it("prices goal-or-bust against a simulated walk and its limits", () => {
    // Monte Carlo: normal steps of mean 0.03 and SD 1, a 15 bankroll, a +25 goal, 600 rounds.
    let seed = 7;
    const uniform = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) + 0.5) / 2 ** 32;
    const normal = () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
    const paths = 20_000, rounds = 600, mean = 0.03;
    let goals = 0, ruins = 0;
    for (let path = 0; path < paths; path++) {
      let x = 0;
      for (let round = 0; round < rounds; round++) {
        x += mean + normal();
        if (x >= 25) { goals++; break; }
        if (x <= -15) { ruins++; break; }
      }
    }
    // A discrete walk overshoots each barrier by about 0.5826 SD (Siegmund), so the continuous
    // formula is compared with the barriers moved out by that much.
    const shift = 0.5826;
    const timed = goalOrBust(15 + shift, 25 + shift, mean, 1, rounds);
    expect(timed.goal).toBeCloseTo(goals / paths, 1.7);
    expect(timed.ruin).toBeCloseTo(ruins / paths, 1.7);
    // With no time limit the walk always ends at one barrier; a long trip approaches that.
    const ever = goalOrBust(15, 25, mean, 1);
    expect(ever.goal + ever.ruin).toBeCloseTo(1, 12);
    const long = goalOrBust(15, 25, mean, 1, 1e6);
    expect(long.goal).toBeCloseTo(ever.goal, 6);
    expect(long.ruin).toBeCloseTo(ever.ruin, 6);
    // A goal out of reach leaves plain trip ruin; no drift gives the fair-game split.
    expect(goalOrBust(15, 1e6, mean, 1, rounds).ruin).toBeCloseTo(finiteHorizonRisk(15, mean, 1, rounds), 4);
    expect(goalOrBust(10, 30, 0, 1).goal).toBeCloseTo(0.25, 10);
    // Dollar-sized inputs stay finite.
    const big = goalOrBust(20_000, 10_000, 1.2, 1600 ** 2, 50_000);
    expect(big.goal).toBeGreaterThan(0);
    expect(big.goal + big.ruin).toBeLessThanOrEqual(1 + 1e-12);
  });

  it("sizes a bankroll for a number of rounds at a target risk", () => {
    const [mean, variance, rounds, target] = [0.02, 1.7, 50_000, 0.05];
    const bankroll = bankrollForHorizon(mean, variance, rounds, target);
    expect(finiteHorizonRisk(bankroll, mean, variance, rounds)).toBeCloseTo(target, 3);
    expect(finiteHorizonRisk(bankroll * 0.95, mean, variance, rounds)).toBeGreaterThan(target);
    // Never more than the play-forever bankroll, and it grows with the horizon towards it.
    expect(bankroll).toBeLessThan(requiredBankroll(mean, variance, target));
    expect(bankrollForHorizon(mean, variance, rounds * 10, target)).toBeGreaterThan(bankroll);
    // A losing game still has a finite answer for a finite horizon.
    expect(Number.isFinite(bankrollForHorizon(-0.005, 1.3, 10_000, 0.05))).toBe(true);
  });

  it("returns bounded finite-horizon outcomes for a complete scenario", () => {
    const result = analyzeCvcx({
      bankroll: 10_000,
      minimumBet: 25,
      handsPerHour: 100,
      hours: 8,
      targetRisk: 0.135,
      maxSpread: 8,
      wongInAt: null,
      rules: DEFAULT_ADVANTAGE_RULES,
    }, RAMPS["1-8"]);

    expect(result.playedFrequency).toBeCloseTo(1, 10);
    expect(result.chanceOfProfit).toBeGreaterThanOrEqual(0);
    expect(result.chanceOfProfit).toBeLessThanOrEqual(1);
    expect(result.tripRiskOfRuin).toBeGreaterThanOrEqual(0);
    expect(result.tripRiskOfRuin).toBeLessThanOrEqual(1);
    expect(finiteHorizonRisk(0, 1, 1, 10)).toBe(1);
    expect(goalByHorizonProbability(0, 0, 1, 10)).toBe(1);
  });
});
