/**
 * The Blackjack Apprenticeship H17 deviation chart (2018), from BJA_H17.pdf.
 *
 * Transcribed from the PDF's text layer rather than read by eye: every cell is
 * a positioned span, and the deviation cells are exactly the spans drawn in the
 * chart's red (#ef4850). The tables below are laid out to read like the printed
 * chart so a diff against the source stays legible.
 *
 * Blank cells in the late-surrender table are stored as "N". The drill has the
 * user type `n` in them, which keeps an empty cell meaning *unanswered* rather
 * than *answered no*.
 *
 * The chart's legend notes that `0-` and `0+` mean any negative / any positive
 * *running* count, where every other index is a true count. That is explanatory
 * only — the printed cell is what the drill asks for.
 *
 * House additions sit on top of the transcription. This is the chart the drill
 * grades, so the additions are listed here rather than hidden in the catalog:
 *
 * - Soft 20 doubles against 4, 5 and 6 at 6+, 5+ and 4+. The printed chart
 *   stands there at every count, but those are the counts where doubling
 *   actually overtakes standing — the same shape, and the same three indices,
 *   as the chart's own T,T splits. Measured with `priceCell` (H17, 6 decks,
 *   75% dealt): against a 6 the double is behind by 0.013 units at +3 and ahead
 *   by 0.020 at +4; against a 5, behind 0.017 at +4 and ahead 0.021 at +5;
 *   against a 4, behind 0.018 at +5 and ahead 0.003 at +6.
 * - Six Illustrious 18 / Fab 4 cells the printed chart leaves at their basic
 *   action: pairs 9,9 v 7 `3+` (printed N), hard 13 v 3 `-2+`, 12 v 5 `-2+` and
 *   12 v 6 `-3+` (all printed S), hard 11 v A `-1+` (printed D), and the
 *   surrender 14 v 10 `3+` (printed blank).
 *
 * Everything else here is the PDF as printed. The cells the chart genuinely
 * omits and this catalog omits too are hard 8 v 5 and the 8,8 surrenders;
 * `h17Pro.test.ts` guards that they stay absent.
 */

export const CHART_DEALERS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"] as const;

export type ChartActionValue = "Y" | "N" | "Y/N" | "H" | "S" | "D" | "Ds" | "SUR";

export type ChartToken =
  | { kind: "action"; value: ChartActionValue }
  | { kind: "index"; value: number; when: "atOrAbove" | "atOrBelow" };

export type ChartSectionId = "pairs" | "soft" | "hard" | "surrender";

export interface ChartSection {
  id: ChartSectionId;
  label: string;
  /** Hand labels in printed order, top to bottom. */
  rows: readonly string[];
  /** Keyed by `cellKey`. */
  cells: ReadonlyMap<string, ChartToken>;
}

/** Identifies one cell across the whole chart, and doubles as the entry key. */
export const cellKey = (section: ChartSectionId, row: string, dealer: string) =>
  `${section}:${row}v${dealer}`;

export const formatToken = (token: ChartToken) =>
  token.kind === "action" ? token.value : `${token.value}${token.when === "atOrAbove" ? "+" : "-"}`;

const ACTION_VALUES: readonly string[] = ["Y", "N", "Y/N", "H", "S", "D", "Ds", "SUR"];

function parsePrintedCell(text: string): ChartToken {
  if (ACTION_VALUES.includes(text)) return { kind: "action", value: text as ChartActionValue };
  const index = /^(-?\d{1,2})([+-])$/.exec(text);
  if (!index) throw new Error(`Unreadable chart cell: "${text}"`);
  return {
    kind: "index",
    value: Number(index[1]),
    when: index[2] === "+" ? "atOrAbove" : "atOrBelow",
  };
}

function section(id: ChartSectionId, label: string, printed: string): ChartSection {
  const rows: string[] = [];
  const cells = new Map<string, ChartToken>();
  for (const line of printed.trim().split("\n")) {
    const [row, ...values] = line.trim().split(/\s+/);
    if (values.length !== CHART_DEALERS.length) {
      throw new Error(`${id} row ${row}: ${values.length} cells, expected ${CHART_DEALERS.length}`);
    }
    rows.push(row);
    values.forEach((value, column) => cells.set(cellKey(id, row, CHART_DEALERS[column]), parsePrintedCell(value)));
  }
  return { id, label, rows, cells };
}

export const BJA_H17_SECTIONS: readonly ChartSection[] = [
  section("pairs", "Pair splitting", `
    A,A  Y    Y    Y   Y    Y    Y  Y  Y  Y  Y
    T,T  N    N    6+  5+   4+   N  N  N  N  N
    9,9  Y    Y    Y   Y    Y   3+  Y  Y  N  N
    8,8  Y    Y    Y   Y    Y    Y  Y  Y  Y  Y
    7,7  Y    Y    Y   Y    Y    Y  N  N  N  N
    6,6  Y/N  Y    Y   Y    Y    N  N  N  N  N
    5,5  N    N    N   N    N    N  N  N  N  N
    4,4  N    N    N   Y/N  Y/N  N  N  N  N  N
    3,3  Y/N  Y/N  Y   Y    Y    Y  N  N  N  N
    2,2  Y/N  Y/N  Y   Y    Y    Y  N  N  N  N
  `),
  section("soft", "Soft totals", `
    A,9  S   S   6+  5+   4+   S  S  S  S  S
    A,8  S   S   3+  1+  0-  S  S  S  S  S
    A,7  Ds  Ds  Ds  Ds  Ds  S  S  H  H  H
    A,6  1+  D   D   D   D   H  H  H  H  H
    A,5  H   H   D   D   D   H  H  H  H  H
    A,4  H   H   D   D   D   H  H  H  H  H
    A,3  H   H   H   D   D   H  H  H  H  H
    A,2  H   H   H   D   D   H  H  H  H  H
  `),
  section("hard", "Hard totals", `
    17  S    S   S   S  S   S   S  S   S   S
    16  S    S   S   S  S   H   H  4+  0+  3+
    15  S    S   S   S  S   H   H  H   4+  5+
    14  S    S   S   S  S   H   H  H   H   H
    13  -1- -2+  S   S  S   H   H  H   H   H
    12  3+   2+  0- -2+ -3+ H   H  H   H   H
    11  D    D   D   D  D   D   D  D   D  -1+
    10  D    D   D   D  D   D   D  D   4+  3+
    9   1+   D   D   D  D   3+  H  H   H   H
    8   H    H   H   H  2+  H   H  H   H   H
  `),
  section("surrender", "Late surrender", `
    17  N  N  N  N  N  N  N   N    N    SUR
    16  N  N  N  N  N  N  4+  -1-  SUR  SUR
    15  N  N  N  N  N  N  N   2+   0-   -1+
    14  N  N  N  N  N  N  N   N   3+    N
  `),
];

export function chartToken(chartSection: ChartSection, row: string, dealer: string): ChartToken {
  const token = chartSection.cells.get(cellKey(chartSection.id, row, dealer));
  if (!token) throw new Error(`No chart cell for ${chartSection.id} ${row} vs ${dealer}`);
  return token;
}
