/**
 * Basic-strategy drill questions: which hand to deal, what the player may do
 * with it, and the answer. The answer is always `decideHand` on the exact
 * cards dealt, so a three-card soft 18 is graded as the hand it is (no
 * double), and surrender is only ever correct where the table offers it.
 */
import { isPair } from "@/lib/blackjack/hand";
import { doubleAllowed } from "@/lib/blackjack/strategyChart";
import type { Action, Card } from "@/lib/blackjack/types";
import type { LeitnerState } from "@/lib/statistics/spacedRepetition";
import type { Mistake, Session } from "@/lib/statistics/storage";
import { ACTION_NAMES, cellDecision, cellKey, DEALERS, decideHand, explainDecision, locateHand, surrenderOffered, type CellRef, type Dealer, type Decision, type Section, type TableRules } from "@/lib/strategy";
import { drawnHand, isCard, pick, ranksText, totalLabel, twoCardHand, upcardFor, type Rng } from "./cards";
import { chartFor } from "./chartRow";

export type BasicFocus = "mixed" | "hard" | "soft" | "pairs" | "surrender" | "weak";
export const BASIC_FOCUSES: readonly BasicFocus[] = ["mixed", "hard", "soft", "pairs", "surrender", "weak"];
export const basicFocusOf = (value: unknown): BasicFocus => (BASIC_FOCUSES.includes(value as BasicFocus) ? (value as BasicFocus) : value === "adaptive" ? "weak" : "mixed");

/** Session categories. The names are the ones saved history already uses. */
export type BasicCategory = "Hard totals" | "Soft totals" | "Pairs" | "Surrender";
export const BASIC_CATEGORIES: readonly BasicCategory[] = ["Hard totals", "Soft totals", "Pairs", "Surrender"];
const SECTION_CATEGORY: Record<Section, BasicCategory> = { hard: "Hard totals", soft: "Soft totals", pairs: "Pairs" };
export const FOCUS_FOR_CATEGORY: Record<BasicCategory, BasicFocus> = { "Hard totals": "hard", "Soft totals": "soft", Pairs: "pairs", Surrender: "surrender" };

/** What a round stores and replays: just the cards. Everything else is derived. */
export interface BasicQuestion { cards: Card[]; upcard: Card }

export interface BasicHand extends BasicQuestion {
  cell: CellRef;
  /** Three or more cards: the player has hit, so only hit and stand remain. */
  drawn: boolean;
  category: BasicCategory;
  /** The buttons that are live for this hand. */
  available: Action[];
  decision: Decision;
  correct: Action;
  /** Spaced-repetition key: the chart cell, plus `|drawn` for hit hands. */
  key: string;
}

/** The actions the table allows on these cards: no double, split or surrender after a hit. */
export function legalActions(cards: Card[], rules: TableRules): Action[] {
  const actions: Action[] = ["H", "S"];
  if (cards.length !== 2) return actions;
  const located = locateHand(cards, true);
  const doubles = rules.doubling === "any" || (!("outside" in located) && doubleAllowed({ doubleRule: rules.doubling }, located.section, located.row));
  if (doubles) actions.push("D");
  if (isPair(cards)) actions.push("P");
  if (surrenderOffered(rules)) actions.push("R");
  return actions;
}

/** Cells the surrender table lists for these rules (the hands that are ever given up). */
export function surrenderTableKeys(rules: TableRules): Set<string> {
  return new Set(chartFor(rules).surrender?.cells.keys() ?? []);
}

export function categoryOf(cell: CellRef, drawn: boolean, rules: TableRules): BasicCategory {
  if (!drawn && surrenderOffered(rules) && surrenderTableKeys(rules).has(cellKey(cell))) return "Surrender";
  return SECTION_CATEGORY[cell.section];
}

export const practiceKey = (cell: CellRef, drawn: boolean) => (drawn ? `${cellKey(cell)}|drawn` : cellKey(cell));

