import { AdvantageRules, RampPoint, unitsAt } from "./advantage";
import { decideHand, takeInsurance, type TableRules } from "@/lib/strategy";
import { calculateHandValue, canSplit, isBlackjack, isSoft } from "./hand";
import { hiLoValue, trueCount, TrueCountRounding } from "./hiLo";
import { BlackjackShoe } from "./shoe";
import { Card } from "./types";
export type DeviationGroup = "h17-pro";

export interface SimulatedPlayerHand {
  cards: Card[];
  net: number;
  surrendered: boolean;
  /** Only set when doubled — the wager is twice the round's base bet for this box. */
  bet?: number;
}

export interface SimulatedDecision {
  category: "Betting" | "Basic Strategy" | "Deviations";
  chosen: string;
  correct: string;
  ok: boolean;
  explanation: string;
  trueCount: number;
}

export interface SimulatedHand {
  shoeNumber: number;
  handNumber: number;
  roundInShoe: number;
  dealerCards: Card[];
  playerHands: SimulatedPlayerHand[];
  bet: number;
  runningCountBefore: number;
  trueCountBefore: number;
  tcMin: number;
  tcMax: number;
  netResult: number;
  decisions?: SimulatedDecision[];
}

export interface SimulatedShoe {
  shoeNumber: number;
  hands: SimulatedHand[];
  totalHands: number;
  totalProfit: number;
  tcMin: number;
  tcMax: number;
}

export interface ShoeSessionTracePoint {
  round: number;
  bankroll: number;
}

export interface ShoeSimulationConfig {
  bankroll: number;
  bettingUnit: number;
  playerHands: number;
  roundsPerHour: number;
  handsToSimulate: number;
  highSpeed: boolean;
  seed: number;
  rules: AdvantageRules;
  ramp: RampPoint[];
  deviationGroups: DeviationGroup[];
  rounding?: TrueCountRounding;
}

export interface ShoeSimulationResult {
  totalHands: number;
  totalShoes: number;
  totalProfit: number;
  startingBankroll: number;
  endingBankroll: number;
  peakBankroll: number;
  lowBankroll: number;
  avPerHour: number;
  bankrollTrace: ShoeSessionTracePoint[];
  shoes: SimulatedShoe[];
}

export interface SimulationHooks {
  onProgress?: (completed: number, total: number) => void;
  isCancelled?: () => boolean;
  yieldControl?: () => Promise<void>;
}

