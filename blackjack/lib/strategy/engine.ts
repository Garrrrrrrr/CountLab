/**
 * The one place a blackjack decision is made.
 *
 * Charts, drills and the full-shoe table all ask this module, so they cannot
 * teach different plays for the same hand. The order is the order a player
 * decides at the table: insurance, then surrender, then the play.
 *
 *   no count     basic strategy: the audited total-dependent grids
 *                (lib/blackjack/strategyTables.ts)
 *   with a count Stanford Wong's High-Low strategy numbers (wong.ts), read
 *                the way he lays them out: surrender, then split, then
 *                double, then hit or stand
 */
import { calculateHandValue, isPair, isSoft, rankValue } from "@/lib/blackjack/hand";
import { chartCell, chartCode, doubleAllowed, type ChartCode } from "@/lib/blackjack/strategyChart";
import type { Action, Card } from "@/lib/blackjack/types";
import { DEALERS, type Dealer, type IndexSource, type PlayIndex } from "./indices";
import { effectiveSurrender, toChartRules, type TableRules } from "./rules";
import { insuranceGate, noHoleCardDouble, noHoleCardSplit, passes, splits, surrenderGate, WONG_RANGE, wongTable, type Gate, type SplitGate, type Sourced } from "./wong";

export type Section = "hard" | "soft" | "pairs";
export interface CellRef { section: Section; row: string; dealer: Dealer }

export interface Permissions {
  /** Two cards, and doubling allowed for this hand (some tables refuse after a split). */
  canDouble: boolean;
  /** A pair the table will still let you split. */
  canSplit: boolean;
  /** An original two-card hand, before any split, at a table that offers surrender. */
  canSurrender: boolean;
}

const TWO_CARD: Permissions = { canDouble: true, canSplit: true, canSurrender: true };

export const ACTION_NAMES: Record<Action, string> = { H: "Hit", S: "Stand", D: "Double", P: "Split", R: "Surrender" };

/* ------------------------------------------------------------------ */
/* Where a hand sits on the chart                                      */
/* ------------------------------------------------------------------ */

/** The hard row a pair is played on when it is not split. */
export function pairTotalRow(row: string): { section: Section; row: string } {
  if (row === "A,A") return { section: "soft", row: "A,A" };
  const value = row === "T,T" ? 10 : Number(row.split(",")[0]);
  return { section: "hard", row: String(value * 2) };
}

/** Grid coordinates for a two-or-more-card hand. Returns `outside` for totals the grid does not print. */
export function locateHand(cards: Card[], canSplit: boolean): { section: Section; row: string } | { outside: "H" | "S" } {
  if (canSplit && cards.length === 2 && isPair(cards)) {
    const value = rankValue(cards[0]);
    return { section: "pairs", row: value === 11 ? "A,A" : value === 10 ? "T,T" : `${value},${value}` };
  }
  const total = calculateHandValue(cards);
  if (isSoft(cards) && total >= 13 && total <= 20) return { section: "soft", row: `A,${total - 11}` };
  // Soft 12 (an unsplit A,A) cannot bust with one card, so it always draws.
  if (isSoft(cards) && total === 12) return { outside: "H" };
  if (total >= 18) return { outside: "S" };
  // Hard 5-7 sit below the printed chart, but Wong has doubles for them at high counts.
  if (total < 5) return { outside: "H" };
  return { section: "hard", row: String(total) };
}

export const dealerOf = (card: Card): Dealer => {
  const value = rankValue(card);
  return value === 11 ? "A" : (String(value) as Dealer);
};

/* ------------------------------------------------------------------ */
/* Basic strategy                                                      */
/* ------------------------------------------------------------------ */

export interface Resolved { action: Action; fallback?: Action }

/**
 * The basic-strategy play for a cell, with surrender left out.
 *
 * Surrender is answered separately (see `surrenderRule`), so this is the play
 * a hand gets when it is not surrendered: what the hard, soft and pair tables
 * print, and what a hand that has drawn or split must do.
 */