/** The cell behind a practice key, or null for a key from another version. */
export function parsePracticeKey(key: string, rules: TableRules): { cell: CellRef; drawn: boolean } | null {
  const match = /^(hard|soft|pairs):([^v|]+)v(10|[2-9]|A)(\|drawn)?$/.exec(key);
  if (!match) return null;
  const section = match[1] as Section;
  if (!chartFor(rules).tables[section].rows.includes(match[2])) return null;
  const drawn = Boolean(match[4]);
  if (drawn && section === "pairs") return null;
  return { cell: { section, row: match[2], dealer: match[3] as Dealer }, drawn };
}

export function resolveBasic(question: BasicQuestion, rules: TableRules): BasicHand | null {
  if (!isBasicQuestion(question)) return null;
  const decision = decideHand({ cards: question.cards, upcard: question.upcard, rules });
  if (!decision.cell) return null;
  const drawn = question.cards.length > 2;
  return {
    cards: question.cards,
    upcard: question.upcard,
    cell: decision.cell,
    drawn,
    category: categoryOf(decision.cell, drawn, rules),
    available: legalActions(question.cards, rules),
    decision,
    correct: decision.action,
    key: practiceKey(decision.cell, drawn),
  };
}

const lower = (action: Action) => ACTION_NAMES[action].toLowerCase();

/** The feedback sentence, with the reason a drawn hand plays differently from its chart cell. */
export function explainBasic(hand: BasicHand, rules: TableRules): string {
  const base = explainDecision(hand.cell, hand.decision);
  if (!hand.drawn) return base;
  const twoCard = cellDecision(rules, hand.cell, undefined);
  if (twoCard.action === hand.decision.action) return base;
  const why = twoCard.action === "D" ? "You can only double on your first two cards" : twoCard.action === "R" ? "Surrender is only offered on your first two cards" : "This hand has been hit";
  return `${base} ${why}, so ${lower(hand.decision.action)}; on two cards the chart says ${lower(twoCard.action)}.`;
}

/* ------------------------------------------------------------------ */
/* Dealing                                                             */
/* ------------------------------------------------------------------ */

export interface WeakPool {
  entries: { key: string; weight: number }[];
  /** "history": cells you missed or that are due. "borderline": no history yet, so cells where the play changes. */
  source: "history" | "borderline";
}

const BOX_WEIGHT: Record<number, number> = { 1: 8, 2: 4, 3: 1.5, 4: 0.6, 5: 0.3 };

/** Recent misses per practice key, from the `key` each saved mistake carries. */
export function recentMisses(sessions: readonly Session[], limit = 10): Record<string, number> {
  const counts: Record<string, number> = {};
  sessions.filter((session) => session.drill === "Basic Strategy" && !session.tags?.includes("retry")).slice(0, limit).forEach((session) => {
    for (const mistake of session.mistakes ?? []) {
      const key = mistake.context?.key;
      if (typeof key === "string") counts[key] = (counts[key] ?? 0) + 1;
    }
  });
  return counts;
}

const allCells = (rules: TableRules): CellRef[] => (["hard", "soft", "pairs"] as const).flatMap((section) =>
  chartFor(rules).tables[section].rows.flatMap((row) => DEALERS.map((dealer) => ({ section, row, dealer }))));

/** Cells whose two-card play differs from a neighbour's: the edges of each colour block on the chart. */
export function borderlineCells(rules: TableRules): CellRef[] {
  const play = (cell: CellRef) => cellDecision(rules, cell, undefined).action;
  return allCells(rules).filter((cell) => {
    const rows = chartFor(rules).tables[cell.section].rows;
    const column = DEALERS.indexOf(cell.dealer), rowIndex = rows.indexOf(cell.row);
    const neighbours: CellRef[] = [];
    if (column > 0) neighbours.push({ ...cell, dealer: DEALERS[column - 1] });
    if (column < DEALERS.length - 1) neighbours.push({ ...cell, dealer: DEALERS[column + 1] });
    if (rowIndex > 0) neighbours.push({ ...cell, row: rows[rowIndex - 1] });
    if (rowIndex < rows.length - 1) neighbours.push({ ...cell, row: rows[rowIndex + 1] });
    const own = play(cell);
    return neighbours.some((neighbour) => play(neighbour) !== own);
  });
}

/**
 * What "Weak spots" deals from: cells you missed recently or whose review is
 * due (Leitner boxes), weighted toward the newest misses. With no history it
 * falls back to the borderline cells, which is where most misses happen.
 */