export class ShoeSimulationCancelled extends Error {
  constructor() {
    super("Shoe simulation cancelled");
    this.name = "ShoeSimulationCancelled";
  }
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** The strategy engine's view of the simulator's rules. */
const tableRules = (rules: AdvantageRules): TableRules => ({
  decks: rules.decks,
  hitSoft17: rules.dealerHitsSoft17,
  das: rules.doubleAfterSplit,
  surrender: rules.lateSurrender ? "late" : "none",
  doubling: "any",
  noHoleCard: false,
});

/** The count the strategy uses: the live true count with indices on, none for basic strategy. */
type CountSource = () => number | undefined;

/**
 * Plays a single box from its post-decision state, hitting per basic strategy +
 * indices until stand/bust. Only hitting and standing are still on the table:
 * doubling, splitting and surrendering all need a decision this box has passed.
 */
function autoPlay(cards: Card[], dealerUpcard: Card, count: CountSource, shoe: BlackjackShoe, rules: AdvantageRules, track: (card?: Card) => void): Card[] {
  const hand = [...cards];
  while (calculateHandValue(hand) < 21) {
    const decision = decideHand({ cards: hand, upcard: dealerUpcard, rules: tableRules(rules), tc: count(), canDouble: false, canSplit: false, canSurrender: false });
    if (decision.action !== "H") break;
    const card = shoe.deal();
    if (!card) break;
    hand.push(card);
    track(card);
  }
  return hand;
}

function settle(playerTotal: number, dealerTotal: number, bet: number, blackjackPayout: number, playerBlackjack: boolean, dealerBlackjack: boolean): number {
  if (playerTotal > 21) return -bet;
  if (playerBlackjack) return dealerBlackjack ? 0 : bet * blackjackPayout;
  if (dealerBlackjack) return -bet;
  if (dealerTotal > 21) return bet;
  if (playerTotal > dealerTotal) return bet;
  if (playerTotal < dealerTotal) return -bet;
  return 0;
}

interface PendingSplitHand {
  cards: Card[];
  fromSplit: boolean;
  splitAces: boolean;
}

/**
 * Plays one original box, including split hands. The queue keeps each split
 * branch independent so DAS and RSA use the same rule settings as the rest of
 * the calculator. A box may contain at most four hands.
 */
function playBox(
  initialCards: Card[],
  dealerUpcard: Card,
  count: CountSource,
  shoe: BlackjackShoe,
  rules: AdvantageRules,
  bet: number,
  track: (card?: Card) => void,
): SimulatedPlayerHand[] {
  const played: SimulatedPlayerHand[] = [];
  const queue: PendingSplitHand[] = [{ cards: initialCards, fromSplit: false, splitAces: false }];
  let handsInBox = 1;

  while (queue.length) {
    const pending = queue.shift()!;
    const splitAllowed = canSplit(pending.cards)
      && handsInBox < 4
      && (!pending.splitAces || (pending.cards[0]?.rank === "A" && rules.resplitAces));

    // Split aces receive one card only, except for an allowed re-split.
    if (pending.splitAces && !splitAllowed) {
      played.push({ cards: pending.cards, net: 0, surrendered: false });
      continue;
    }

    const canDoubleNow = pending.cards.length === 2 && (!pending.fromSplit || rules.doubleAfterSplit);
    const canSurrender = !pending.fromSplit && pending.cards.length === 2 && rules.lateSurrender;
    const action = decideHand({ cards: pending.cards, upcard: dealerUpcard, rules: tableRules(rules), tc: count(), canDouble: canDoubleNow, canSplit: splitAllowed, canSurrender }).action;

    if (action === "P" && splitAllowed) {
      handsInBox += 1;
      const aceSplit = pending.cards[0].rank === "A";
      for (const original of pending.cards) {
        const card = shoe.deal();
        track(card);
        const cards = card ? [original, card] : [original];
        queue.push({ cards, fromSplit: true, splitAces: aceSplit });
      }
      continue;
    }

    if (action === "R" && !pending.fromSplit && rules.lateSurrender) {
      played.push({ cards: pending.cards, net: -bet / 2, surrendered: true });
      continue;
    }

    if (action === "D" && canDoubleNow) {
      const card = shoe.deal();
      track(card);
      played.push({ cards: card ? [...pending.cards, card] : pending.cards, net: 0, surrendered: false, bet: bet * 2 });
      continue;
    }

    const cards = autoPlay(pending.cards, dealerUpcard, count, shoe, rules, track);
    played.push({ cards, net: 0, surrendered: false });
  }
  return played;
}

export async function simulateShoeSession(config: ShoeSimulationConfig, hooks: SimulationHooks = {}): Promise<ShoeSimulationResult> {
  const { rules, ramp, bettingUnit, playerHands, handsToSimulate, highSpeed, deviationGroups, rounding = "truncate" } = config;
  const random = mulberry32(config.seed);
  const shoe = new BlackjackShoe(rules.decks, random);
  const cutCardAt = rules.decks * 52 * (1 - rules.penetration);
  const indexed = deviationGroups.includes("h17-pro");

  let bankroll = config.bankroll;
  let peak = bankroll;
  let low = bankroll;
  let shoeNumber = 0;
  let roundInShoe = 0;
  let handNumber = 0;
  let totalProfit = 0;
  let visibleRunningCount = 0;
  let hiddenDealerCards = 0;
  const shoes: SimulatedShoe[] = [];
  const bankrollTrace: ShoeSessionTracePoint[] = [{ round: 0, bankroll }];
  const traceEvery = Math.max(1, Math.floor(handsToSimulate / 400));
  const progressEvery = Math.max(500, Math.min(5_000, Math.floor(handsToSimulate / 200)));
  let currentShoe: SimulatedShoe | undefined;

  const startNewShoe = () => {
    shoeNumber += 1;
    roundInShoe = 0;
    shoe.reset();
    visibleRunningCount = 0;
    hiddenDealerCards = 0;
    currentShoe = { shoeNumber, hands: [], totalHands: 0, totalProfit: 0, tcMin: Infinity, tcMax: -Infinity };
  };
  startNewShoe();

  while (handNumber < handsToSimulate) {
    if (shoe.cardsRemaining() < cutCardAt) startNewShoe();
    roundInShoe += 1;
    handNumber += 1;

    const runningCountBefore = visibleRunningCount;
    const decksRemaining = () => (shoe.cardsRemaining() + hiddenDealerCards) / 52;
    const currentTrueCount = () => trueCount(visibleRunningCount, decksRemaining(), rounding);
    const trueCountBefore = currentTrueCount();
    let tcMin = trueCountBefore;
    let tcMax = trueCountBefore;
    const track = (card?: Card) => {
      if (card) visibleRunningCount += hiLoValue(card);
      const tc = currentTrueCount();
      tcMin = Math.min(tcMin, tc);
      tcMax = Math.max(tcMax, tc);
    };

    const dealVisible = () => {
      const card = shoe.deal();
      if (card) track(card);
      return card;
    };

    const bet = bettingUnit * unitsAt(trueCountBefore, ramp);
    // Deal in casino order. The hole card stays out of the running count but
    // remains in the true-count denominator until the dealer exposes it.
    const boxes: Card[][] = Array.from({ length: playerHands }, () => []);
    for (const cards of boxes) {
      const card = dealVisible();
      if (card) cards.push(card);
    }
    const dealerUpcard = dealVisible();
    for (const cards of boxes) {
      const card = dealVisible();
      if (card) cards.push(card);
    }
    const dealerHoleCard = shoe.deal();
    if (dealerHoleCard) hiddenDealerCards += 1;
    if (!dealerUpcard || !dealerHoleCard) break;
    let dealerCards = [dealerUpcard, dealerHoleCard];
    const dealerBlackjack = isBlackjack(dealerCards);

    const wantsInsurance = indexed && dealerUpcard.rank === "A" && takeInsurance(rules, currentTrueCount());
    const insuranceNet = wantsInsurance ? (dealerBlackjack ? bet : -bet / 2) : 0;

    const playedHands: SimulatedPlayerHand[] = [];
    const resolved = new Set<SimulatedPlayerHand>();
    if (dealerBlackjack) {
      hiddenDealerCards -= 1;
      track(dealerHoleCard);
      for (const cards of boxes) {
        const hand: SimulatedPlayerHand = { cards, net: settle(calculateHandValue(cards), 21, bet, rules.blackjackPayout, isBlackjack(cards), true), surrendered: false };
        playedHands.push(hand);
        resolved.add(hand);
      }
    } else {
      for (const initialCards of boxes) {
        const playerBlackjack = isBlackjack(initialCards);
        if (playerBlackjack) {
          const hand: SimulatedPlayerHand = { cards: initialCards, net: settle(21, calculateHandValue(dealerCards), bet, rules.blackjackPayout, true, false), surrendered: false };
          playedHands.push(hand);
          resolved.add(hand);
          continue;
        }
        playedHands.push(...playBox(
          initialCards,
          dealerUpcard,
          () => (indexed ? currentTrueCount() : undefined),
          shoe,
          rules,
          bet,
          track,
        ));
      }

      const anyoneActive = playedHands.some((hand) => !hand.surrendered && !resolved.has(hand) && calculateHandValue(hand.cards) <= 21);
      if (anyoneActive) {
        hiddenDealerCards -= 1;
        track(dealerHoleCard);
        while (calculateHandValue(dealerCards) < 21 && (calculateHandValue(dealerCards) < 17 || (calculateHandValue(dealerCards) === 17 && rules.dealerHitsSoft17 && isSoft(dealerCards)))) {
          const card = dealVisible();
          if (!card) break;
          dealerCards = [...dealerCards, card];
        }
      } else {
        // The hole card is still eventually exposed, even if no dealer draw is
        // required because every hand has already resolved.
        hiddenDealerCards -= 1;
        track(dealerHoleCard);
      }
      const dealerTotal = calculateHandValue(dealerCards);
      for (const hand of playedHands) {
        if (hand.surrendered || resolved.has(hand)) continue;
        hand.net = settle(calculateHandValue(hand.cards), dealerTotal, hand.bet ?? bet, rules.blackjackPayout, false, false);
      }
    }

    const netResult = playedHands.reduce((sum, hand) => sum + hand.net, 0) + insuranceNet;
    bankroll += netResult;
    peak = Math.max(peak, bankroll);
    low = Math.min(low, bankroll);
    totalProfit += netResult;

    const record: SimulatedHand = {
      shoeNumber,
      handNumber,
      roundInShoe,
      dealerCards,
      playerHands: playedHands,
      bet,
      runningCountBefore,
      trueCountBefore,
      tcMin,
      tcMax,
      netResult,
    };
    if (!highSpeed && currentShoe) currentShoe.hands.push(record);
    if (currentShoe) {
      currentShoe.totalHands += 1;
      currentShoe.totalProfit += netResult;
      currentShoe.tcMin = Math.min(currentShoe.tcMin, tcMin);
      currentShoe.tcMax = Math.max(currentShoe.tcMax, tcMax);
    }

    if (handNumber % traceEvery === 0 || handNumber === handsToSimulate) bankrollTrace.push({ round: handNumber, bankroll });
    if (handNumber % progressEvery === 0) {
      if (hooks.isCancelled?.()) throw new ShoeSimulationCancelled();
      hooks.onProgress?.(handNumber, handsToSimulate);
      await hooks.yieldControl?.();
    }

    if (shoe.cardsRemaining() < cutCardAt && currentShoe) {
      shoes.push(currentShoe);
      currentShoe = undefined;
    }
  }
  if (currentShoe && currentShoe.totalHands > 0) shoes.push(currentShoe);

  hooks.onProgress?.(handsToSimulate, handsToSimulate);
  const hours = handsToSimulate / config.roundsPerHour;
  return {
    totalHands: handNumber,
    totalShoes: shoes.length,
    totalProfit,
    startingBankroll: config.bankroll,
    endingBankroll: bankroll,
    peakBankroll: peak,
    lowBankroll: low,
    avPerHour: hours > 0 ? totalProfit / hours : 0,
    bankrollTrace,
    shoes,
  };
}
