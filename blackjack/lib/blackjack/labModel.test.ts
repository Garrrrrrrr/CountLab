import { describe, expect, it } from "vitest";
import { unsupportedScenario } from "@/components/ScenarioPicker";
import { analyzeCvcx, createOptimalRamp, riskSizedUnit } from "./cvcx";
import { DEFAULT_LAB_CONFIG, toTemplateConfig, type LabConfig } from "./labConfig";
import { chance, count, money, percent, riskLabel, signedMoney } from "./labFormat";
import {
  bankrollFit,
  bettingNothing,
  compareGames,
  extraRuleAdjustment,
  labBlocker,
  labRules,
  labScenario,
  playedRamp,
  playedSpread,
  reusableSimulationTemplate,
  sameSimulationSetup,
  simulationConfigFor,
  type Destination,
} from "./labModel";
import { simulationLibrary } from "./simulationLibrary";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const withConfig = (patch: Partial<LabConfig>): LabConfig => ({ ...DEFAULT_LAB_CONFIG, ...patch });

describe("pricing", () => {
  it("masks counts below the sit-out point without changing the saved ramp", () => {
    const config = withConfig({ wongInAt: 1 });
    expect(playedRamp(config).filter((point) => point.units === 0).map((point) => point.trueCount)).toEqual([-8, -7, -6, -5, -4, -3, -2, -1, 0]);
    expect(config.ramp.every((point) => point.units > 0)).toBe(true);
  });

  it("passes only the hole-card and doubling rules as an extra adjustment", () => {
    expect(extraRuleAdjustment(DEFAULT_LAB_CONFIG)).toBe(0);
    expect(extraRuleAdjustment(withConfig({ dealerHitsSoft17: false }))).toBe(0);
    expect(extraRuleAdjustment(withConfig({ europeanNoHoleCard: true, doubleRule: "10to11" }))).toBeCloseTo(-0.0029, 6);
  });

  it("prices the default setup as the Lab always has", () => {
    const result = analyzeCvcx(labScenario(DEFAULT_LAB_CONFIG), playedRamp(DEFAULT_LAB_CONFIG), 15);
    expect(result.hourlyEv).toBeCloseTo(26.55, 1);
    expect(result.riskOfRuin).toBeCloseTo(0.0186, 3);
  });

  it("recognizes a ramp that bets nothing", () => {
    expect(bettingNothing(playedRamp(DEFAULT_LAB_CONFIG))).toBe(false);
    expect(bettingNothing(DEFAULT_LAB_CONFIG.ramp.map((point) => ({ ...point, units: 0 })))).toBe(true);
    expect(playedSpread(DEFAULT_LAB_CONFIG.ramp)).toEqual({ min: 1, max: 12 });
    expect(playedSpread(DEFAULT_LAB_CONFIG.ramp.map((point) => ({ ...point, units: 0 })))).toBeNull();
  });
});

describe("bankrollFit", () => {
  const scenario = labScenario(DEFAULT_LAB_CONFIG);
  const result = analyzeCvcx(scenario, playedRamp(DEFAULT_LAB_CONFIG), 15);
  const raw = riskSizedUnit(scenario, playedRamp(DEFAULT_LAB_CONFIG));

  it("offers a floored unit that keeps risk at or under the target", () => {
    const fit = bankrollFit({ bankroll: 25000, unit: 15, required: result.requiredBankroll, evPerRound: result.evPerRound, riskSizedUnit: raw, noBets: false });
    expect(fit.kind).toBe("covered");
    if (fit.kind !== "covered" || fit.raiseTo === null) throw new Error("expected a raise");
    expect(fit.raiseTo).toBe(Math.floor(raw));
    const raised = analyzeCvcx({ ...scenario, minimumBet: fit.raiseTo }, playedRamp(DEFAULT_LAB_CONFIG), fit.raiseTo);
    expect(raised.riskOfRuin).toBeLessThanOrEqual(DEFAULT_LAB_CONFIG.targetRisk);
  });

  it("reports the shortfall and the largest affordable unit", () => {
    const fit = bankrollFit({ bankroll: 5000, unit: 15, required: 18796, evPerRound: 0.26, riskSizedUnit: 3.99, noBets: false });
    expect(fit).toEqual({ kind: "short", required: 18796, shortBy: 13796, maxUnit: 3 });
  });

  it("never offers less than a dollar, and never silently rounds up to one", () => {
    expect(bankrollFit({ bankroll: 100, unit: 15, required: 18796, evPerRound: 0.26, riskSizedUnit: 0.4, noBets: false })).toEqual({ kind: "unaffordable" });
  });

  it("has nothing to size when there is no edge or no bet", () => {
    expect(bankrollFit({ bankroll: 25000, unit: 15, required: Infinity, evPerRound: -0.1, riskSizedUnit: 0, noBets: false })).toEqual({ kind: "no-edge" });
    expect(bankrollFit({ bankroll: 25000, unit: 15, required: Infinity, evPerRound: 0, riskSizedUnit: 0, noBets: true })).toEqual({ kind: "no-bets" });
  });
});

