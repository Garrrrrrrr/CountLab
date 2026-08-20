import { describe, expect, it } from "vitest";
import { hiLoValue, runningCount, trueCount } from "./hiLo";
import { BlackjackShoe } from "./shoe";
import { calculateHandValue, isBlackjack, isPair, isSoft } from "./hand";
import { getBasicStrategyDecision } from "./basicStrategy";
import { DEVIATIONS, deviationDecision } from "./deviations";
import { Card, DEFAULT_RULES, RANKS, SUITS } from "./types";
import {
  calculateAdvantage,
  DEFAULT_ADVANTAGE_RULES,
  getCountProfile,
  RAMPS,
  recommendUnit,
  simultaneousHandVarianceFactor,
  unitsAt,
  zeroBetsBelow,
  zeroNegativeCountBets,
} from "./advantage";
import { H17_PRO_COEFFICIENTS, H17_PRO_METADATA } from "./h17ProCoefficients";
import { simulateProfileSessions } from "./sessionSimulation";
import {
  analyzeCvcx,
  createOptimalRamp,
  finiteHorizonRisk,
  goalByHorizonProbability,
  normalCdf,
  requiredBankroll,
} from "./cvcx";
const c = (rank: Card["rank"], suit: Card["suit"] = "spades"): Card => ({
  rank,
  suit,
});
describe("Hi-Lo", () => {
  it("maps ranks", () => {
    for (const r of ["2", "3", "4", "5", "6"] as const)
      expect(hiLoValue(r)).toBe(1);
    for (const r of ["7", "8", "9"] as const) expect(hiLoValue(r)).toBe(0);
    for (const r of ["10", "J", "Q", "K", "A"] as const)
      expect(hiLoValue(r)).toBe(-1);
  });
  it("balances one and six decks", () => {
    const deck = SUITS.flatMap((s) => RANKS.map((r) => c(r, s)));
    expect(runningCount(deck)).toBe(0);
    expect(runningCount(Array.from({ length: 6 }, () => deck).flat())).toBe(0);
  });
  it("rounds true counts", () => {
    expect(trueCount(7, 2, "floor")).toBe(3);
    expect(trueCount(-7, 2, "floor")).toBe(-4);
    expect(trueCount(-7, 2, "truncate")).toBe(-3);
    expect(trueCount(7, 2, "nearest")).toBe(4);
  });
});
describe("shoe", () => {
  it("contains and removes exact cards", () => {
    const shoe = new BlackjackShoe(6);
    expect(shoe.cardsRemaining()).toBe(312);
    shoe.deal();
    expect(shoe.cardsRemaining()).toBe(311);
    expect(shoe.dealtCards()).toHaveLength(1);
    shoe.reset();
    expect(shoe.cardsRemaining()).toBe(312);
    expect(shoe.runningCount()).toBe(0);
  });
});
describe("hands", () => {
  it("handles soft aces", () => {
    const h = [c("A"), c("6")];
    expect(calculateHandValue(h)).toBe(17);
    expect(isSoft(h)).toBe(true);
    expect(calculateHandValue([c("A"), c("A"), c("9")])).toBe(21);
  });
  it("detects blackjack and pairs", () => {
    expect(isBlackjack([c("A"), c("K")])).toBe(true);
    expect(isPair([c("8"), c("8", "hearts")])).toBe(true);
  });
});
describe("strategy", () => {
  it("uses late-surrender H17 defaults", () =>
    expect(
      getBasicStrategyDecision({
        playerCards: [c("10"), c("6")],
        dealerUpcard: c("10"),
        rules: DEFAULT_RULES,
      }).action,
    ).toBe("R"));
  it("splits aces", () =>
    expect(
      getBasicStrategyDecision({
        playerCards: [c("A"), c("A")],
        dealerUpcard: c("7"),
        rules: DEFAULT_RULES,
      }).action,
    ).toBe("P"));
  it.each([
    ["9", "P"],
    ["10", "P"],
    ["A", "R"],
  ] as const)("plays 8,8 vs %s as %s", (dealer, action) =>
    expect(
      getBasicStrategyDecision({
        playerCards: [c("8"), c("8", "hearts")],
        dealerUpcard: c(dealer),
        rules: DEFAULT_RULES,
      }).action,
    ).toBe(action));
  it("doubles eleven", () =>
    expect(
      getBasicStrategyDecision({
        playerCards: [c("6"), c("5")],
        dealerUpcard: c("6"),
        rules: DEFAULT_RULES,
      }).action,
    ).toBe("D"));
  it("stands on multi-card soft 18 when doubling is unavailable", () => {
    const decision = getBasicStrategyDecision({
      playerCards: [c("A"), c("2"), c("5")],
      dealerUpcard: c("2"),
      rules: DEFAULT_RULES,
    });
    expect(decision.action).toBe("D");
    expect(decision.fallback).toBe("S");
    expect(decision.explanation).toContain("otherwise Stand");
  });
  it("hits lower soft doubles when doubling is unavailable", () => {
    const decision = getBasicStrategyDecision({
      playerCards: [c("A"), c("2"), c("4")],
      dealerUpcard: c("3"),
      rules: DEFAULT_RULES,
    });
    expect(decision.action).toBe("D");
    expect(decision.fallback).toBe("H");
  });
  it("applies the H17-only 15 vs Ace surrender rule", () => {
    const hand = [c("10"), c("5")];
    expect(getBasicStrategyDecision({ playerCards: hand, dealerUpcard: c("A"), rules: DEFAULT_RULES }).action).toBe("R");
    expect(getBasicStrategyDecision({ playerCards: hand, dealerUpcard: c("A"), rules: { ...DEFAULT_RULES, dealerHitsSoft17: false } }).action).toBe("H");
  });
  it("applies the H17-only 16 vs Ace surrender rule", () => {
    const hand = [c("10"), c("6")];
    expect(getBasicStrategyDecision({ playerCards: hand, dealerUpcard: c("A"), rules: DEFAULT_RULES }).action).toBe("R");
    expect(getBasicStrategyDecision({ playerCards: hand, dealerUpcard: c("A"), rules: { ...DEFAULT_RULES, dealerHitsSoft17: false } }).action).toBe("H");
    // 16 vs 9 and 16 vs 10 surrender under either dealer rule.
    expect(getBasicStrategyDecision({ playerCards: hand, dealerUpcard: c("9"), rules: { ...DEFAULT_RULES, dealerHitsSoft17: false } }).action).toBe("R");
    expect(getBasicStrategyDecision({ playerCards: hand, dealerUpcard: c("10"), rules: { ...DEFAULT_RULES, dealerHitsSoft17: false } }).action).toBe("R");
  });
});
describe("deviations", () => {
  it("uses the H17 Pro thresholds", () => {
    const d = DEVIATIONS.find((x) => x.hand === "15" && x.dealer === "10" && x.deviationAction === "S")!;
    expect(deviationDecision(d, 3)).toBe("R");
    expect(deviationDecision(d, 4)).toBe("S");
  });
  it("uses the complete supplied H17 Pro catalog", () => {
    expect(DEVIATIONS).toHaveLength(34);
  });
});
describe("advantage model", () => {
  it("selects the matching shoe and penetration coefficients", () => {
    const profile = getCountProfile({
      ...DEFAULT_ADVANTAGE_RULES,
      decks: 8,
      penetration: 0.75,
    });
    expect(profile).toHaveLength(17);
    expect(profile.reduce((sum, row) => sum + row.p, 0)).toBeCloseTo(1, 10);
    const neutral = profile.find((row) => row.tc === 0)!;
    const measured = H17_PRO_COEFFICIENTS["8-6"][8];
    expect(neutral.p).toBeCloseTo(measured[0], 12);
    expect(neutral.samples).toBe(measured[3]);
    expect(neutral.standardError).toBe(measured[4]);
    expect(H17_PRO_METADATA.totalRounds).toBeGreaterThan(100_000_000_000);
  });
  it("applies ramp thresholds", () => {
    expect(unitsAt(0, RAMPS["1-8"])).toBe(1);
    expect(unitsAt(3, RAMPS["1-8"])).toBe(6);
  });
  it("can zero every negative-count wager without changing nonnegative bets", () => {
    const ramp = zeroNegativeCountBets([
      { trueCount: -8, units: 1 },
      { trueCount: -1, units: 1 },
      { trueCount: 0, units: 1 },
      { trueCount: 1, units: 2 },
    ]);
    expect(unitsAt(-8, ramp)).toBe(0);
    expect(unitsAt(-1, ramp)).toBe(0);
    expect(unitsAt(0, ramp)).toBe(1);
    expect(unitsAt(1, ramp)).toBe(2);
  });
  it("drops wonged-out counts from EV, action and rounds played", () => {
    // The Lab's Wong-in control used to reshape only the generated ramp, so the
    // headline numbers still priced playing every count. Zeroing the live ramp
    // has to actually remove those rounds from the aggregates.
    const base = {
      bankroll: 25_000,
      minimumBet: 10,
      handsPerHour: 100,
      hours: 100,
      targetRisk: 0.05,
      maxSpread: 12,
      wongInAt: null,
      rules: DEFAULT_ADVANTAGE_RULES,
    };
    const ramp = Array.from({ length: 17 }, (_, index) => ({
      trueCount: index - 8,
      units: unitsAt(index - 8, RAMPS["1-12"]),
    }));
    const playAll = analyzeCvcx(base, ramp, 10);
    const wonged = analyzeCvcx(base, zeroBetsBelow(ramp, 2), 10);
    expect(playAll.playedFrequency).toBeCloseTo(1, 10);
    expect(wonged.playedFrequency).toBeLessThan(0.2);
    expect(wonged.averageBet).toBeLessThan(playAll.averageBet);
    // Skipping every negative count removes losses, so EV per observed round rises.
    expect(wonged.evPerRound).toBeGreaterThan(playAll.evPerRound);
    for (const row of wonged.rows.filter((entry) => entry.trueCount < 2)) {
      expect(row.bet).toBe(0);
      expect(row.totalBet).toBe(0);
    }
  });
  it("returns finite risk and scales units with risk tolerance", () => {
    const result = calculateAdvantage({
      bankroll: 1000,
      handsPerHour: 100,
      hours: 4,
      rules: DEFAULT_ADVANTAGE_RULES,
      ramp: RAMPS["1-8"],
    });
    expect(Number.isFinite(result.riskOfRuin)).toBe(true);
    expect(result.averageBet).toBeGreaterThan(1);
    expect(
      recommendUnit(1000, 0.01, DEFAULT_ADVANTAGE_RULES, RAMPS["1-8"]),
    ).toBeLessThan(
      recommendUnit(1000, 0.1, DEFAULT_ADVANTAGE_RULES, RAMPS["1-8"]),
    );
    expect(recommendUnit(1000, 1, DEFAULT_ADVANTAGE_RULES, RAMPS["1-8"])).toBe(
      Infinity,
    );
  });
  it("aggregates simultaneous player hands as total action", () => {
    const base = {
      bankroll: 10_000,
      bettingUnit: 10,
      handsPerHour: 80,
      hours: 4,
      rules: DEFAULT_ADVANTAGE_RULES,
      ramp: RAMPS["1-8"],
    };
    const one = calculateAdvantage({ ...base, playerHands: 1 });
    const three = calculateAdvantage({ ...base, playerHands: 3 });
    expect(three.averageBet).toBeCloseTo(one.averageBet * 3, 10);
    expect(three.evPerRound).toBeCloseTo(one.evPerRound * 3, 10);
    expect(three.rows.find((row) => row.trueCount === 2)?.totalBet).toBe(120);
    expect(three.sdPerRound).toBeGreaterThan(one.sdPerRound);
    expect(three.riskOfRuin).toBeGreaterThanOrEqual(0);
    expect(three.riskOfRuin).toBeLessThanOrEqual(1);
  });
  it("prices simultaneous hands as correlated, not independent", () => {
    // Hands in one round are settled against a single dealer hand, so they are
    // strongly positively correlated. blackjack-simulator/covariance.py measures
    // the round-total variance of n equal hands at n * (1 + (n - 1) * rho) times
    // a single hand's variance, with rho = 0.3724. Treating them as independent
    // (a plain n x multiplier) understates variance and therefore risk of ruin.
    expect(simultaneousHandVarianceFactor(1)).toBe(1);
    expect(simultaneousHandVarianceFactor(2)).toBeCloseTo(2.7448, 10);
    expect(simultaneousHandVarianceFactor(3)).toBeCloseTo(5.2344, 10);
    expect(simultaneousHandVarianceFactor(4)).toBeCloseTo(8.4688, 10);

    // A flat one-unit ramp isolates the conditional term: with no bet ramping
    // the round variance is just the per-hand variance times that factor.
    const flat = Array.from({ length: 17 }, (_, index) => ({
      trueCount: index - 8,
      units: 1,
    }));
    const base = {
      bankroll: 10_000,
      bettingUnit: 10,
      handsPerHour: 100,
      hours: 1,
      rules: DEFAULT_ADVANTAGE_RULES,
      ramp: flat,
    };
    const one = calculateAdvantage({ ...base, playerHands: 1 });
    const two = calculateAdvantage({ ...base, playerHands: 2 });
    expect(two.sdPerRound ** 2 / one.sdPerRound ** 2).toBeCloseTo(
      simultaneousHandVarianceFactor(2),
      3,
    );
    // Independence would have given exactly 2x, understating variance.
    expect(two.sdPerRound ** 2 / one.sdPerRound ** 2).toBeGreaterThan(2.7);

    // On a real positive-EV ramp the understatement lands on risk of ruin: the
    // old independent model reported a materially safer game than it is.
    const ramped = calculateAdvantage({
      ...base,
      ramp: RAMPS["1-8"],
      playerHands: 2,
    });
    const independentVariance = ramped.rows.reduce(
      (sum, row) =>
        sum +
        row.frequency *
          (row.playerHands * (row.sdUnits * row.bet) ** 2 +
            (row.advantage * row.totalBet) ** 2),
      0,
    ) - ramped.evPerRound ** 2;
    const independentRisk = Math.exp(
      (-2 * base.bankroll * ramped.evPerRound) / independentVariance,
    );
    expect(ramped.evPerRound).toBeGreaterThan(0);
    expect(ramped.sdPerRound ** 2).toBeGreaterThan(independentVariance);
    expect(ramped.riskOfRuin).toBeGreaterThan(independentRisk);
    expect(ramped.nZeroRounds).toBeGreaterThan(
      independentVariance / ramped.evPerRound ** 2,
    );
  });
  it("changes the number of hands at a true-count threshold", () => {
    const result = calculateAdvantage({
      bankroll: 10_000,
      bettingUnit: 10,
      playerHands: 1,
      handsByTrueCount: [
        { trueCount: -8, hands: 1 },
        { trueCount: 2, hands: 2 },
      ],
      handsPerHour: 100,
      hours: 4,
      rules: DEFAULT_ADVANTAGE_RULES,
      ramp: RAMPS["1-8"],
    });
    expect(result.rows.find((row) => row.trueCount === 1)?.playerHands).toBe(1);
    expect(result.rows.find((row) => row.trueCount === 2)?.playerHands).toBe(2);
    expect(result.rows.find((row) => row.trueCount === 2)?.totalBet).toBe(80);
  });
});
describe("session simulation", () => {
  it("is reproducible for a fixed seed and reports complete count frequencies", async () => {
    const config = {
      bankroll: 10_000,
      bettingUnit: 25,
      playerHands: 1,
      rounds: 250,
      paths: 3,
      roundsPerHour: 100,
      seed: "deterministic-test",
      rules: DEFAULT_ADVANTAGE_RULES,
      ramp: RAMPS["1-8"],
    };
    const first = await simulateProfileSessions(config);
    const second = await simulateProfileSessions(config);
    expect(first).toEqual(second);
    expect(first.observations).toBe(750);
    expect(first.samplePath.at(-1)?.round).toBe(250);
    expect(first.countBreakdown.reduce((sum, row) => sum + row.simulatedFrequency, 0)).toBeCloseTo(1, 12);
    expect(first.simulatedCi95[0]).toBeLessThan(first.simulatedCi95[1]);
  });
});

