/**
 * Index-play drill questions.
 *
 * Questions come from `indexList(rules)`, and each one is asked on both sides
 * of its switch point: at the index, where the count changes the play, and one
 * count back on the basic-strategy side. That pair is what teaches the exact
 * number.
 *
 * The expected answer is never read off the index row. It is `decideHand` on
 * the exact cards at the stated count, and each question picks a hand shape
 * for which the row really is the switch: a two-card hand where surrender is
 * allowed, or a drawn hand (three or more cards) where it is not. Index stand
 * plays such as 16 v 10 are only reachable once surrender is off the table, so
 * at a surrender table they are asked on a drawn hand, and the screen says so.
 */
import type { Action, Card } from "@/lib/blackjack/types";
import type { Mistake } from "@/lib/statistics/storage";
import { ACTION_NAMES, CORE_INDEX_COUNT, cellDecision, decideHand, explainDecision, handLabel, dealerLabel, indexList, rowLabel, signedCount, surrenderOffered, takeInsurance, thresholdPhrase, type CellRef, type Decision, type IndexEntry, type Permissions, type TableRules } from "@/lib/strategy";
import { legalActions } from "./basic";
import { drawnHand, insuranceHand, isCard, pick, ranksText, sameCell, twoCardHand, upcardFor, type Rng } from "./cards";

export type IndexSet = "core" | "all";
export const indexSetOf = (value: unknown): IndexSet => (value === "all" ? "all" : "core");

/** `indexList` ranks the Illustrious 18 and the Fab 4 first; this is where they end. */
export const CORE_PRIORITY_LIMIT = CORE_INDEX_COUNT;

export type IndexSide = "index" | "basic";
export type IndexAnswer = Action | "I" | "N";
export const INSURANCE_NAMES = { I: "Take insurance", N: "Decline" } as const;
export const answerName = (answer: IndexAnswer) => (answer === "I" || answer === "N" ? INSURANCE_NAMES[answer] : ACTION_NAMES[answer]);

/** What a round stores: the index, the count and the cards. Everything else is derived. */
export interface IndexQuestion {
  id: string;
  tc: number;
  side: IndexSide;
  cards: Card[];
  upcard: Card;
}

export interface IndexHand extends IndexQuestion {
  entry: IndexEntry;
  cell?: CellRef;
  /** Three or more cards: the player has hit. */
  drawn: boolean;
  /** Whether this hand may be surrendered, and if not, why. */
  surrender: "allowed" | "drawn" | "none";
  available: IndexAnswer[];
  decision?: Decision;
  correct: IndexAnswer;
  category: string;
}

type Shape = "two" | "drawn";
const DRAWN: Permissions = { canDouble: false, canSplit: false, canSurrender: false };
const twoCardPermissions = (rules: TableRules, cell: CellRef): Permissions => ({ canDouble: true, canSplit: cell.section === "pairs", canSurrender: surrenderOffered(rules) });
export const permissionsFor = (shape: Shape, rules: TableRules, cell: CellRef) => (shape === "drawn" ? DRAWN : twoCardPermissions(rules, cell));

/** The count on each side of the switch: the index, and one step back on the basic-strategy side. */
export function switchCounts(entry: Pick<IndexEntry, "at" | "dir">): { index: number; basic: number } {
  return { index: entry.at, basic: entry.dir === "up" ? entry.at - 1 : entry.at + 1 };
}

/** Hand shapes on which this row is the switch: the index play at the index, something else one count back. */
export function workingShapes(entry: IndexEntry, rules: TableRules): Shape[] {
  if (entry.kind === "insurance" || !entry.ref) return [];
  const ref = entry.ref;
  const { index, basic } = switchCounts(entry);
  const shapes: Shape[] = entry.kind === "surrender" || ref.section === "pairs" ? ["two"] : ["two", "drawn"];
  return shapes.filter((shape) => {
    if (shape === "drawn" && ref.section === "soft" && Number(ref.row.slice(2)) < 4) return false;
    const permissions = permissionsFor(shape, rules, ref);
    return cellDecision(rules, ref, index, permissions).action === entry.play && cellDecision(rules, ref, basic, permissions).action !== entry.play;
  });
}

export const playable = (entry: IndexEntry, rules: TableRules) => entry.kind === "insurance" || workingShapes(entry, rules).length > 0;

/** The indices a round deals: the I18 + Fab 4, or every index for these rules. */
export function indexPool(rules: TableRules, set: IndexSet): IndexEntry[] {
  const list = indexList(rules).filter((entry) => playable(entry, rules));
  return set === "core" ? list.filter((entry) => entry.priority < CORE_PRIORITY_LIMIT) : list;
}