describe("compareGames", () => {
  it("ranks all nine games by SCORE and marks the current one", () => {
    const rows = compareGames(DEFAULT_LAB_CONFIG, "optimal");
    expect(rows).toHaveLength(9);
    expect(rows.filter((row) => row.current)).toHaveLength(1);
    for (let index = 1; index < rows.length; index++) expect(rows[index - 1].result.cScore).toBeGreaterThanOrEqual(rows[index].result.cScore);
  });

  it("prices each game with its own optimal ramp, as before", () => {
    const row = compareGames(DEFAULT_LAB_CONFIG, "optimal").find((item) => item.decks === 8 && item.dealt === 6)!;
    const rules = { ...labRules(DEFAULT_LAB_CONFIG), decks: 8, penetration: 6 / 8 };
    const ramp = createOptimalRamp(rules, 12, null, 0.5, 0);
    expect(row.ramp).toEqual(ramp);
    expect(row.result.hourlyEv).toBeCloseTo(analyzeCvcx({ ...labScenario(DEFAULT_LAB_CONFIG), rules }, ramp, 15).hourlyEv, 9);
  });

  it("can price every game with the player's own ramp, matching the headline for the current game", () => {
    const current = compareGames(DEFAULT_LAB_CONFIG, "yours").find((row) => row.current)!;
    expect(current.result.hourlyEv).toBeCloseTo(analyzeCvcx(labScenario(DEFAULT_LAB_CONFIG), playedRamp(DEFAULT_LAB_CONFIG), 15).hourlyEv, 9);
  });
});

describe("labBlocker", () => {
  const destinations: Destination[] = ["simulation", "compare", "trip-planner", "journal"];
  const cases: Partial<LabConfig>[] = [
    {},
    { europeanNoHoleCard: true },
    { doubleRule: "9to11" },
    { dealerHitsSoft17: false },
    { blackjackPayout: 1.2 },
    { lateSurrender: false },
    { hands: DEFAULT_LAB_CONFIG.hands.map((point) => (point.trueCount >= 3 ? { ...point, hands: 2 } : point)) },
    { hands: DEFAULT_LAB_CONFIG.hands.map((point) => ({ ...point, hands: 2 })) },
  ];

  it("blocks exactly what the destination tools refuse on arrival", () => {
    for (const patch of cases) {
      const config = withConfig(patch);
      for (const destination of destinations) {
        expect(Boolean(labBlocker(config, destination)), `${JSON.stringify(patch)} → ${destination}`).toBe(Boolean(unsupportedScenario(toTemplateConfig(config), destination === "simulation")));
      }
    }
  });

  it("says what to change, in the Lab's words", () => {
    expect(labBlocker(withConfig({ dealerHitsSoft17: false }), "simulation")).toEqual({ reason: "The Session Simulator models only the audited rules: H17 · DAS · RSA · LS · 3:2.", fix: "rules" });
    expect(labBlocker(withConfig({ hands: DEFAULT_LAB_CONFIG.hands.map((point) => (point.trueCount >= 3 ? { ...point, hands: 2 } : point)) }), "simulation")?.fix).toBe("hands");
    expect(labBlocker(withConfig({ europeanNoHoleCard: true }), "trip-planner")?.reason).toMatch(/no-hole-card/);
  });
});

describe("simulator hand-off", () => {
  it("builds the same setup the Lab has always handed over", () => {
    const config = simulationConfigFor(DEFAULT_LAB_CONFIG, "cvcx-1");
    expect(config).toMatchObject({ bankroll: 25000, bettingUnit: 15, playerHands: 1, rounds: 100_000, paths: 50, roundsPerHour: 100, seed: "cvcx-1" });
    expect(config.ramp).toEqual(playedRamp(DEFAULT_LAB_CONFIG));
    expect(Object.keys(config)).toEqual(["bankroll", "bettingUnit", "playerHands", "rounds", "paths", "roundsPerHour", "seed", "rules", "ramp"]);
  });

  it("reuses a matching template instead of saving a copy on every click", () => {
    const store = new MemoryStorage();
    for (let click = 0; click < 3; click++) {
      const config = simulationConfigFor(DEFAULT_LAB_CONFIG, `cvcx-${click}`);
      if (!reusableSimulationTemplate(simulationLibrary.templates(store), config, "Weekend")) simulationLibrary.saveTemplate(config, "Weekend", store);
    }
    expect(simulationLibrary.templates(store)).toHaveLength(1);
    const changed = simulationConfigFor(withConfig({ bankroll: 30000 }), "cvcx-9");
    expect(sameSimulationSetup(changed, simulationLibrary.templates(store)[0].config)).toBe(false);
    expect(reusableSimulationTemplate(simulationLibrary.templates(store), simulationConfigFor(DEFAULT_LAB_CONFIG, "x"), "Other")).toBeUndefined();
  });
});

describe("labFormat", () => {
  it("prints money with a true minus and a dash when unknown", () => {
    expect(money(18796)).toBe("$18,796");
    expect(money(26.554, 2)).toBe("$26.55");
    expect(money(-12.5, 2)).toBe("−$12.50");
    expect(money(Infinity)).toBe("—");
    expect(money(-0.001, 2)).toBe("$0.00");
    expect(signedMoney(2655)).toBe("+$2,655");
    expect(signedMoney(-1200)).toBe("−$1,200");
    expect(signedMoney(0)).toBe("$0");
  });

  it("prints percentages and tiny chances readably", () => {
    expect(percent(0.0186)).toBe("1.86%");
    expect(percent(0.00849, 3, true)).toBe("+0.849%");
    expect(percent(-0.0007, 2, true)).toBe("−0.07%");
    expect(percent(0, 2, true)).toBe("0.00%");
    expect(chance(0.00000004)).toBe("<0.01%");
    expect(chance(0.051)).toBe("5.10%");
    expect(count(1666.67)).toBe("1,667");
    expect(count(Infinity)).toBe("—");
    expect([riskLabel(0.05), riskLabel(0.025), riskLabel(0.135)]).toEqual(["5%", "2.5%", "13.5%"]);
  });
});