export function basicPlay(rules: TableRules, cell: CellRef, permissions: Permissions = TWO_CARD): Resolved {
  if (cell.section === "soft" && cell.row === "A,A") return { action: "H" };
  // Below the chart: nothing to do but draw.
  if (cell.section === "hard" && Number(cell.row) < 8) return { action: "H" };
  const chart = toChartRules(rules);
  const resolved = chartCell(chart, cell.section, cell.row, cell.dealer, {
    canDouble: permissions.canDouble,
    canSplit: cell.section === "pairs" && permissions.canSplit,
    canSurrender: false,
  });
  return { action: resolved.action, fallback: resolved.fallback };
}

/** The printed grid code, for the rare caller that needs the raw composite ("Ds", "Rh"). */
export const gridCode = (rules: TableRules, cell: CellRef): ChartCode => chartCode(toChartRules(rules), cell.section, cell.row, cell.dealer);

/** Whether basic strategy gives this two-card hand up. Soft hands never surrender. */
export function basicSurrenders(rules: TableRules, cell: CellRef): boolean {
  if (effectiveSurrender(rules) === "none" || cell.section === "soft") return false;
  if (cell.section === "hard" && Number(cell.row) < 8) return false;
  return chartCell(toChartRules(rules), cell.section, cell.row, cell.dealer, { canSurrender: true }).action === "R";
}

/* ------------------------------------------------------------------ */
/* Wong's play, with a count                                           */
/* ------------------------------------------------------------------ */

/** The appendix table these rules read (A1-A4). */
export const wongSource = (rules: TableRules): IndexSource => wongTable(rules).source;

const tenOrAce = (dealer: Dealer): dealer is "10" | "A" => dealer === "10" || dealer === "A";

/** `pair` is an unsplit pair's own row ("5,5", "4,4"), which Wong prints apart from the total. */
function doubleGate(rules: TableRules, section: "hard" | "soft", row: string, dealer: Dealer, pair?: string): Sourced<Gate> {
  const table = wongTable(rules);
  if (!doubleAllowed({ doubleRule: rules.doubling }, section, row)) return { value: "never", source: table.source };
  if (rules.noHoleCard && tenOrAce(dealer)) return noHoleCardDouble(rules, row, dealer);
  const own = pair ? table.pair.double.get(pair)?.[dealer] : undefined;
  return { value: own ?? table.double.get(row)?.[dealer] ?? "never", source: table.source };
}

function splitGate(rules: TableRules, row: string, dealer: Dealer): Sourced<SplitGate> {
  const table = wongTable(rules);
  if (rules.noHoleCard && tenOrAce(dealer)) return noHoleCardSplit(rules, row, dealer);
  return { value: (rules.das ? table.split.das : table.split.noDas).get(row)?.[dealer] ?? { from: "never" }, source: table.source };
}

/** Wong's hit/stand rows: hard 12-17 and soft 18 by number; soft 19+ and hard 18+ stand; everything else draws. */
function stands(rules: TableRules, section: "hard" | "soft", row: string, dealer: Dealer, tc: number, pair?: string): boolean {
  const table = wongTable(rules);
  const own = pair ? table.pair.stand.get(pair)?.[dealer] : undefined;
  if (own !== undefined) return passes(own, tc);
  if (section === "soft") return row === "A,9" || row === "A,8" || (row === "A,7" && passes(table.stand.get("A,7")![dealer], tc));
  const total = Number(row);
  return total >= 18 || (total >= 12 && passes(table.stand.get(row)![dealer], tc));
}

/**
 * Wong's play for a hand at a true count, surrender aside. The layers are his
 * (p. 37): split, then double, then hit or stand, each read from its own rows
 * of the appendix table for these rules.
 */
