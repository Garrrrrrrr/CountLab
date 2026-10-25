import { RAMPS, type HandCountPoint, type RampPoint } from "./advantage";
import { expandHands, expandRamp, MAX_TC, stepRangeLabel, tcLabel, toSteps, unitLabel, type RampStep } from "./rampSteps";

/**
 * The Bet Ramp drill: a true count, the betting unit and a ramp; the answer
 * is the bet (and, with spots on, how many hands), or leaving the table where
 * the ramp sits out. The ramp is the one saved in the Calculator when there
 * is one, so the drill rehearses the exact spread the player will use.
 */
export interface BetRamp {
  /** "1-8", or the Calculator scenario's name. */
  name: string;
  source: "calculator" | "preset";
  /** Dollars per unit. */
  unit: number;
  /** Units at each true count, −8 to +8 (the ends are open). */
  ramp: RampPoint[];
  /** Hands played at each true count. */
  hands: HandCountPoint[];
  /** The count play starts at: below it the player leaves the table. Null plays every count. */
  playFrom: number | null;
}

/** With nothing saved in the Calculator: a 1–8 spread on a $25 unit, leaving at −2 and below. */
export const PRESET_RAMP: BetRamp = { name: "1-8", source: "preset", unit: 25, ramp: expandRamp(RAMPS["1-8"]), hands: expandHands(undefined), playFrom: -1 };

/** A ramp from the Calculator's inputs (its working draft or a saved scenario). */
export function rampFromConfig(config: { baseBet: number; ramp: RampPoint[]; wongInAt: number | null; hands?: HandCountPoint[] }, name: string): BetRamp {
  return { name, source: "calculator", unit: config.baseBet, ramp: expandRamp(config.ramp), hands: expandHands(config.hands), playFrom: config.wongInAt };
}

const clampTc = (tc: number) => Math.max(-8, Math.min(MAX_TC, tc));

export type RampAnswer = { leave: true } | { leave: false; bet: number; hands: number };

/** What the ramp says at a true count. A unit of zero sits out too. */
export function rampAnswer(ramp: BetRamp, tc: number): RampAnswer {
  const index = clampTc(tc) + 8;
  const units = ramp.ramp[index]?.units ?? 0;
  if ((ramp.playFrom !== null && tc < ramp.playFrom) || units <= 0) return { leave: true };
  return { leave: false, bet: Number((units * ramp.unit).toFixed(2)), hands: ramp.hands[index]?.hands ?? 1 };
}

/** The ramp as steps from where play starts, for the card on screen. */
export function rampSteps(ramp: BetRamp): RampStep[] {
  return toSteps(ramp.ramp, ramp.hands, { start: ramp.playFrom ?? -8 });
}

/** Whether the ramp ever plays more than one hand, so the spots question is worth asking. */
export const spreadsHands = (ramp: BetRamp) => ramp.hands.some((point) => point.hands > 1 && (ramp.playFrom === null || point.trueCount >= ramp.playFrom));

/**
 * The counts to ask about: mostly where the bet changes (either side of each
 * step, and of where play starts), the rest anywhere from −4 to +8.
 */
export function drawTrueCount(ramp: BetRamp, rng: () => number = Math.random, last?: number): number {
  const edges = new Set<number>();
  for (const step of rampSteps(ramp)) { edges.add(step.from); edges.add(step.from - 1); }
  const near = [...edges].filter((tc) => tc >= -4 && tc <= MAX_TC);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const tc = near.length && rng() < 0.6 ? near[Math.floor(rng() * near.length)] : -4 + Math.floor(rng() * 13);
    if (tc !== last) return tc;
  }
  return last === 0 ? 1 : 0;
}

const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;

/** Grades a reply. Without spots, the number of hands is not asked and not graded. */
export function gradeBet(ramp: BetRamp, tc: number, reply: RampAnswer, spots: boolean) {
  const expected = rampAnswer(ramp, tc);
  const ok = expected.leave ? reply.leave : !reply.leave && Math.abs(reply.bet - expected.bet) < 0.005 && (!spots || reply.hands === expected.hands);
  return { ok, expected };
}

/** "Leave the table", "$150", "2 hands of $100". */
export function answerText(answer: RampAnswer, spots: boolean): string {
  if (answer.leave) return "Leave the table";
  return spots && answer.hands > 1 ? `${answer.hands} hands of ${money(answer.bet)}` : money(answer.bet);
}

/** Why the bet is what it is, in one or two sentences. */
export function explainBet(ramp: BetRamp, tc: number, spots: boolean): string {
  const expected = rampAnswer(ramp, tc);
  const step = rampSteps(ramp).find((candidate) => clampTc(tc) >= candidate.from && clampTc(tc) <= candidate.to);
  if (expected.leave) {
    return ramp.playFrom !== null && tc < ramp.playFrom
      ? `Your ramp plays from ${tcLabel(ramp.playFrom)} up, so at ${tcLabel(tc)} you leave the table (or stop betting) until the count comes back.`
      : `Your ramp bets nothing at ${tcLabel(tc)}: sit this one out.`;
  }
  const units = expected.bet / ramp.unit;
  const range = step && step.from !== step.to ? ` (${stepRangeLabel(step).replace(/^Every count$/, "every count")})` : "";
  const hands = spots ? (expected.hands > 1 ? ` Play ${expected.hands} hands, each at that bet.` : " One hand.") : "";
  return `At ${tcLabel(tc)} the ramp bets ${unitLabel(units)} ${units === 1 ? "unit" : "units"}${range}: ${unitLabel(units)} × ${money(ramp.unit)} = ${money(expected.bet)}.${hands}`;
}