/** "16 vs 10", "A,8 vs 6", "10,10 vs 5", "15 vs 10 surrender", "Insurance": the session category. */
export function entryLabel(entry: Pick<IndexEntry, "kind" | "ref">): string {
  if (entry.kind === "insurance" || !entry.ref) return "Insurance";
  const base = `${rowLabel(entry.ref.section, entry.ref.row)} vs ${entry.ref.dealer}`;
  return entry.kind === "surrender" ? `${base} surrender` : base;
}

/** The index as a sentence: "Stand at +4 or higher", "Take insurance at +3 or higher". */
export function indexRule(entry: Pick<IndexEntry, "kind" | "play" | "dir" | "at">): string {
  const play = entry.play === "insurance" ? "Take insurance" : ACTION_NAMES[entry.play as Action];
  return `${play} ${thresholdPhrase(entry)}`;
}

/** Mostly the switch point itself; now and then a count or two further out, so the answer is not always one of two numbers. */
export function pickOffset(rng: Rng): number {
  const roll = rng();
  return roll < 0.8 ? 0 : roll < 0.92 ? 1 : 2;
}

export function buildIndexQuestion(entry: IndexEntry, side: IndexSide, rules: TableRules, rng: Rng, offset = 0): IndexQuestion | null {
  const { index, basic } = switchCounts(entry);
  const toward = entry.dir === "up" ? 1 : -1;
  const tc = side === "index" ? index + toward * offset : basic - toward * offset;
  if (entry.kind === "insurance") return { id: entry.id, tc, side, cards: insuranceHand(rng), upcard: upcardFor("A", rng) };
  if (!entry.ref) return null;
  const shapes = workingShapes(entry, rules);
  if (!shapes.length) return null;
  const ref = entry.ref;
  const drawn = shapes.includes("drawn") && (!shapes.includes("two") || rng() < 0.25);
  const cards = drawn && ref.section !== "pairs" ? drawnHand(ref.section, ref.row, rng) : twoCardHand(ref.section, ref.row, rng);
  if (!cards) return shapes.includes("two") ? { id: entry.id, tc, side, cards: twoCardHand(ref.section, ref.row, rng), upcard: upcardFor(ref.dealer, rng) } : null;
  return { id: entry.id, tc, side, cards, upcard: upcardFor(ref.dealer, rng) };
}

export function resolveIndex(question: IndexQuestion, rules: TableRules, list: readonly IndexEntry[] = indexList(rules)): IndexHand | null {
  if (!isIndexQuestion(question)) return null;
  const entry = list.find((candidate) => candidate.id === question.id);
  if (!entry) return null;
  const category = entryLabel(entry);
  if (entry.kind === "insurance") {
    if (question.upcard.rank !== "A") return null;
    return { ...question, entry, drawn: false, surrender: "none", available: ["I", "N"], correct: takeInsurance(question.tc) ? "I" : "N", category };
  }
  const decision = decideHand({ cards: question.cards, upcard: question.upcard, rules, tc: question.tc });
  if (!decision.cell || !entry.ref || !sameCell(decision.cell, entry.ref)) return null;
  const drawn = question.cards.length > 2;
  const surrender = !surrenderOffered(rules) ? "none" : drawn ? "drawn" : "allowed";
  return { ...question, entry, cell: decision.cell, drawn, surrender, available: legalActions(question.cards, rules), decision, correct: decision.action, category };
}

/** Why this count gives this answer, in one or two sentences. */
export function explainIndex(hand: IndexHand, rules: TableRules): string {
  if (hand.entry.kind === "insurance") {
    const take = hand.correct === "I";
    return `Insurance pays 2 to 1 and is worth taking at a true count of ${signedCount(hand.entry.at)} or higher. At ${signedCount(hand.tc)}, ${take ? "take it" : "decline it"}.`;
  }
  let text = explainDecision(hand.cell!, hand.decision!, hand.tc);
  // On the basic-strategy side the engine's sentence never mentions the index, which is the point of the question.
  if (hand.decision!.via === "basic" || (hand.entry.kind === "surrender" && hand.correct !== "R")) {
    text += ` The index is ${indexRule(hand.entry).toLowerCase()}, so at ${signedCount(hand.tc)} basic strategy holds.`;
  }
  if (hand.surrender === "drawn" && cellDecision(rules, hand.cell!, hand.tc).action === "R") {
    text += " On two cards you would surrender here; once you have hit, surrender is gone and the stand index decides.";
  }
  return text;
}

/** The sentence under the cards that says whether surrender is allowed for this hand. */
export function surrenderNote(hand: Pick<IndexHand, "surrender" | "entry" | "drawn" | "cards">): string {
  if (hand.entry.kind === "insurance") return "The dealer shows an ace and offers insurance.";
  if (hand.surrender === "allowed") return "Two-card hand: surrender is allowed.";
  if (hand.surrender === "drawn") return `You have hit to ${hand.cards.length} cards: no surrender or double now.`;
  return hand.drawn ? "You have hit: no double now. This table has no surrender." : "This table has no surrender.";
}

