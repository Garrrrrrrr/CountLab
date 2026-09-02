/**
 * Total-dependent basic strategy for 1, 2 and 4-8 deck games, H17 and S17.
 *
 * Cells hold composite codes (see `strategyChart.ts`): the rule conditions live
 * in the cell rather than in extra copies of the grid, so DAS, surrender
 * availability and double restrictions all resolve at read time.
 *
 * Provenance: transcribed into this repo's row/column layout from published
 * total-dependent basic strategy for these rule sets, and pinned by the three
 * tests in `strategyTables.test.ts` — the deck-class mapping, every grid being
 * complete and well-formed, and agreement with the audited `bjaH17Chart.ts`
 * transcription. The parity
 * check against the branch-based engine these tables replaced is gone: that
 * engine no longer exists, since `basicStrategy.ts` now reads these grids.
 * `strategyChart.test.ts` pins the cells where the two deliberately differed.
 *
 * The `5,5` pairs row is not a splitting decision; it repeats the hard 10 row so
 * the grid has a cell everywhere the printed chart does.
 */
import type { ChartCode, StrategySectionId } from "./strategyChart";
import { CHART_DEALERS } from "./bjaH17Chart";

export type DeckClass = "1" | "2" | "4plus";
export type Soft17Rule = "h17" | "s17";

export const STRATEGY_ROWS: Record<StrategySectionId, readonly string[]> = {
  pairs: ["A,A", "T,T", "9,9", "8,8", "7,7", "6,6", "5,5", "4,4", "3,3", "2,2"],
  soft: ["A,9", "A,8", "A,7", "A,6", "A,5", "A,4", "A,3", "A,2"],
  hard: ["17", "16", "15", "14", "13", "12", "11", "10", "9", "8"],
};

const TABLES: Record<`${DeckClass}/${Soft17Rule}`, Record<StrategySectionId, string>> = {
  "4plus/h17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S   S
      8,8    P   P   P   P   P   P   P   P   P  Rp
      7,7    P   P   P   P   P   P   H   H   H   H
      6,6   Ph   P   P   P   P   H   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H   H  Ph  Ph   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P   H   H   H   H
      2,2   Ph  Ph   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S  Ds   S   S   S   S   S
      A,7   Ds  Ds  Ds  Ds  Ds   S   S   H   H   H
      A,6    H   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   H   D   D   H   H   H   H   H
      A,2    H   H   H   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S   S
      16     S   S   S   S   S   H   H  Rh  Rh  Rh
      15     S   S   S   S   S   H   H   H  Rh  Rh
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   D
      10     D   D   D   D   D   D   D   D   H   H
      9      H   D   D   D   D   H   H   H   H   H
      8      H   H   H   H   H   H   H   H   H   H
    `,
  },
  "4plus/s17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S   S
      8,8    P   P   P   P   P   P   P   P   P   P
      7,7    P   P   P   P   P   P   H   H   H   H
      6,6   Ph   P   P   P   P   H   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H   H  Ph  Ph   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P   H   H   H   H
      2,2   Ph  Ph   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S   S   S   S   S   S   S
      A,7    S  Ds  Ds  Ds  Ds   S   S   H   H   H
      A,6    H   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   H   D   D   H   H   H   H   H
      A,2    H   H   H   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S   S
      16     S   S   S   S   S   H   H  Rh  Rh  Rh
      15     S   S   S   S   S   H   H   H  Rh   H
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   H
      10     D   D   D   D   D   D   D   D   H   H
      9      H   D   D   D   D   H   H   H   H   H
      8      H   H   H   H   H   H   H   H   H   H
    `,
  },
  "2/h17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S   S
      8,8    P   P   P   P   P   P   P   P   P  Rp
      7,7    P   P   P   P   P   P  Ph   H   H   H
      6,6    P   P   P   P   P  Ph   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H   H  Ph  Ph   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P   H   H   H   H
      2,2   Ph  Ph   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S  Ds   S   S   S   S   S
      A,7    S  Ds  Ds  Ds  Ds   S   S   H   H   H
      A,6    H   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   H   D   D   H   H   H   H   H
      A,2    H   H   H   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S  Rs
      16     S   S   S   S   S   H   H   H  Rh  Rh
      15     S   S   S   S   S   H   H   H  Rh  Rh
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   D
      10     D   D   D   D   D   D   D   D   H   H
      9      D   D   D   D   D   H   H   H   H   H
      8      H   H   H   H   H   H   H   H   H   H
    `,
  },
  "2/s17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S   S
      8,8    P   P   P   P   P   P   P   P   P   P
      7,7    P   P   P   P   P   P  Ph   H   H   H
      6,6    P   P   P   P   P  Ph   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H   H  Ph  Ph   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P   H   H   H   H
      2,2   Ph  Ph   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S   S   S   S   S   S   S
      A,7    S  Ds  Ds  Ds  Ds   S   S   H   H   H
      A,6    H   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   H   D   D   H   H   H   H   H
      A,2    H   H   H   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S   S
      16     S   S   S   S   S   H   H   H  Rh  Rh
      15     S   S   S   S   S   H   H   H  Rh   H
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   H
      10     D   D   D   D   D   D   D   D   H   H
      9      D   D   D   D   D   H   H   H   H   H
      8      H   H   H   H   H   H   H   H   H   H
    `,
  },
  "1/h17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S  Ps
      8,8    P   P   P   P   P   P   P   P   P   P
      7,7    P   P   P   P   P   P  Ph   H  Rs  Rh
      6,6    P   P   P   P   P  Ph   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H  Ph  Pd  Pd   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P  Ph   H   H   H
      2,2   Ph   P   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S  Ds   S   S   S   S   S
      A,7    S  Ds  Ds  Ds  Ds   S   S   H   H   H
      A,6    D   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   D   D   D   H   H   H   H   H
      A,2    H   H   D   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S  Rs
      16     S   S   S   S   S   H   H   H  Rh  Rh
      15     S   S   S   S   S   H   H   H   H   H
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   D
      10     D   D   D   D   D   D   D   D   H   H
      9      D   D   D   D   D   H   H   H   H   H
      8      H   H   H   D   D   H   H   H   H   H
    `,
  },
  "1/s17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S   S
      8,8    P   P   P   P   P   P   P   P   P   P
      7,7    P   P   P   P   P   P  Ph   H  Rs   H
      6,6    P   P   P   P   P  Ph   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H  Ph  Pd  Pd   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P  Ph   H   H   H
      2,2   Ph   P   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S  Ds   S   S   S   S   S
      A,7    S  Ds  Ds  Ds  Ds   S   S   H   H   S
      A,6    D   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   D   D   D   H   H   H   H   H
      A,2    H   H   D   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S   S
      16     S   S   S   S   S   H   H   H  Rh  Rh
      15     S   S   S   S   S   H   H   H   H   H
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   D
      10     D   D   D   D   D   D   D   D   H   H
      9      D   D   D   D   D   H   H   H   H   H
      8      H   H   H   D   D   H   H   H   H   H
    `,
  },
};

