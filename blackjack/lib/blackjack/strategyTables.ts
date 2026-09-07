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

/**
 * Early surrender against a ten: the decision is taken before the dealer checks
 * the hole card, so the roughly 4-in-51 chance of a natural is given up along
 * with the hand, and more sixteens-and-under are worth folding.
 *
 * Only the ten column moves. Where the dealer cannot hold a natural the two
 * rules are the same decision, and Wong's early- and late-surrender tables
 * (32 and 33) are identical cell for cell in their 8 and 9 columns; the ace is
 * left on late surrender because that is the rule this models — early against
 * the ten, late against everything else. The dealer's soft-17 rule does not
 * enter into it: "whether the dealer hits or stands on soft seventeen does not
 * matter when the dealer starts with 7 through 10" (Professional Blackjack,
 * p. 89), which is why table 32 prints one shared ten column and splits only
 * the ace into A-s17 and A-h17.
 *
 * These are table 32's ten column read at a true count of zero. 7,7 needs no
 * entry of its own beyond the pair row, because a 7,7 you would consider
 * surrendering is just a hard fourteen — Wong's stated reason for not giving it
 * a row. Hard 17, 13 and 12 versus a ten surrender only at +5, +3 and +8, so
 * they are index plays rather than basic strategy and live in
 * `earlySurrender.ts`.
 */
const EARLY_SURRENDER_VS_TEN: readonly string[] = [
  "hard:14v10", "hard:15v10", "hard:16v10",
  "pairs:7,7v10", "pairs:8,8v10",
];

/**
 * Whether early surrender versus a ten applies to one cell under these rules.
 *
 * Single deck with double-after-split is the one exception: the extra value
 * double-after-split gives the split lifts 8,8 back above the flat -0.5, so
 * eights are split rather than surrendered there.
 *
 * Two further published exceptions are composition-dependent — do not surrender
 * a fourteen made of 4+10 or 5+9 in single deck, nor 4+10 in double deck — and
 * this grid is total-dependent, with no card composition to test. They are
 * carried as a note on the chart page instead of being silently applied to
 * every fourteen.
 */
export function earlySurrendersVsTen(cellKey: string, rules: { decks: number; doubleAfterSplit: boolean }): boolean {
  if (!EARLY_SURRENDER_VS_TEN.includes(cellKey)) return false;
  if (cellKey === "pairs:8,8v10") return !(rules.decks === 1 && rules.doubleAfterSplit);
  return true;
}

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
