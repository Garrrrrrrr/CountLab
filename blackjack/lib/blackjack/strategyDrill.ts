import { getBasicStrategyDecision } from "./basicStrategy";
import { CHART_DEALERS } from "./bjaH17Chart";
import { calculateHandValue, isPair, isSoft, rankValue } from "./hand";
import type { StrategySectionId } from "./strategyChart";
import { randomStrategyQuestion, STRATEGY_CATEGORIES, type StrategyCategory, type StrategyQuestion } from "./strategyQuestions";
import { RANKS, type BlackjackRules, type Card, type Rank } from "./types";
import { shuffled, type CategoryTotals } from "../statistics/drillRound";
import type { Mistake, SurrenderRule } from "../statistics/storage";

/**
 * The basic-strategy drill's questions and answers, outside the component so
 * the unit suite can hold the drill, the chart row it shows, and the engine
 * that grades it to one another.
 */

/** Surrender is asked as its own question: `R` gives the hand up, `N` declines and plays it out. */
export type StrategyAnswer = "H" | "S" | "D" | "P" | "R" | "N";
export type StrategyMode = "standard" | "adaptive" | "tricky";

export const STRATEGY_ANSWER_NAMES: Record<StrategyAnswer, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
  N: "Play it out",
};
export const PLAY_ANSWERS: readonly StrategyAnswer[] = ["H", "S", "D", "P"];
export const SURRENDER_ANSWERS: readonly StrategyAnswer[] = ["R", "N"];

const TEN_VALUES: readonly Rank[] = ["10", "J", "Q", "K"];

/** The chart column for an upcard: every ten-value card reads as `10`. */
export const chartDealer = (rank: Rank): string => (rank === "A" ? "A" : TEN_VALUES.includes(rank) ? "10" : rank);

/**
 * Where a two-card hand sits on the basic-strategy chart, placed exactly as
 * the engine places it: a pair on its pair row first, then soft 13 to 20,
 * then hard 8 to 17. Hands the chart does not print return null.
 */
export function chartCoordinateOf(player: readonly Card[]): { section: StrategySectionId; row: string } | null {
  const cards = [...player];
  const total = calculateHandValue(cards);
  if (isPair(cards)) {
    const value = rankValue(cards[0]);
    return { section: "pairs", row: value === 11 ? "A,A" : value === 10 ? "T,T" : `${value},${value}` };
  }
  if (isSoft(cards) && total >= 13 && total <= 20) return { section: "soft", row: `A,${total - 11}` };
  if (total >= 18 || total < 8) return null;
  return { section: "hard", row: String(total) };
}

/** Why a hand has no chart row: the chart only prints the totals where the play can change. */
export function offChartNote(player: readonly Card[]): string | undefined {
  if (chartCoordinateOf(player)) return undefined;
  return calculateHandValue([...player]) < 8 ? "Hard 5–7 always hit." : "Hard 18 and up always stand.";
}

const PAIR_WORD: Partial<Record<Rank, string>> = { A: "aces", J: "jacks", Q: "queens", K: "kings" };

/** "Hard 16", "Soft 18", "Pair of 8s", "Pair of aces". */
export function handLabel(player: readonly Card[]): string {
  const cards = [...player];
  if (isPair(cards) && cards[0].rank === cards[1].rank) return `Pair of ${PAIR_WORD[cards[0].rank] ?? `${cards[0].rank}s`}`;
  if (isPair(cards)) return "Pair of 10s";
  const total = calculateHandValue(cards);
  return `${isSoft(cards) ? "Soft" : "Hard"} ${total}`;
}

const RANK_WORD: Partial<Record<Rank, string>> = { A: "ace", J: "jack", Q: "queen", K: "king" };
const word = (rank: Rank) => RANK_WORD[rank] ?? rank;
const withArticle = (rank: Rank) => `${rank === "A" || rank === "8" ? "an" : "a"} ${word(rank)}`;

/** "Ace and 7 against a 9", for screen-reader announcements. */
export function spokenHand(player: readonly Card[], dealer: Card): string {
  const [first, ...rest] = player.map((card) => word(card.rank));
  return `${first.charAt(0).toUpperCase()}${first.slice(1)} and ${rest.join(" and ")} against ${withArticle(dealer.rank)}`;
}

