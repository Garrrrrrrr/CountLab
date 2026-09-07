import type { DeviationAction } from "./deviations";
import { makeDeviations } from "./h17Pro";
import type { H17Deviation, H17DeviationSet } from "./h17Pro";

type Row = readonly [hand: string, dealer: string, index: number, normal: DeviationAction, departure: DeviationAction, direction?: "atOrAbove" | "atOrBelow", overridesSurrender?: true, always?: true, priority?: number, listedBaseline?: true];

/**
 * Hi-Lo indices for early surrender against a ten.
 *
 * Source: Stanford Wong, Professional Blackjack, table 32 "Early Surrender"
 * (p. 91), ten column, transcribed verbatim. Wong's benchmark for these numbers
 * is six decks, dealer stands on soft seventeen, no double after split, Hi-Lo,
 * and "count per deck" is the true count. His key reads "surrender if the count
 * per deck equals or exceeds the number", which is this catalog's `atOrAbove`
 * with `R` as the departure, so every row below is stored in the book's own
 * convention rather than being flipped to the downward form the chart prints
 * for cells basic strategy already surrenders. `deviationTransition` works out
 * which side of each index the play actually changes on, so nothing here has to
 * anticipate that and no off-by-one translation is involved.
 *
 * Two independent checks pin the transcription:
 *
 *  - the 8 and 9 columns of tables 32 and 33 are identical cell for cell, which
 *    they must be, since early and late surrender can only differ where the
 *    dealer can hold a natural. `earlySurrender.test.ts` asserts this catalog
 *    leaves those columns to the H17/S17 catalogs untouched.
 *  - read at a true count of zero the ten column gives exactly the published
 *    early-surrender basic strategy — surrender hard 14, 15 and 16 against a
 *    ten, including 7,7 and 8,8, and nothing else.
 *
 * The dealer's soft-17 rule does not reach the ten column (p. 89), so the H17
 * and S17 sets differ only in the id their rows carry and in the `normalAction`
 * each cell falls back to.
 *
 * One caveat, deliberately not "corrected" here: 8,8 versus a ten at -2 is a
 * no-double-after-split number, because Wong's benchmark has no double after
 * split. Where the table allows it the split is worth more, so the true index
 * sits somewhat above -2. Every other cell in the column is a plain hit or
 * stand alternative and is unaffected. Wong gives a second figure for the other
 * direction: a game where you lose the whole bet to a dealer natural, and so
 * would not split 8,8 against a ten at all, uses -5 — the same number as the
 * other sixteens.
 */
const EARLY_SURRENDER_VS_TEN_ROWS: readonly Row[] = [
  ["17", "10", 5, "S", "R", "atOrAbove", undefined, undefined, 2],
  ["16", "10", -5, "H", "R", "atOrAbove", undefined, undefined, 2],
  ["8,8", "10", -2, "P", "R", "atOrAbove", undefined, undefined, 2],
  ["15", "10", -2, "H", "R", "atOrAbove", undefined, undefined, 2],
  ["14", "10", 0, "H", "R", "atOrAbove", undefined, undefined, 2],
  ["13", "10", 3, "H", "R", "atOrAbove", undefined, undefined, 2],
  ["12", "10", 8, "H", "R", "atOrAbove", undefined, undefined, 2],
] as const;

/**
 * Ids are prefixed so they cannot collide with the late-surrender row covering
 * the same cell. `deviationRanking.generated.json` is keyed by id and was
 * measured on late-surrender profiles, so a shared id would quietly hand an
 * early-surrender row its late-surrender neighbour's EV instead of reporting
 * the cell as unmeasured, which is what it is.
 */
const withEarlySurrenderIds = (set: H17DeviationSet): H17Deviation[] =>
  makeDeviations(set, EARLY_SURRENDER_VS_TEN_ROWS).map((row) => ({ ...row, id: `es10-${row.id}` }));

export const EARLY_SURRENDER_VS_TEN: Record<H17DeviationSet, H17Deviation[]> = {
  h17Pro: withEarlySurrenderIds("h17Pro"),
  s17Pro: withEarlySurrenderIds("s17Pro"),
};

/**
 * A catalog row the early-surrender-versus-a-ten set replaces.
 *
 * Every ten-column row that decides a surrender goes, in both directions: the
 * late-surrender indices themselves, the unconditional `always` surrenders, and
 * the starred stands, whose `normalAction` is the cell's surrender. Leaving any
 * of them in place would let a late-surrender threshold compete with the early
 * one on the same cell.
 */
export const supersededByEarlySurrenderVsTen = (row: { dealer: string; normalAction: DeviationAction; deviationAction: DeviationAction }) =>
  row.dealer === "10" && (row.normalAction === "R" || row.deviationAction === "R");