export function wongPlay(rules: TableRules, cell: CellRef, tc: number, permissions: Permissions = TWO_CARD): Resolved & { source: IndexSource } {
  const source = wongTable(rules).source;
  if (cell.section === "pairs") {
    if (permissions.canSplit) {
      // Without DAS, doubling 8 beats splitting 4-4 at every count; the no-DAS
      // 4-4 numbers are for a table that will not let you double 8 (p. 270).
      const doublesEight = cell.row === "4,4" && !rules.das && permissions.canDouble && doubleAllowed({ doubleRule: rules.doubling }, "hard", "8");
      if (!doublesEight) {
        const rule = splitGate(rules, cell.row, cell.dealer);
        if (splits(rule.value, tc)) return { action: "P", source: rule.source };
      }
    }
    if (cell.row === "A,A") return { action: "H", source };
    // Not split: played as its total, but by the pair's own two-card rows where Wong prints them.
    return playTotal(rules, { ...pairTotalRow(cell.row), dealer: cell.dealer }, tc, permissions, cell.row);
  }
  if (cell.section === "soft" && cell.row === "A,A") return { action: "H", source };
  return playTotal(rules, cell, tc, permissions);
}

function playTotal(rules: TableRules, cell: CellRef, tc: number, permissions: Permissions, pair?: string): Resolved & { source: IndexSource } {
  const section = cell.section as "hard" | "soft";
  const play: Action = stands(rules, section, cell.row, cell.dealer, tc, pair) ? "S" : "H";
  if (permissions.canDouble) {
    const rule = doubleGate(rules, section, cell.row, cell.dealer, pair);
    if (passes(rule.value, tc)) return { action: "D", fallback: play, source: rule.source };
  }
  return { action: play, source: wongTable(rules).source };
}

/** Counts past ±10 all read the same (see `gate`), so these two ends stand for "−11 or lower" and "+11 or higher". */
const LOW = -WONG_RANGE - 1;
const HIGH = WONG_RANGE + 1;

interface PlaySegment { from: number; to: number; action: Action; source: IndexSource }

function wongLadder(rules: TableRules, cell: CellRef, permissions: Permissions): PlaySegment[] {
  const segments: PlaySegment[] = [];
  for (let tc = LOW; tc <= HIGH; tc++) {
    const play = wongPlay(rules, cell, tc, permissions);
    const last = segments[segments.length - 1];
    if (last && last.action === play.action) last.to = tc;
    else segments.push({ from: tc, to: tc, action: play.action, source: play.source });
  }
  return segments;
}

export interface ActiveIndex extends PlayIndex {
  /** Basic strategy for the same hand, the play with no count. */
  basic: Resolved;
}

/**
 * A run of the ladder as an index: "from here up" or, for a run that starts
 * below −10, "from here down". A run that covers every count (Wong's play
 * never matches basic strategy, as when two-deck basic strategy splits 6,6 v 7
 * and his multiple-deck numbers never do) is `at: -Infinity`: at every count.
 */
function asIndex(cell: CellRef, segment: PlaySegment, basic: Resolved): ActiveIndex {
  if (segment.from === LOW && segment.to === HIGH) return { hand: cell.row, dealer: cell.dealer, play: segment.action as PlayIndex["play"], dir: "up", at: -Infinity, source: segment.source, basic };
  const down = segment.from === LOW;
  return { hand: cell.row, dealer: cell.dealer, play: segment.action as PlayIndex["play"], dir: down ? "down" : "up", at: down ? segment.to : segment.from, source: segment.source, basic };
}

/**
 * The count-based change to basic strategy that a chart cell prints, if any:
 * Wong's play wherever it differs from basic strategy, as one threshold. When
 * the count changes the play twice inside −10…+10 the change nearest zero is
 * the one printed; the cell's count ladder shows the rest.
 *
 * A pair that is not split is played as its total, so its index is the total's
 * (5,5 v 10 doubles at +4 exactly as hard 10 does).
 */
