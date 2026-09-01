import type { DDMAction, DDMRank } from "./engine";

export type Composition = readonly number[];

export interface ExactEvInput {
  decks: number;
  player: DDMRank[];
  dealerUp: DDMRank;
  /** Exposed cards seen before this hand, indexed A through T. */
  deadCards?: number[];
}

export interface ExactEvResult {
  action: DDMAction;
  actionEv: Partial<Record<DDMAction, number>>;
  /** Main-hand EV before the peek, available when the current hand has one card. */
  prePeekActionEv?: Partial<Record<DDMAction, number>>;
  dealerBlackjackProbability: number;
  insuranceEvPerBaseUnit?: number;
  conditionedOnNoDealerBlackjack: boolean;
  unseenCards: number;
  playerStates: number;
  dealerStates: number;
}

const BJ_MULTIPLIER = 1.625;
const OUTCOMES = 7;
const IDX_22 = 5;
const IDX_BUST_OTHER = 6;

function cloneComposition(comp: Composition): number[] {
  return Array.from({ length: 11 }, (_, rank) => Number(comp[rank] ?? 0));
}

function remove(comp: Composition, rank: DDMRank): number[] {
  if ((comp[rank] ?? 0) <= 0) throw new Error(`No ${rank === 1 ? "ace" : rank} remains in the composition.`);
  const child = cloneComposition(comp);
  child[rank] -= 1;
  return child;
}

function countCards(comp: Composition): number {
  let total = 0;
  for (let rank = 1; rank <= 10; rank += 1) total += comp[rank] ?? 0;
  return total;
}

function compositionKey(comp: Composition): string {
  return comp.slice(1, 11).join(",");
}

function totals(hard: number, aces: number): { total: number; soft: boolean } {
  const soft = aces > 0 && hard + 10 <= 21;
  return { total: hard + (soft ? 10 : 0), soft };
}

function oneHot(index: number): Float64Array {
  const result = new Float64Array(OUTCOMES);
  result[index] = 1;
  return result;
}

class DealerSolver {
  readonly memo = new Map<string, Float64Array>();

  private stands(hard: number, aces: number): boolean {
    const value = totals(hard, aces);
    return value.total > 17 || (value.total === 17 && !value.soft);
  }

  distribution(hard: number, aces: number, comp: Composition): Float64Array {
    if (hard > 21) return oneHot(hard === 22 ? IDX_22 : IDX_BUST_OTHER);
    if (this.stands(hard, aces)) return oneHot(totals(hard, aces).total - 17);
    const key = `${hard}|${aces}|${compositionKey(comp)}`;
    const cached = this.memo.get(key);
    if (cached) return cached;
    const remaining = countCards(comp);
    if (remaining <= 0) throw new Error(`Dealer must draw at hard ${hard}, but the composition is exhausted.`);
    const result = new Float64Array(OUTCOMES);
    for (let rank = 1; rank <= 10; rank += 1) {
      const copies = comp[rank] ?? 0;
      if (!copies) continue;
      const child = this.distribution(
        hard + rank,
        aces + Number(rank === 1),
        remove(comp, rank as DDMRank),
      );
      const probability = copies / remaining;
      for (let index = 0; index < OUTCOMES; index += 1) result[index] += probability * child[index];
    }
    this.memo.set(key, result);
    return result;
  }

  fromTwoCards(upcard: DDMRank, hole: DDMRank, comp: Composition): Float64Array {
    return this.distribution(upcard + hole, Number(upcard === 1) + Number(hole === 1), comp);
  }
}

class ExactStateSolver {
  readonly playerMemo = new Map<string, number>();
  readonly dealer = new DealerSolver();

  constructor(
    readonly upcard: DDMRank,
    readonly bannedHole: DDMRank | 0,
  ) {}

  private drawProbabilities(comp: Composition): number[] {
    const cards = countCards(comp);
    if (!this.bannedHole) return Array.from({ length: 11 }, (_, rank) => rank ? (comp[rank] ?? 0) / cards : 0);
    const allowedHoles = cards - (comp[this.bannedHole] ?? 0);
    if (cards <= 1 || allowedHoles <= 0) throw new Error("The peek-conditioned composition has no legal hole card.");
    const probabilities = Array(11).fill(0) as number[];
    for (let rank = 1; rank <= 10; rank += 1) {
      const copies = comp[rank] ?? 0;
      if (!copies) continue;
      const adjustment = rank === this.bannedHole ? 1 : 1 - 1 / allowedHoles;
      probabilities[rank] = copies * adjustment / (cards - 1);
    }
    return probabilities;
  }

  private holeProbabilities(comp: Composition): number[] {
    const cards = countCards(comp);
    const allowed = cards - (this.bannedHole ? comp[this.bannedHole] ?? 0 : 0);
    if (allowed <= 0) throw new Error("The composition has no legal dealer hole card.");
    return Array.from({ length: 11 }, (_, rank) => {
      if (!rank || rank === this.bannedHole) return 0;
      return (comp[rank] ?? 0) / allowed;
    });
  }

  private settle(playerTotal: number, distribution: Float64Array): number {
    let ev = distribution[IDX_BUST_OTHER];
    // Dealer 22 pushes every non-blackjack hand, so it contributes zero.
    for (let dealerTotal = 17; dealerTotal <= 21; dealerTotal += 1) {
      const probability = distribution[dealerTotal - 17];
      ev += probability * (playerTotal > dealerTotal ? 1 : playerTotal === dealerTotal ? 0 : -1);
    }
    return ev;
  }

