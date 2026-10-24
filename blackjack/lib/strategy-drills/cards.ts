/**
 * Real-looking hands for the strategy drills.
 *
 * Every hand is built for a chart cell and then checked with the engine's own
 * `locateHand`, so a generated hand can never sit on a different row from the
 * one the question was drawn for (a hard 16 is never dealt as 8,8, a soft 18
 * is never accidentally hard).
 */
import { calculateHandValue, isSoft, rankValue } from "@/lib/blackjack/hand";
import { SUITS, type Card, type Rank, type Suit } from "@/lib/blackjack/types";
import { locateHand, type CellRef, type Dealer, type Section } from "@/lib/strategy";

export type Rng = () => number;

export const TEN_RANKS: readonly Rank[] = ["10", "J", "Q", "K"];

export const pick = <T,>(items: readonly T[], rng: Rng): T => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];

const suit = (rng: Rng): Suit => pick(SUITS, rng);

/** A card of a blackjack value: 1 or 11 is an ace, 10 is any ten-value rank. */
export function cardOfValue(value: number, rng: Rng, avoid?: Suit): Card {
  const rank: Rank = value === 1 || value === 11 ? "A" : value === 10 ? pick(TEN_RANKS, rng) : (String(value) as Rank);
  let chosen = suit(rng);
  if (avoid && chosen === avoid) chosen = SUITS[(SUITS.indexOf(chosen) + 1 + Math.floor(rng() * 3)) % SUITS.length];
  return { rank, suit: chosen };
}

export const upcardFor = (dealer: Dealer, rng: Rng): Card => cardOfValue(dealer === "A" ? 11 : Number(dealer), rng);

/** A copy in random order (Fisher-Yates). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** Puts the cards in a random order, as they would be dealt. */
function dealtOrder(cards: Card[], rng: Rng): Card[] {
  return rng() < 0.5 ? cards : [...cards].reverse();
}

/** True when `cards` sit on exactly this chart row for the engine. */
export function sitsOn(cards: Card[], section: Section, row: string): boolean {
  const located = locateHand(cards, cards.length === 2);
  return !("outside" in located) && located.section === section && located.row === row;
}

/** An original two-card hand that the engine places on `section` / `row`. */
export function twoCardHand(section: Section, row: string, rng: Rng): Card[] {
  if (section === "pairs") {
    const value = row === "A,A" ? 11 : row === "T,T" ? 10 : Number(row.split(",")[0]);
    const first = cardOfValue(value, rng);
    // Same rank twice, as most tables require for a split; never the identical card.
    return [first, { rank: first.rank, suit: cardOfValue(value, rng, first.suit).suit }];
  }
  if (section === "soft") {
    const other = Number(row.slice(2));
    return dealtOrder([cardOfValue(11, rng), cardOfValue(other, rng)], rng);
  }
  const total = Number(row);
  const splits: [number, number][] = [];
  for (let low = 2; low <= 10; low += 1) {
    const high = total - low;
    if (high > low && high <= 10) splits.push([low, high]);
  }
  const [low, high] = pick(splits, rng);
  return dealtOrder([cardOfValue(low, rng), cardOfValue(high, rng)], rng);
}

/**
 * A hand of three or more cards on a hard or soft row: the player has already
 * hit, so doubling, splitting and surrender are gone. Null when the row
 * cannot be reached that way (no drawn hand is a pair, and soft 13 or 14 would
 * need a run of aces that looks like a typo on screen).
 */
export function drawnHand(section: "hard" | "soft", row: string, rng: Rng, count = 3): Card[] | null {
  const target = section === "hard" ? Number(row) : 11 + Number(row.slice(2));
  if (section === "soft" && target < 15) return null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const values: number[] = section === "soft" ? [11] : [];
    // Hard drawn hands use no aces, so the total reads at a glance.
    let remaining = section === "soft" ? target - 11 : target;
    const slots = section === "soft" ? count - 1 : count;
    for (let slot = 0; slot < slots; slot += 1) {
      const left = slots - slot - 1;
      const lo = 2, hi = Math.min(section === "soft" ? 9 : 10, remaining - left * 2);
      if (hi < lo) break;
      const value = slot === slots - 1 ? remaining : lo + Math.floor(rng() * (hi - lo + 1));
      values.push(value);
      remaining -= value;
    }
    const ceiling = section === "soft" ? 9 : 10;
    if (values.length !== count || remaining !== 0 || values.some((value, index) => value < 2 || (value > ceiling && !(section === "soft" && index === 0)))) continue;
    const cards = values.map((value) => cardOfValue(value, rng));
    // Deal the ace anywhere but always keep it soft; hard hands must stay hard.
    const shuffled = shuffle(cards, rng);
    if (calculateHandValue(shuffled) !== target || isSoft(shuffled) !== (section === "soft")) continue;
    if (sitsOn(shuffled, section, row)) return shuffled;
  }
  return null;
}

/** "A,7", "10,6,K": ranks as dealt. */
export const ranksText = (cards: readonly Card[]) => cards.map((card) => card.rank).join(",");

/** "Soft 18", "Hard 16", "Pair of 8s": what the hand is, as a player would say it. */
export function totalLabel(cards: readonly Card[]): string {
  const list = [...cards];
  if (list.length === 2 && rankValue(list[0]) === rankValue(list[1])) {
    const value = rankValue(list[0]);
    return value === 11 ? "Pair of aces" : value === 10 ? "Pair of tens" : `Pair of ${value}s`;
  }
  return `${isSoft(list) ? "Soft" : "Hard"} ${calculateHandValue(list)}`;
}

/** A two-card player hand of 12 to 20, for the insurance question: the kind of hand that is usually on the table. */
export function insuranceHand(rng: Rng): Card[] {
  for (;;) {
    const cards = [cardOfValue(2 + Math.floor(rng() * 9), rng), cardOfValue(2 + Math.floor(rng() * 9), rng)];
    const total = calculateHandValue(cards);
    if (total >= 12 && total <= 20) return cards;
  }
}

export const isCard = (value: unknown): value is Card => {
  const card = value as Card | null;
  return Boolean(card && typeof card === "object" && typeof card.rank === "string" && typeof card.suit === "string"
    && ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].includes(card.rank) && (SUITS as readonly string[]).includes(card.suit));
};

export const sameCell = (a: CellRef, b: CellRef) => a.section === b.section && a.row === b.row && a.dealer === b.dealer;