export function playIndex(rules: TableRules, cell: CellRef): ActiveIndex | undefined {
  const basic = basicPlay(rules, cell);
  const distance = (segment: PlaySegment) => (segment.from > 0 ? segment.from : segment.to < 0 ? -segment.to : 0);
  const changed = wongLadder(rules, cell, TWO_CARD)
    .filter((segment) => segment.action !== basic.action)
    .sort((a, b) => distance(a) - distance(b) || b.from - a.from);
  return changed.length ? asIndex(cell, changed[0], basic) : undefined;
}

/** The index behind Wong's play at this count, when it is not the basic play. */
function indexAt(rules: TableRules, cell: CellRef, tc: number, permissions: Permissions): ActiveIndex {
  const at = Math.max(LOW, Math.min(HIGH, tc));
  const segment = wongLadder(rules, cell, permissions).find((run) => run.from <= at && at <= run.to)!;
  return asIndex(cell, segment, basicPlay(rules, cell, permissions));
}

/** True when an index row's condition holds at this true count. */
export const indexApplies = (index: { dir: "up" | "down"; at: number }, tc: number) => (index.dir === "up" ? tc >= index.at : tc <= index.at);

/* ------------------------------------------------------------------ */
/* Surrender                                                           */
/* ------------------------------------------------------------------ */

export interface SurrenderThreshold {
  /** With a count: surrender at this true count or higher. -Infinity: always. +Infinity: never. */
  at: number;
  /** Basic strategy (no count) surrenders. */
  basic: boolean;
  source?: IndexSource;
}

/**
 * When a two-card hand should be given up. `basic` is the play with no count;
 * `at` is Wong's number for these rules (tables 32 and 33, or the one-deck
 * appendix), read across −10…+10 like every other number.
 */
export function surrenderRule(rules: TableRules, cell: CellRef): SurrenderThreshold {
  const rule = effectiveSurrender(rules);
  if (rule === "none" || cell.section === "soft") return { at: Infinity, basic: false };
  const basic = basicSurrenders(rules, cell);
  const printed = surrenderGate(rules, rule === "early", cell.row, cell.dealer);
  if (!printed) return { at: Infinity, basic };
  const at = passes(printed.value, LOW) ? -Infinity : passes(printed.value, HIGH) ? (printed.value as number) : Infinity;
  return { at, basic, source: printed.source };
}

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

export interface Decision extends Resolved {
  /** What decided it, for feedback copy and chart highlighting. */
  via: "basic" | "index" | "surrender" | "surrender-index";
  /** The index row that changed the play, when one did. */
  index?: ActiveIndex;
  surrender?: SurrenderThreshold;
}

/**
 * The play for a chart cell at a true count. Pass `tc: undefined` for basic
 * strategy with no count at all.
 */
export function cellDecision(rules: TableRules, cell: CellRef, tc: number | undefined, permissions: Permissions = TWO_CARD): Decision {
  if (permissions.canSurrender && cell.section !== "soft") {
    const surrender = surrenderRule(rules, cell);
    const surrenders = tc === undefined ? surrender.basic : tc >= surrender.at;
    if (surrenders) {
      const fallback = cellDecision(rules, cell, tc, { ...permissions, canSurrender: false });
      return { action: "R", fallback: fallback.action, via: surrender.basic ? "surrender" : "surrender-index", surrender };
    }
  }
  const basic = basicPlay(rules, cell, permissions);
  if (tc === undefined) return { ...basic, via: "basic" };
  const play = wongPlay(rules, cell, tc, permissions);
  if (play.action === basic.action) return { action: play.action, fallback: play.fallback, via: "basic" };
  return { action: play.action, fallback: play.fallback, via: "index", index: indexAt(rules, cell, tc, permissions) };
}

