/**
 * One round at the full-shoe table, as plain data and pure transitions.
 *
 * The UI decides *when* each step happens (it pauses between them so the cards
 * can be seen and counted); this module decides *what* happens: who may do
 * what, which card goes where, and what every hand is paid. Nothing here reads
 * a clock or React state, so the rules are tested card by card.
 *
 *   dealRound        two cards to every seat with a bet, two to the dealer
 *   resolveInsurance the insurance / even-money stake, then the peek
 *   applyAction      hit, stand, double, split or surrender on the active hand
 *   dealSplitCard    a split hand gets its second card when its turn comes
 *   revealHole       the hole card is turned (it is counted from here on)
 *   dealerDraw       one more card for the dealer while the rules say draw
 *   settleRound      every hand's result, the insurance and the cash returned
 *
 * Casino procedure the transitions follow: an ace up offers insurance before
 * the dealer peeks; a ten up is peeked straight away, except at an early
 * surrender table, where the players decide first; split hands are dealt
 * their second card one at a time; split aces take one card each unless the
 * table resplits aces and the card is another ace.
 */
import { calculateHandValue, isBlackjack, isPair, isSoft, rankValue } from "@/lib/blackjack/hand";
import type { Action, Card } from "@/lib/blackjack/types";
import { surrenderOffered, type Permissions, type TableRules } from "@/lib/strategy";

export type HandStatus = "playing" | "waiting" | "stood" | "busted" | "surrendered" | "blackjack";

export interface SeatHand {
  /** Stable for the life of the round, so a split never remounts a dealt card. */
  id: number;
  seat: number;
  /** Which player owns the seat (players share one bankroll). */
  owner: number;
  cards: Card[];
  bet: number;
  status: HandStatus;
  fromSplit: boolean;
  splitAces: boolean;
  doubled: boolean;
}

export interface TableConfig {
  rules: TableRules;
  resplitAces: boolean;
  /** 1.5 for 3:2, 1.2 for 6:5. */
  blackjackPayout: number;
  /** Hands one seat may hold after splitting. */
  maxHandsPerSeat: number;
}

export type RoundPhase = "insurance" | "playing" | "dealer";

export interface Round {
  /** Up card first, then the hole card, then any draws. */
  dealer: Card[];
  holeRevealed: boolean;
  hands: SeatHand[];
  /** The hand to act, or -1 when no hand is waiting for a decision. */
  active: number;
  phase: RoundPhase;
  insurance: number;
  /** Ten up at an early-surrender table: the peek waits for the players' decisions. */
  earlySurrenderOpen: boolean;
  nextId: number;
}

export interface Bet { seat: number; owner: number; amount: number }
export type Draw = () => Card;

export const MAX_HANDS_PER_SEAT = 4;

const isTen = (card: Card) => rankValue(card) === 10;
const done = (status: HandStatus) => status === "busted" || status === "surrendered" || status === "blackjack";
const live = (hand: SeatHand) => hand.status === "playing" || hand.status === "waiting";

/** The next hand after `from` that still needs a card or a decision. */
function nextActive(hands: SeatHand[], from: number): number {
  return hands.findIndex((hand, index) => index > from && live(hand));
}

function withActive(round: Round, active: number): Round {
  if (active >= 0) return { ...round, active, phase: "playing" };
  return { ...round, active: -1, phase: "dealer" };
}

/** Whether the dealer's two cards are a natural. Only the engine looks before the reveal. */
export const dealerHasBlackjack = (round: Pick<Round, "dealer">) => isBlackjack(round.dealer.slice(0, 2));

/**
 * After the insurance decision (ace up) or straight after the deal (ten up),
 * the dealer looks at the hole card. A natural ends the round: the UI turns
 * the card and settles.
 */
function peek(round: Round): Round {
  if (dealerHasBlackjack(round)) return { ...round, active: -1, phase: "dealer" };
  return withActive(round, nextActive(round.hands, -1));
}