  private standValue(hard: number, aces: number, comp: Composition): number {
    const playerTotal = totals(hard, aces).total;
    const holeProbabilities = this.holeProbabilities(comp);
    let ev = 0;
    for (let hole = 1; hole <= 10; hole += 1) {
      const probability = holeProbabilities[hole];
      if (!probability) continue;
      const distribution = this.dealer.fromTwoCards(this.upcard, hole as DDMRank, remove(comp, hole as DDMRank));
      ev += probability * this.settle(playerTotal, distribution);
    }
    return ev;
  }

  private hitValue(hard: number, aces: number, cards: number, comp: Composition): number {
    const probabilities = this.drawProbabilities(comp);
    let ev = 0;
    for (let rank = 1; rank <= 10; rank += 1) {
      const probability = probabilities[rank];
      if (!probability) continue;
      const nextHard = hard + rank;
      ev += probability * (nextHard > 21
        ? -1
        : this.value(nextHard, aces + Number(rank === 1), cards + 1, remove(comp, rank as DDMRank)));
    }
    return ev;
  }

  private value(hard: number, aces: number, cards: number, comp: Composition): number {
    if (hard > 21) return -1;
    if (cards === 2 && aces === 1 && hard === 11) return BJ_MULTIPLIER;
    const key = `${hard}|${aces}|${cards}|${compositionKey(comp)}`;
    const cached = this.playerMemo.get(key);
    if (cached !== undefined) return cached;
    const stand = this.standValue(hard, aces, comp);
    const hit = this.hitValue(hard, aces, cards, comp);
    const best = Math.max(stand, hit, 2 * hit);
    this.playerMemo.set(key, best);
    return best;
  }

  actions(player: readonly DDMRank[], comp: Composition): Partial<Record<DDMAction, number>> {
    const hard = player.reduce((sum, rank) => sum + rank, 0);
    const aces = player.filter((rank) => rank === 1).length;
    if (hard > 21 || (player.length === 2 && aces === 1 && hard === 11)) return {};
    const stand = this.standValue(hard, aces, comp);

    if (player.length === 1 && player[0] === 1) {
      const probabilities = this.drawProbabilities(comp);
      let cappedHit = 0;
      for (let rank = 1; rank <= 10; rank += 1) {
        const probability = probabilities[rank];
        if (!probability) continue;
        const child = remove(comp, rank as DDMRank);
        cappedHit += probability * (rank === 10 ? BJ_MULTIPLIER : this.standValue(1 + rank, 1, child));
      }
      return { H: cappedHit, D: 2 * cappedHit };
    }

    const hit = this.hitValue(hard, aces, player.length, comp);
    return { S: stand, H: hit, D: 2 * hit };
  }
}

export function freshComposition(decks: number): number[] {
  if (!Number.isInteger(decks) || decks < 1 || decks > 8) throw new Error("Decks must be an integer from 1 through 8.");
  return [0, 4 * decks, 4 * decks, 4 * decks, 4 * decks, 4 * decks, 4 * decks, 4 * decks, 4 * decks, 4 * decks, 16 * decks];
}

export function exactStateEv(input: ExactEvInput): ExactEvResult {
  if (!input.player.length) throw new Error("Add at least one player card.");
  const comp = freshComposition(input.decks);
  const deadCards = input.deadCards ?? Array(10).fill(0);
  if (deadCards.length !== 10) throw new Error("Dead-card counts must contain A through T.");
  for (let rank = 1; rank <= 10; rank += 1) {
    const count = deadCards[rank - 1];
    if (!Number.isInteger(count) || count < 0) throw new Error("Dead-card counts must be non-negative integers.");
    comp[rank] -= count;
  }
  for (const rank of input.player) comp[rank] -= 1;
  comp[input.dealerUp] -= 1;
  if (comp.slice(1).some((count) => count < 0)) throw new Error("The selected cards exceed the cards available in the shoe.");
  if (countCards(comp) < 2) throw new Error("At least a dealer hole card and one draw card must remain.");

  const bannedHole: DDMRank | 0 = input.dealerUp === 1 ? 10 : input.dealerUp === 10 ? 1 : 0;
  const dealerBlackjackProbability = bannedHole ? comp[bannedHole] / countCards(comp) : 0;
  const solver = new ExactStateSolver(input.dealerUp, bannedHole);
  const actionEv = solver.actions(input.player, comp);
  const ordered = (Object.entries(actionEv) as Array<[DDMAction, number]>).sort((a, b) => b[1] - a[1]);
  if (!ordered.length) {
    const hard = input.player.reduce((sum, rank) => sum + rank, 0);
    const aces = input.player.filter((rank) => rank === 1).length;
    throw new Error(hard > 21 ? "The selected player hand is already busted." : aces === 1 && hard === 11 && input.player.length === 2 ? "The selected player hand is already a blackjack." : "No legal action is available.");
  }
  const prePeekActionEv = input.player.length === 1 && bannedHole
    ? Object.fromEntries(Object.entries(actionEv).map(([action, ev]) => [action, dealerBlackjackProbability * -1 + (1 - dealerBlackjackProbability) * Number(ev)])) as Partial<Record<DDMAction, number>>
    : undefined;
  return {
    action: ordered[0][0],
    actionEv,
    prePeekActionEv,
    dealerBlackjackProbability,
    insuranceEvPerBaseUnit: input.dealerUp === 1 ? 1.5 * dealerBlackjackProbability - 0.5 : undefined,
    conditionedOnNoDealerBlackjack: Boolean(bannedHole),
    unseenCards: countCards(comp),
    playerStates: solver.playerMemo.size,
    dealerStates: solver.dealer.memo.size,
  };
}
