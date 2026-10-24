/**
 * Hi-Lo index plays for shoe games (4–8 decks), as plain data. Every number is
 * a published one, with its source on the row; none comes from a simulation.
 *
 * Every row says exactly one thing: "play X when the true count is at or above
 * N" (`up`) or "at or below N" (`down`). There is no baseline field and no
 * precedence flag: the play it departs from is whatever basic strategy says
 * for the reader's rules, and a row whose play basic strategy already makes is
 * simply not used (that is how one list serves 1-, 2- and 4–8-deck grids).
 *
 * Surrender is kept apart as a single threshold per hand: "surrender when the
 * true count is at or above N". Surrendering a stiff only gets better as tens
 * pile up, so one number describes the whole count range.
 *
 * SOURCES, one per row:
 *   BJA   Blackjack Apprenticeship H17 deviation chart (2018), as printed.
 *         Its "0-" and "0+" mean a negative / positive running count; read as
 *         true counts those are "-1 or below" and "0 or above".
 *   I18   Schlesinger's Illustrious 18 (Blackjack Attack), S17 shoe values.
 *   Fab4  Schlesinger's Fab 4 surrender indices, S17 shoe values.
 *   Wong  Wong, Professional Blackjack: table 32 (early surrender) for ES10.
 *   S17P  The S17 Pro chart supplied with this project (provenance of the
 *         individual numbers not recorded), for S17 cells nothing above covers.
 *
 * SINGLE AND DOUBLE DECK. These are shoe figures. Where 1- or 2-deck basic
 * strategy plays a hand the other way from the shoe game (single deck hits
 * 14 v 10 under ES10, for one), a shoe threshold cannot apply; the engine
 * keeps it as a `shoeOnly` note and the chart says so, rather than inventing a
 * single-deck number. Wong's single- and double-deck tables (Professional
 * Blackjack, appendix A) are not transcribed here.
 *
 * WHY H17 AND S17 SHARE THE 7–10 COLUMNS. With a 7, 8, 9 or ten showing the
 * dealer can never hold a soft 17 (the ace would have to count 11 on top of a
 * 7 or more), so the soft-17 rule cannot change a single decision there. Any
 * two sources that disagree in those columns disagree about the same game, and
 * this list picks one value for both: the BJA chart's where it prints one,
 * since that is the chart this site's users learn from.
 */
import type { Action } from "@/lib/blackjack/types";

