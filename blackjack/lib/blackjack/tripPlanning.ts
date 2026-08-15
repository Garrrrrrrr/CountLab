import { AdvantageRules, RampPoint, calculateAdvantage } from "./advantage";
import { finiteHorizonRisk, goalByHorizonProbability, normalCdf, resultPercentile } from "./cvcx";

export interface TripPlanInput {
  bankroll: number;
  bettingUnit: number;
  playerHands: number;
  handsPerHour: number;
  hours: number;
  rules: AdvantageRules;
  ramp: RampPoint[];
}

const Z95 = 1.95996398454;

export interface TripPlanResult {
  hourlyEv: number;
  tripEv: number;
  standardDeviation: number;
  expectedEndingBankroll: number;
  ci95Low: number;
  ci95High: number;
  /** Probability the trip crosses zero bankroll at any point during play (finite-horizon, analytical normal approximation). */
  bustProbability: number;
  /** Probability the trip ends with a net win. */
  chanceOfProfit: number;
  /** Probability the trip ends down more than `thresholdLoss` (a positive dollar amount). */
  lossProbability: (thresholdLoss: number) => number;
  /** Probability the trip reaches a net win of at least `goalAmount` at some point within the horizon. */
  goalProbability: (goalAmount: number) => number;
}

/**
 * Finite-horizon trip planning built on the same analytical (normal-approximation)
 * machinery already audited for the Game & Bankroll Lab's risk tab (lib/blackjack/cvcx.ts).
 * Like that tab, this is an approximation labeled as such in the UI — it can
 * underestimate ruin probability very close to the zero-bankroll boundary.
 */
export function planTrip(input: TripPlanInput): TripPlanResult {
  const result = calculateAdvantage({
    bankroll: input.bankroll,
    bettingUnit: input.bettingUnit,
    playerHands: input.playerHands,
    handsPerHour: input.handsPerHour,
    hours: input.hours,
    rules: input.rules,
    ramp: input.ramp,
  });
  const variance = result.sdPerRound ** 2;
  const rounds = input.handsPerHour * input.hours;
  return {
    hourlyEv: result.hourlyEv,
    tripEv: result.tripEv,
    standardDeviation: result.standardDeviation,
    expectedEndingBankroll: input.bankroll + result.tripEv,
    ci95Low: input.bankroll + result.tripEv - Z95 * result.standardDeviation,
    ci95High: input.bankroll + result.tripEv + Z95 * result.standardDeviation,
    bustProbability: finiteHorizonRisk(input.bankroll, result.evPerRound, variance, rounds),
    chanceOfProfit: result.standardDeviation > 0 ? normalCdf(result.tripEv / result.standardDeviation) : Number(result.tripEv > 0),
    lossProbability: (thresholdLoss: number) => resultPercentile(-Math.abs(thresholdLoss), result.tripEv, result.standardDeviation),
    goalProbability: (goalAmount: number) => goalByHorizonProbability(goalAmount, result.evPerRound, variance, rounds),
  };
}
