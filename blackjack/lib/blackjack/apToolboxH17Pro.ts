import type { DeviationAction } from "./deviations";

export type H17DeviationSet = "apToolboxH17Pro" | "apToolboxS17Pro";

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
   */
  overridesSurrender?: true;
}

type Row = readonly [hand: string, dealer: string, index: number, normal: DeviationAction, departure: DeviationAction, direction?: "atOrAbove" | "atOrBelow", overridesSurrender?: true, always?: true, priority?: number];

// AP Toolbox's supplied H17 Pro chart: 34 entries including the five
// unconditional late-surrender plays and insurance (4–8 decks).
const AP_TOOLBOX_PRO_ROWS: readonly Row[] = [
  ["Insurance", "A", 3, "N", "I"],
  ["10,10", "4", 7, "S", "P"], ["10,10", "5", 5, "S", "P"], ["10,10", "6", 4, "S", "P"],
  ["Soft 19", "4", 3, "S", "D"], ["Soft 19", "5", 1, "S", "D"],
  ["16", "9", 5, "H", "S", "atOrAbove", true, undefined, 3], ["16", "10", 0, "R", "S", "atOrAbove", true, undefined, 3], ["16", "A", 3, "R", "S", "atOrAbove", true, undefined, 3],
  ["15", "10", 4, "R", "S", "atOrAbove", true, undefined, 3], ["15", "A", 5, "R", "S", "atOrAbove", true, undefined, 3],
  ["13", "2", -1, "H", "S"], ["12", "2", 3, "H", "S"], ["12", "3", 2, "H", "S"], ["12", "4", 0, "H", "S"], ["12", "5", -2, "H", "S"],
  ["11", "A", -1, "H", "D"], ["10", "10", 7, "H", "D"], ["10", "A", 3, "H", "D"], ["9", "2", 1, "H", "D"], ["9", "7", 3, "H", "D"], ["8", "5", 4, "H", "D"], ["8", "6", 2, "H", "D"],
  ["16", "8", 4, "H", "R", "atOrAbove", undefined, undefined, 2], ["16", "9", -1, "H", "R", "atOrAbove", undefined, undefined, 2], ["15", "9", 2, "H", "R", "atOrAbove", undefined, undefined, 2], ["15", "10", 0, "H", "R", "atOrAbove", undefined, undefined, 2], ["14", "10", 3, "H", "R", "atOrAbove", undefined, undefined, 2], ["8,8", "10", 2, "P", "R", "atOrAbove", undefined, undefined, 2],
  ["17", "A", 0, "S", "R", "atOrAbove", undefined, true], ["16", "10", 0, "H", "R", "atOrAbove", undefined, true], ["16", "A", 0, "H", "R", "atOrAbove", undefined, true], ["15", "A", 0, "H", "R", "atOrAbove", undefined, true], ["8,8", "A", 0, "P", "R", "atOrAbove", undefined, true],
] as const;

const make = (set: H17DeviationSet, rows: readonly Row[]) => rows.map(
  ([hand, dealer, index, normalAction, deviationAction, direction = "atOrAbove", overridesSurrender, always, priority], position): H17Deviation => ({
    id: `${set}-${position}`, set, hand, dealer, index, normalAction, deviationAction, direction, overridesSurrender, always, priority,
  }),
);

export const H17_PRO_DEVIATIONS = make("apToolboxH17Pro", AP_TOOLBOX_PRO_ROWS);

export interface H17DeviationRules {
  dealerHitsSoft17: boolean;
  lateSurrender: boolean;
}
