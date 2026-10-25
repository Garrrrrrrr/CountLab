/**
 * How the full-shoe table grades every answer.
 *
 * THE COUNT USED FOR GRADING. Bets, plays and insurance are graded at the
 * true count a perfect counter would hold at that moment: the running count of
 * every card turned face up so far, divided by the decks still in the shoe
 * rounded to the table's deck precision (a half deck by default), rounded to
 * a whole number the way Settings says (down, by default). The answer itself
 * always comes from `decideHand` / `takeInsurance` in lib/strategy.
 *
 * THE PLAYER'S OWN COUNT. A count check asks for the running count (and the
 * true count, from the player's own deck estimate). A wrong count is graded
 * once, in the count categories. In a checkout nothing reveals the right
 * count afterwards, so until the next check the player keeps playing the
 * count they reported, carried forward card by card. A bet, insurance or
 * index play that is wrong at the real count but exactly right at that
 * carried count is marked right ("credited") rather than counted as a second
 * mistake for the same slip. The old table never asked for the count, so it
 * could only grade at the real count; this keeps that, and adds the credit
 * only where the player has told us what count they hold. In coached mode the
 * feedback corrects the count on the spot, so nothing is carried.
 */
import { roundDeckEstimate, type DeckResolution } from "@/lib/blackjack/countingTraining";
import { betUnitsAt, type BetRamp, type FullShoeGradingCategory } from "@/lib/blackjack/fullShoeSession";
import { calculateHandValue, isSoft } from "@/lib/blackjack/hand";
import { trueCount, type TrueCountRounding } from "@/lib/blackjack/hiLo";
import type { Action, Card } from "@/lib/blackjack/types";
import {
  ACTION_NAMES,
  decideHand,
  explainDecision,
  handLabel,
  playIndex,
  signedCount,
  surrenderRule,
  takeInsurance,
  thresholdPhrase,
  dealerLabel,
  dealerOf,
  insuranceAt,
  type Decision,
  type Permissions,
  type TableRules,
} from "@/lib/strategy";

export const ROUNDING_PHRASE: Record<TrueCountRounding, string> = { floor: "rounded down", truncate: "rounded toward zero", nearest: "rounded to the nearest whole number" };
export const RESOLUTION_PHRASE: Record<DeckResolution, string> = { 1: "the nearest whole deck", 0.5: "the nearest half deck", 0.25: "the nearest quarter deck" };

export interface CountSettings {
  resolution: DeckResolution;
  rounding: TrueCountRounding;
}

/** The divisor a perfect counter uses: decks left in the shoe, to the table's precision. */
export const divisorFor = (cardsRemaining: number, resolution: DeckResolution) => roundDeckEstimate(cardsRemaining / 52, resolution);

export const liveTrueCount = (rc: number, cardsRemaining: number, count: CountSettings) => trueCount(rc, divisorFor(cardsRemaining, count.resolution), count.rounding);

const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
const name = (action: Action) => ACTION_NAMES[action];
const lower = (action: Action) => ACTION_NAMES[action].toLowerCase();

/* ------------------------------------------------------------------ */
/* Betting                                                             */
/* ------------------------------------------------------------------ */