export function weakPool(rules: TableRules, states: Record<string, LeitnerState>, misses: Record<string, number>, now = Date.now()): WeakPool {
  const weights = new Map<string, number>();
  for (const [key, state] of Object.entries(states)) {
    if (!parsePracticeKey(key, rules)) continue;
    const due = new Date(state.dueAt).getTime() <= now;
    if (state.box > 2 && !due && !misses[key]) continue;
    weights.set(key, (BOX_WEIGHT[state.box] ?? 1) * (due ? 1.5 : 1));
  }
  for (const [key, count] of Object.entries(misses)) {
    if (!parsePracticeKey(key, rules)) continue;
    weights.set(key, (weights.get(key) ?? 0) + 3 * count);
  }
  if (weights.size) return { entries: [...weights].map(([key, weight]) => ({ key, weight })).sort((a, b) => b.weight - a.weight), source: "history" };
  return { entries: borderlineCells(rules).map((cell) => ({ key: practiceKey(cell, false), weight: 1 })), source: "borderline" };
}

function weighted<T extends { weight: number }>(items: readonly T[], rng: Rng): T {
  let target = rng() * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) {
    target -= item.weight;
    if (target < 0) return item;
  }
  return items[items.length - 1];
}

/** The cells a surrender question is drawn from: the surrender table, twice as often, and the hands around it that are played on. */
export function surrenderPool(rules: TableRules): { cell: CellRef; weight: number }[] {
  const listed = surrenderTableKeys(rules);
  const pool = new Map<string, { cell: CellRef; weight: number }>();
  for (const section of ["hard", "pairs"] as const) {
    const rows = section === "hard" ? ["12", "13", "14", "15", "16", "17"] : ["6,6", "7,7", "8,8", "9,9"];
    for (const row of rows) for (const dealer of ["8", "9", "10", "A"] as Dealer[]) {
      const cell = { section, row, dealer };
      pool.set(cellKey(cell), { cell, weight: listed.has(cellKey(cell)) ? 2 : 1 });
    }
  }
  for (const key of listed) {
    if (pool.has(key)) continue;
    const parsed = parsePracticeKey(key, rules);
    if (parsed) pool.set(key, { cell: parsed.cell, weight: 2 });
  }
  return [...pool.values()];
}

/** Hard and soft cells where a drawn hand plays differently from two cards (a double or surrender that is gone). */
export function drawnChangesPlay(rules: TableRules, cell: CellRef): boolean {
  if (cell.section === "pairs") return false;
  return cellDecision(rules, cell, undefined).action !== cellDecision(rules, cell, undefined, { canDouble: false, canSplit: false, canSurrender: false }).action;
}

export function questionForCell(cell: CellRef, drawn: boolean, rng: Rng): BasicQuestion {
  const cards = drawn && cell.section !== "pairs" ? drawnHand(cell.section, cell.row, rng, rng() < 0.2 && cell.section === "hard" && Number(cell.row) >= 12 ? 4 : 3) : null;
  return { cards: cards ?? twoCardHand(cell.section, cell.row, rng), upcard: upcardFor(cell.dealer, rng) };
}

export interface DrawOptions {
  focus: BasicFocus;
  rules: TableRules;
  /** Needed for "weak". */
  weak?: WeakPool;
  /** The previous hand's key, so the same cell does not come up twice running. */
  avoid?: string;
  rng?: Rng;
}

type Slice = "hard" | "soft" | "pairs" | "surrender";

function sliceFor(focus: BasicFocus, rules: TableRules, rng: Rng): Slice {
  const surrender = surrenderOffered(rules);
  if (focus === "hard" || focus === "soft" || focus === "pairs") return focus;
  if (focus === "surrender" && surrender) return "surrender";
  const slices: { slice: Slice; weight: number }[] = [
    { slice: "hard", weight: 0.35 }, { slice: "soft", weight: 0.25 }, { slice: "pairs", weight: 0.25 },
    ...(surrender ? [{ slice: "surrender" as const, weight: 0.15 }] : []),
  ];
  return weighted(slices, rng).slice;
}