/** "16 against a 10. True count plus 3." */
export function spokenIndexHand(hand: IndexHand): string {
  const count = hand.tc > 0 ? `plus ${hand.tc}` : hand.tc < 0 ? `minus ${Math.abs(hand.tc)}` : "zero";
  if (hand.entry.kind === "insurance") return `The dealer shows an ace. True count ${count}. Take insurance?`;
  const cell = hand.cell!;
  return `${handLabel(cell.section, cell.row)}${hand.drawn ? `, ${hand.cards.length} cards,` : ""} against ${dealerLabel(cell.dealer)}. True count ${count}.`;
}

const encodeCards = (cards: readonly Card[]) => cards.map((card) => `${card.rank}:${card.suit}`).join(",");
function decodeCards(text: unknown): Card[] | null {
  if (typeof text !== "string" || !text) return null;
  const cards = text.split(",").map((part) => {
    const [rank, suit] = part.split(":");
    return { rank, suit } as Card;
  });
  return cards.every(isCard) ? cards : null;
}

export function indexMistake(hand: IndexHand, chosen: IndexAnswer, rules: TableRules): Mistake {
  return {
    question: `${hand.category} at TC ${signedCount(hand.tc)}${hand.drawn ? ` (${ranksText(hand.cards)})` : ""}`,
    userAnswer: answerName(chosen),
    correctAnswer: answerName(hand.correct),
    explanation: explainIndex(hand, rules),
    category: "playing decision",
    context: { id: hand.id, tc: hand.tc, side: hand.side, cards: encodeCards(hand.cards), upcard: encodeCards([hand.upcard]) },
  };
}

/** The exact question behind a saved mistake, for "Retry misses" after a reload. */
export function questionFromMistake(mistake: Mistake): IndexQuestion | null {
  const context = mistake.context ?? {};
  const cards = decodeCards(context.cards);
  const upcard = decodeCards(context.upcard)?.[0];
  if (!cards || !upcard || typeof context.id !== "string" || typeof context.tc !== "number") return null;
  return { id: context.id, tc: context.tc, side: context.side === "basic" ? "basic" : "index", cards, upcard };
}

export function isIndexQuestion(value: unknown): value is IndexQuestion {
  const item = value as IndexQuestion | null;
  return Boolean(item && typeof item.id === "string" && Number.isInteger(item.tc) && (item.side === "index" || item.side === "basic")
    && Array.isArray(item.cards) && item.cards.length >= 2 && item.cards.every(isCard) && isCard(item.upcard));
}

/* ------------------------------------------------------------------ */
/* Dealing                                                             */
/* ------------------------------------------------------------------ */

/** How strongly "lean on misses" favours an index: its smoothed miss rate (one half when unseen). */
export const missWeight = (totals?: { correct: number; total: number }) => (totals ? (totals.total - totals.correct + 1) / (totals.total + 2) : 0.5);

export interface DealState {
  /** The side each index was last asked on this round, so the next ask takes the other side. */
  sides: Record<string, IndexSide>;
  /** The previous question's index, so the same play does not come up twice running. */
  last?: string;
}

export function dealIndex(pool: readonly IndexEntry[], rules: TableRules, state: DealState, options: { lean?: boolean; history?: Record<string, { correct: number; total: number }> } = {}, rng: Rng = Math.random): IndexQuestion | null {
  const candidates = pool.length > 1 ? pool.filter((entry) => entry.id !== state.last) : pool;
  if (!candidates.length) return null;
  let entry: IndexEntry;
  if (options.lean && rng() < 0.65) {
    const weights = candidates.map((candidate) => missWeight(options.history?.[entryLabel(candidate)]));
    let target = rng() * weights.reduce((sum, weight) => sum + weight, 0);
    entry = candidates[candidates.length - 1];
    for (let index = 0; index < candidates.length; index += 1) {
      target -= weights[index];
      if (target < 0) { entry = candidates[index]; break; }
    }
  } else entry = pick(candidates, rng);
  const previous = state.sides[entry.id];
  const side: IndexSide = previous ? (previous === "index" ? "basic" : "index") : rng() < 0.5 ? "index" : "basic";
  return buildIndexQuestion(entry, side, rules, rng, pickOffset(rng));
}

/** Both sides of one index, at the switch, for a focused start. */
export function focusQuestions(entry: IndexEntry, rules: TableRules, rng: Rng = Math.random): IndexQuestion[] {
  return (["index", "basic", "index", "basic"] as const).map((side, index) => buildIndexQuestion(entry, side, rules, rng, index < 2 ? 0 : 1)).filter((question): question is IndexQuestion => question !== null);
}
