import { CHART_DEALERS } from "./bjaH17Chart";
import { deviationGridCells } from "./deviationChart";
import type { DeviationCell } from "./deviationChart";
import type { DeviationRules } from "./deviations";
import { chartCell } from "./strategyChart";
import type { StrategyChartRules, StrategySectionId } from "./strategyChart";
import { STRATEGY_ROWS } from "./strategyTables";

/** The table's rules as the deviation catalog wants them. */
export const toDeviationRules = (rules: StrategyChartRules): DeviationRules => ({
  dealerHitsSoft17: rules.dealerHitsSoft17,
  lateSurrender: rules.surrender !== "none",
  earlySurrenderVsTen: rules.surrender === "early",
});

export interface SurrenderCell {
  /** True when basic strategy gives the hand up, before any count is applied. */
  surrenders: boolean;
  /**
   * The count at which the surrender starts or stops, when one is printed.
   *
   * Absent on an unconditional surrender even though the catalog carries a row
   * for it: 17 v A, 16 v 10 and 16 v A are `always` rows with a nominal index of
   * zero, and printing that zero would read as a threshold the play does not
   * have.
   */
  marker?: DeviationCell;
}

export interface SurrenderChart {
  /** Hand labels carrying surrender content, in printed order. Empty at a table without the rule. */
  rows: readonly string[];
  /** Where each label sits in the strategy grids, since the rows come from more than one section. */
  coordinate: ReadonlyMap<string, { section: StrategySectionId; row: string }>;
  /** Keyed `${row}v${dealer}`. Absent where the hand is simply played out. */
  cells: ReadonlyMap<string, SurrenderCell>;
}

/** A marker belongs on the surrender table when either side of its threshold is a surrender. */
const isSurrenderMarker = (marker: DeviationCell) =>
  marker.row.transition.departure === "R" || marker.row.transition.baseline === "R";

/**
 * The surrender decisions lifted out of the strategy grids into a table of
 * their own.
 *
 * Surrender is answered before the hand is played, so mixing it into the hand
 * tables costs a cell that would otherwise carry the play. The printed charts
 * this app teaches from already split the two — the Blackjack Apprenticeship
 * H17 chart prints a stand index of `0+` at 16 v 10 in its hard table and says
 * `SUR` in a separate surrender table — and this puts the rules-driven chart on
 * the same footing.
 *
 * Splitting them is also what makes the starred stand indices reachable. Those
 * rows carry `overridesSurrender`, so `resolveDeviation` suppresses them
 * wherever surrender is on offer; with the hand tables asked as though the
 * table had none, they resolve and the chart can finally print them.
 *
 * Rows are derived rather than listed, so the table stays correct across the
 * three surrender rules instead of printing empty rows for hands that only give
 * up under one of them.
 */
export function surrenderChart(rules: StrategyChartRules): SurrenderChart {
  const coordinate = new Map<string, { section: StrategySectionId; row: string }>();
  const cells = new Map<string, SurrenderCell>();
  const rows: string[] = [];
  if (rules.surrender === "none") return { rows, coordinate, cells };

  const markers = deviationGridCells(toDeviationRules(rules), rules.decks);

  // Hard totals first, then pairs, matching the order the printed charts use.
  // Soft hands are never surrendered: an ace counted as eleven cannot make a
  // hand bad enough, and no published chart gives up one.
  for (const section of ["hard", "pairs"] satisfies StrategySectionId[]) {
    for (const row of STRATEGY_ROWS[section]) {
      let used = false;
      for (const dealer of CHART_DEALERS) {
        const marker = markers.get(`${section}:${row}v${dealer}`);
        const surrenderMarker = marker && isSurrenderMarker(marker) ? marker : undefined;
        // An unconditional surrender can come from either side: the grid prints
        // one at 16 v 10, while 17 v A stands in the grid and is given up only
        // by the catalog's `always` row.
        const always = surrenderMarker?.row.row.always === true;
        const surrenders = always || chartCell(rules, section, row, dealer).action === "R";
        if (!surrenders && !surrenderMarker) continue;
        cells.set(`${row}v${dealer}`, { surrenders, marker: always ? undefined : surrenderMarker });
        used = true;
      }
      if (used) {
        rows.push(row);
        coordinate.set(row, { section, row });
      }
    }
  }
  return { rows, coordinate, cells };
}
