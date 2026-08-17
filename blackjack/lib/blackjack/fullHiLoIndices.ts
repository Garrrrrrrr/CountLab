import type { DeviationAction } from "./deviations";

/**
 * The complete set of Hi-Lo departures published by FreeBJ's default strategy.
 *
 * Source: https://github.com/kevin-lesenechal/freebj
 * Copyright (c) 2021 Kévin Lesénéchal. MIT License; its copyright and licence
 * notice are reproduced in THIRD_PARTY_NOTICES.md.  This is intentionally a
 * compact 17-play set, not a claimed complete index matrix. FreeBJ's defaults
 * do not include insurance or surrender departures.
 */
export type DeviationGroup = "freebj";

export interface FullHiLoDeviation {
  id: string;
  hand: string;
  dealer: string;
  index: number;
  normalAction: DeviationAction;
  deviationAction: DeviationAction;
  direction: "atOrAbove" | "atOrBelow";
  doubleAllowed: boolean;
  splitAllowed: boolean;
  surrenderAllowed: boolean;
  groups: DeviationGroup[];
}

type Row = readonly [hand: string, dealer: string, index: number, normal: DeviationAction, departure: DeviationAction, direction?: "atOrAbove" | "atOrBelow"];

const rows: readonly Row[] = [
  ["16", "8", 5, "H", "S"], ["16", "9", 4, "H", "S"],
  ["15", "7", 6, "H", "S"], ["15", "8", 7, "H", "S"],
  ["15", "9", 6, "H", "S"], ["15", "10", 4, "H", "S"],
  ["13", "3", -3, "S", "H", "atOrBelow"],
  ["12", "2", 6, "H", "S"], ["12", "3", 3, "H", "S"],
  ["11", "A", 2, "H", "D"], ["10", "A", 5, "H", "D"],
  ["10", "10", 6, "H", "D"], ["9", "8", 8, "H", "D"],
  ["Soft 19", "5", 2, "S", "D"],
  ["10,10", "4", 7, "S", "P"], ["10,10", "5", 5, "S", "P"],
  ["10,10", "6", 4, "S", "P"],
] as const;

export const FREEBJ_DEFAULT_HILO_DEVIATIONS: FullHiLoDeviation[] = rows.map(
  ([hand, dealer, index, normalAction, deviationAction, direction = "atOrAbove"], position) => ({
    id: `freebj-${position}`,
    hand,
    dealer,
    index,
    normalAction,
    deviationAction,
    direction,
    doubleAllowed: deviationAction === "D",
    splitAllowed: deviationAction === "P",
    surrenderAllowed: false,
    groups: ["freebj"],
  }),
);
