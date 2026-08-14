import { AdvantageRules, RampPoint, unitsAt } from "./advantage";
import { DeviationAction } from "./deviations";
import { FAB_4_DEVIATIONS, FullHiLoDeviation, ILLUSTRIOUS_18_DEVIATIONS, DeviationGroup } from "./fullHiLoIndices";
import { calculateHandValue, canSplit, isBlackjack, isSoft } from "./hand";
import { trueCount, TrueCountRounding } from "./hiLo";
import { BlackjackShoe } from "./shoe";
import { getBasicStrategyDecision } from "./basicStrategy";
import { Card, Rank } from "./types";

export interface SimulatedPlayerHand {
  cards: Card[];
  net: number;
  surrendered: boolean;
  /** Only set when doubled — the wager is twice the round's base bet for this box. */
  bet?: number;
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

/** Matches the hand/dealer string labels used by the curated i18/fab4 deviation tables. */
const rankLabel = (rank: Rank) => (rank === "A" ? "A" : ["J", "Q", "K"].includes(rank) ? "10" : rank);
const handLabel = (cards: Card[]) =>
  cards.length === 2 && cards[0].rank === cards[1].rank
    ? `${rankLabel(cards[0].rank)},${rankLabel(cards[0].rank)}`
    : String(calculateHandValue(cards));

function activeDeviations(groups: DeviationGroup[]): FullHiLoDeviation[] {
  const all = [...ILLUSTRIOUS_18_DEVIATIONS, ...FAB_4_DEVIATIONS];
  return all.filter((deviation) => deviation.groups.some((group) => groups.includes(group)));
}

function applyIndexDeviation(
  action: DeviationAction,
  playerCards: Card[],
  dealerUpcard: Card,
  tc: number,
  deviations: FullHiLoDeviation[],
): DeviationAction {
  const hand = handLabel(playerCards);
  const dealer = rankLabel(dealerUpcard.rank);
  const match = deviations.find((deviation) => deviation.hand === hand && deviation.dealer === dealer);
  if (!match) return action;
  const crossed = match.direction === "atOrBelow" ? tc <= match.index : tc >= match.index;
  return crossed ? match.deviationAction : match.normalAction;
}

function insuranceDecision(tc: number, deviations: FullHiLoDeviation[]): boolean {
  const match = deviations.find((deviation) => deviation.hand === "Insurance");
  if (!match) return false;
  return (match.direction === "atOrBelow" ? tc <= match.index : tc >= match.index) === (match.deviationAction === "I");
}

/** Plays a single box from its post-decision state, hitting per basic strategy + deviations until stand/bust. */
function autoPlay(cards: Card[], dealerUpcard: Card, tc: number, deviations: DeviationGroup[], shoe: BlackjackShoe, rules: AdvantageRules, track: () => void): Card[] {
  const hand = [...cards];
  const active = activeDeviations(deviations);
  while (calculateHandValue(hand) < 21) {
    const decision = getBasicStrategyDecision({ playerCards: hand, dealerUpcard, rules });
    // Resplitting isn't modeled here, so an in-progress hand that would normally split just stands.
    const base = decision.action === "D" ? decision.fallback ?? "H" : decision.action === "P" ? "S" : decision.action;
    const action = applyIndexDeviation(base, hand, dealerUpcard, tc, active);
    if (action !== "H") break;
    const card = shoe.deal();
    if (!card) break;
    hand.push(card);
    track();
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

export async function simulateShoeSession(config: ShoeSimulationConfig, hooks: SimulationHooks = {}): Promise<ShoeSimulationResult> {
  const { rules, ramp, bettingUnit, playerHands, handsToSimulate, highSpeed, deviationGroups, rounding = "floor" } = config;
  const random = mulberry32(config.seed);
  const shoe = new BlackjackShoe(rules.decks, random);
  const cutCardAt = rules.decks * 52 * (1 - rules.penetration);
  const active = activeDeviations(deviationGroups);

  let bankroll = config.bankroll;
  let peak = bankroll;
  let low = bankroll;
  let shoeNumber = 0;
  let roundInShoe = 0;
  let handNumber = 0;
  let totalProfit = 0;
  const shoes: SimulatedShoe[] = [];
  const bankrollTrace: ShoeSessionTracePoint[] = [{ round: 0, bankroll }];
  const traceEvery = Math.max(1, Math.floor(handsToSimulate / 400));
  const progressEvery = Math.max(500, Math.min(5_000, Math.floor(handsToSimulate / 200)));
  let currentShoe: SimulatedShoe | undefined;

  const startNewShoe = () => {
    shoeNumber += 1;
    roundInShoe = 0;
    shoe.reset();
    currentShoe = { shoeNumber, hands: [], totalHands: 0, totalProfit: 0, tcMin: Infinity, tcMax: -Infinity };
  };
  startNewShoe();

  while (handNumber < handsToSimulate) {
    if (shoe.cardsRemaining() < cutCardAt) startNewShoe();
    roundInShoe += 1;
    handNumber += 1;

    const runningCountBefore = shoe.runningCount();
    const trueCountBefore = trueCount(runningCountBefore, shoe.decksRemaining(), rounding);
    let tcMin = trueCountBefore;
    let tcMax = trueCountBefore;
    const track = () => {
      const tc = trueCount(shoe.runningCount(), shoe.decksRemaining(), rounding);
      tcMin = Math.min(tcMin, tc);
      tcMax = Math.max(tcMax, tc);
    };

    const bet = bettingUnit * unitsAt(trueCountBefore, ramp);
    const boxes: Card[][] = Array.from({ length: playerHands }, () => {
      const cards = [shoe.deal(), shoe.deal()].filter((card): card is Card => Boolean(card));
      track();
      return cards;
    });
    const dealerUpcard = shoe.deal();
    const dealerHoleCard = shoe.deal();
    track();
    if (!dealerUpcard || !dealerHoleCard) break;
    let dealerCards = [dealerUpcard, dealerHoleCard];
    const dealerBlackjack = isBlackjack(dealerCards);

    const wantsInsurance = dealerUpcard.rank === "A" && insuranceDecision(trueCountBefore, active);
    const insuranceNet = wantsInsurance ? (dealerBlackjack ? bet : -bet / 2) : 0;

    const playedHands: SimulatedPlayerHand[] = [];
    const resolved = new Set<SimulatedPlayerHand>();
    if (dealerBlackjack) {
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
        const decision = getBasicStrategyDecision({ playerCards: initialCards, dealerUpcard, rules });
        const action = applyIndexDeviation(decision.action, initialCards, dealerUpcard, trueCountBefore, active);

        if (action === "R" && rules.lateSurrender) {
          playedHands.push({ cards: initialCards, net: -bet / 2, surrendered: true });
          continue;
        }
        if (action === "P" && canSplit(initialCards)) {
          for (const original of initialCards) {
            const card = shoe.deal();
            track();
            let hand = card ? [original, card] : [original];
            const isAcePair = initialCards[0].rank === "A";
            if (!isAcePair) hand = autoPlay(hand, dealerUpcard, trueCountBefore, deviationGroups, shoe, rules, track);
            playedHands.push({ cards: hand, net: 0, surrendered: false });
          }
          continue;
        }
        if (action === "D") {
          const card = shoe.deal();
          track();
          const hand = card ? [...initialCards, card] : initialCards;
          playedHands.push({ cards: hand, net: 0, surrendered: false, bet: bet * 2 });
          continue;
        }
        const hand = autoPlay(initialCards, dealerUpcard, trueCountBefore, deviationGroups, shoe, rules, track);
        playedHands.push({ cards: hand, net: 0, surrendered: false });
      }

      const anyoneActive = playedHands.some((hand) => !hand.surrendered && !resolved.has(hand) && calculateHandValue(hand.cards) <= 21);
      if (anyoneActive) {
        while (calculateHandValue(dealerCards) < 21 && (calculateHandValue(dealerCards) < 17 || (calculateHandValue(dealerCards) === 17 && rules.dealerHitsSoft17 && isSoft(dealerCards)))) {
          const card = shoe.deal();
          track();
          if (!card) break;
          dealerCards = [...dealerCards, card];
        }
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