describe("CVCX-style analysis", () => {
  it("builds a bounded ramp and respects a wong-in point", () => {
    const ramp = createOptimalRamp(DEFAULT_ADVANTAGE_RULES, 8, 1, 1);
    expect(ramp).toHaveLength(17);
    expect(ramp.find((row) => row.trueCount === 0)?.units).toBe(0);
    expect(ramp.find((row) => row.trueCount === 1)?.units).toBe(1);
    expect(Math.max(...ramp.map((row) => row.units))).toBeLessThanOrEqual(8);
  });

  it("reports scale-independent SCORE and practical performance metrics", () => {
    const scenario = {
      bankroll: 25_000,
      minimumBet: 10,
      handsPerHour: 100,
      hours: 100,
      targetRisk: 0.05,
      maxSpread: 12,
      wongInAt: null,
      rules: DEFAULT_ADVANTAGE_RULES,
    };
    const ramp = createOptimalRamp(DEFAULT_ADVANTAGE_RULES, 12, null);
    const tenDollar = analyzeCvcx(scenario, ramp, 10);
    const twentyDollar = analyzeCvcx(scenario, ramp, 20);
    expect(tenDollar.hourlyEv).toBeGreaterThan(0);
    expect(tenDollar.playedFrequency).toBeCloseTo(1, 10);
    expect(tenDollar.cScore).toBeCloseTo(twentyDollar.cScore, 10);
    expect(twentyDollar.hourlyEv).toBeCloseTo(tenDollar.hourlyEv * 2, 10);
    expect(tenDollar.requiredBankroll).toBeGreaterThan(0);
  });

  it("keeps probability and risk calculators numerically sane", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(finiteHorizonRisk(10_000, 1, 100, 0)).toBe(0);
    const shortRisk = finiteHorizonRisk(1_000, 0.5, 100, 100);
    const longRisk = finiteHorizonRisk(1_000, 0.5, 100, 10_000);
    expect(shortRisk).toBeGreaterThanOrEqual(0);
    expect(longRisk).toBeGreaterThan(shortRisk);
    expect(longRisk).toBeLessThanOrEqual(1);
    expect(requiredBankroll(0.5, 100, 0.05)).toBeCloseTo(299.573, 2);
    // A first-passage probability includes paths that hit the goal and finish
    // below it, so it is larger than the 50% terminal-tail probability here.
    expect(goalByHorizonProbability(100, 1, 100, 100)).toBeGreaterThan(0.5);
    expect(goalByHorizonProbability(100, 1, 100, 300)).toBeGreaterThan(
      goalByHorizonProbability(100, 1, 100, 100),
    );
  });
});
