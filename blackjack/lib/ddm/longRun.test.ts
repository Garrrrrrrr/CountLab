import { describe, expect, it } from "vitest";
import { calculateDDMLongRun, DDM_PROFILES, reweightMainRamp } from "./longRun";

const main = DDM_PROFILES.find((profile) => profile.id === "main")!;

describe("DDM long-run calculator", () => {
  it("reproduces the audited one-unit, 100-round hourly metrics", () => {
    const result = calculateDDMLongRun(main, { unit: 1, bankroll: 10_000, roundsPerHour: 100, hours: 1, targetRisk: 0.05 });
    expect(result.evPerHour).toBeCloseTo(7.397920950459167, 13);
    expect(result.sdPerHour).toBeCloseTo(84.01038848957194, 13);
    expect(result.n0).toBeCloseTo(12895.750238296843, 8);
    expect(result.requiredBankroll).toBeCloseTo(1428.9903702344623, 8);
    expect(result.riskSizedUnit).toBeCloseTo(6.997947787681204, 12);
  });

  it("scales dollars linearly and standard deviation by square-root time", () => {
    const result = calculateDDMLongRun(main, { unit: 10, bankroll: 10_000, roundsPerHour: 100, hours: 4, targetRisk: 0.05 });
    expect(result.evPerHour).toBeCloseTo(73.97920950459167, 11);
    expect(result.sdPerHour).toBeCloseTo(840.1038848957194, 10);
    expect(result.tripEv).toBeCloseTo(295.9168380183667, 10);
    expect(result.tripSd).toBeCloseTo(1680.2077697914388, 9);
    expect(result.averageBet).toBeCloseTo(29.257262870702907, 12);
  });

  it("reports standard SCORE and scale-independent N0", () => {
    const one = calculateDDMLongRun(main, { unit: 1, bankroll: 10_000, roundsPerHour: 100, hours: 1, targetRisk: 0.05 });
    const twenty = calculateDDMLongRun(main, { unit: 20, bankroll: 10_000, roundsPerHour: 100, hours: 1, targetRisk: 0.05 });
    expect(twenty.n0).toBeCloseTo(one.n0, 10);
    expect(one.score).toBeCloseTo(1_000_000 / 12895.750238296843, 10);
  });

  it("reproduces the source profile when reweighting its recorded ramp", () => {
    const reweighted = reweightMainRamp([1, 3, 7, 11, 15, 16]);
    expect(reweighted.evPerRound).toBeCloseTo(main.evPerRound, 14);
    expect(reweighted.variancePerRound).toBeCloseTo(main.variancePerRound, 11);
    expect(reweighted.avgBet).toBeCloseTo(main.avgBet, 14);
    expect(reweighted.ci95).toBeCloseTo(main.ci95, 7);
  });

  it("supports a flat custom spread without changing TC frequencies", () => {
    const flat = reweightMainRamp([1, 1, 1, 1, 1, 1]);
    expect(flat.avgBet).toBeCloseTo(1, 7);
    expect(flat.variancePerRound).toBeGreaterThan(0);
    expect(flat.evPerRound).toBeLessThan(main.evPerRound);
  });

  it("marks negative-EV profiles as having no finite N0 or bankroll solution", () => {
    const csm = DDM_PROFILES.find((profile) => profile.id === "csm")!;
    const result = calculateDDMLongRun(csm, { unit: 10, bankroll: 10_000, roundsPerHour: 100, hours: 4, targetRisk: 0.05 });
    expect(result.evPerHour).toBeLessThan(0);
    expect(result.n0).toBe(Infinity);
    expect(result.score).toBe(0);
    expect(result.requiredBankroll).toBe(Infinity);
    expect(result.lifetimeRisk).toBe(1);
    expect(result.riskSizedUnit).toBe(0);
  });
});