export type Dealer = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "A";
export const DEALERS: readonly Dealer[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

export type IndexSource = "BJA" | "I18" | "Fab4" | "Wong" | "S17P";
export type GameFamily = "h17" | "s17";

/** A count-based change to a hit, stand, double or split decision. */
export interface PlayIndex {
  /** "16" hard total, "A,7" soft hand, "T,T" pair. */
  hand: string;
  dealer: Dealer;
  play: Exclude<Action, "R">;
  dir: "up" | "down";
  at: number;
  source: IndexSource;
  /** Absent: the row applies to both H17 and S17. */
  only?: GameFamily;
}

/** "Surrender when the true count is at or above `at`." */
export interface SurrenderIndex {
  hand: string;
  dealer: Dealer;
  at: number;
  source: IndexSource;
  only?: GameFamily;
}

const up = (hand: string, dealer: Dealer, play: PlayIndex["play"], at: number, source: IndexSource, only?: GameFamily): PlayIndex => ({ hand, dealer, play, dir: "up", at, source, only });
const down = (hand: string, dealer: Dealer, play: PlayIndex["play"], at: number, source: IndexSource, only?: GameFamily): PlayIndex => ({ hand, dealer, play, dir: "down", at, source, only });

export const PLAY_INDICES: readonly PlayIndex[] = [
  // Stiffs against a strong card: stand once the shoe is rich in tens.
  up("16", "10", "S", 0, "BJA"),
  up("15", "10", "S", 4, "BJA"),
  up("16", "9", "S", 4, "BJA"),
  up("16", "A", "S", 3, "BJA", "h17"),
  up("16", "A", "S", 5, "S17P", "s17"),
  up("15", "A", "S", 5, "BJA", "h17"),

  // Twelves and thirteens against small cards.
  up("12", "2", "S", 3, "BJA"),
  up("12", "3", "S", 2, "BJA"),
  down("12", "4", "H", -1, "BJA"),
  down("12", "5", "H", -3, "I18"),
  down("12", "6", "H", -2, "I18"),
  down("13", "2", "H", -1, "BJA", "h17"),
  down("13", "2", "H", -2, "I18", "s17"),
  down("13", "3", "H", -3, "I18"),

  // Doubles.
  up("10", "10", "D", 4, "BJA"),
  up("10", "A", "D", 3, "BJA", "h17"),
  up("10", "A", "D", 4, "I18", "s17"),
  down("11", "A", "H", -2, "I18", "h17"),
  up("11", "A", "D", 1, "I18", "s17"),
  up("9", "2", "D", 1, "BJA"),
  up("9", "7", "D", 3, "BJA"),
  up("8", "6", "D", 2, "BJA"),
  up("8", "5", "D", 4, "S17P", "s17"),

  // Soft doubles and stands.
  // The BJA H17 chart stands on soft 20 at every count; the S17 Pro chart doubles it.
  up("A,9", "4", "D", 6, "S17P", "s17"),
  up("A,9", "5", "D", 5, "S17P", "s17"),
  up("A,9", "6", "D", 5, "S17P", "s17"),
  up("A,8", "4", "D", 3, "BJA"),
  up("A,8", "5", "D", 1, "BJA"),
  down("A,8", "6", "S", -1, "BJA", "h17"),
  up("A,8", "6", "D", 1, "S17P", "s17"),
  up("A,7", "A", "S", 1, "S17P", "s17"),
  up("A,6", "2", "D", 1, "BJA"),

  // Splits.
  up("T,T", "4", "P", 6, "BJA"),
  up("T,T", "5", "P", 5, "BJA"),
  up("T,T", "6", "P", 4, "BJA"),
  up("9,9", "7", "P", 3, "S17P"),
];

/** Late surrender, and the non-ten columns of early surrender. */
export const LATE_SURRENDER_INDICES: readonly SurrenderIndex[] = [
  { hand: "16", dealer: "8", at: 4, source: "BJA" },
  { hand: "16", dealer: "9", at: 0, source: "BJA" },
  { hand: "15", dealer: "9", at: 2, source: "BJA" },
  { hand: "15", dealer: "10", at: 0, source: "BJA" },
  { hand: "14", dealer: "10", at: 3, source: "Fab4" },
  // Wong: "a 7,7 you would consider surrendering is just a hard fourteen".
  { hand: "7,7", dealer: "10", at: 3, source: "Fab4" },
  { hand: "15", dealer: "A", at: -1, source: "BJA", only: "h17" },
  { hand: "15", dealer: "A", at: 1, source: "Fab4", only: "s17" },
];

/**
 * Early surrender against a ten: Wong, Professional Blackjack, table 32, ten
 * column. The soft-17 rule cannot reach this column. 8,8 at -2 is Wong's
 * no-double-after-split figure; with DAS the split is worth a little more, so
 * the true break-even sits slightly higher.
 */
export const EARLY_SURRENDER_TEN_INDICES: readonly SurrenderIndex[] = [
  { hand: "17", dealer: "10", at: 5, source: "Wong" },
  { hand: "16", dealer: "10", at: -5, source: "Wong" },
  { hand: "15", dealer: "10", at: -2, source: "Wong" },
  { hand: "14", dealer: "10", at: 0, source: "Wong" },
  { hand: "13", dealer: "10", at: 3, source: "Wong" },
  { hand: "12", dealer: "10", at: 8, source: "Wong" },
  { hand: "8,8", dealer: "10", at: -2, source: "Wong" },
  { hand: "7,7", dealer: "10", at: 0, source: "Wong" },
  { hand: "6,6", dealer: "10", at: 8, source: "Wong" },
];

/** Take insurance (and even money) at a true count of +3 or more. */
export const INSURANCE_INDEX = { at: 3, source: "BJA" as IndexSource };

export const SOURCE_NAME: Record<IndexSource, string> = {
  BJA: "Blackjack Apprenticeship H17 chart",
  I18: "Illustrious 18 (Schlesinger)",
  Fab4: "Fab 4 surrenders (Schlesinger)",
  Wong: "Wong, Professional Blackjack, table 32",
  S17P: "S17 Pro chart",
};
