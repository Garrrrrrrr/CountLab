import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import {
  SessionSimulationCancelled,
  simulateProfileSessions,
} from "./sessionSimulation";

const config = {
  bankroll: 5_000,
  bettingUnit: 25,
  playerHands: 1,
  rounds: 120,
  paths: 4,
  roundsPerHour: 100,
  seed: "repeatable-test-seed",
  rules: DEFAULT_ADVANTAGE_RULES,
  ramp: RAMPS["1-4"],
};

describe("profile session simulation", () => {
  it("is deterministic for a seed and reports internally consistent observations", async () => {
    const first = await simulateProfileSessions(config);
    const second = await simulateProfileSessions(config);

    expect(second).toEqual(first);
    expect(first.observations).toBe(480);
    expect(first.countBreakdown.reduce((sum, row) => sum + row.simulatedFrequency, 0)).toBeCloseTo(1, 10);
    expect(first.samplePath[0]).toEqual({ round: 0, bankroll: config.bankroll });
    expect(first.samplePath.at(-1)?.round).toBe(config.rounds);
    expect(first.endingBankrollP10).toBeLessThanOrEqual(first.medianEndingBankroll);
    expect(first.medianEndingBankroll).toBeLessThanOrEqual(first.endingBankrollP90);
  });

  it("checks cancellation at cooperative progress boundaries", async () => {
    await expect(simulateProfileSessions({ ...config, rounds: 1_000, paths: 1 }, {
      isCancelled: () => true,
    })).rejects.toBeInstanceOf(SessionSimulationCancelled);
  });
});
