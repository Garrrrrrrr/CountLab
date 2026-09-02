import { deviationTrainingRows } from "./deviations";
import type { DeviationRules, DeviationTrainingRow } from "./deviations";
import type { StrategySectionId } from "./strategyChart";

export const INSURANCE_ROW = "Insurance";

export interface DeviationCell {
  row: DeviationTrainingRow;
  index: number;
  atOrBelow: boolean;
}

/** Catalog hand labels are not chart row labels: "10,10" is "T,T" and "Soft 20" is "A,9". */
function coordinate(hand: string): { section: StrategySectionId; row: string } | null {
  if (hand === INSURANCE_ROW) return null;
  const soft = /^Soft (\d{1,2})$/.exec(hand);
  if (soft) return { section: "soft", row: "A," + String(Number(soft[1]) - 11) };
  const pair = /^(A|\d{1,2}),(A|\d{1,2})$/.exec(hand);
  if (pair) return { section: "pairs", row: pair[1] === "10" ? "T,T" : hand };
  return { section: "hard", row: hand };
}

export function deviationGridCells(rules: DeviationRules, decks = 6): Map<string, DeviationCell> {
  const cells = new Map<string, DeviationCell>();
  for (const entry of deviationTrainingRows(rules, decks)) {
    const at = coordinate(entry.row.hand);
    if (!at) continue;
    cells.set(at.section + ":" + at.row + "v" + entry.row.dealer, {
      row: entry,
      index: entry.row.index,
      atOrBelow: entry.transition.atOrBelow,
    });
  }
  return cells;
}
