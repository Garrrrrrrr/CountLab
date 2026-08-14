import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import { simulationLibrary } from "./simulationLibrary";
import type { SessionSimulationConfig, SessionSimulationResult } from "./sessionSimulation";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const config: SessionSimulationConfig = {
  bankroll: 10_000,
  bettingUnit: 25,
  playerHands: 1,
  rounds: 10_000,
  paths: 25,
  roundsPerHour: 100,
  seed: "library-test",
  rules: DEFAULT_ADVANTAGE_RULES,
  ramp: RAMPS["1-8"],
};

const result: SessionSimulationResult = {
  methodology: "profile-moment-monte-carlo-v1",
  seed: "library-test",
  roundsPerPath: 10_000,
  paths: 25,
  observations: 250_000,
  expectedEvPerRound: 0.25,
  expectedHourlyEv: 25,
  simulatedEvPerRound: 0.24,
  simulatedStandardError: 0.01,
  simulatedCi95: [0.22, 0.26],
  averageBet: 40,
  medianEndingBankroll: 12_500,
  meanEndingBankroll: 12_400,
  endingBankrollP10: 8_000,
  endingBankrollP90: 17_000,
  chanceOfProfit: 0.7,
  ruinCrossingRate: 0.01,
  averageMaxDrawdown: 2_500,
  samplePath: [{ round: 0, bankroll: 10_000 }],
  countBreakdown: [],
};

describe("simulation library", () => {
  it("persists, renames, duplicates, and deletes simulation runs", () => {
    const store = new MemoryStorage();
    const run = simulationLibrary.addRun(config, result, "Six deck test", store, new Date("2026-08-13T12:00:00Z"));
    expect(simulationLibrary.runs(store)).toHaveLength(1);
    simulationLibrary.renameRun(run.id, "Updated test", store);
    expect(simulationLibrary.runs(store)[0].name).toBe("Updated test");
    const copy = simulationLibrary.duplicateRun(run.id, store, new Date("2026-08-14T12:00:00Z"));
    expect(copy?.name).toBe("Updated test copy");
    expect(simulationLibrary.runs(store)).toHaveLength(2);
    simulationLibrary.deleteRun(run.id, store);
    expect(simulationLibrary.runs(store).map((item) => item.id)).toEqual([copy?.id]);
  });

  it("persists reusable templates independently from results", () => {
    const store = new MemoryStorage();
    const template = simulationLibrary.saveTemplate(config, "Local six deck", store, new Date("2026-08-13T12:00:00Z"));
    expect(simulationLibrary.templates(store)[0]).toMatchObject({ id: template.id, name: "Local six deck", config });
    simulationLibrary.deleteTemplate(template.id, store);
    expect(simulationLibrary.templates(store)).toEqual([]);
  });

  it("ignores malformed or old storage payloads", () => {
    const store = new MemoryStorage();
    store.setItem("countlab:simulation-runs:v1", JSON.stringify({ version: 1, items: [{ id: "broken" }] }));
    expect(simulationLibrary.runs(store)).toEqual([]);
    store.setItem("countlab:simulation-runs:v1", JSON.stringify({ version: 0, items: [] }));
    expect(simulationLibrary.runs(store)).toEqual([]);
  });

  it("exports and merges a validated portable library", () => {
    const source = new MemoryStorage();
    simulationLibrary.addRun(config, result, "Portable run", source, new Date("2026-08-13T12:00:00Z"));
    simulationLibrary.saveTemplate(config, "Portable setup", source, new Date("2026-08-13T12:00:00Z"));
    const target = new MemoryStorage();
    const imported = simulationLibrary.importData(simulationLibrary.exportData(source), target);
    expect(imported).toEqual({ runs: 1, templates: 1 });
    expect(simulationLibrary.runs(target)[0].name).toBe("Portable run");
    expect(simulationLibrary.templates(target)[0].name).toBe("Portable setup");
    expect(() => simulationLibrary.importData('{"version":1,"runs":[{}],"templates":[]}', target)).toThrow(/invalid/i);
  });
});
