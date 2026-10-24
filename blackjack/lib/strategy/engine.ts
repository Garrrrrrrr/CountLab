/**
 * The one place a blackjack decision is made.
 *
 * Charts, drills and the full-shoe table all ask this module, so they cannot
 * teach different plays for the same hand. The order is the order a player
 * decides at the table: insurance, then surrender, then the play.
 *
 *   basic play   the audited total-dependent grids (lib/blackjack/strategyTables.ts)
 *   index play   lib/strategy/indices.ts, applied only where it changes the basic play
 *   surrender    one threshold per hand: surrender at or above it
 */
import { calculateHandValue, isPair, isSoft, rankValue } from "@/lib/blackjack/hand";
import { chartCell, chartCode, doubleAllowed, type ChartCode } from "@/lib/blackjack/strategyChart";
import type { Action, Card } from "@/lib/blackjack/types";
import { DEALERS, EARLY_SURRENDER_TEN_INDICES, INSURANCE_INDEX, LATE_SURRENDER_INDICES, PLAY_INDICES, type Dealer, type PlayIndex, type SurrenderIndex } from "./indices";
import { effectiveSurrender, toChartRules, type TableRules } from "./rules";

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
  if (total < 8) return { outside: "H" };
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
  return chartCell(toChartRules(rules), cell.section, cell.row, cell.dealer, { canSurrender: true }).action === "R";
}

/* ------------------------------------------------------------------ */
/* Index plays                                                         */
/* ------------------------------------------------------------------ */

const family = (rules: TableRules) => (rules.hitSoft17 ? "h17" : "s17");
const inFamily = (row: { only?: "h17" | "s17" }, rules: TableRules) => !row.only || row.only === family(rules);

export interface ActiveIndex extends PlayIndex {
  /** The play on the other side of the index: basic strategy for these rules. */
  basic: Resolved;
}

/**
 * The index play that applies to a cell under these rules, if any.
 *
 * A row is used only when its play differs from basic strategy here, which is
 * what lets one list serve every deck count: in double deck, where 9 v 2 is
 * already a basic double, the shoe game's "double at +1" has nothing to change.
 * Doubles that the table refuses (restricted doubling, or against a ten or ace
 * in a no-hole-card game, where a double loses to a dealer blackjack) are not
 * offered as index plays either.
 *
 * A pair that basic strategy does not split is a hard total, so it takes that
 * total's index (5,5 v 10 doubles at +4 exactly as hard 10 does). A pair that
 * is split keeps its own row: 8,8 v 10 never borrows hard 16's stand index.
 */
export function playIndex(rules: TableRules, cell: CellRef): ActiveIndex | undefined {
  const basic = basicPlay(rules, cell);
  const candidates = PLAY_INDICES.filter((row) => row.dealer === cell.dealer && inFamily(row, rules));
  let row = candidates.find((entry) => entry.hand === cell.row);
  if (!row && cell.section === "pairs" && basic.action !== "P") {
    const total = pairTotalRow(cell.row);
    row = candidates.find((entry) => entry.hand === total.row && entry.play !== "P");
  }
  if (!row || row.play === basic.action) return undefined;
  const tenOrAce = cell.dealer === "10" || cell.dealer === "A";
  if (row.play === "D") {
    if (!doubleAllowed({ doubleRule: rules.doubling }, cell.section, cell.row)) return undefined;
    if (rules.noHoleCard && tenOrAce) return undefined;
  }
  if (row.play === "P" && rules.noHoleCard && tenOrAce) return undefined;
  return { ...row, basic };
}

/** True when an index row's condition holds at this true count. */
export const indexApplies = (index: { dir: "up" | "down"; at: number }, tc: number) => (index.dir === "up" ? tc >= index.at : tc <= index.at);

/* ------------------------------------------------------------------ */
/* Surrender                                                           */
/* ------------------------------------------------------------------ */

export interface SurrenderThreshold {
  /** Surrender when the true count is at or above this. -Infinity: always. +Infinity: never. */
  at: number;
  /** Basic strategy (no count) surrenders. */
  basic: boolean;
  source?: SurrenderIndex["source"];
  /**
   * A published threshold that belongs to the shoe game: these rules' basic
   * strategy plays the hand the other way, so it cannot apply and no figure
   * for these rules is listed. Shown as a note, never used.
   */
  shoeOnly?: { at: number; source: SurrenderIndex["source"] };
}

const surrenderHand = (cell: CellRef) => cell.row;

/**
 * When a hand should be given up, as one threshold.
 *
 * The index list is checked against basic strategy for the reader's rules: a
 * threshold at or below zero must belong to a hand basic strategy surrenders,
 * and one above zero to a hand it plays. Where the two disagree (single deck,
 * whose basic strategy differs from the shoe game the indices were built for)
 * basic strategy wins and the count is not used for that hand; the published
 * figure rides along as `shoeOnly` so the chart can say why.
 */
export function surrenderRule(rules: TableRules, cell: CellRef): SurrenderThreshold {
  const rule = effectiveSurrender(rules);
  if (rule === "none" || cell.section === "soft") return { at: Infinity, basic: false };
  const basic = basicSurrenders(rules, cell);
  const lists = rule === "early" && cell.dealer === "10" ? [EARLY_SURRENDER_TEN_INDICES] : [LATE_SURRENDER_INDICES];
  const row = lists.flat().find((entry) => entry.hand === surrenderHand(cell) && entry.dealer === cell.dealer && inFamily(entry, rules));
  if (row && (row.at <= 0) === basic) return { at: row.at, basic, source: row.source };
  return { at: basic ? -Infinity : Infinity, basic, ...(row && { shoeOnly: { at: row.at, source: row.source } }) };
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
  const index = playIndex(rules, cell);
  if (!index || !indexApplies(index, tc)) return { ...basic, via: "basic" };
  if (index.play === "D" && !permissions.canDouble) return { ...basic, via: "basic" };
  if (index.play === "P" && !permissions.canSplit) return { ...basic, via: "basic" };
  // A double index keeps the cell's own fallback for a hand that cannot double.
  const fallback = index.play === "D" ? basicPlay(rules, cell, { ...permissions, canDouble: false }).action : undefined;
  return { action: index.play, fallback: fallback === "D" ? undefined : fallback, via: "index", index };
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

/** Insurance and even money: take at the index, never without a count. */
export const takeInsurance = (tc: number | undefined) => tc !== undefined && tc >= INSURANCE_INDEX.at;

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

const MINUS = "−";
/** A true count as people write it: +4, 0, −1. */
export const signedCount = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `${MINUS}${Math.abs(value)}` : "0");

/** "at +4 or higher" / "at −1 or lower". */
export const thresholdPhrase = (index: { dir: "up" | "down"; at: number }) => `at ${signedCount(index.at)} or ${index.dir === "up" ? "higher" : "lower"}`;

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