/** Deals a round: one card to each seat in order, the up card, a second card each, the hole card. */
export function dealRound(config: TableConfig, bets: readonly Bet[], draw: Draw, firstId = 1): Round {
  const seats = [...bets].filter((bet) => bet.amount > 0).sort((a, b) => a.seat - b.seat);
  if (!seats.length) throw new Error("A round needs at least one bet");
  const first = seats.map(() => draw());
  const up = draw();
  const second = seats.map(() => draw());
  const hole = draw();
  let id = firstId;
  const hands: SeatHand[] = seats.map((bet, index) => {
    const cards = [first[index], second[index]];
    return { id: id++, seat: bet.seat, owner: bet.owner, cards, bet: bet.amount, status: isBlackjack(cards) ? "blackjack" : "playing", fromSplit: false, splitAces: false, doubled: false };
  });
  const round: Round = { dealer: [up, hole], holeRevealed: false, hands, active: -1, phase: "playing", insurance: 0, earlySurrenderOpen: false, nextId: id };
  if (up.rank === "A") return { ...round, phase: "insurance" };
  if (isTen(up)) {
    if (config.rules.surrender === "early" && !config.rules.noHoleCard) return { ...withActive(round, nextActive(hands, -1)), earlySurrenderOpen: true };
    return peek(round);
  }
  return withActive(round, nextActive(hands, -1));
}

export interface InsuranceOffer {
  /** Half of every hand's bet: insuring the whole table. */
  full: number;
  /** Half of each blackjack's bet: even money on the naturals only. */
  evenMoney: number;
  blackjacks: number;
  others: number;
}

export function insuranceOffer(round: Round): InsuranceOffer {
  const blackjacks = round.hands.filter((hand) => hand.status === "blackjack");
  return {
    full: round.hands.reduce((sum, hand) => sum + hand.bet / 2, 0),
    evenMoney: blackjacks.reduce((sum, hand) => sum + hand.bet / 2, 0),
    blackjacks: blackjacks.length,
    others: round.hands.length - blackjacks.length,
  };
}

/** Records the insurance stake (0 to decline) and peeks. */
export function resolveInsurance(round: Round, stake: number): Round {
  if (round.phase !== "insurance") throw new Error("Insurance is only offered with an ace up");
  return peek({ ...round, insurance: Math.max(0, stake) });
}

const handsInSeat = (round: Round, seat: number) => round.hands.filter((hand) => hand.seat === seat).length;

/** A split ace that drew another ace may split again, table and seat permitting. */
function canResplitAces(config: TableConfig, round: Round, hand: SeatHand): boolean {
  return hand.splitAces && hand.cards.length === 2 && hand.cards.every((card) => card.rank === "A") && config.resplitAces && handsInSeat(round, hand.seat) < config.maxHandsPerSeat;
}

/** Whether the table's doubling rule lets this two-card hand double. */
export function doublingPermits(config: TableConfig, cards: Card[]): boolean {
  if (config.rules.doubling === "any") return true;
  if (isSoft(cards)) return false;
  const total = calculateHandValue(cards);
  return config.rules.doubling === "9-11" ? total >= 9 && total <= 11 : total === 10 || total === 11;
}

/**
 * What the active hand may do, given the cash still off the table. Doubles
 * and splits need a second bet's worth of cash; surrender is only for an
 * original two-card hand at a table that offers it; a split ace may only
 * resplit (when the table allows) or stand.
 */
export function legalActions(config: TableConfig, round: Round, cash: number): Action[] {
  const hand = round.hands[round.active];
  if (!hand || round.phase !== "playing" || hand.status !== "playing") return [];
  if (calculateHandValue(hand.cards) >= 21) return [];
  const affordable = cash >= hand.bet;
  if (hand.splitAces) return canResplitAces(config, round, hand) && affordable ? ["S", "P"] : [];
  const actions: Action[] = ["H", "S"];
  const two = hand.cards.length === 2;
  if (two && affordable && doublingPermits(config, hand.cards) && (!hand.fromSplit || config.rules.das)) actions.push("D");
  if (two && isPair(hand.cards) && affordable && handsInSeat(round, hand.seat) < config.maxHandsPerSeat) actions.push("P");
  if (two && !hand.fromSplit && surrenderOffered(config.rules)) actions.push("R");
  return actions;
}