/** The analytics scenario key: sorted ranks, then the upcard (`10A_v_9`). */
export const strategyScenario = (question: StrategyQuestion) =>
  `${question.player.map((card) => card.rank).sort().join("")}_v_${question.dealer.rank}`;

/** One dealt hand with its answer decided up front. */
export interface StrategyHand extends StrategyQuestion {
  askingSurrender: boolean;
  options: readonly StrategyAnswer[];
  /** Offered for muscle memory but not playable: Split on a hand that is not a pair. */
  disabled: readonly StrategyAnswer[];
  correct: StrategyAnswer;
  explanation: string;
  /**
   * The rules the answer was decided under. A surrender change in another tab
   * applies from the next hand; it never re-grades the hand on screen.
   */
  rules: BlackjackRules;
}

const withoutSurrender = (rules: BlackjackRules): BlackjackRules => ({ ...rules, lateSurrender: false, earlySurrenderVsTen: false });

/**
 * The play question is asked as though the surrender had been declined; the
 * surrender question uses the table's own rule. Wording and outcomes are the
 * drill's existing ones, so recorded mistakes read the same as before.
 */
export function resolveStrategyHand(question: StrategyQuestion, rules: BlackjackRules): StrategyHand {
  const askingSurrender = question.category === "Surrender";
  const play = getBasicStrategyDecision({ playerCards: question.player, dealerUpcard: question.dealer, rules: withoutSurrender(rules) });
  const surrender = getBasicStrategyDecision({ playerCards: question.player, dealerUpcard: question.dealer, rules });
  const surrenders = surrender.action === "R";
  const correct: StrategyAnswer = askingSurrender ? (surrenders ? "R" : "N") : play.action;
  const explanation = askingSurrender
    ? surrenders
      ? surrender.explanation
      : `Basic strategy does not give this hand up, so decline and play it out: ${play.explanation.replace(/^.*? is /, "")}`
    : play.explanation;
  return {
    ...question,
    askingSurrender,
    options: askingSurrender ? SURRENDER_ANSWERS : PLAY_ANSWERS,
    disabled: askingSurrender || isPair([...question.player]) ? [] : ["P"],
    correct,
    explanation,
    rules,
  };
}

/** The hand as recorded in a session's mistakes: `A,8 vs K`, plus ` — surrender?` on a surrender question. */
export const strategyQuestionText = (question: StrategyQuestion) =>
  `${question.player.map((card) => card.rank).join(",")} vs ${question.dealer.rank}${question.category === "Surrender" ? " — surrender?" : ""}`;

export function strategyMistake(hand: StrategyHand, chosen: StrategyAnswer): Mistake {
  return {
    question: strategyQuestionText(hand),
    userAnswer: STRATEGY_ANSWER_NAMES[chosen],
    correctAnswer: STRATEGY_ANSWER_NAMES[hand.correct],
    explanation: hand.explanation,
  };
}

/** The hand behind a recorded mistake, so "Retry mistakes" works for resumed rounds too. */
export function parseStrategyQuestion(text: string): StrategyQuestion | null {
  const match = /^([^ ]+) vs (\S+?)( — surrender\?)?$/.exec(text.trim());
  if (!match) return null;
  const ranks = match[1].split(",");
  const dealer = match[2] as Rank;
  if (ranks.length !== 2 || !ranks.every((rank) => RANKS.includes(rank as Rank)) || !RANKS.includes(dealer)) return null;
  const player: Card[] = [{ rank: ranks[0] as Rank, suit: "spades" }, { rank: ranks[1] as Rank, suit: "hearts" }];
  const category: StrategyCategory = match[3] ? "Surrender" : isPair(player) ? "Pairs" : player.some((card) => card.rank === "A") ? "Soft totals" : "Hard totals";
  return { player, dealer: { rank: dealer, suit: "diamonds" }, category };
}

export interface MiniChartRow {
  caption: string;
  /** The chart's row label, e.g. `A,7`, `T,T` or `16`. */
  rowLabel: string;
  /** One entry per chart column, `2` to `A`. `null` is a blank (no surrender). */
  cells: ReadonlyArray<{ dealer: string; action: StrategyAnswer | null }>;
  /** The column of the hand being asked. */
  current: string;
}

