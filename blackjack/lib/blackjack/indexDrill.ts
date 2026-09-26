import {
  DEVIATION_ACTION_NAMES,
  deviationHandRanks,
  deviationSentence,
  deviationTrainingRows,
  type Deviation,
  type DeviationAction,
  type DeviationTransition,
} from "./deviations";
import { isPair } from "./hand";
import { signed } from "./hiLo";
import type { Card, Rank } from "./types";
import { shuffled, type CategoryTotals } from "../statistics/drillRound";
import type { Mistake, SurrenderRule } from "../statistics/storage";

/**
 * The index-play (deviations) drill's questions, answers and explanations,
 * outside the component so the copy and the pictures are unit-tested against
 * the same transitions the reference chart prints.
 */

/** A play question (H/S/D/P), a surrender question (R/N) or insurance (I/N). */
export type IndexKind = "play" | "surrender" | "insurance";

export interface IndexRow {
  row: Deviation;
  transition: DeviationTransition;
  kind: IndexKind;
}

export interface IndexRules {
  decks: number;
  dealerHitsSoft17: boolean;
  surrender: SurrenderRule;
}

/**
 * Play rows and surrender rows, drawn separately exactly as the drill always
 * has. Play rows come from a no-surrender reading, which is what brings the
 * starred stand indices (16 v 10 at 0, 15 v 10 at +4) in; surrender rows are
 * added when the table offers surrender, following early surrender vs 10.
 */
export function indexTrainingRows({ decks, dealerHitsSoft17, surrender }: IndexRules): IndexRow[] {
  const play = deviationTrainingRows({ dealerHitsSoft17, lateSurrender: false }, decks);
  const surrenderRows = surrender === "none"
    ? []
    : deviationTrainingRows({ dealerHitsSoft17, lateSurrender: true, earlySurrenderVsTen: surrender === "early" }, decks)
      .filter(({ transition }) => transition.departure === "R" || transition.baseline === "R");
  return [...play, ...surrenderRows].map((entry) => ({
    ...entry,
    kind: entry.row.hand === "Insurance" ? "insurance" : entry.transition.departure === "R" || entry.transition.baseline === "R" ? "surrender" : "play",
  }));
}

/** The session category a row is scored under: `16 vs 10`, or `Insurance`. */
export const indexCategory = (row: Pick<Deviation, "hand" | "dealer">) => (row.hand === "Insurance" ? "Insurance" : `${row.hand} vs ${row.dealer}`);

/** Near the index so both sides of the threshold come up; `always` rows draw from the practical range. */
export function drawTrueCount(row: Pick<Deviation, "index" | "always">, rng: () => number = Math.random): number {
  if (row.always) return Math.floor(rng() * 12) - 4;
  return row.index + Math.floor(rng() * 5) - 2;
}

/** The answer names the buttons show. "N" declines whatever the question offered. */
export function indexAnswerName(action: DeviationAction, kind: IndexKind): string {
  if (kind === "insurance") return action === "I" ? "Insurance" : "No insurance";
  if (kind === "surrender") return action === "R" ? "Surrender" : "Play it out";
  return DEVIATION_ACTION_NAMES[action];
}

/** One dealt question with its answer decided up front. */
export interface IndexHand {
  hand: string;
  dealer: string;
  kind: IndexKind;
  tc: number;
  /** Running count: three decks are left, so RC = TC x 3. */
  rc: number;
  index: number;
  always: boolean;
  atOrBelow: boolean;
  baseline: DeviationAction;
  departure: DeviationAction;
  departureApplies: boolean;
  /** The correct button: R or N on a surrender question. */
  correct: DeviationAction;
  options: readonly DeviationAction[];
  disabled: readonly DeviationAction[];
  /** The catalog row's instruction, as recorded in mistakes. */
  sentence: string;
  player: Card[];
  dealerCard: Card;
}

export function resolveIndexHand({ row, transition, kind }: IndexRow, tc: number): IndexHand {
  const departureApplies = row.always === true || (transition.atOrBelow ? tc <= row.index : tc >= row.index);
  const resolved = departureApplies ? transition.departure : transition.baseline;
  const [first, second] = deviationHandRanks(row.hand);
  const player: Card[] = [{ rank: first, suit: "spades" }, { rank: second, suit: "hearts" }];
  return {
    hand: row.hand,
    dealer: row.dealer,
    kind,
    tc,
    rc: tc * 3,
    index: row.index,
    always: row.always === true,
    atOrBelow: transition.atOrBelow,
    baseline: transition.baseline,
    departure: transition.departure,
    departureApplies,
    correct: kind === "surrender" ? (resolved === "R" ? "R" : "N") : resolved,
    options: kind === "insurance" ? ["I", "N"] : kind === "surrender" ? ["R", "N"] : ["H", "S", "D", "P"],
    disabled: kind === "play" && !isPair(player) ? ["P"] : [],
    sentence: deviationSentence(row, transition),
    player,
    dealerCard: { rank: row.dealer as Rank, suit: "diamonds" },
  };
}

