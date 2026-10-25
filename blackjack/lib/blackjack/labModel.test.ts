import { describe, expect, it } from "vitest";
import { DECK_COUNTS, GAME_OPTIONS } from "./coefficients";
import { unsupportedScenario } from "./scenarios";
import { calculateAdvantage, DEFAULT_ADVANTAGE_RULES, RAMPS, unitsAt } from "./advantage";
import { analyzeCvcx, createOptimalRamp, riskSizedUnit } from "./cvcx";
import { DEFAULT_LAB_CONFIG, normalizeConfig, OPTIMAL_RAMP_NAME, presetRamp, toTemplateConfig, type LabConfig } from "./labConfig";
import { chance, count, money, percent, riskLabel, signedMoney } from "./labFormat";
import {
  bankrollFit,
  bettingNothing,
  compareGames,
  expertFigures,
  extraRuleAdjustment,
  labBlocker,
  labRuleFlags,
  countSharesFor,
  roundsPerShoe,
  labRules,
  labScenario,
  playedRamp,
  wongOutChoices,
  playedSpread,
  priceLab,
  priceTemplate,
  reusableSimulationTemplate,
  sameSimulationSetup,
  simulationConfigFor,
  suggestSpreads,
  tripOutlook,
  type Destination,
} from "./labModel";
import { expandHands, sameRamp } from "./rampSteps";
import { isEstimated, sumRuleAdjustment } from "./ruleAdjustments";
import { planTrip } from "./tripPlanning";
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
    expect(result.hourlyEv).toBeCloseTo(30.95, 1);
    expect(result.riskOfRuin).toBeCloseTo(0.011, 3);
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
  it("ranks every simulated game by SCORE and marks the current one", () => {
    const rows = compareGames(DEFAULT_LAB_CONFIG, "optimal");
    expect(rows).toHaveLength(DECK_COUNTS.reduce((sum, decks) => sum + GAME_OPTIONS[decks].length, 0));
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

/* ------------------------------------------------------------------------ */
/* Calculator parity with the Game & Bankroll Lab                            */
/* ------------------------------------------------------------------------ */

/** The Lab's page computation (components/cvcx/useLab.ts, useLabModel), verbatim apart from the hook. */
function legacyLabModel(config: LabConfig) {
  const rules = labRules(config);
  const flags = labRuleFlags(config);
  const activeRamp = playedRamp(config);
  const scenario = labScenario(config, rules);
  const result = analyzeCvcx(scenario, activeRamp, config.baseBet);
  const optimalRamp = createOptimalRamp(rules, config.maxSpread, config.wongInAt, config.chipIncrement, extraRuleAdjustment(config));
  const noBets = bettingNothing(activeRamp);
  return {
    rules,
    activeRamp,
    scenario,
    result,
    optimalRamp,
    optimalScore: analyzeCvcx(scenario, optimalRamp, config.baseBet).cScore,
    usingOptimal: sameRamp(activeRamp, optimalRamp),
    optimalUnit: riskSizedUnit(scenario, optimalRamp),
    noBets,
    estimated: isEstimated(flags),
    ruleAdjustment: sumRuleAdjustment(flags),
    fit: bankrollFit({ bankroll: config.bankroll, unit: config.baseBet, required: result.requiredBankroll, evPerRound: result.evPerRound, riskSizedUnit: riskSizedUnit(scenario, activeRamp), noBets }),
    staleOptimal: config.rampName === OPTIMAL_RAMP_NAME && !sameRamp(config.ramp, optimalRamp),
  };
}

const PARITY: Record<string, LabConfig> = {
  /** The example the page opens with. */
  default: DEFAULT_LAB_CONFIG,
  /** 8 decks, 6.5 dealt, basic strategy, sitting out below +1, 1–8 at $25. */
  eightDeckBasicWong: withConfig({ decks: 8, dealt: 6.5, useIndices: false, wongInAt: 1, rampName: "1-8", ramp: presetRamp("1-8"), baseBet: 25, bankroll: 40000, handsPerHour: 80, hours: 20, targetRisk: 0.1 }),
  /** Estimated rules (S17, no hole card, double 10–11) and two hands from +3. */
  estimatedTwoHands: withConfig({ dealt: 5, dealerHitsSoft17: false, europeanNoHoleCard: true, doubleRule: "10to11", hands: DEFAULT_LAB_CONFIG.hands.map((point) => ({ ...point, hands: point.trueCount >= 3 ? 2 : 1 })), baseBet: 10, bankroll: 10000, hours: 8 }),
};

describe("priceLab", () => {
  it("is the Lab's own computation for the same inputs", () => {
    for (const [name, config] of Object.entries(PARITY)) {
      const { figures, riskSizedUnit: sized, ...pricing } = priceLab(config);
      expect(pricing, name).toEqual(legacyLabModel(config));
      expect(sized, name).toBe(riskSizedUnit(labScenario(config), playedRamp(config)));
      expect(figures, name).toEqual(expertFigures(pricing.result, config.baseBet));
    }
  });

  // Pinned figures: a units mix-up (dealt as a fraction, hours as rounds, the unit applied twice) moves every one of these.
  it.each([
    ["default", { hourlyEv: 30.947, sdPerHour: 585.61, riskOfRuin: 0.010975, requiredBankroll: 16598.3, nZeroRounds: 35806.8, score: 27.9276, averageBet: 31.3173, chanceAhead: 0.70141 }],
    ["eightDeckBasicWong", { hourlyEv: 30.481, sdPerHour: 584.89, riskOfRuin: 0.000802, requiredBankroll: 12921.4, nZeroRounds: 29456.6, score: 33.9482, averageBet: 25.764, chanceAhead: 0.59214 }],
    ["estimatedTwoHands", { hourlyEv: 61.994, sdPerHour: 679.56, riskOfRuin: 0.068229, requiredBankroll: 11157.8, nZeroRounds: 12015.9, score: 83.2228, averageBet: 33.5362, chanceAhead: 0.60181 }],
  ] as const)("prices the %s setup as the Lab did", (name, expected) => {
    const config = PARITY[name];
    const { result } = priceLab(config);
    const trip = tripOutlook(config, result);
    expect(result.hourlyEv).toBeCloseTo(expected.hourlyEv, 2);
    expect(result.sdPerHour).toBeCloseTo(expected.sdPerHour, 1);
    expect(result.riskOfRuin).toBeCloseTo(expected.riskOfRuin, 5);
    expect(result.requiredBankroll).toBeCloseTo(expected.requiredBankroll, 0);
    expect(result.nZeroRounds).toBeCloseTo(expected.nZeroRounds, 0);
    expect(result.cScore).toBeCloseTo(expected.score, 3);
    expect(result.averageBet).toBeCloseTo(expected.averageBet, 3);
    expect(trip.chanceAhead).toBeCloseTo(expected.chanceAhead, 4);
  });

  it("reads penetration as decks dealt and the unit as dollars", () => {
    const pricing = priceLab(PARITY.eightDeckBasicWong);
    expect(pricing.rules.penetration).toBeCloseTo(6.5 / 8, 12);
    expect(pricing.result.rows.find((row) => row.trueCount === 4)!.bet).toBe(8 * 25);
    expect(pricing.result.rows.find((row) => row.trueCount === 0)!.bet).toBe(0);
    expect(pricing.result.hourlyEv).toBeCloseTo(pricing.result.evPerRound * 80, 9);
  });

  it("reports DI as the square root of SCORE, and neither without an edge", () => {
    const { figures, result } = priceLab(DEFAULT_LAB_CONFIG);
    expect(figures.desirabilityIndex ** 2).toBeCloseTo(result.cScore, 9);
    expect(figures.unitsPerHour).toBeCloseTo(result.hourlyEv / 15, 9);
    const losing = priceLab(withConfig({ useIndices: false, rampName: "Custom", ramp: DEFAULT_LAB_CONFIG.ramp.map((point) => ({ ...point, units: 1 })) }));
    expect(losing.result.evPerRound).toBeLessThan(0);
    expect(losing.figures.desirabilityIndex).toBeNaN();
    expect(losing.figures.score).toBeNaN();
  });

  it("prices a saved scenario exactly as loading it would", () => {
    const template = { id: "t1", name: "Trip", createdAt: "2026-01-01T00:00:00.000Z", config: toTemplateConfig(PARITY.estimatedTwoHands) };
    const priced = priceTemplate(template);
    expect(priced.config).toEqual(normalizeConfig(template.config));
    expect(priced.pricing.result.hourlyEv).toBeCloseTo(priceLab(PARITY.estimatedTwoHands).result.hourlyEv, 12);
  });
});

describe("tripOutlook", () => {
  it("matches the Trip Planner for the audited rules", () => {
    const config = withConfig({ hours: 12, bankroll: 6000 });
    const { result } = priceLab(config);
    const trip = tripOutlook(config, result);
    const plan = planTrip({ bankroll: 6000, bettingUnit: 15, playerHands: 1, handsByTrueCount: config.hands, handsPerHour: 100, hours: 12, rules: labRules(config), ramp: playedRamp(config) });
    expect(trip.expected).toBeCloseTo(plan.tripEv, 9);
    expect(trip.riskOfRuin).toBeCloseTo(plan.bustProbability, 12);
    expect(trip.chanceAhead).toBeCloseTo(plan.chanceOfProfit, 12);
    expect(trip.lossAtLeast(1000)).toBeCloseTo(plan.lossProbability(1000), 12);
    expect(trip.reachesGoal(1000)).toBeCloseTo(plan.goalProbability(1000), 12);
    expect(trip.endingBankroll).toBeCloseTo(plan.expectedEndingBankroll, 9);
  });

  it("orders its percentiles and ranges around the expected result", () => {
    const config = DEFAULT_LAB_CONFIG;
    const trip = tripOutlook(config, priceLab(config).result);
    expect(trip.rounds).toBe(10_000);
    expect(trip.percentiles.map((point) => point.percentile)).toEqual([5, 25, 50, 75, 95]);
    expect(trip.percentiles[2].value).toBeCloseTo(trip.expected, 9);
    for (let index = 1; index < trip.percentiles.length; index++) expect(trip.percentiles[index].value).toBeGreaterThan(trip.percentiles[index - 1].value);
    expect(trip.ranges[2].low).toBeLessThan(trip.ranges[0].low);
    expect(trip.chanceOfLoss).toBeCloseTo(1 - trip.chanceAhead, 12);
    expect(trip.lossAtLeast(0)).toBeCloseTo(trip.chanceOfLoss, 12);
    expect(trip.reachesGoal(0)).toBe(1);
  });
});

/** The Bet Spread Recommender's rule, verbatim, on its fixed audited game with one hand. */
function legacyRecommender({ bankroll, minimumBet, desiredEv, targetRisk, rph, rules }: { bankroll: number; minimumBet: number; desiredEv: number; targetRisk: number; rph: number; rules: typeof DEFAULT_ADVANTAGE_RULES }) {
  return Object.entries(RAMPS).map(([name, ramp]) => {
    const oneDollar = calculateAdvantage({ bankroll: 1, bettingUnit: 1, playerHands: 1, handsPerHour: rph, hours: 1, rules, ramp });
    const requiredRaw = oneDollar.evPerRound > 0 ? desiredEv / (oneDollar.evPerRound * rph) : Infinity;
    const allowedRaw = targetRisk >= 1 ? Infinity : oneDollar.evPerRound > 0 ? (-2 * bankroll * oneDollar.evPerRound) / (oneDollar.sdPerRound ** 2 * Math.log(targetRisk)) : 0;
    const minimumWhole = Math.max(1, Math.ceil(minimumBet));
    const requiredWhole = Math.max(minimumWhole, Math.ceil(requiredRaw));
    const allowedWhole = Math.floor(allowedRaw);
    const [baseBet, status] = allowedWhole < minimumWhole ? [minimumWhole, "minimum-too-high"] : requiredWhole <= allowedWhole ? [requiredWhole, "met"] : [allowedWhole, "risk-limited"];
    const maxBet = Math.max(...Array.from({ length: 17 }, (_, index) => Math.round(unitsAt(index - 8, ramp) * Number(baseBet))));
    return { name, baseBet, status, maxBet };
  });
}

describe("suggestSpreads", () => {
  it("sizes each preset exactly as the Bet Spread Recommender did on its own game", () => {
    for (const [bankroll, minimumBet, desiredEv, targetRisk] of [[25000, 10, 50, 0.05], [10000, 25, 40, 0.1], [5000, 15, 100, 0.01], [60000, 10, 20, 0.25]] as const) {
      const config = withConfig({ bankroll, baseBet: minimumBet, targetRisk });
      const { suggestions } = suggestSpreads(config, { tableMinimum: minimumBet, hourlyGoal: desiredEv });
      for (const legacy of legacyRecommender({ bankroll, minimumBet, desiredEv, targetRisk, rph: 100, rules: { ...DEFAULT_ADVANTAGE_RULES, decks: 6, penetration: 0.75 } })) {
        const ours = suggestions.find((suggestion) => suggestion.key === legacy.name)!;
        expect({ baseBet: ours.baseBet, status: ours.status, maxBet: ours.maxBet }, `${legacy.name} @ ${bankroll}/${minimumBet}/${desiredEv}/${targetRisk}`).toEqual({ baseBet: legacy.baseBet, status: legacy.status, maxBet: legacy.maxBet });
      }
    }
  });

  it("prices every candidate on the Lab's own game, including sitting out and hands per count", () => {
    const config = PARITY.estimatedTwoHands;
    const { suggestions } = suggestSpreads(config, { tableMinimum: 10, hourlyGoal: 50 });
    const preset = suggestions.find((suggestion) => suggestion.key === "1-8")!;
    expect(preset.result.hourlyEv).toBeCloseTo(analyzeCvcx(labScenario(config), playedRamp({ ...config, ramp: presetRamp("1-8") }), preset.baseBet).hourlyEv, 9);
    const sitting = suggestSpreads(PARITY.eightDeckBasicWong, { tableMinimum: 25, hourlyGoal: 50 }).suggestions;
    expect(sitting.every((suggestion) => suggestion.minBet === 0 || suggestion.result.rows.filter((row) => row.trueCount < 1).every((row) => row.bet === 0))).toBe(true);
  });

  it("offers the Kelly-weighted ramp and leaves out a ramp that duplicates a preset", () => {
    const keys = suggestSpreads(DEFAULT_LAB_CONFIG, { tableMinimum: 15, hourlyGoal: 50 }).suggestions.map((suggestion) => suggestion.key);
    expect(keys).toEqual(["1-4", "1-8", "1-12", "optimal"]);
    const custom = withConfig({ rampName: "Custom", ramp: presetRamp("1-12").map((point) => (point.trueCount >= 5 ? { ...point, units: 16 } : point)) });
    expect(suggestSpreads(custom, { tableMinimum: 15, hourlyGoal: 50 }).suggestions.map((suggestion) => suggestion.key)).toContain("yours");
  });

  it("recommends the smallest top bet that meets both targets", () => {
    const { suggestions, recommended } = suggestSpreads(withConfig({ bankroll: 40000, decks: 8, dealt: 6.5, wongInAt: 1 }), { tableMinimum: 25, hourlyGoal: 50 });
    const met = suggestions.filter((suggestion) => suggestion.feasible);
    expect(met.length).toBeGreaterThan(1);
    expect(recommended!.feasible).toBe(true);
    expect(recommended!.maxBet).toBe(Math.min(...met.map((suggestion) => suggestion.maxBet)));
    for (const suggestion of met) {
      expect(suggestion.result.hourlyEv).toBeGreaterThanOrEqual(50 - 1e-9);
      expect(suggestion.result.riskOfRuin).toBeLessThanOrEqual(0.05 + 1e-12);
    }
  });

  it("when the goal is out of reach, recommends the most per hour within the risk ceiling", () => {
    const { suggestions, recommended } = suggestSpreads(DEFAULT_LAB_CONFIG, { tableMinimum: 15, hourlyGoal: 50 });
    expect(suggestions.some((suggestion) => suggestion.feasible)).toBe(false);
    const allowed = suggestions.filter((suggestion) => suggestion.withinRisk);
    expect(recommended!.result.hourlyEv).toBe(Math.max(...allowed.map((suggestion) => suggestion.result.hourlyEv)));
    for (const suggestion of allowed) expect(suggestion.result.riskOfRuin).toBeLessThanOrEqual(0.05 + 1e-12);
  });

  it("recommends nothing when the table minimum alone is too risky for every spread", () => {
    const { suggestions, recommended } = suggestSpreads(withConfig({ bankroll: 500, hands: expandHands(undefined) }), { tableMinimum: 25, hourlyGoal: 10 });
    expect(suggestions.every((suggestion) => suggestion.status === "minimum-too-high")).toBe(true);
    expect(recommended).toBeUndefined();
  });
});

describe("leaving a shoe played from the top", () => {
  it("offers only leave points below the shoe's starting count, each with simulated shares", () => {
    expect(wongOutChoices(null)).toEqual([-3, -2, -1]);
    expect(wongOutChoices(2)).toEqual([-3, -2, -1, 0, 1]);
    const rules = labRules(DEFAULT_LAB_CONFIG);
    for (const exit of wongOutChoices(null)) expect(countSharesFor({ wongInAt: null, wongOutAt: exit, handsPerHour: 100 }, rules), `start:${exit}`).toBeDefined();
  });

  it("charges each move to a fresh shoe as time without play", () => {
    const rules = labRules(DEFAULT_LAB_CONFIG);
    const shares = countSharesFor({ wongInAt: null, wongOutAt: -1, handsPerHour: 120 }, rules)!;
    const perShoe = roundsPerShoe({ wongInAt: null, wongOutAt: -1 }, rules)!;
    // Five minutes at 120 rounds an hour is ten rounds of time for every shoe left.
    expect(shares.idle! / shares.played.reduce((sum, share) => sum + share, 0)).toBeCloseTo(10 / perShoe, 6);
    const config = { ...DEFAULT_LAB_CONFIG, handsPerHour: 120, wongOutAt: -1 };
    const charged = analyzeCvcx(labScenario(config), config.ramp, 1);
    const free = analyzeCvcx({ ...labScenario(config), countShares: { ...shares, idle: 0 } }, config.ramp, 1);
    // The time between shoes scales the hour down and leaves each played round alone.
    expect(charged.hourlyEv / free.hourlyEv).toBeCloseTo(perShoe / (perShoe + 10), 3);
    expect(charged.evPerRound * (perShoe + 10)).toBeCloseTo(free.evPerRound * perShoe, 6);
    // Back-counters stay to watch, so they never move.
    expect(countSharesFor({ wongInAt: 2, wongOutAt: -1, handsPerHour: 120 }, rules)!.idle).toBe(0);
  });

  it("drops a saved leave point that could never apply", () => {
    const template = toTemplateConfig(DEFAULT_LAB_CONFIG);
    expect(normalizeConfig({ ...template, wongInAt: null, wongOutAt: 1 }).wongOutAt).toBeNull();
    expect(normalizeConfig({ ...template, wongInAt: null, wongOutAt: -1 }).wongOutAt).toBe(-1);
  });
});
