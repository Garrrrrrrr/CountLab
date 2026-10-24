/**
 * Prices every legal action for one chart cell from real shoe states, bucketed
 * by true count, so an index can be checked against the count where two
 * actions actually cross instead of taken on trust (scripts/priceDeviationCell.ts).
 *
 * It walks basic-strategy shoes and, at each occurrence of the cell, evaluates
 * every action by paired replications from the exact remaining composition:
 * the dealer's cards come from the same shuffled remainder for every action,
 * so the dealer's variance cancels between them, and every action draws its
 * player cards from the same head of that remainder.
 *
 * Known limit, second order: an action changes how many cards the round uses,
 * which shifts later rounds in the shoe. That effect is not modelled.
 */
import { AdvantageRules } from "./advantage";
import { decideHand, fromBlackjackRules } from "@/lib/strategy";
import { Action, BlackjackRules, Card, Rank } from "./types";

/** Ranks collapsed to the ten distinct values: 0 = ace, 1-8 = 2-9, 9 = any ten-value card. */
const VALUE = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const HI_LO = [-1, 1, 1, 1, 1, 1, 0, 0, 0, -1];
const PER_DECK = [4, 4, 4, 4, 4, 4, 4, 4, 4, 16];
const CODE_RANK: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const ACE = 0;

const card = (code: number): Card => ({ rank: CODE_RANK[code], suit: "spades" });

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