export interface HandQuestion {
  cards: Card[];
  upcard: Card;
  rules: TableRules;
  /** The rounded true count, or undefined for basic strategy. */
  tc?: number;
  /** Defaults: double on two cards, split any pair, surrender any original two-card hand. */
  canDouble?: boolean;
  canSplit?: boolean;
  canSurrender?: boolean;
}

/** The play for a live hand of any size. */
export function decideHand({ cards, upcard, rules, tc, canDouble, canSplit, canSurrender }: HandQuestion): Decision & { cell?: CellRef } {
  const two = cards.length === 2;
  const permissions: Permissions = {
    canDouble: (canDouble ?? true) && two,
    canSplit: (canSplit ?? true) && two,
    canSurrender: (canSurrender ?? true) && two && effectiveSurrender(rules) !== "none",
  };
  const dealer = dealerOf(upcard);
  const located = locateHand(cards, permissions.canSplit);
  if ("outside" in located) return { action: located.outside, via: "basic" };
  const cell = { ...located, dealer };
  return { ...cellDecision(rules, cell, tc, permissions), cell };
}

/** Insurance and even money: take at Wong's number for the deck count (table 11), never without a count. */
export const insuranceAt = (rules: Pick<TableRules, "decks">) => insuranceGate(rules.decks).value;
export const takeInsurance = (rules: Pick<TableRules, "decks">, tc: number | undefined) => tc !== undefined && tc >= insuranceAt(rules);

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

const MINUS = "−";
/** A true count as people write it: +4, 0, −1. */
export const signedCount = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `${MINUS}${Math.abs(value)}` : "0");

/** "at +4 or higher" / "at −1 or lower" / "at every count". */
export const thresholdPhrase = (index: { dir: "up" | "down"; at: number }) => (Number.isFinite(index.at) ? `at ${signedCount(index.at)} or ${index.dir === "up" ? "higher" : "lower"}` : "at every count");

/** "Hard 16", "Soft 18 (A,7)", "Pair of 8s". */
export function handLabel(section: Section, row: string): string {
  if (section === "hard") return `Hard ${row}`;
  if (section === "soft") return row === "A,A" ? "Soft 12 (A,A)" : `Soft ${11 + Number(row.slice(2))} (${row})`;
  if (row === "A,A") return "Pair of aces";
  if (row === "T,T") return "Pair of tens";
  return `Pair of ${row.split(",")[0]}s`;
}

export const dealerLabel = (dealer: Dealer) => (dealer === "A" ? "an ace" : dealer === "8" ? "an 8" : `a ${dealer}`);

/** One sentence for feedback: "Hard 16 vs a 10: stand at +0 or higher, otherwise hit." */
export function explainDecision(cell: CellRef, decision: Decision, tc?: number): string {
  const hand = `${handLabel(cell.section, cell.row)} vs ${dealerLabel(cell.dealer)}`;
  const name = (action: Action) => ACTION_NAMES[action].toLowerCase();
  if (decision.via === "surrender") return `${hand}: surrender is basic strategy${decision.surrender && Number.isFinite(decision.surrender.at) ? ` until the count falls below ${signedCount(decision.surrender.at)}` : ""}. If you cannot surrender, ${name(decision.fallback ?? "H")}.`;
  if (decision.via === "surrender-index") return `${hand}: surrender ${thresholdPhrase({ dir: "up", at: decision.surrender!.at })}${tc !== undefined ? ` (the count is ${signedCount(tc)})` : ""}. Otherwise ${name(decision.fallback ?? "H")}.`;
  if (decision.via === "index" && decision.index) return `${hand}: ${name(decision.index.play)} ${thresholdPhrase(decision.index)}${tc !== undefined ? ` (the count is ${signedCount(tc)})` : ""}; basic strategy is ${name(decision.index.basic.action)}.`;
  const fallback = decision.fallback ? `, or ${name(decision.fallback)} if you can't ${name(decision.action)}` : "";
  return `${hand}: ${name(decision.action)}${fallback}.`;
}

export { DEALERS };
export type { Dealer };