export function indexMistake(hand: IndexHand, chosen: DeviationAction): Mistake {
  return {
    question: `${hand.hand} vs ${hand.dealer} at TC ${signed(hand.tc)}`,
    userAnswer: indexAnswerName(chosen, hand.kind),
    correctAnswer: indexAnswerName(hand.correct, hand.kind),
    explanation: hand.sentence,
  };
}

/** A signed count for reading: a real minus sign, and a plus on positives. */
export const countText = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0");

export interface IndexSegment {
  from: number;
  to: number;
  action: DeviationAction;
}

/** Which play applies over which counts, for the number line. Integer counts; the ends are open. */
export function indexSegments(transition: Pick<DeviationTransition, "baseline" | "departure" | "atOrBelow">, index: number, always = false): IndexSegment[] {
  if (always) return [{ from: -Infinity, to: Infinity, action: transition.departure }];
  if (transition.atOrBelow) {
    return [
      { from: -Infinity, to: index, action: transition.departure },
      { from: index + 1, to: Infinity, action: transition.baseline },
    ];
  }
  return [
    { from: -Infinity, to: index - 1, action: transition.baseline },
    { from: index, to: Infinity, action: transition.departure },
  ];
}

/** The number line's range: the usual −5 to +10, widened to keep the index and the count on the scale. */
export const indexDomain = (index: number, tc: number) => ({
  min: Math.min(-5, index - 3, tc - 1),
  max: Math.max(10, index + 3, tc + 1),
});

/** "Hit below +4 · Stand at +4 or higher". */
export function indexRuleText(hand: IndexHand): string {
  const base = indexAnswerName(hand.baseline, hand.kind), departure = indexAnswerName(hand.departure, hand.kind);
  if (hand.always) return `${departure} at any count`;
  const index = countText(hand.index);
  return hand.atOrBelow
    ? `${departure} at ${index} or lower · ${base} above ${index}`
    : `${base} below ${index} · ${departure} at ${index} or higher`;
}

/** The number line for a screen reader: "Hit below true count +4, stand at +4 or higher. This count: +6." */
export function indexLineLabel(hand: IndexHand): string {
  const base = indexAnswerName(hand.baseline, hand.kind), departure = indexAnswerName(hand.departure, hand.kind);
  const index = countText(hand.index);
  const rule = hand.always
    ? `${departure} at any true count`
    : hand.atOrBelow
      ? `${departure} at true count ${index} or lower, ${base.toLowerCase()} above ${index}`
      : `${base} below true count ${index}, ${departure.toLowerCase()} at ${index} or higher`;
  return `${rule}. This count: ${countText(hand.tc)}.`;
}

/**
 * Why this count gives this answer, in the direction the index runs. Actions
 * are named as the buttons name them, so a surrender row says "Play it out"
 * rather than the hit or stand behind it.
 */
export function indexReasoning(hand: IndexHand): string {
  const base = indexAnswerName(hand.baseline, hand.kind), departure = indexAnswerName(hand.departure, hand.kind);
  if (hand.always) return `This play does not depend on the count: ${departure.toLowerCase()} whenever the table offers it.`;
  const tc = countText(hand.tc), index = countText(hand.index);
  if (hand.departureApplies) {
    return `At ${tc}, which is at or ${hand.atOrBelow ? "below" : "above"} ${index}, the play changes to ${departure}.`;
  }
  return `At ${tc}, ${hand.atOrBelow ? "above" : "below"} the index ${index}, basic strategy stands: ${base}.`;
}

/** What the drill queues (retry rounds and exam focus) and saves in progress. */
export interface IndexQueueItem {
  hand: string;
  dealer: string;
  kind: IndexKind;
  tc: number;
}

export const findIndexRow = (rows: readonly IndexRow[], item: Pick<IndexQueueItem, "hand" | "dealer" | "kind">) =>
  rows.find((entry) => entry.row.hand === item.hand && entry.row.dealer === item.dealer && entry.kind === item.kind);

/** Queue items still playable under the current rules (surrender can be switched off in another tab). */
export const playableQueue = (queue: readonly IndexQueueItem[] | undefined, rows: readonly IndexRow[]) =>
  (queue ?? []).filter((item) => item && typeof item.tc === "number" && findIndexRow(rows, item));

/**
 * The rows an exam or weak-spot hand-off names. The exam labels insurance
 * "Insurance vs A", and one `16 vs 10` names both the play and the surrender
 * row, so every matching kind is returned.
 */
export function focusRows(category: string, rows: readonly IndexRow[]): IndexRow[] {
  const wanted = /^insurance(\s+vs\s+a)?$/i.test(category.trim()) ? "Insurance" : category.trim();
  return rows.filter((entry) => indexCategory(entry.row) === wanted);
}

