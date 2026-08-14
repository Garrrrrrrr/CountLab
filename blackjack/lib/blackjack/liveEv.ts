import { getBasicStrategyDecision } from "./basicStrategy";
import { calculateHandValue, isSoft } from "./hand";
import { Action, BlackjackRules, Card, Rank, RANKS } from "./types";

export type LiveEvRequest = {
  playerCards: Card[];
  dealerUpcard: Card;
  /** Provide only when the hole card has been peeked; otherwise it is drawn from the pool like any other unknown card. */
  dealerHoleCard?: Card;
  composition: Record<Rank, number>;
  rules: BlackjackRules;
  legalActions: Action[];
  samples?: number;
  seed?: number;
};

export type LiveEvResult = {
  method: "MONTE_CARLO";
  samples: number;
  evs: Partial<Record<Action, number>>;
  standardErrors: Partial<Record<Action, number>>;
  confidenceIntervals: Partial<Record<Action, [number, number]>>;
  bestAction: Action;
};

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const fakeCard = (rank: Rank): Card => ({ rank, suit: "spades" });

function buildPool(composition: Record<Rank, number>): Rank[] {
  const pool: Rank[] = [];
  for (const rank of RANKS) for (let i = 0; i < composition[rank]; i++) pool.push(rank);
  return pool;
}

/** Composition is a multiset; draw order doesn't matter, so a swap-pop keeps this O(1). */
function drawTracked(pool: Rank[], random: () => number, drawn: Rank[]): Rank {
  const index = Math.floor(random() * pool.length);
  const value = pool.length ? pool[index] : "10";
  if (pool.length) {
    pool[index] = pool[pool.length - 1];
    pool.pop();
  }
  drawn.push(value);
  return value;
}

function restore(pool: Rank[], drawn: Rank[]) {
  for (const rank of drawn) pool.push(rank);
  drawn.length = 0;
}

function resolveDealer(upcard: Card, holeCard: Card | undefined, pool: Rank[], random: () => number, rules: BlackjackRules, drawn: Rank[]): Card[] {
  const cards = [upcard, holeCard ?? fakeCard(drawTracked(pool, random, drawn))];
  while (true) {
    const total = calculateHandValue(cards);
    if (total > 21) break;
    if (total > 17 || (total === 17 && !(rules.dealerHitsSoft17 && isSoft(cards)))) break;
    cards.push(fakeCard(drawTracked(pool, random, drawn)));
  }
  return cards;
}

/** Plays out a hand that has already received its post-decision card, following basic strategy for every further hit/stand choice. */
function autoPlayPlayerHand(cards: Card[], dealerUpcard: Card, rules: BlackjackRules, pool: Rank[], random: () => number, drawn: Rank[]): Card[] {
  const hand = [...cards];
  while (calculateHandValue(hand) < 21) {
    const decision = getBasicStrategyDecision({ playerCards: hand, dealerUpcard, rules });
    const action = decision.action === "H" ? "H" : decision.action === "S" ? "S" : decision.fallback ?? "S";
    if (action !== "H") break;
    hand.push(fakeCard(drawTracked(pool, random, drawn)));
  }
  return hand;
}

function settleOutcome(playerCards: Card[], dealerCards: Card[], wagerMultiplier: number): number {
  const playerTotal = calculateHandValue(playerCards);
  if (playerTotal > 21) return -wagerMultiplier;
  const dealerTotal = calculateHandValue(dealerCards);
  if (dealerTotal > 21) return wagerMultiplier;
  if (playerTotal > dealerTotal) return wagerMultiplier;
  if (playerTotal < dealerTotal) return -wagerMultiplier;
  return 0;
}

function simulatePlayerOutcome(action: Action, playerCards: Card[], dealerCards: Card[], dealerUpcard: Card, rules: BlackjackRules, pool: Rank[], random: () => number, drawn: Rank[]): number {
  if (action === "S") return settleOutcome(playerCards, dealerCards, 1);
  if (action === "D") {
    const cards = [...playerCards, fakeCard(drawTracked(pool, random, drawn))];
    return settleOutcome(cards, dealerCards, 2);
  }
  if (action === "H") {
    let cards = [...playerCards, fakeCard(drawTracked(pool, random, drawn))];
    if (calculateHandValue(cards) <= 21) cards = autoPlayPlayerHand(cards, dealerUpcard, rules, pool, random, drawn);
    return settleOutcome(cards, dealerCards, 1);
  }
  if (action === "P") {
    let net = 0;
    for (const original of [playerCards[0], playerCards[1]]) {
      let hand = [original, fakeCard(drawTracked(pool, random, drawn))];
      if (calculateHandValue(hand) <= 21) hand = autoPlayPlayerHand(hand, dealerUpcard, rules, pool, random, drawn);
      net += settleOutcome(hand, dealerCards, 1);
    }
    return net;
  }
  return 0;
}

/**
 * Monte Carlo, composition-dependent EV per legal action for the current decision.
 * Hit/split EV assumes correct basic-strategy continuation, the standard
 * "EV of this decision, then perfect play" definition — not a full recursive-exact solve.
 */
export function computeLiveEv(request: LiveEvRequest): LiveEvResult {
  const { playerCards, dealerUpcard, dealerHoleCard, composition, rules, legalActions, samples = 20000, seed = 1 } = request;
  const random = mulberry(seed);
  const pool = buildPool(composition);
  const drawn: Rank[] = [];
  const evs: Partial<Record<Action, number>> = {};
  const standardErrors: Partial<Record<Action, number>> = {};
  const confidenceIntervals: Partial<Record<Action, [number, number]>> = {};
  for (const action of legalActions) {
    if (action === "R") {
      evs.R = -0.5;
      standardErrors.R = 0;
      confidenceIntervals.R = [-0.5, -0.5];
      continue;
    }
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < samples; i++) {
      const dealerCards = resolveDealer(dealerUpcard, dealerHoleCard, pool, random, rules, drawn);
      const net = simulatePlayerOutcome(action, playerCards, dealerCards, dealerUpcard, rules, pool, random, drawn);
      restore(pool, drawn);
      sum += net;
      sumSq += net * net;
    }
    const mean = sum / samples;
    const variance = Math.max(0, sumSq / samples - mean * mean);
    const standardError = Math.sqrt(variance / samples);
    evs[action] = mean;
    standardErrors[action] = standardError;
    confidenceIntervals[action] = [mean - 1.96 * standardError, mean + 1.96 * standardError];
  }
  const bestAction = legalActions.reduce((best, action) => (evs[action] ?? -Infinity) > (evs[best] ?? -Infinity) ? action : best, legalActions[0]);
  return { method: "MONTE_CARLO", samples, evs, standardErrors, confidenceIntervals, bestAction };
}