/**
 * The chart row a hand sits on, as the answer's picture. Every cell comes from
 * the same engine that grades the drill, applied to this hand against each
 * upcard, so the row can never disagree with the answer marked correct.
 * Off-chart hands, and surrender hands never given up, get a note instead.
 */
export function strategyChartRow(hand: StrategyHand): { row: MiniChartRow } | { note: string } {
  const coordinate = chartCoordinateOf(hand.player);
  if (!coordinate) return { note: offChartNote(hand.player)! };
  const against = (dealer: string) => ({ rank: dealer as Rank, suit: "diamonds" as const });
  const current = chartDealer(hand.dealer.rank);
  if (hand.askingSurrender) {
    const cells = CHART_DEALERS.map((dealer) => ({
      dealer,
      action: getBasicStrategyDecision({ playerCards: hand.player, dealerUpcard: against(dealer), rules: hand.rules }).action === "R" ? "R" as const : null,
    }));
    if (!cells.some((cell) => cell.action)) return { note: "This hand is never surrendered under these rules." };
    return { row: { caption: `${handLabel(hand.player)} on your surrender chart`, rowLabel: coordinate.row, cells, current } };
  }
  const cells = CHART_DEALERS.map((dealer) => ({
    dealer,
    action: getBasicStrategyDecision({ playerCards: hand.player, dealerUpcard: against(dealer), rules: withoutSurrender(hand.rules) }).action as StrategyAnswer,
  }));
  return { row: { caption: `${handLabel(hand.player)} on your basic strategy chart`, rowLabel: coordinate.row, cells, current } };
}

/** The reference-chart cell a hand links to. */
export function strategyChartCell(question: StrategyQuestion): { section: string; hand: string; dealer: string } | null {
  const coordinate = chartCoordinateOf(question.player);
  if (!coordinate) return null;
  return { section: question.category === "Surrender" ? "surrender" : coordinate.section, hand: coordinate.row, dealer: chartDealer(question.dealer.rank) };
}

/** The hand types Weak spots can lean on: surrender only when the table offers it. */
export const focusCandidates = (surrender: SurrenderRule): StrategyCategory[] =>
  STRATEGY_CATEGORIES.filter((category) => surrender !== "none" || category !== "Surrender");

export interface FocusPick {
  category: StrategyCategory;
  /** Due for review, never practised, or the lowest accuracy in history. */
  reason: "due" | "new" | "weakest";
  correct?: number;
  total?: number;
}

/**
 * What Weak spots deals more of next. Leitner-due types come first (unseen
 * ones count as due), then the lowest historical accuracy. One helper drives
 * the dealing, the Setup line and the in-round chip, so they always agree.
 */
