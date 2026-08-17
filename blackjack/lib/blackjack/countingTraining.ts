import { unitsAt, RAMPS } from "./advantage";
import { getBasicStrategyDecision } from "./basicStrategy";
import { DEVIATIONS, deviationDecision, DeviationAction } from "./deviations";
import { calculateHandValue, isPair, isSoft } from "./hand";
import { hiLoValue, runningCount, trueCount, TrueCountRounding } from "./hiLo";
import { BlackjackShoe } from "./shoe";
import { Action, BlackjackRules, Card } from "./types";
import { CountingErrorCategory, Session } from "../statistics/storage";

export type DeckResolution = 1 | 0.5 | 0.25;
export type CountBias = "none" | "positive" | "negative";
export type CountingPreset = "one-deck-speed" | "two-card-cancellation" | "six-deck-casino" | "recovery";

export const COUNTING_PRESETS: Record<CountingPreset, {
  label: string; decks: number; cards: number; group: "1" | "2" | "random"; speed: number;
  checkpoint: "final" | "5" | "10" | "random" | "sign"; interruption: boolean;
}> = {
  "one-deck-speed": { label: "One-deck speed", decks: 1, cards: 52, group: "1", speed: 500, checkpoint: "final", interruption: false },
  "two-card-cancellation": { label: "Two-card cancellation", decks: 2, cards: 104, group: "2", speed: 650, checkpoint: "10", interruption: false },
  "six-deck-casino": { label: "Six-deck casino", decks: 6, cards: 234, group: "random", speed: 750, checkpoint: "random", interruption: false },
  recovery: { label: "Interruption recovery", decks: 6, cards: 156, group: "random", speed: 850, checkpoint: "sign", interruption: true },
};

export function makeCountSequence(decks: number, amount: number, bias: CountBias = "none") {
  const shoe = new BlackjackShoe(decks);
  const cards: Card[] = [];
  while (cards.length < Math.min(amount, decks * 52)) {
    const card = shoe.deal();
    if (card) cards.push(card);
  }
  if (bias !== "none") {
    cards.sort((a, b) => {
      const direction = bias === "positive" ? -1 : 1;
      return direction * (hiLoValue(a) - hiLoValue(b)) + (Math.random() - 0.5) * 0.2;
    });
  }
  return cards;
}

export const roundDeckEstimate = (decks: number, resolution: DeckResolution) =>
  Math.max(resolution, Math.round(decks / resolution) * resolution);

export interface TrueCountScenario {
  runningCount: number;
  exactDecksRemaining: number;
  estimatedDecksRemaining: number;
  cardsDealt: number;
  totalDecks: number;
  answer: number;
}

export function makeTrueCountScenario({
  decks,
  resolution,
  rounding,
  focus = "all",
}: {
  decks: number;
  resolution: DeckResolution;
  rounding: TrueCountRounding;
  focus?: "all" | "positive" | "negative" | "zero" | "index" | "last-deck";
}): TrueCountScenario {
  let fallback: TrueCountScenario | undefined;
  for (let attempt = 0; attempt < 80; attempt++) {
    const shoe = new BlackjackShoe(decks);
    const maxDealt = Math.max(1, Math.floor(decks * 52 * 0.8));
    const minDealt = focus === "last-deck" ? Math.max(1, (decks - 1) * 52) : 1;
    const count = minDealt + Math.floor(Math.random() * Math.max(1, maxDealt - minDealt));
    for (let i = 0; i < count; i++) shoe.deal();
    const rc = shoe.runningCount();
    const estimated = roundDeckEstimate(shoe.decksRemaining(), resolution);
    const scenario = {
      runningCount: rc,
      exactDecksRemaining: shoe.decksRemaining(),
      estimatedDecksRemaining: estimated,
      cardsDealt: count,
      totalDecks: decks,
      answer: trueCount(rc, estimated, rounding),
    };
    fallback = scenario;
    const match = focus === "all"
      || (focus === "positive" && rc > 0)
      || (focus === "negative" && rc < 0)
      || (focus === "zero" && rc === 0)
      || (focus === "last-deck" && shoe.decksRemaining() <= 1)
      || (focus === "index" && DEVIATIONS.some((d) => Math.abs(scenario.answer - d.index) <= 1));
    if (match) return scenario;
  }
  return fallback!;
}

export function classifyCountError({ expected, actual, previous = 0, cards = [], interrupted = false }: {
  expected: number; actual: number; previous?: number; cards?: Card[]; interrupted?: boolean;
}): CountingErrorCategory {
  if (interrupted) return "interruption recovery";
  if ((previous < 0 && expected >= 0) || (previous > 0 && expected <= 0)) return "zero crossing";
  if (expected < 0 || actual < 0) return "negative arithmetic";
  if (cards.length > 1 && runningCount(cards) === 0) return "missed cancellation";
  return "negative arithmetic";
}

export function classifyTrueCountError(rc: number, decks: number, expected: number, actual: number) {
  const raw = rc / decks;
  return Math.abs(actual - raw) < Math.abs(expected - raw) ? "true-count rounding" as const : "true-count division" as const;
}

export interface SimulatedRound {
  playerHands: Card[][];
  dealerHand: Card[];
  heroInitial: Card[];
  dealerUpcard: Card;
  exposedCards: Card[];
  correctPlay: DeviationAction;
  insurancePlay?: "I" | "N";
  basicPlay: Action;
  explanation: string;
}

