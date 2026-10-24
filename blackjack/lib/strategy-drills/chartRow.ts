/**
 * One row of the strategy chart, as the compact row in drill feedback prints
 * it. Every cell comes from `buildChart`, the same model the reference chart
 * and the graders read, so the picture can never disagree with the answer.
 */
import type { Action } from "@/lib/blackjack/types";
import { buildChart, cellKey, DEALERS, rowLabel, surrenderOffered, type Dealer, type Resolved, type Section, type StrategyChart, type TableRules } from "@/lib/strategy";

/** "D" doubles or else hits; "Ds" doubles or else stands, as printed charts write it. */
export const playToken = (basic: Resolved): string => (basic.action === "D" && basic.fallback === "S" ? "Ds" : basic.action);

export interface RowCell {
  dealer: Dealer;
  /** "H", "Ds", "Rh": the chart's code for an original two-card hand. */
  code: string;
  /** The colour: the first action the code names. */
  action: Action;
  /** Words for a screen reader: "Surrender, otherwise hit". */
  spoken: string;
}

const NAME: Record<Action, string> = { H: "hit", S: "stand", D: "double", P: "split", R: "surrender" };

const chartCache = new Map<string, StrategyChart>();
/** Charts are pure functions of the rules; drills ask for the same one on every answer. */
export function chartFor(rules: TableRules): StrategyChart {
  const key = JSON.stringify(rules);
  let chart = chartCache.get(key);
  if (!chart) {
    chart = buildChart(rules);
    chartCache.set(key, chart);
    if (chartCache.size > 12) chartCache.delete(chartCache.keys().next().value as string);
  }
  return chart;
}

export function chartRow(rules: TableRules, section: Section, row: string): { label: string; cells: RowCell[] } {
  const chart = chartFor(rules);
  const table = chart.tables[section];
  const surrender = surrenderOffered(rules);
  const cells = DEALERS.map((dealer): RowCell => {
    const cell = table.cells.get(cellKey({ section, row, dealer }))!;
    const token = playToken(cell.basic);
    const fallbackWord = cell.basic.fallback ? `, otherwise ${NAME[cell.basic.fallback]}` : "";
    if (surrender && cell.surrenderFirst) {
      return { dealer, code: `R${token[0].toLowerCase()}`, action: "R", spoken: `Surrender, otherwise ${NAME[cell.basic.action]}` };
    }
    const spoken = `${NAME[cell.basic.action][0].toUpperCase()}${NAME[cell.basic.action].slice(1)}${fallbackWord}`;
    return { dealer, code: token, action: cell.basic.action, spoken };
  });
  return { label: rowLabel(section, row), cells };
}