function drawOnce({ focus, rules, weak }: DrawOptions, rng: Rng): BasicQuestion {
  if (focus === "weak" && weak?.entries.length && rng() < 0.7) {
    const entry = weighted(weak.entries, rng);
    const parsed = parsePracticeKey(entry.key, rules);
    if (parsed) return questionForCell(parsed.cell, parsed.drawn, rng);
  }
  const slice = sliceFor(focus, rules, rng);
  if (slice === "surrender") return questionForCell(weighted(surrenderPool(rules), rng).cell, false, rng);
  const rows = chartFor(rules).tables[slice].rows;
  const drawnShare = slice === "pairs" ? 0 : focus === "mixed" || focus === "weak" ? 0.15 : 0.2;
  if (rng() < drawnShare) {
    const cells = rows.flatMap((row) => DEALERS.map((dealer) => ({ section: slice, row, dealer })));
    const teaching = cells.filter((cell) => drawnChangesPlay(rules, cell));
    const cell = teaching.length && rng() < 0.6 ? pick(teaching, rng) : pick(cells, rng);
    return questionForCell(cell, true, rng);
  }
  return questionForCell({ section: slice, row: pick(rows, rng), dealer: pick(DEALERS, rng) }, false, rng);
}

/** The next hand for a focus. Never repeats the previous cell straight away. */
export function drawBasic(options: DrawOptions): BasicQuestion {
  const rng = options.rng ?? Math.random;
  let question = drawOnce(options, rng);
  for (let attempt = 0; attempt < 6 && options.avoid; attempt += 1) {
    const hand = resolveBasic(question, options.rules);
    if (hand && hand.key !== options.avoid) break;
    question = drawOnce(options, rng);
  }
  return question;
}

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

const encodeCards = (cards: readonly Card[]) => cards.map((card) => `${card.rank}:${card.suit}`).join(",");
function decodeCards(text: unknown): Card[] | null {
  if (typeof text !== "string" || !text) return null;
  const cards = text.split(",").map((part) => {
    const [rank, suit] = part.split(":");
    return { rank, suit } as Card;
  });
  return cards.every(isCard) ? cards : null;
}

export function basicMistake(hand: BasicHand, chosen: Action, rules: TableRules): Mistake {
  return {
    question: `${ranksText(hand.cards)} vs ${hand.upcard.rank} · ${totalLabel(hand.cards)}`,
    userAnswer: ACTION_NAMES[chosen],
    correctAnswer: ACTION_NAMES[hand.correct],
    explanation: explainBasic(hand, rules),
    category: "playing decision",
    context: { key: hand.key, cards: encodeCards(hand.cards), upcard: encodeCards([hand.upcard]) },
  };
}

/** The exact hand behind a saved mistake, for "Retry misses" after a reload. */
export function questionFromMistake(mistake: Mistake): BasicQuestion | null {
  const cards = decodeCards(mistake.context?.cards);
  const upcard = decodeCards(mistake.context?.upcard)?.[0];
  return cards && upcard ? { cards, upcard } : null;
}

export function isBasicQuestion(value: unknown): value is BasicQuestion {
  const item = value as BasicQuestion | null;
  return Boolean(item && Array.isArray(item.cards) && item.cards.length >= 2 && item.cards.length <= 6 && item.cards.every(isCard) && isCard(item.upcard));
}

/** "Ace and 7 against a 9", for the screen-reader announcement of a new hand. */
export function spokenHand(hand: Pick<BasicHand, "cards" | "upcard">): string {
  const word = (card: Card) => (card.rank === "A" ? "ace" : card.rank === "J" ? "jack" : card.rank === "Q" ? "queen" : card.rank === "K" ? "king" : card.rank);
  const names = hand.cards.map(word);
  const up = word(hand.upcard);
  const article = up === "ace" || up === "8" ? "an" : "a";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} against ${article} ${up}`.replace(/^./, (letter) => letter.toUpperCase());
}

/** Analytics scenario: sorted ranks, then the upcard (`10A_v_9`). */
export const basicScenario = (hand: BasicQuestion) => `${hand.cards.map((card) => card.rank).sort().join("")}_v_${hand.upcard.rank}`;