function playHand(hand: Card[], dealer: Card, shoe: BlackjackShoe, rules: BlackjackRules, allowSplit = true): Card[][] {
  const first = getBasicStrategyDecision({ playerCards: hand, dealerUpcard: dealer, rules }).action;
  if (first === "P" && hand.length === 2 && allowSplit) {
    const left = [hand[0], shoe.deal()].filter(Boolean) as Card[];
    const right = [hand[1], shoe.deal()].filter(Boolean) as Card[];
    return [left, right].flatMap((split) => playHand(split, dealer, shoe, { ...rules, lateSurrender: false }, false));
  }
  if (first === "P") return [hand];
  if (first === "R" || first === "S") return [hand];
  if (first === "D") {
    const card = shoe.deal();
    return [card ? [...hand, card] : hand];
  }
  const result = [...hand];
  while (calculateHandValue(result) < 21 && getBasicStrategyDecision({ playerCards: result, dealerUpcard: dealer, rules }).action === "H") {
    const card = shoe.deal();
    if (!card) break;
    result.push(card);
  }
  return [result];
}

export function simulateRound(shoe: BlackjackShoe, spots: number, rules: BlackjackRules, currentTrueCount: number): SimulatedRound {
  const before = shoe.dealtCards().length;
  const initial: Card[][] = Array.from({ length: spots }, () => []);
  const dealer: Card[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const hand of initial) {
      const card = shoe.deal();
      if (card) hand.push(card);
    }
    const card = shoe.deal();
    if (card) dealer.push(card);
  }
  const heroInitial = [...initial[0]];
  const dealerUpcard = dealer[0];
  const basic = getBasicStrategyDecision({ playerCards: heroInitial, dealerUpcard, rules });
  const total = calculateHandValue(heroInitial);
  const handLabel = isPair(heroInitial)
    ? `${heroInitial[0].rank === "J" || heroInitial[0].rank === "Q" || heroInitial[0].rank === "K" ? "10" : heroInitial[0].rank},${heroInitial[1].rank === "J" || heroInitial[1].rank === "Q" || heroInitial[1].rank === "K" ? "10" : heroInitial[1].rank}`
    : isSoft(heroInitial)
      ? `Soft ${total}`
      : String(total);
  const dealerLabel = dealerUpcard.rank === "J" || dealerUpcard.rank === "Q" || dealerUpcard.rank === "K" ? "10" : dealerUpcard.rank;
  const deviation = DEVIATIONS.find((d) => d.hand === handLabel && d.dealer === dealerLabel);
  const correctPlay = deviation ? deviationDecision(deviation, currentTrueCount) : basic.action;
  const insurance = dealerUpcard.rank === "A" ? DEVIATIONS.find((d) => d.hand === "Insurance") : undefined;
  const playerHands = initial.flatMap((hand) => playHand(hand, dealerUpcard, shoe, rules));
  while (calculateHandValue(dealer) < 17 || (calculateHandValue(dealer) === 17 && isSoft(dealer) && rules.dealerHitsSoft17)) {
    const card = shoe.deal();
    if (!card) break;
    dealer.push(card);
  }
  return {
    playerHands,
    dealerHand: dealer,
    heroInitial,
    dealerUpcard,
    exposedCards: shoe.dealtCards().slice(before),
    correctPlay,
    insurancePlay: insurance ? deviationDecision(insurance, currentTrueCount) as "I" | "N" : undefined,
    basicPlay: basic.action,
    explanation: deviation
      ? `${deviation.hand} vs ${deviation.dealer} changes at ${deviation.index > 0 ? "+" : ""}${deviation.index}.`
      : basic.explanation,
  };
}

export function expectedBet(trueCountValue: number, baseBet: number, spread: keyof typeof RAMPS, wongOutNegative: boolean) {
  if (wongOutNegative && trueCountValue < 0) return 0;
  return unitsAt(trueCountValue, RAMPS[spread]) * baseBet;
}

export function countingMastery(sessions: Session[]) {
  const counting = sessions.filter((s) => ["Running Count", "True Count", "Deck Estimation", "Full Shoe"].includes(s.drill));
  const latest = (drill: string) => counting.find((s) => s.drill === drill);
  const running = latest("Running Count");
  const tc = latest("True Count");
  const deck = latest("Deck Estimation");
  const shoe = latest("Full Shoe");
  const checks = [
    { label: "Count a deck perfectly in 30 seconds", met: Boolean(running?.metrics?.perfectDeck) && Number(running?.metrics?.elapsedSeconds) <= 30, href: "/training/running-count" },
    { label: "Reach 95% true-count accuracy", met: (tc?.accuracy ?? 0) >= 95, href: "/training/true-count" },
    { label: "Estimate within 0.25 decks on average", met: Number(deck?.metrics?.meanAbsoluteDeckError ?? Infinity) <= 0.25, href: "/training/deck-estimation" },
    { label: "Reach 95% across a casino shoe", met: (shoe?.accuracy ?? 0) >= 95, href: "/training/full-shoe" },
  ];
  return { score: Math.round(checks.filter((x) => x.met).length / checks.length * 100), checks, next: checks.find((x) => !x.met) ?? checks[0] };
}
