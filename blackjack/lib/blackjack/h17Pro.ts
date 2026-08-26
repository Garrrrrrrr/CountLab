import type { DeviationAction } from "./deviations";

export type H17DeviationSet = "h17Pro" | "s17Pro";

export interface H17Deviation {
  id: string;
  set: H17DeviationSet;
  hand: string;
  dealer: string;
  index: number;
  normalAction: DeviationAction;
  deviationAction: DeviationAction;
  direction: "atOrAbove" | "atOrBelow";
  /** The chart marks this as a basic late-surrender decision, without an index. */
  always?: true;
  /** Higher-priority actions resolve overlapping surrender/stand entries. */
  priority?: number;
  /**
   * A starred stand index: the chart prints it as taking precedence over the
   * cell's surrender, but it is applied only where surrender is unavailable.
   *
   * Standing on 15 or 16 against a ten or an ace is worth about -0.53 to -0.61
   * per unit at *every* true count from -6 to +10, because a ten-rich shoe
   * gives the dealer fewer stiff hands to bust with — so it never overtakes the
   * flat -0.50 of late surrender. Measured with `priceCell` in deviationEv.ts;
   * the per-count table is in docs/reference-analysis.md. Honouring the star in
   * a late-surrender game costs about 0.2 units per 100 rounds on 16 vs 10
   * alone. Where the table offers no surrender these indices are correct and
   * valuable, and they are applied there.
   *
   * Only set where the chart surrenders the cell at *every* count. Where its
   * surrender is a count window instead, see `outsideSurrenderWindow`.
   */
  overridesSurrender?: true;
  /**
   * The chart surrenders this cell only inside a count window (16 v 9 at -1 and
   * below, 15 v 10 at 0 and below), so outside that window it plays the hand —
   * and its printed stand index is written against *that* play, not against a
   * basic strategy that surrenders the cell at every count. Without this the
   * row would never match a late-surrender game's basic action and 16 v 9 would
   * hit at +4 rather than stand, which no reading of the chart asks for.
   */
  outsideSurrenderWindow?: true;
}

type Row = readonly [hand: string, dealer: string, index: number, normal: DeviationAction, departure: DeviationAction, direction?: "atOrAbove" | "atOrBelow", overridesSurrender?: true, always?: true, priority?: number, outsideSurrenderWindow?: true];

/**
 * The Blackjack Apprenticeship H17 chart's 26 printed index cells, the three
 * soft-20 doubles this app adds to it, the chart's insurance legend
 * ("INSURANCE OR EVEN MONEY: TAKE AT 3+") and its three unconditional
 * late-surrender plays: 33 rows for 4–8 deck games.
 *
 * These are the same indices the H17 chart drill is graded against — the
 * transcription in `bjaH17Chart.ts` is the source, and a test in
 * `h17Pro.test.ts` asserts the two cannot drift apart. Cells the chart
 * leaves blank are deliberately absent, even where another chart carries an
 * index there (12 v 5, 11 v A, 8 v 5, and the 14 v 10 and 8,8 surrenders).
 *
 * Two of the chart's printed cells read backwards from the familiar Fab 4
 * indices: it surrenders 16 v 9 at -1 *and below* and 15 v 10 at 0 *and below*,
 * playing the hand above those counts. That is what the PDF prints, and it is
 * what the drill teaches, so it is what the catalog carries.
 */
const BJA_H17_CHART_ROWS: readonly Row[] = [
  ["Insurance", "A", 3, "N", "I"],
  // Pair splitting: T,T
  ["10,10", "4", 6, "S", "P"], ["10,10", "5", 5, "S", "P"], ["10,10", "6", 4, "S", "P"],
  // Soft totals: A,9 (this app's addition, see bjaH17Chart.ts), A,8 and A,6
  ["Soft 20", "4", 6, "S", "D"], ["Soft 20", "5", 5, "S", "D"], ["Soft 20", "6", 4, "S", "D"],
  ["Soft 19", "4", 3, "S", "D"], ["Soft 19", "5", 1, "S", "D"], ["Soft 19", "6", 0, "S", "D"],
  ["Soft 17", "2", 1, "H", "D"],
  // Hard totals: the stand indices for 15 and 16, starred on the chart
  ["16", "9", 4, "H", "S", "atOrAbove", undefined, undefined, 3, true], ["16", "10", 0, "R", "S", "atOrAbove", true, undefined, 3], ["16", "A", 3, "R", "S", "atOrAbove", true, undefined, 3],
  ["15", "10", 4, "H", "S", "atOrAbove", undefined, undefined, 3, true], ["15", "A", 5, "R", "S", "atOrAbove", true, undefined, 3],
  // Hard totals: standing and doubling
  ["13", "2", -1, "H", "S"], ["12", "2", 3, "H", "S"], ["12", "3", 2, "H", "S"], ["12", "4", 0, "H", "S"],
  ["10", "10", 4, "H", "D"], ["10", "A", 3, "H", "D"], ["9", "2", 1, "H", "D"], ["9", "7", 3, "H", "D"], ["8", "6", 2, "H", "D"],
  // Late surrender
  ["16", "8", 4, "H", "R", "atOrAbove", undefined, undefined, 2], ["16", "9", -1, "H", "R", "atOrBelow", undefined, undefined, 2], ["15", "9", 2, "H", "R", "atOrAbove", undefined, undefined, 2], ["15", "10", 0, "H", "R", "atOrBelow", undefined, undefined, 2], ["15", "A", -1, "H", "R", "atOrAbove", undefined, undefined, 2],
  ["17", "A", 0, "S", "R", "atOrAbove", undefined, true], ["16", "10", 0, "H", "R", "atOrAbove", undefined, true], ["16", "A", 0, "H", "R", "atOrAbove", undefined, true],
] as const;

/**
 * A row's id names the cell it plays, not its position in the table. The EV
 * ranking artifact is keyed by these, and it used to key them by position: an
 * artifact generated before a row was added or removed still resolved for every
 * lookup, silently handing each row its neighbour's measured value. Named ids
 * turn that into a miss, and `deviationRanking.test.ts` fails on it.
 */
export const deviationId = (set: H17DeviationSet, hand: string, dealer: string, deviationAction: DeviationAction) =>
  `${set}-${hand.replace(/\s+/g, "")}v${dealer}-${deviationAction}`;

export const makeDeviations = (set: H17DeviationSet, rows: readonly Row[]): H17Deviation[] => {
  const made = rows.map(
    ([hand, dealer, index, normalAction, deviationAction, direction = "atOrAbove", overridesSurrender, always, priority, outsideSurrenderWindow]): H17Deviation => ({
      id: deviationId(set, hand, dealer, deviationAction), set, hand, dealer, index, normalAction, deviationAction, direction, overridesSurrender, always, priority, outsideSurrenderWindow,
    }),
  );
  // Two rows can share a cell (a stand index and a surrender), but never a cell
  // *and* an action — that would collapse them to one entry in the artifact.
  const ids = new Set(made.map((row) => row.id));
  if (ids.size !== made.length) throw new Error(`${set}: two rows share an id`);
  return made;
};

export const H17_PRO_DEVIATIONS = makeDeviations("h17Pro", BJA_H17_CHART_ROWS);

export interface H17DeviationRules {
  dealerHitsSoft17: boolean;
  lateSurrender: boolean;
}