/** Total and softness for a list of rank codes, matching `calculateHandValue`/`isSoft`. */
function handTotal(cards: number[]) {
  let total = 0;
  let aces = 0;
  for (const code of cards) {
    total += VALUE[code];
    if (code === ACE) aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

/**
 * Every hand with the same (total, soft, pair-rank, card count) shape gets the
 * same basic-strategy answer, so decisions are cached on that shape rather than
 * on literal cards. Hands of three or more cards can neither surrender nor
 * split, so their answer depends only on (total, soft).
 */
class BasicStrategyTable {
  private readonly cache = new Map<number, Action>();
  private readonly shapes = new Map<number, Card[]>();
  constructor(private readonly rules: BlackjackRules) {}

  private shape(total: number, soft: boolean, pairCode: number, twoCards: boolean): Card[] {
    const key = ((total * 2 + (soft ? 1 : 0)) * 11 + pairCode + 1) * 2 + (twoCards ? 1 : 0);
    const cached = this.shapes.get(key);
    if (cached) return cached;
    let codes: number[] | undefined;
    if (pairCode >= 0) {
      codes = [pairCode, pairCode];
    } else {
      const size = twoCards ? 2 : 3;
      const working: number[] = new Array(size).fill(0);
      const search = (position: number): number[] | undefined => {
        if (position === size) {
          const value = handTotal(working);
          if (value.total !== total || value.soft !== soft) return undefined;
          // A non-pair shape is required so the pair branch stays unreachable.
          if (size === 2 && VALUE[working[0]] === VALUE[working[1]]) return undefined;
          return [...working];
        }
        for (let code = 0; code < 10; code++) {
          working[position] = code;
          const found = search(position + 1);
          if (found) return found;
        }
        return undefined;
      };
      // Hard 4 and hard 20 exist only as pairs; those are asked with splitting off.
      codes = search(0) ?? [total / 2 - 1, total / 2 - 1];
      if (!codes.every((code) => Number.isInteger(code) && code >= 0 && code < 10)) {
        throw new Error(`No ${size}-card hand has total ${total} (${soft ? "soft" : "hard"})`);
      }
    }
    const cards = codes.map(card);
    this.shapes.set(key, cards);
    return cards;
  }

  action(total: number, soft: boolean, pairCode: number, up: number, twoCards: boolean, splitAllowed: boolean): Action {
    const key = ((((total * 2 + (soft ? 1 : 0)) * 11 + pairCode + 1) * 10 + up) * 2 + (twoCards ? 1 : 0)) * 2 + (splitAllowed ? 1 : 0);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const action = decideHand({
      cards: this.shape(total, soft, splitAllowed ? pairCode : -1, twoCards),
      upcard: card(up),
      rules: fromBlackjackRules(this.rules),
      canSplit: splitAllowed,
    }).action;
    this.cache.set(key, action);
    return action;
  }
}

/**
 * The unseen shoe, drawable from either end with an undo log.
 *
 * Dealing the dealer's cards off the back and the player's off the front lets
 * two candidate player actions be replayed against a byte-identical dealer hand
 * and an identical stream of player draws.
 */
class Remainder {
  private readonly pool: Int8Array;
  private lo = 0;
  private hi = -1;
  private readonly log: number[] = [];
  constructor(capacity: number, private readonly random: () => number) {
    this.pool = new Int8Array(capacity);
  }
  load(counts: Int32Array) {
    let index = 0;
    for (let code = 0; code < 10; code++) for (let n = 0; n < counts[code]; n++) this.pool[index++] = code;
    this.lo = 0;
    this.hi = index - 1;
    this.log.length = 0;
  }
  mark() {
    return this.log.length;
  }
  private take(position: number, fromFront: boolean) {
    const pick = this.lo + Math.floor(this.random() * (this.hi - this.lo + 1));
    const value = this.pool[pick];
    this.pool[pick] = this.pool[position];
    this.pool[position] = value;
    this.log.push(position, pick);
    if (fromFront) this.lo += 1;
    else this.hi -= 1;
    return value;
  }
  drawFront = () => this.take(this.lo, true);
  drawBack = () => this.take(this.hi, false);
  rewind(mark: number) {
    while (this.log.length > mark) {
      const pick = this.log.pop()!;
      const position = this.log.pop()!;
      if (position === this.lo - 1) this.lo -= 1;
      else this.hi += 1;
      const value = this.pool[position];
      this.pool[position] = this.pool[pick];
      this.pool[pick] = value;
    }
  }
}

interface SettledHand {
  total: number;
  wager: number;
}

/**
 * Plays one box to completion, forcing `forced` as the first decision and
 * following basic strategy afterwards. Returns -0.5 for a surrender, otherwise
 * 0 with each resulting hand pushed into `out` (a total above 21 is a bust).
 */
function playBox(
  first: number,
  second: number,
  forced: Action,
  up: number,
  rules: AdvantageRules,
  basic: BasicStrategyTable,
  draw: () => number,
  out: SettledHand[],
): number {
  out.length = 0;
  if (forced === "R") return -0.5;
  const queue: Array<{ cards: number[]; fromSplit: boolean; splitAces: boolean }> = [
    { cards: [first, second], fromSplit: false, splitAces: false },
  ];
  let handsInBox = 1;
  let isFirstDecision = true;

  while (queue.length) {
    const pending = queue.shift()!;
    const cards = pending.cards;
    let { total, soft } = handTotal(cards);
    const pair = cards.length === 2 && VALUE[cards[0]] === VALUE[cards[1]];
    const splitAllowed = pair
      && handsInBox < 4
      && (!pending.splitAces || (cards[0] === ACE && rules.resplitAces));

    // Split aces take one card only, unless the table lets them be resplit.
    if (pending.splitAces && !splitAllowed) {
      out.push({ total, wager: 1 });
      continue;
    }

    let action: Action;
    if (isFirstDecision) {
      action = forced;
      isFirstDecision = false;
    } else {
      action = basic.action(total, soft, pair ? cards[0] : -1, up, cards.length === 2, splitAllowed);
    }
    if (action === "P" && !splitAllowed) action = basic.action(total, soft, -1, up, cards.length === 2, false);

    if (action === "P") {
      handsInBox += 1;
      const aceSplit = cards[0] === ACE;
      for (const original of cards) queue.push({ cards: [original, draw()], fromSplit: true, splitAces: aceSplit });
      continue;
    }

    if (action === "R" && !pending.fromSplit && cards.length === 2 && rules.lateSurrender) return -0.5;

    if (action === "D" && cards.length === 2 && (!pending.fromSplit || rules.doubleAfterSplit)) {
      cards.push(draw());
      out.push({ total: handTotal(cards).total, wager: 2 });
      continue;
    }
    if (action !== "S") action = "H";

    while (action === "H" && total < 21) {
      cards.push(draw());
      const value = handTotal(cards);
      total = value.total;
      soft = value.soft;
      if (total >= 21) break;
      action = basic.action(total, soft, -1, up, false, false);
      if (action !== "S") action = "H";
    }
    out.push({ total, wager: 1 });
  }
  return 0;
}

function playDealer(up: number, hole: number, rules: AdvantageRules, draw: () => number) {
  const cards = [up, hole];
  for (;;) {
    const { total, soft } = handTotal(cards);
    if (total > 17) return total;
    if (total === 17 && !(rules.dealerHitsSoft17 && soft)) return total;
    cards.push(draw());
  }
}

function settle(hands: SettledHand[], surrender: number, dealerTotal: number) {
  if (surrender !== 0) return surrender;
  let net = 0;
  for (const hand of hands) {
    if (hand.total > 21) net -= hand.wager;
    else if (dealerTotal > 21 || hand.total > dealerTotal) net += hand.wager;
    else if (hand.total < dealerTotal) net -= hand.wager;
  }
  return net;
}



/** Labels a two-card hand using the deviation catalog's chart notation. */
function chartLabel(a: number, b: number) {
  if (VALUE[a] === VALUE[b]) return `${CODE_RANK[a]},${CODE_RANK[b]}`;
  const { total, soft } = handTotal([a, b]);
  return soft ? `Soft ${total}` : String(total);
}

export interface CellPriceOptions {
  rules: AdvantageRules;
  /** Chart label, e.g. "16", "Soft 19", "10,10". */
  hand: string;
  /** Chart dealer label, e.g. "10" or "A". */
  dealer: string;
  rounds: number;
  replications: number;
  seed: number;
  /**
   * Early surrender (ES10): the choice comes before the dealer checks for
   * blackjack, so rounds where the dealer has one count too. There every
   * action but surrender loses the original bet, and surrender loses half.
   * Off (late surrender), rounds with a dealer blackjack are left out.
   */
  earlySurrender?: boolean;
}

export interface CellPriceBucket {
  trueCount: number;
  samples: number;
  evs: Partial<Record<Action, number>>;
}

/**
 * Prices every legal action for one chart cell, bucketed by true count.
 *
 * This is the check that says whether a published index is in the right place:
 * the index is the true count where two actions cross, so a catalog row can be
 * validated against the crossing point rather than taken on trust.
 */
export function priceCell(options: CellPriceOptions): CellPriceBucket[] {
  const { rules, rounds, replications } = options;
  const random = mulberry32(options.seed);
  const basic = new BasicStrategyTable({
    decks: rules.decks,
    dealerHitsSoft17: rules.dealerHitsSoft17,
    doubleAfterSplit: rules.doubleAfterSplit,
    resplitAces: rules.resplitAces,
    lateSurrender: rules.lateSurrender,
    doubleRule: "any",
  });
  const totalCards = rules.decks * 52;
  const shoe = new Int8Array(totalCards);
  const counts = new Int32Array(10);
  const remainder = new Remainder(totalCards, random);
  const branch: SettledHand[] = [];
  const LOW = -6;
  const HIGH = 10;
  const span = HIGH - LOW + 1;
  const actions: Action[] = ["S", "H", "D", "P", "R"];
  const totals = new Float64Array(span * actions.length);
  const samples = new Int32Array(span);

  const cutCard = totalCards * (1 - rules.penetration);
  let cursor = totalCards;
  let runningCount = 0;
  const reshuffle = () => {
    let index = 0;
    for (let code = 0; code < 10; code++) for (let n = 0; n < PER_DECK[code] * rules.decks; n++) shoe[index++] = code;
    for (let i = totalCards - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const value = shoe[i];
      shoe[i] = shoe[j];
      shoe[j] = value;
    }
    cursor = 0;
    runningCount = 0;
  };
  reshuffle();
  const deal = () => {
    // A long round (several splits off a short single-deck cut) can outlast the cards; reshuffling
    // then only moves the shoe on, the priced cell has already been measured.
    if (cursor >= totalCards) reshuffle();
    const code = shoe[cursor++];
    runningCount += HI_LO[code];
    return code;
  };

  for (let round = 0; round < rounds; round++) {
    if (totalCards - cursor < cutCard) reshuffle();
    const player0 = deal();
    const up = deal();
    const player1 = deal();
    const hole = shoe[cursor++];
    const decksRemaining = (totalCards - cursor + 1) / 52;
    const trueCount = decksRemaining > 0 ? Math.floor(runningCount / decksRemaining) : runningCount;
    const player = handTotal([player0, player1]);
    const dealerBlackjack = handTotal([up, hole]).total === 21;
    const pair = VALUE[player0] === VALUE[player1];
    const basicAction = basic.action(player.total, player.soft, pair ? player0 : -1, up, true, pair);

    const matches = (!dealerBlackjack || options.earlySurrender === true)
      && player.total !== 21
      && chartLabel(player0, player1) === options.hand
      && CODE_RANK[up] === options.dealer
      && trueCount >= LOW
      && trueCount <= HIGH;

    if (matches) {
      const bucket = trueCount - LOW;
      samples[bucket] += 1;
      counts.fill(0);
      for (let index = cursor; index < totalCards; index++) counts[shoe[index]] += 1;
      remainder.load(counts);
      if (dealerBlackjack) {
        for (let a = 0; a < actions.length; a++) totals[bucket * actions.length + a] += (actions[a] === "R" ? -0.5 : -1) * replications;
      } else for (let replication = 0; replication < replications; replication++) {
        const start = remainder.mark();
        const dealerTotal = playDealer(up, hole, rules, remainder.drawBack);
        const afterDealer = remainder.mark();
        for (let a = 0; a < actions.length; a++) {
          const action = actions[a];
          if (action === "P" && !pair) continue;
          totals[bucket * actions.length + a] += settle(branch, playBox(player0, player1, action, up, rules, basic, remainder.drawFront, branch), dealerTotal);
          remainder.rewind(afterDealer);
        }
        remainder.rewind(start);
      }
    }

    runningCount += HI_LO[hole];
    if (!dealerBlackjack && player.total !== 21) {
      if (playBox(player0, player1, basicAction, up, rules, basic, deal, branch) === 0) {
        const dealerCards = [up, hole];
        for (;;) {
          const value = handTotal(dealerCards);
          if (value.total > 17) break;
          if (value.total === 17 && !(rules.dealerHitsSoft17 && value.soft)) break;
          dealerCards.push(deal());
        }
      }
    }
  }

  const isPairCell = options.hand.includes(",");
  return Array.from({ length: span }, (_, bucket) => ({
    trueCount: bucket + LOW,
    samples: samples[bucket],
    evs: Object.fromEntries(
      actions
        .filter((action) => action !== "P" || isPairCell)
        .map((action) => [action, samples[bucket] ? totals[bucket * actions.length + actions.indexOf(action)] / (samples[bucket] * replications) : undefined])
        .filter(([, value]) => value !== undefined),
    ) as Partial<Record<Action, number>>,
  }));
}