export interface BetGrade {
  ok: boolean;
  credited: boolean;
  expected: number;
  units: number;
  chosen: string;
  correct: string;
  explanation: string;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Every seat with a bet should carry the ramp's bet for the count, up to the
 * table maximum. A ramp bet the bankroll cannot cover is satisfied by betting
 * everything left, down to the smallest chip on the rack.
 */
export function gradeBet({ bets, unit, ramp, tc, bankroll, playerTc, max = Infinity, chip = 0.01 }: {
  bets: readonly number[]; unit: number; ramp: BetRamp; tc: number; bankroll: number; playerTc?: number;
  /** The table maximum per seat, and the smallest chip the rack offers. */
  max?: number; chip?: number;
}): BetGrade {
  const units = betUnitsAt(ramp, tc);
  const ideal = Math.round(unit * units * 100) / 100;
  const capCents = Math.floor((bankroll / Math.max(1, bets.length)) * 100 + 1e-6);
  const affordable = (capCents - (capCents % Math.round(chip * 100))) / 100;
  const target = (count: number) => Math.min(Math.round(unit * betUnitsAt(ramp, count) * 100) / 100, max, affordable);
  const expected = target(tc);
  const matches = (amount: number) => bets.length > 0 && bets.every((bet) => near(bet, amount));
  let ok = matches(expected);
  let credited = false;
  if (!ok && playerTc !== undefined && playerTc !== tc && matches(target(playerTc))) { ok = true; credited = true; }
  const chosen = bets.map(money).join(" + ");
  const correct = `${bets.length} × ${money(expected)}`;
  const rampWords = units === 1 ? "one unit" : `${units} units`;
  const capped = expected < Math.min(ideal, max) ? ` The ramp's ${money(ideal)} is more than the bankroll covers, so the whole bankroll is right.`
    : ideal > max ? ` The table maximum is ${money(max)}, so that is the bet.` : "";
  const explanation = credited
    ? `Right for the count you reported (true count ${signedCount(playerTc!)}). The real true count was ${signedCount(tc)}, where the ramp bets ${money(expected)}.`
    : `At a true count of ${signedCount(tc)} the ramp bets ${rampWords} (${money(expected)}) on each seat.${tc <= 0 ? " Zero or lower always bets one unit." : ""}${capped}`;
  return { ok, credited, expected, units, chosen, correct, explanation };
}

/* ------------------------------------------------------------------ */
/* Back-counting                                                       */
/* ------------------------------------------------------------------ */

/** Sit in at a true count of `enter` or more; leave at `leave` or less. */
export interface WongPlan { enter: number; leave: number }

/**
 * Grades sitting in or out, at the deal. Moving is always a decision. Holding
 * still is one only when the count called for a move (still watching at the
 * entry count, still playing at the exit count), and then it is a mistake;
 * otherwise it is not graded, so a long watch does not pad the score.
 * Undefined when there is nothing to grade.
 */
export function gradeWong({ wasIn, isIn, tc, plan, playerTc }: { wasIn: boolean; isIn: boolean; tc: number; plan: WongPlan; playerTc?: number }) {
  const shouldBeIn = (count: number) => (wasIn ? count > plan.leave : count >= plan.enter);
  if (wasIn === isIn && shouldBeIn(tc) === isIn) return undefined;
  let ok = shouldBeIn(tc) === isIn;
  let credited = false;
  if (!ok && playerTc !== undefined && playerTc !== tc && shouldBeIn(playerTc) === isIn) { ok = true; credited = true; }
  const label = (sitting: boolean) => (wasIn ? (sitting ? "Stay in" : "Leave") : sitting ? "Sit in" : "Keep watching");
  const rule = `Sit in at a true count of ${signedCount(plan.enter)} or higher; leave at ${signedCount(plan.leave)} or lower.`;
  const explanation = credited
    ? `Right for the count you reported (${signedCount(playerTc!)}). The real true count was ${signedCount(tc)}. ${rule}`
    : `${rule} The true count was ${signedCount(tc)}.`;
  return { ok, credited, chosen: label(isIn), correct: label(shouldBeIn(tc)), explanation };
}

/* ------------------------------------------------------------------ */
/* Insurance                                                           */
/* ------------------------------------------------------------------ */

export interface InsuranceGrade { ok: boolean; credited: boolean; take: boolean; chosen: string; correct: string; explanation: string }

export function gradeInsurance({ rules, took, tc, playerTc, evenMoney = false }: { rules: Pick<TableRules, "decks">; took: boolean; tc: number; playerTc?: number; evenMoney?: boolean }): InsuranceGrade {
  const take = takeInsurance(rules, tc);
  let ok = took === take;
  let credited = false;
  if (!ok && playerTc !== undefined && playerTc !== tc && took === takeInsurance(rules, playerTc)) { ok = true; credited = true; }
  const what = evenMoney ? "even money" : "insurance";
  const label = (yes: boolean) => (yes ? `Take ${what}` : `No ${what}`);
  const rule = `Take ${what} at a true count of ${signedCount(insuranceAt(rules))} or higher, never below.`;
  const explanation = credited
    ? `Right for the count you reported (${signedCount(playerTc!)}). The real true count was ${signedCount(tc)}. ${rule}`
    : `${rule} The true count is ${signedCount(tc)}.`;
  return { ok, credited, take, chosen: label(took), correct: label(take), explanation };
}

/* ------------------------------------------------------------------ */
/* Playing decisions                                                   */
/* ------------------------------------------------------------------ */

export interface PlayGrade {
  ok: boolean;
  credited: boolean;
  /** The play at the real true count. */
  correct: Action;
  /** The play with no count at all. */
  basic: Action;
  category: Extract<FullShoeGradingCategory, "Basic Strategy" | "Deviations">;
  question: string;
  explanation: string;
  decision: Decision;
}

/** Counts a deviation can sit at; wide enough to cover every index in the list. */
const COUNT_SWEEP = Array.from({ length: 21 }, (_, index) => index - 10);

/** "Hard 16 vs a 10" for any hand, including totals the chart does not print. */
export function describeHand(cards: Card[], upcard: Card, decision?: Decision & { cell?: { section: "hard" | "soft" | "pairs"; row: string } }): string {
  const dealer = dealerLabel(dealerOf(upcard));
  if (decision?.cell) return `${handLabel(decision.cell.section, decision.cell.row)} vs ${dealer}`;
  const total = calculateHandValue(cards);
  return `${isSoft(cards) && total < 21 ? "Soft" : "Hard"} ${total} vs ${dealer}`;
}

/**
 * Grades one hit/stand/double/split/surrender against `decideHand`.
 *
 * Category: Deviations when the count changes the answer (the real-count play
 * differs from basic strategy), and also when the player made a count play
 * the count did not call for (standing on 16 v 10 at −3); everything else is
 * Basic Strategy. That is the old table's split, plus the second case, which
 * the old one filed under Basic Strategy.
 */
export function gradePlay({ cards, upcard, rules, permissions, chosen, tc, playerTc }: {
  cards: Card[]; upcard: Card; rules: TableRules; permissions: Permissions; chosen: Action; tc: number; playerTc?: number;
}): PlayGrade {
  const question = { cards, upcard, rules, ...permissions };
  const atCount = decideHand({ ...question, tc });
  const basic = decideHand({ ...question, tc: undefined });
  const countPlays = new Set(COUNT_SWEEP.map((count) => decideHand({ ...question, tc: count }).action));
  let ok = chosen === atCount.action;
  let credited = false;
  if (!ok && playerTc !== undefined && playerTc !== tc && decideHand({ ...question, tc: playerTc }).action === chosen) { ok = true; credited = true; }
  const deviation = atCount.action !== basic.action || (chosen !== basic.action && countPlays.has(chosen));
  const label = describeHand(cards, upcard, atCount);
  let explanation: string;
  if (atCount.cell) {
    explanation = explainDecision(atCount.cell, atCount, tc);
    // explainDecision says nothing about an index the count has not reached; the coach should.
    if (atCount.via === "basic") {
      const index = playIndex(rules, atCount.cell);
      const usable = index && !(index.play === "D" && !permissions.canDouble) && !(index.play === "P" && !permissions.canSplit);
      if (usable) explanation += ` The index: ${lower(index.play)} ${thresholdPhrase(index)}, and the count is ${signedCount(tc)}.`;
      if (permissions.canSurrender && atCount.action !== "R") {
        const surrender = surrenderRule(rules, atCount.cell);
        if (Number.isFinite(surrender.at)) explanation += ` Surrender ${thresholdPhrase({ dir: "up", at: surrender.at })}; the count is ${signedCount(tc)}.`;
      }
    }
  } else {
    explanation = `${label}: ${lower(atCount.action)} at every count.`;
  }
  if (credited) explanation = `Right for the count you reported (true count ${signedCount(playerTc!)}). At the real count, ${signedCount(tc)}: ${explanation}`;
  return { ok, credited, correct: atCount.action, basic: basic.action, category: deviation ? "Deviations" : "Basic Strategy", question: label, explanation, decision: atCount };
}

/* ------------------------------------------------------------------ */
/* Count checks                                                        */
/* ------------------------------------------------------------------ */

export type CountCheckFrequency = "off" | "every" | "3" | "5" | "random";
export type CountCheckDepth = "running" | "true";

/** Rough share of rounds a random check lands on. */
export const RANDOM_CHECK_RATE = 0.3;

/** Whether a count check comes before the next bet, after `roundsDone` rounds. */
export function countCheckDue(frequency: CountCheckFrequency, roundsDone: number, rng: () => number = Math.random): boolean {
  if (roundsDone < 1) return false;
  switch (frequency) {
    case "off": return false;
    case "every": return true;
    case "3": return roundsDone % 3 === 0;
    case "5": return roundsDone % 5 === 0;
    case "random": return rng() < RANDOM_CHECK_RATE;
  }
}

export interface CountCheckAnswer { rc: number; decks?: number; tc?: number }

export interface CountCheckGrade {
  rcOk: boolean;
  decksOk?: boolean;
  tcOk?: boolean;
  expected: { rc: number; decks: number; tc: number };
  /** Deck estimates accepted: the real depth to the precision, and what the tray photo shows. */
  acceptedDecks: number[];
  rcExplanation: string;
  tcExplanation?: string;
}

/**
 * Grades a count check.
 *
 * Running count: exact. Deck estimate: right when it is the decks left to the
 * table's precision, or what the tray photo on screen shows to that precision
 * (the photo is the nearest real picture, which can sit a few cards away).
 * True count: right when the deck estimate was accepted and the true count is
 * the correct division of the real running count or of the player's own
 * running count (that slip is graded once, above) by an accepted estimate.
 * So the category measures the tray reading and the division together, and a
 * reported running count of 0 cannot pass it with any deck estimate at all.
 * When the estimate was the problem, the explanation says so.
 */
export function gradeCountCheck({ rc, cardsRemaining, totalDecks, photoDiscarded, count, answer }: {
  rc: number; cardsRemaining: number; totalDecks: number; photoDiscarded?: number; count: CountSettings; answer: CountCheckAnswer;
}): CountCheckGrade {
  const decks = divisorFor(cardsRemaining, count.resolution);
  const expected = { rc, decks, tc: trueCount(rc, decks, count.rounding) };
  const rcOk = answer.rc === rc;
  const accepted = new Set([decks]);
  if (photoDiscarded !== undefined) accepted.add(roundDeckEstimate(Math.max(0, totalDecks - photoDiscarded), count.resolution));
  const acceptedDecks = [...accepted].sort((a, b) => a - b);
  const signedRc = signedCount(rc);
  const rcExplanation = rcOk
    ? `The running count is ${signedRc}.`
    : `The running count is ${signedRc}; you had ${signedCount(answer.rc)}, ${Math.abs(answer.rc - rc)} ${Math.abs(answer.rc - rc) === 1 ? "point" : "points"} ${answer.rc > rc ? "high" : "low"}.`;
  if (answer.tc === undefined) return { rcOk, expected, acceptedDecks, rcExplanation };
  const decksOk = answer.decks !== undefined && acceptedDecks.some((value) => near(value, answer.decks!));
  const counts = new Set([rc, answer.rc]);
  const divides = [...counts].some((running) => acceptedDecks.some((divisor) => trueCount(running, divisor, count.rounding) === answer.tc));
  const tcOk = divides && (answer.decks === undefined || decksOk);
  const how = `${signedRc} ÷ ${decks} decks = ${(rc / decks).toFixed(2).replace("-", "−")}, ${ROUNDING_PHRASE[count.rounding]}: ${signedCount(expected.tc)}`;
  let tcExplanation: string;
  if (tcOk) tcExplanation = !rcOk ? `Your division was right for your running count. ${how}.` : `${how}.`;
  else if (answer.decks !== undefined && !decksOk) tcExplanation = `${trueCount(answer.rc, answer.decks, count.rounding) === answer.tc ? "Your division was right, but the" : "The"} tray shows about ${decks} decks left, not ${answer.decks}. ${how}.`;
  else tcExplanation = `${how}.`;
  return { rcOk, decksOk, tcOk, expected, acceptedDecks, rcExplanation, tcExplanation };
}

/**
 * The count the player holds now, if a checkout count check showed it was off:
 * their reported running count plus every card seen since, over the real
 * divisor. Undefined when there is nothing to carry.
 */
export function carriedTrueCount(offset: number | undefined, rc: number, cardsRemaining: number, count: CountSettings): number | undefined {
  if (!offset) return undefined;
  return liveTrueCount(rc + offset, cardsRemaining, count);
}

export const actionName = name;
