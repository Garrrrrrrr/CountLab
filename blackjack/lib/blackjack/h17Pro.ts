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
   * Set on every hard-total stand index whose cell the chart also surrenders,
   * whether that surrender is unconditional (16 v 10) or indexed (16 v 9,
   * which surrenders from TC 0 up — well below its printed 4+ stand).
   */
  overridesSurrender?: true;
  /** The listed normal action overrides basic strategy on the other side of a new threshold. */
  listedBaseline?: true;
}

type Row = readonly [hand: string, dealer: string, index: number, normal: DeviationAction, departure: DeviationAction, direction?: "atOrAbove" | "atOrBelow", overridesSurrender?: true, always?: true, priority?: number, listedBaseline?: true];

/**
 * The Blackjack Apprenticeship H17 chart's printed index cells, the house
 * additions this app makes to them, the chart's insurance legend ("INSURANCE OR
 * EVEN MONEY: TAKE AT 3+") and its three unconditional late-surrender plays:
 * 39 rows for 4–8 deck games.
 *
 * These are the same indices the H17 chart drill is graded against — the
 * transcription in `bjaH17Chart.ts` is the source, its docstring lists every
 * addition, and a test in `h17Pro.test.ts` asserts the two cannot drift apart.
 * Hard 8 v 5 and the 8,8 surrenders stay absent: the chart leaves them blank
 * and this catalog does not add them back.
 *
 * The chart's legend is what fixes each cell's direction: "Red Numbers indicate
 * the index that the true count must meet to deviate from basic strategy", with
 * `+` meaning the deviation happens at that true count and above and `-` at that
 * true count and below. Basic strategy for the cell is its printed background
 * colour, so a red index always names the *departure*, never the baseline.
 *
 * That is why 16 v 9 and 15 v 10 in the late-surrender table run downwards. Both
 * cells are printed green (SUR) — basic strategy surrenders them — so their
 * `-1-` and `0-` mark the low counts at which the chart stops surrendering and
 * plays the hand out. They are carried here as R -> H, not H -> R.
 */
const BJA_H17_CHART_ROWS: readonly Row[] = [
  ["Insurance", "A", 3, "N", "I"],
  // Pair splitting: T,T
  ["10,10", "4", 6, "S", "P"], ["10,10", "5", 5, "S", "P"], ["10,10", "6", 4, "S", "P"],
  ["9,9", "7", 3, "S", "P"],
  // Soft totals: A,9 (this app's addition, see bjaH17Chart.ts), A,8 and A,6
  ["Soft 20", "4", 6, "S", "D"], ["Soft 20", "5", 5, "S", "D"], ["Soft 20", "6", 4, "S", "D"],
  ["Soft 19", "4", 3, "S", "D"], ["Soft 19", "5", 1, "S", "D"], ["Soft 19", "6", 0, "S", "D"],
  ["Soft 17", "2", 1, "H", "D"],
  // Hard totals: the stand indices for 15 and 16, starred on the chart
  ["16", "9", 4, "H", "S", "atOrAbove", true, undefined, 3], ["16", "10", 0, "R", "S", "atOrAbove", true, undefined, 3], ["16", "A", 3, "R", "S", "atOrAbove", true, undefined, 3],
  ["15", "10", 4, "H", "S", "atOrAbove", true, undefined, 3], ["15", "A", 5, "R", "S", "atOrAbove", true, undefined, 3],
  // Hard totals: standing and doubling
  ["13", "2", -1, "H", "S"], ["13", "3", -2, "H", "S", "atOrAbove", undefined, undefined, undefined, true], ["12", "2", 3, "H", "S"], ["12", "3", 2, "H", "S"], ["12", "4", 0, "H", "S"], ["12", "5", -2, "H", "S", "atOrAbove", undefined, undefined, undefined, true], ["12", "6", -3, "H", "S", "atOrAbove", undefined, undefined, undefined, true],
  ["11", "A", -1, "H", "D", "atOrAbove", undefined, undefined, undefined, true], ["10", "10", 4, "H", "D"], ["10", "A", 3, "H", "D"], ["9", "2", 1, "H", "D"], ["9", "7", 3, "H", "D"], ["8", "6", 2, "H", "D"],
  // Late surrender. 16 v 9 and 15 v 10 are printed green (basic strategy
  // surrenders them) with a downward index, so they depart *out* of surrender.
  ["16", "8", 4, "H", "R", "atOrAbove", undefined, undefined, 2], ["16", "9", -1, "R", "H", "atOrBelow", undefined, undefined, 2], ["15", "9", 2, "H", "R", "atOrAbove", undefined, undefined, 2], ["15", "10", 0, "R", "H", "atOrBelow", undefined, undefined, 2], ["15", "A", -1, "H", "R", "atOrAbove", undefined, undefined, 2], ["14", "10", 3, "H", "R", "atOrAbove", undefined, undefined, 2, true],
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
    ([hand, dealer, index, normalAction, deviationAction, direction = "atOrAbove", overridesSurrender, always, priority, listedBaseline]): H17Deviation => ({
      id: deviationId(set, hand, dealer, deviationAction), set, hand, dealer, index, normalAction, deviationAction, direction, overridesSurrender, always, priority, listedBaseline,
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