export function pickFocusCategory({ surrender, due, seen, history }: { surrender: SurrenderRule; due: readonly string[]; seen: ReadonlySet<string>; history: CategoryTotals }): FocusPick | undefined {
  const allowed = focusCandidates(surrender);
  const dueNow = due.find((key): key is StrategyCategory => allowed.includes(key as StrategyCategory));
  if (dueNow) return { category: dueNow, reason: seen.has(dueNow) ? "due" : "new" };
  const ranked = allowed
    .map((category) => ({ category, ...(history[category] ?? { correct: 0, total: 0 }) }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => a.correct / a.total - b.correct / b.total);
  const weakest = ranked[0];
  return weakest && { category: weakest.category, reason: "weakest", correct: weakest.correct, total: weakest.total };
}

/**
 * Borderline hands, where the play turns on the upcard or the rules: soft
 * doubles, the stiff hands at their edges, and the pairs that split only
 * against some cards. Used by the "Tricky hands" mode.
 */
const TRICKY: ReadonlyArray<{ cards: readonly [Rank, Rank]; dealers: readonly Rank[] }> = [
  { cards: ["A", "2"], dealers: ["3", "4", "5"] },
  { cards: ["A", "3"], dealers: ["3", "4", "5"] },
  { cards: ["A", "4"], dealers: ["3", "4"] },
  { cards: ["A", "5"], dealers: ["3", "4"] },
  { cards: ["A", "6"], dealers: ["2", "3", "7"] },
  { cards: ["A", "7"], dealers: ["2", "3", "7", "8", "9", "10", "A"] },
  { cards: ["A", "8"], dealers: ["5", "6"] },
  { cards: ["4", "5"], dealers: ["2", "3", "7"] },
  { cards: ["4", "6"], dealers: ["9", "10", "A"] },
  { cards: ["5", "6"], dealers: ["10", "A"] },
  { cards: ["10", "2"], dealers: ["2", "3", "4", "6"] },
  { cards: ["6", "7"], dealers: ["2", "3"] },
  { cards: ["10", "6"], dealers: ["7", "8", "9", "10", "A"] },
  { cards: ["7", "8"], dealers: ["9", "10", "A"] },
  { cards: ["2", "2"], dealers: ["2", "3", "7", "8"] },
  { cards: ["3", "3"], dealers: ["2", "3", "7", "8"] },
  { cards: ["4", "4"], dealers: ["4", "5", "6"] },
  { cards: ["5", "5"], dealers: ["9", "10"] },
  { cards: ["6", "6"], dealers: ["2", "7"] },
  { cards: ["7", "7"], dealers: ["7", "8"] },
  { cards: ["9", "9"], dealers: ["6", "7", "10", "A"] },
];
const TRICKY_SURRENDER: ReadonlyArray<{ cards: readonly [Rank, Rank]; dealers: readonly Rank[] }> = [
  { cards: ["10", "4"], dealers: ["10"] },
  { cards: ["10", "5"], dealers: ["9", "10", "A"] },
  { cards: ["10", "6"], dealers: ["8", "9", "10", "A"] },
  { cards: ["9", "7"], dealers: ["9", "10", "A"] },
  { cards: ["10", "7"], dealers: ["A"] },
  { cards: ["8", "8"], dealers: ["10", "A"] },
];

const pick = <T,>(items: readonly T[], rng: () => number): T => items[Math.floor(rng() * items.length)];

function trickyQuestion(surrender: SurrenderRule, rng: () => number): StrategyQuestion {
  const asking = surrender !== "none" && rng() < 0.2;
  const entry = pick(asking ? TRICKY_SURRENDER : TRICKY, rng);
  const up = pick(entry.dealers, rng);
  const player: Card[] = [{ rank: entry.cards[0], suit: "spades" }, { rank: entry.cards[1], suit: "hearts" }];
  const category: StrategyCategory = asking ? "Surrender" : isPair(player) ? "Pairs" : player.some((card) => card.rank === "A") ? "Soft totals" : "Hard totals";
  return { player, dealer: { rank: up === "10" ? pick(TEN_VALUES, rng) : up, suit: "diamonds" }, category };
}

/**
 * The next hand for a mode. Mixed draws pairs, soft and hard totals evenly,
 * with surrender questions one time in five when the table offers them. Weak
 * spots deals its focus type about two times in three.
 */
export function drawStrategyQuestion({ mode, surrender, focus }: { mode: StrategyMode; surrender: SurrenderRule; focus?: StrategyCategory }, rng: () => number = Math.random): StrategyQuestion {
  if (mode === "tricky") return trickyQuestion(surrender, rng);
  const lean = mode === "adaptive" && focus && (focus !== "Surrender" || surrender !== "none") && rng() < 0.65 ? focus : undefined;
  const preferred = lean ?? (surrender !== "none" && rng() < 0.2 ? "Surrender" : undefined);
  return randomStrategyQuestion(preferred, rng);
}

/** A retry round: the missed hands in a fresh order, minus any surrender hands the table no longer offers. */
export function strategyRetryQueue(questions: readonly (StrategyQuestion | null)[], surrender: SurrenderRule, rng: () => number = Math.random): StrategyQuestion[] {
  return shuffled(questions.filter((question): question is StrategyQuestion => Boolean(question) && (question!.category !== "Surrender" || surrender !== "none")), rng);
}

/** Whether a saved queue item is still a well-formed hand (progress can come from another app version). */
export function isStrategyQuestion(value: unknown): value is StrategyQuestion {
  const item = value as StrategyQuestion | null;
  return Boolean(item && Array.isArray(item.player) && item.player.length === 2 && item.player.every((card) => RANKS.includes(card?.rank))
    && item.dealer && RANKS.includes(item.dealer.rank) && STRATEGY_CATEGORIES.includes(item.category));
}
