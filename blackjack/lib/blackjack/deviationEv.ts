/**
 * Standalone marginal value of a single index departure.
 *
 * The measurement is a *conditional* EV difference taken at the decision point,
 * not the profit difference between two whole simulated sessions. Playing two
 * long sessions and subtracting their bankrolls buries a ~0.05 unit signal
 * under the ~10 unit per-shoe swing of ordinary blackjack variance: at 50,000
 * paired 60-hand sessions the 95% interval on such an estimate is ±0.05 to
 * ±0.17 units per 100 rounds, wider than the entire spread of values being
 * ranked, so the resulting order is noise.
 *
 * Instead this walks a basic-strategy (no-index) shoe and, every time the
 * departure would actually change the play, measures only what that one
 * decision is worth:
 *
 *   value per 100 rounds = 100 · E[ bet(TC) · (EV(departure) − EV(basic)) ]
 *
 * The inner expectation is evaluated by paired replications from the exact
 * remaining-shoe composition, with three variance reductions:
 *
 *  - the dealer's cards are drawn from the tail of the same shuffled remainder
 *    for both branches, so the dealer's final total is *identical* and all of
 *    its variance cancels;
 *  - both branches draw player cards from the head of that same remainder, so
 *    hit and double share their first card;
 *  - rounds where the departure does not change the play contribute an exact
 *    zero instead of a noisy near-zero.
 *
 * Insurance needs no sampling at all: with the unseen-card multiset known the
 * probability the hole card is a ten is exact, so its value is closed form.
 *
 * Known limits, both second order and stated in the published metadata:
 *  - the departure changes how many cards the round consumes, which shifts
 *    later rounds in the shoe. That effect is zero to first order and is not
 *    modelled.
 *  - departures are evaluated on the round's original two cards, so value
 *    picked up on a post-split hand (splitting 8,8 into a 16, say) is not
 *    credited to the 16 entry.
 */
import { AdvantageRules, RampPoint, unitsAt } from "./advantage";
import { getBasicStrategyDecision } from "./basicStrategy";
import { Deviation, resolveDeviation } from "./deviations";
import { Action, BlackjackRules, Card, Rank } from "./types";

