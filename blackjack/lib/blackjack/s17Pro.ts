import type { DeviationAction } from "./deviations";
import type { H17Deviation, H17DeviationSet } from "./h17Pro";

type Row = readonly [hand: string, dealer: string, index: number, normal: DeviationAction, departure: DeviationAction, direction?: "atOrAbove" | "atOrBelow", overridesSurrender?: true, always?: true, priority?: number];

// the reference product supplied S17 Pro chart: 32 entries including the two
// unconditional late-surrender plays and insurance (4-8 decks).
const S17_PRO_ROWS: readonly Row[] = [
  ["Insurance", "A", 3, "N", "I"],
  ["10,10", "4", 7, "S", "P"], ["10,10", "5", 5, "S", "P"], ["10,10", "6", 5, "S", "P"],
  ["Soft 19", "4", 3, "S", "D"], ["Soft 19", "5", 1, "S", "D"], ["Soft 19", "6", 1, "S", "D"],
  ["Soft 18", "A", 1, "H", "S"],
  ["16", "9", 5, "H", "S", "atOrAbove", true, undefined, 3], ["16", "10", 0, "R", "S", "atOrAbove", true, undefined, 3],
  ["15", "10", 4, "R", "S", "atOrAbove", true, undefined, 3],
  ["12", "2", 4, "H", "S"], ["12", "3", 2, "H", "S"], ["12", "4", 0, "H", "S"], ["12", "5", -1, "H", "S"], ["12", "6", -1, "H", "S"],
  ["11", "A", 1, "H", "D"], ["10", "10", 7, "H", "D"], ["10", "A", 4, "H", "D"], ["9", "2", 1, "H", "D"], ["9", "7", 3, "H", "D"], ["8", "5", 4, "H", "D"], ["8", "6", 2, "H", "D"],
  ["16", "8", 4, "H", "R", "atOrAbove", undefined, undefined, 2], ["16", "9", -1, "H", "R", "atOrAbove", undefined, undefined, 2], ["15", "9", 2, "H", "R", "atOrAbove", undefined, undefined, 2], ["15", "10", 0, "H", "R", "atOrAbove", undefined, undefined, 2], ["15", "A", 2, "H", "R", "atOrAbove", undefined, undefined, 2], ["14", "10", 3, "H", "R", "atOrAbove", undefined, undefined, 2], ["8,8", "10", 2, "P", "R", "atOrAbove", undefined, undefined, 2],
  ["16", "10", 0, "H", "R", "atOrAbove", undefined, true], ["16", "A", 0, "H", "R", "atOrAbove", undefined, true],
] as const;

const make = (set: H17DeviationSet, rows: readonly Row[]) => rows.map(
  ([hand, dealer, index, normalAction, deviationAction, direction = "atOrAbove", overridesSurrender, always, priority], position): H17Deviation => ({
    id: `${set}-${position}`, set, hand, dealer, index, normalAction, deviationAction, direction, overridesSurrender, always, priority,
  }),
);

/** The supplied S17 Pro catalog: dealer stands on soft 17. */
export const S17_PRO_DEVIATIONS = make("s17Pro", S17_PRO_ROWS);