/** The same facts in the shape `decideHand` asks for. */
export function permissionsFor(config: TableConfig, round: Round, cash: number): Permissions {
  const legal = legalActions(config, round, cash);
  return { canDouble: legal.includes("D"), canSplit: legal.includes("P"), canSurrender: legal.includes("R") };
}

/** Extra cash an action puts on the table: a second bet for a double or a split. */
export function extraStake(round: Round, action: Action): number {
  const hand = round.hands[round.active];
  return hand && (action === "D" || action === "P") ? hand.bet : 0;
}

function finishHand(round: Round, hands: SeatHand[], index: number): Round {
  const hand = hands[index];
  if (hand.status === "playing" || hand.status === "waiting") return { ...round, hands, active: index, phase: "playing" };
  return withActive({ ...round, hands }, nextActive(hands, index));
}

/**
 * Plays one action on the active hand. The caller checks it is legal (and
 * takes the extra stake for a double or split).
 *
 * At an early-surrender table with a ten up, nothing is dealt while the
 * dealer holds a natural: every hand either surrenders or waits for the
 * reveal, as it would when the dealer peeks after taking the surrenders.
 */
export function applyAction(config: TableConfig, round: Round, action: Action, draw: Draw): Round {
  const index = round.active;
  const current = round.hands[index];
  if (!current || round.phase !== "playing" || current.status !== "playing") throw new Error("No hand is waiting for a decision");
  const hands = round.hands.map((hand) => ({ ...hand, cards: [...hand.cards] }));
  const hand = hands[index];

  if (round.earlySurrenderOpen && dealerHasBlackjack(round)) {
    hand.status = action === "R" ? "surrendered" : "stood";
    return finishHand(round, hands, index);
  }

  switch (action) {
    case "H": {
      hand.cards.push(draw());
      const total = calculateHandValue(hand.cards);
      hand.status = total > 21 ? "busted" : total === 21 ? "stood" : "playing";
      break;
    }
    case "S":
      hand.status = "stood";
      break;
    case "D":
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(draw());
      hand.status = calculateHandValue(hand.cards) > 21 ? "busted" : "stood";
      break;
    case "R":
      hand.status = "surrendered";
      break;
    case "P": {
      const [left, right] = hand.cards;
      const splitAces = left.rank === "A";
      const firstCards = [left, draw()];
      const first: SeatHand = { ...hand, cards: firstCards, fromSplit: true, splitAces, status: "playing" };
      const second: SeatHand = { ...hand, id: round.nextId, cards: [right], fromSplit: true, splitAces, status: "waiting" };
      hands.splice(index, 1, first, second);
      const next: Round = { ...round, hands, nextId: round.nextId + 1 };
      first.status = splitStatus(config, next, first);
      return finishHand(next, hands, index);
    }
  }
  return finishHand(round, hands, index);
}

/** A two-card split hand: aces stand unless they may resplit; 21 stands; anything else plays on. */
function splitStatus(config: TableConfig, round: Round, hand: SeatHand): HandStatus {
  if (hand.splitAces) return canResplitAces(config, round, hand) ? "playing" : "stood";
  return calculateHandValue(hand.cards) === 21 ? "stood" : "playing";
}

/** True when the active hand is a split hand still waiting for its second card. */
export const needsSplitCard = (round: Round) => round.phase === "playing" && round.hands[round.active]?.status === "waiting";

export function dealSplitCard(config: TableConfig, round: Round, draw: Draw): Round {
  if (!needsSplitCard(round)) throw new Error("No split hand is waiting for a card");
  const index = round.active;
  const hands = round.hands.map((hand) => ({ ...hand, cards: [...hand.cards] }));
  const hand = hands[index];
  hand.cards.push(draw());
  const next = { ...round, hands };
  hand.status = splitStatus(config, next, hand);
  return finishHand(next, hands, index);
}

export function revealHole(round: Round): Round {
  return { ...round, holeRevealed: true, earlySurrenderOpen: false, active: -1, phase: "dealer" };
}