/**
 * Hands that test a focused play around its index: one count below, at and
 * above it, shuffled, at most six. Unconditional rows need only one hand.
 */
export function focusQueue(rows: readonly IndexRow[], rng: () => number = Math.random): IndexQueueItem[] {
  const items = rows.flatMap(({ row, kind }) => (row.always ? [drawTrueCount(row, rng)] : [row.index - 1, row.index, row.index + 1])
    .map((tc) => ({ hand: row.hand, dealer: row.dealer, kind, tc })));
  return shuffled(items, rng).slice(0, 6);
}

/** The play behind a recorded mistake, so retry works after a reload too. */
export function parseIndexMistake(mistake: Mistake): IndexQueueItem | null {
  const match = /^(.+) vs (\S+) at TC ([+-]?\d+)$/.exec(mistake.question.trim());
  if (!match) return null;
  const names = [mistake.userAnswer, mistake.correctAnswer];
  const kind: IndexKind = match[1] === "Insurance" ? "insurance" : names.some((name) => name === "Surrender" || name === "Play it out") ? "surrender" : "play";
  return { hand: match[1], dealer: match[2], kind, tc: Number(match[3]) };
}

/** A retry round: the missed plays in a fresh order, each at a new count near its index. */
export function indexRetryQueue(mistakes: readonly Mistake[], rows: readonly IndexRow[], rng: () => number = Math.random): IndexQueueItem[] {
  const items = mistakes.flatMap((mistake) => {
    const parsed = parseIndexMistake(mistake);
    const entry = parsed && findIndexRow(rows, parsed);
    return entry ? [{ hand: entry.row.hand, dealer: entry.row.dealer, kind: entry.kind, tc: drawTrueCount(entry.row, rng) }] : [];
  });
  return shuffled(items, rng);
}

/** How strongly "Most missed" leans on a play: its smoothed miss rate (unseen plays sit at one half). */
export const missWeight = (totals?: { correct: number; total: number }) =>
  totals ? (totals.total - totals.correct + 1) / (totals.total + 2) : 0.5;

export type IndexMode = "standard" | "adaptive";

/**
 * The next row. "All index plays" draws uniformly; "Most missed" draws two
 * times in three by miss rate, so plays you get wrong come back sooner while
 * the rest still appear.
 */
export function pickIndexRow(rows: readonly IndexRow[], mode: IndexMode, history: CategoryTotals, rng: () => number = Math.random): IndexRow {
  if (mode === "adaptive" && rng() < 0.65) {
    const weights = rows.map((entry) => missWeight(history[indexCategory(entry.row)]));
    let target = rng() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < rows.length; index += 1) {
      target -= weights[index];
      if (target < 0) return rows[index];
    }
  }
  return rows[Math.floor(rng() * rows.length)];
}

/** The play with the lowest accuracy among those tried three or more times under these rules. */
export function mostMissed(rows: readonly IndexRow[], history: CategoryTotals) {
  const categories = new Set(rows.map((entry) => indexCategory(entry.row)));
  return [...categories]
    .map((category) => ({ category, ...(history[category] ?? { correct: 0, total: 0 }) }))
    .filter((entry) => entry.total >= 3 && entry.correct < entry.total)
    .sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total)[0];
}

/** The deviation-chart cell for a play, as the reference chart labels its rows. */
export function indexChartCell(hand: Pick<IndexHand, "hand" | "dealer" | "kind">): { section: string; hand: string; dealer: string } | null {
  if (hand.kind === "insurance") return null;
  const soft = /^Soft (\d{1,2})$/.exec(hand.hand);
  const pair = /^(A|\d{1,2}),(A|\d{1,2})$/.exec(hand.hand);
  const section = hand.kind === "surrender" ? "surrender" : soft ? "soft" : pair ? "pairs" : "hard";
  const row = soft ? `A,${Number(soft[1]) - 11}` : pair && pair[1] === "10" ? "T,T" : hand.hand;
  return { section, hand: row, dealer: hand.dealer };
}

const RANK_WORD: Partial<Record<string, string>> = { A: "ace", J: "jack", Q: "queen", K: "king" };
const spokenCount = (value: number) => (value > 0 ? `plus ${value}` : value < 0 ? `minus ${Math.abs(value)}` : "zero");

/** "16 against a 10. True count plus 3." for screen-reader announcements. */
export function spokenIndexHand(hand: IndexHand): string {
  const dealer = RANK_WORD[hand.dealer] ?? hand.dealer;
  const article = hand.dealer === "A" || hand.dealer === "8" ? "an" : "a";
  const what = hand.kind === "insurance" ? "Insurance: the dealer shows an ace" : `${hand.hand} against ${article} ${dealer}`;
  return `${what}. True count ${spokenCount(hand.tc)}.`;
}