/** Ranks collapsed to the ten distinct values: 0 = ace, 1-8 = 2-9, 9 = any ten-value card. */
const VALUE = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const HI_LO = [-1, 1, 1, 1, 1, 1, 0, 0, 0, -1];
const PER_DECK = [4, 4, 4, 4, 4, 4, 4, 4, 4, 16];
const CODE_RANK: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const TEN = 9;
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
    const action = getBasicStrategyDecision({
      playerCards: this.shape(total, soft, splitAllowed ? pairCode : -1, twoCards),
      dealerUpcard: card(up),
      rules: this.rules,
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

export interface DeviationEvOptions {
  rules: AdvantageRules;
  ramp: RampPoint[];
  /** Baseline rounds dealt. Every departure in the catalog is measured on this one stream. */
  rounds: number;
  /** Paired replications used per triggered decision. */
  replications: number;
  seed: number;
  catalog: readonly Deviation[];
  onProgress?: (roundsDone: number) => void;
}

export interface DeviationEvRow {
  id: string;
  hand: string;
  dealer: string;
  /** Units gained per 100 rounds by adding this one departure to basic strategy. */
  evPer100: number;
  /** Standard error of `evPer100`. */
  standardError: number;
  /** Rounds per 100 in which the departure actually changes the play. */
  triggersPer100: number;
}

/** Labels a two-card hand the way the AP Toolbox charts do. */
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

    const matches = !dealerBlackjack
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
      for (let replication = 0; replication < replications; replication++) {
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

export function measureDeviationEv(options: DeviationEvOptions): DeviationEvRow[] {
  const { rules, ramp, rounds, replications, catalog } = options;
  const random = mulberry32(options.seed);
  const basic = new BasicStrategyTable({
    decks: rules.decks,
    dealerHitsSoft17: rules.dealerHitsSoft17,
    doubleAfterSplit: rules.doubleAfterSplit,
    resplitAces: rules.resplitAces,
    lateSurrender: rules.lateSurrender,
    doubleRule: "any",
  });
  const deviationRules = { dealerHitsSoft17: rules.dealerHitsSoft17, lateSurrender: rules.lateSurrender };

  const totalCards = rules.decks * 52;
  const shoe = new Int8Array(totalCards);
  const counts = new Int32Array(10);
  const remainder = new Remainder(totalCards, random);
  const branch: SettledHand[] = [];

  const entries = catalog.map((row, position) => ({ row, position }));
  const sum = new Float64Array(catalog.length);
  const sumSquares = new Float64Array(catalog.length);
  const triggers = new Int32Array(catalog.length);

  const insuranceRows = entries.filter(({ row }) => row.hand === "Insurance");
  const byCell = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (entry.row.hand === "Insurance") continue;
    const key = `${entry.row.hand}|${entry.row.dealer}`;
    const bucket = byCell.get(key);
    if (bucket) bucket.push(entry);
    else byCell.set(key, [entry]);
  }

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
    const code = shoe[cursor++];
    runningCount += HI_LO[code];
    return code;
  };

  for (let round = 0; round < rounds; round++) {
    if (totalCards - cursor < cutCard) reshuffle();
    // The wager is placed on the count before the round is dealt.
    const preDealDecks = (totalCards - cursor) / 52;
    const bet = unitsAt(preDealDecks > 0 ? Math.floor(runningCount / preDealDecks) : runningCount, ramp);

    const player0 = deal();
    const up = deal();
    const player1 = deal();
    // The hole card leaves the shoe but stays out of the running count until shown.
    const hole = shoe[cursor++];

    // Indices are compared against the count at the moment of the decision, so
    // the three face-up cards are already in it and the hole card is not.
    const decksRemaining = (totalCards - cursor + 1) / 52;
    const trueCount = decksRemaining > 0 ? Math.floor(runningCount / decksRemaining) : runningCount;

    // Insurance is closed form: the unseen multiset is known, so P(ten) is exact.
    if (up === ACE && insuranceRows.length) {
      const unseen = totalCards - cursor + 1;
      let tens = hole === TEN ? 1 : 0;
      for (let index = cursor; index < totalCards; index++) if (shoe[index] === TEN) tens += 1;
      const value = bet * ((1.5 * tens) / unseen - 0.5);
      for (const { row, position } of insuranceRows) {
        const takes = row.direction === "atOrBelow" ? trueCount <= row.index : trueCount >= row.index;
        if (!takes) continue;
        triggers[position] += 1;
        sum[position] += value;
        sumSquares[position] += value * value;
      }
    }

    const player = handTotal([player0, player1]);
    const playerBlackjack = player.total === 21;
    const dealerBlackjack = handTotal([up, hole]).total === 21;
    const pair = VALUE[player0] === VALUE[player1];
    const basicAction = basic.action(player.total, player.soft, pair ? player0 : -1, up, true, pair);

    if (!dealerBlackjack && !playerBlackjack) {
      const label = chartLabel(player0, player1);
      const bucket = byCell.get(`${label}|${CODE_RANK[up]}`);
      if (bucket) {
        let loaded = false;
        for (const { row, position } of bucket) {
          const departure = resolveDeviation(basicAction, label, CODE_RANK[up], trueCount, deviationRules, [row as Deviation]).action;
          if (departure === basicAction || departure === "I" || departure === "N") continue;
          triggers[position] += 1;
          if (!loaded) {
            counts.fill(0);
            for (let index = cursor; index < totalCards; index++) counts[shoe[index]] += 1;
            loaded = true;
          }
          remainder.load(counts);

          let difference = 0;
          for (let replication = 0; replication < replications; replication++) {
            const start = remainder.mark();
            const dealerTotal = playDealer(up, hole, rules, remainder.drawBack);
            const afterDealer = remainder.mark();

            const netDeparture = settle(branch, playBox(player0, player1, departure as Action, up, rules, basic, remainder.drawFront, branch), dealerTotal);
            remainder.rewind(afterDealer);
            const netBasic = settle(branch, playBox(player0, player1, basicAction, up, rules, basic, remainder.drawFront, branch), dealerTotal);
            remainder.rewind(start);

            difference += netDeparture - netBasic;
          }
          const contribution = (bet * difference) / replications;
          sum[position] += contribution;
          sumSquares[position] += contribution * contribution;
        }
      }
    }

    // Advance the shoe by playing the round out under plain basic strategy.
    runningCount += HI_LO[hole];
    if (!dealerBlackjack && !playerBlackjack) {
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
    if (options.onProgress && round > 0 && round % 250_000 === 0) options.onProgress(round);
  }

  return entries.map(({ row, position }) => {
    const mean = sum[position] / rounds;
    const variance = Math.max(0, sumSquares[position] / rounds - mean * mean);
    return {
      id: (row as { id?: string }).id ?? `${row.hand}-${row.dealer}-${row.index}`,
      hand: row.hand,
      dealer: row.dealer,
      evPer100: mean * 100,
      standardError: (100 * Math.sqrt(variance)) / Math.sqrt(rounds),
      triggersPer100: (triggers[position] / rounds) * 100,
    };
  });
}