/** Whether the dealer draws again: never against a table of finished hands, never on a natural. */
export function dealerNeedsCard(config: TableConfig, round: Round): boolean {
  if (!round.holeRevealed || dealerHasBlackjack(round)) return false;
  if (round.hands.every((hand) => done(hand.status))) return false;
  const total = calculateHandValue(round.dealer);
  if (total < 17) return true;
  return total === 17 && isSoft(round.dealer) && config.rules.hitSoft17;
}

export function dealerDraw(round: Round, draw: Draw): Round {
  return { ...round, dealer: [...round.dealer, draw()] };
}

export type Outcome = "Blackjack" | "Win" | "Push" | "Loss" | "Bust" | "Surrender" | "Dealer blackjack";

export interface HandResult { id: number; seat: number; net: number; outcome: Outcome }

export interface Settlement {
  hands: HandResult[];
  insuranceNet: number;
  /** Everything won or lost this round, insurance included. */
  net: number;
  /** Cash that comes back off the table: stakes still standing plus winnings. */
  returned: number;
  /** Everything that was put on the table this round. */
  staked: number;
  dealerTotal: number;
  dealerBust: boolean;
  dealerBlackjack: boolean;
}

/** Net result of one hand against the dealer's final cards. */
export function handNet(config: TableConfig, hand: SeatHand, dealer: Card[]): { net: number; outcome: Outcome } {
  const dealerNatural = isBlackjack(dealer);
  if (hand.status === "surrendered") return { net: -hand.bet / 2, outcome: "Surrender" };
  const total = calculateHandValue(hand.cards);
  if (total > 21) return { net: -hand.bet, outcome: "Bust" };
  const natural = hand.status === "blackjack" || (!hand.fromSplit && isBlackjack(hand.cards));
  if (natural) return dealerNatural ? { net: 0, outcome: "Push" } : { net: hand.bet * config.blackjackPayout, outcome: "Blackjack" };
  if (dealerNatural) return { net: -hand.bet, outcome: "Dealer blackjack" };
  const dealerTotal = calculateHandValue(dealer);
  if (dealerTotal > 21 || total > dealerTotal) return { net: hand.bet, outcome: "Win" };
  if (total === dealerTotal) return { net: 0, outcome: "Push" };
  return { net: -hand.bet, outcome: "Loss" };
}

export function settleRound(config: TableConfig, round: Round): Settlement {
  const dealerBlackjack = isBlackjack(round.dealer);
  const results = round.hands.map((hand) => ({ id: hand.id, seat: hand.seat, ...handNet(config, hand, round.dealer) }));
  const insuranceNet = round.insurance ? (dealerBlackjack ? round.insurance * 2 : -round.insurance) : 0;
  const staked = round.hands.reduce((sum, hand) => sum + hand.bet, 0) + round.insurance;
  const net = results.reduce((sum, result) => sum + result.net, 0) + insuranceNet;
  const dealerTotal = calculateHandValue(round.dealer);
  return { hands: results, insuranceNet, net, returned: staked + net, staked, dealerTotal, dealerBust: dealerTotal > 21, dealerBlackjack };
}

/** Every card a player at the table has seen: all hands, the up card, and the rest once turned. */
export function visibleCards(round: Round): Card[] {
  return [...round.hands.flatMap((hand) => hand.cards), ...(round.holeRevealed ? round.dealer : round.dealer.slice(0, 1))];
}

/** Every card the round has taken out of the shoe, for the discard tray. */
export const cardsUsed = (round: Round) => round.hands.reduce((sum, hand) => sum + hand.cards.length, 0) + round.dealer.length;

/** Money on the table right now. */
export const stakeOnTable = (round: Round) => round.hands.reduce((sum, hand) => sum + hand.bet, 0) + round.insurance;

/** "Soft 18", "16", "Blackjack". */
export function handTotalLabel(cards: Card[], natural = false): string {
  if (natural && isBlackjack(cards)) return "Blackjack";
  const total = calculateHandValue(cards);
  return `${isSoft(cards) && total < 21 ? "Soft " : ""}${total}`;
}