const isChartCode = (value: string): value is ChartCode =>
  ["H", "S", "P", "D", "Ds", "Ph", "Pd", "Ps", "Rh", "Rs", "Rp"].includes(value);

function parseGrid(id: string, section: StrategySectionId, printed: string): Map<string, ChartCode> {
  const cells = new Map<string, ChartCode>();
  const lines = printed.trim().split("\n");
  const expected = STRATEGY_ROWS[section];
  if (lines.length !== expected.length) {
    throw new Error(`${id} ${section}: ${lines.length} rows, expected ${expected.length}`);
  }
  lines.forEach((line, rowIndex) => {
    const [row, ...values] = line.trim().split(/\s+/);
    if (row !== expected[rowIndex]) throw new Error(`${id} ${section}: row ${rowIndex} is "${row}", expected "${expected[rowIndex]}"`);
    if (values.length !== CHART_DEALERS.length) throw new Error(`${id} ${section} row ${row}: ${values.length} cells, expected ${CHART_DEALERS.length}`);
    values.forEach((value, column) => {
      if (!isChartCode(value)) throw new Error(`${id} ${section} row ${row}: unreadable code "${value}"`);
      cells.set(`${section}:${row}v${CHART_DEALERS[column]}`, value);
    });
  });
  return cells;
}

export const STRATEGY_TABLES: Record<string, Map<string, ChartCode>> = Object.fromEntries(
  Object.entries(TABLES).map(([key, sections]) => [
    key,
    new Map([
      ...parseGrid(key, "pairs", sections.pairs),
      ...parseGrid(key, "soft", sections.soft),
      ...parseGrid(key, "hard", sections.hard),
    ]),
  ]),
);

export const deckClass = (decks: number): DeckClass => (decks === 1 ? "1" : decks === 2 ? "2" : "4plus");
