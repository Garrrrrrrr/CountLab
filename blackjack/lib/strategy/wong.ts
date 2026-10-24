/**
 * Stanford Wong, Professional Blackjack (Pi Yee Press), High-Low strategy
 * numbers, transcribed from the printed tables. Every count-based decision on
 * the site comes from here; nothing in this file is simulated or computed.
 *
 * WHICH TABLE. Appendix A has one table per deck count and soft-17 rule: A1
 * one deck H17, A2 four decks H17, A3 one deck S17, A4 four decks S17. Wong
 * (p. 36): the multiple-deck numbers "actually are based on four decks, but are
 * almost exactly the same as strategy numbers based on other multiples such as
 * two, six, etc.", so 2, 4, 6 and 8 decks read A2/A4. Surrender for multiple
 * decks is his summary, tables 32 (early) and 33 (late); for one deck it is
 * the surrender page of A1/A3. Insurance is table 11 (it varies by deck
 * count), and the no-hole-card changes are table 30.
 *
 * HOW TO READ A NUMBER (p. 253). Act (stand, double, split, surrender) at a
 * count per deck equal to or greater than the number; otherwise do not. A
 * number with an asterisk reverses that: split only below it. "a/b*" is both:
 * from a up to, but not including, b. Wong truncates the count per deck
 * toward zero before comparing; the site's rounding setting decides that.
 *
 * RANGE. The appendix prints numbers past ±10, but Wong's benchmark uses
 * "strategy numbers from −10 to +10" (p. 18) and his summary tables (9, 10,
 * 32, 33) print the same cells as always or never beyond it. The site does the
 * same: `gate()` reads anything above +10 as never and below −10 as always.
 * `wong.test.ts` checks that this reproduces tables 9 and 10 cell for cell.
 *
 * TWO-CARD ROWS. The appendix also breaks two-card hands down by composition
 * (10-6 apart from 9-7). The site's charts are by total, as Wong's own summary
 * tables are, so it reads the total rows, except for pairs: an unsplit 8-8,
 * 7-7 or 6-6 stands by its own two-card row, and 5-5 and 4-4 double by theirs,
 * because the pair's two cards change the numbers (one-deck 7-7 v 10 stands
 * from 0, where hard 14 never does). One-deck surrender is printed only by
 * composition; it reads the ten-card row (10-6 for 16, 10-5 for 15 …), the
 * commonest way to make each total, and the pair rows for 8-8, 7-7 and 6-6.
 */
import type { Dealer } from "./indices";

export type WongSource = "A1" | "A2" | "A3" | "A4" | "A1s" | "A3s" | "T11" | "T30" | "T32" | "T33";

export const WONG_SOURCE: Record<WongSource, string> = {
  A1: "Wong, Professional Blackjack, table A1 (one deck, H17), p. 255",
  A2: "Wong, Professional Blackjack, table A2 (four decks, H17), p. 259",
  A3: "Wong, Professional Blackjack, table A3 (one deck, S17), p. 263",
  A4: "Wong, Professional Blackjack, table A4 (four decks, S17), p. 267",
  A1s: "Wong, Professional Blackjack, table A1 surrender (one deck, H17), p. 257",
  A3s: "Wong, Professional Blackjack, table A3 surrender (one deck, S17), p. 265",
  T11: "Wong, Professional Blackjack, table 11 (insurance), p. 53",
  T30: "Wong, Professional Blackjack, table 30 (no hole card), p. 85",
  T32: "Wong, Professional Blackjack, table 32 (early surrender), p. 91",
  T33: "Wong, Professional Blackjack, table 33 (late surrender), p. 93",
};

/** Act at this count or higher; or always; or never. */
export type Gate = number | "always" | "never";
/** Split from `from` up to (not including) `below`. */
export interface SplitGate { from: Gate; below?: number }

/** Wong's strategy numbers run from −10 to +10 (p. 18). */
export const WONG_RANGE = 10;

/** A printed number as the site uses it: past ±10 it is always or never. */
export function gate(value: Gate): Gate {
  if (typeof value !== "number") return value;
  if (value > WONG_RANGE) return "never";
  if (value < -WONG_RANGE) return "always";
  return value;
}

export const passes = (value: Gate, tc: number) => {
  const read = gate(value);
  return read === "always" || (read !== "never" && tc >= read);
};

export function splits(rule: SplitGate, tc: number): boolean {
  if (!passes(rule.from, tc)) return false;
  // An upper limit past +10 never bites; one below −10 leaves nothing to split.
  return rule.below === undefined || rule.below > WONG_RANGE || tc < rule.below;
}

/* ------------------------------------------------------------------ */
/* Transcription                                                       */
/* ------------------------------------------------------------------ */

const COLUMNS: readonly Dealer[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

/** One printed block: a row label then one token per dealer card, "." for a blank cell. */
function block(text: string, columns: readonly string[] = COLUMNS): Map<string, Record<string, string>> {
  const rows = new Map<string, Record<string, string>>();
  for (const line of text.trim().split("\n")) {
    const [label, ...tokens] = line.trim().split(/\s+/);
    if (tokens.length !== columns.length) throw new Error(`Wong ${label}: ${tokens.length} cells, expected ${columns.length}`);
    rows.set(label, Object.fromEntries(columns.map((column, index) => [column, tokens[index]])));
  }
  return rows;
}

const number = (token: string) => {
  const value = Number(token);
  if (!Number.isInteger(value)) throw new Error(`Wong: unreadable cell "${token}"`);
  return value;
};

/** Hit/stand rows: blank is always stand, "h" is always hit. */
const standCell = (token: string): Gate => (token === "." ? "always" : token === "h" ? "never" : number(token));
/** Double rows: blank is never double. */
const doubleCell = (token: string): Gate => (token === "." ? "never" : number(token));
/**
 * Two-card hit/stand rows for a pair that is not split: "h/sp" and "h" never
 * stand, "sp/-" always stands, "spl" says split (and gives no stand number, so
 * a pair that cannot be split falls back to its total's row).
 */
const pairStandCell = (token: string): Gate | undefined => (token === "spl" ? undefined : token === "sp/-" ? "always" : token === "h/sp" || token === "h" ? "never" : number(token));
/** Split rows: blank never, "spl" always, "n*" below n, "a/b*" from a below b. */
function splitCell(token: string): SplitGate {
  if (token === ".") return { from: "never" };
  if (token === "spl") return { from: "always" };
  const range = /^(-?\d+)\/(-?\d+)\*$/.exec(token);
  if (range) return { from: number(range[1]), below: number(range[2]) };
  if (token.endsWith("*")) return { from: "always", below: number(token.slice(0, -1)) };
  return { from: number(token) };
}

export interface WongTable {
  source: WongSource;
  /** Rows "17" … "12" and "A,7" (soft 18): stand at or above. */
  stand: ReadonlyMap<string, Record<Dealer, Gate>>;
  /** Rows "11" … "5" and "A,9" … "A,2": double at or above. */
  double: ReadonlyMap<string, Record<Dealer, Gate>>;
  split: { noDas: ReadonlyMap<string, Record<Dealer, SplitGate>>; das: ReadonlyMap<string, Record<Dealer, SplitGate>> };
  /** Unsplit pairs, from the two-card pages: stand rows "8,8", "7,7", "6,6" (undefined: use the total's row) and double rows "5,5", "4,4". */
  pair: { stand: ReadonlyMap<string, Record<Dealer, Gate | undefined>>; double: ReadonlyMap<string, Record<Dealer, Gate>> };
}

function table(source: WongSource, parts: { stand: string; double: string; noDas: string; das: string; pairStand: string; pairDouble: string }): WongTable {
  const read = <T,>(text: string, cell: (token: string) => T, rename: (label: string) => string = (label) => label) =>
    new Map([...block(text)].map(([label, row]) => [rename(label), Object.fromEntries(Object.entries(row).map(([dealer, token]) => [dealer, cell(token)])) as Record<Dealer, T>]));
  const pair = (label: string) => label.replace("10-10", "T,T").replace("ace-ace", "A,A").replace("-", ",");
  const soft = (label: string) => label.replace("ace-", "A,").replace("soft18", "A,7");
  return {
    source,
    stand: read(parts.stand, standCell, soft),
    double: read(parts.double, doubleCell, soft),
    split: { noDas: read(parts.noDas, splitCell, pair), das: read(parts.das, splitCell, pair) },
    pair: { stand: read(parts.pairStand, pairStandCell, pair), double: read(parts.pairDouble, doubleCell, pair) },
  };
}

// Columns: 2 3 4 5 6 7 8 9 10 A. Laid out as printed so a diff against the page stays readable.

/** Table A1, High-Low, One Deck, H17 (p. 255). */
const A1 = table("A1", {
  stand: `
    soft18  -16 -18 -15 -16 -14   .  -16   h   h  17
    17        .   .   .   .   .   .  -19 -19   .  -5
    16       -9 -10 -12 -13 -13  11   10   5   1   3
    15       -5  -6  -8  -9 -11  12   12   8   5   5
    14       -3  -4  -6  -7  -9  16    h   h   h   9
    13        0  -1  -3  -4  -7   h    h   h   h  15
    12        3   2   0  -1  -2   h    h   h   h   h`,
  double: `
    11      -11 -12 -13 -14 -15  -8   -5  -3  -3  -1
    10       -8  -9 -10 -11 -13  -6   -3   0   4   3
    9         1   0  -2  -4  -5   3    8   .   .   .
    8        14   9   5   2   2  14    .   .   .   .
    7         .  17  11   9   8   .    .   .   .   .
    6         .   .  15  11  12   .    .   .   .   .
    5         .   .  15  12  13   .    .   .   .   .
    ace-9    10   9   7   5   4  15    .   .   .   .
    ace-8     9   4   2   1   0  16    .   .   .   .
    ace-7     0  -1 -10 -10 -15  18    .   .   .   .
    ace-6     0  -4  -8 -14 -15   .    .   .   .   .
    ace-5    15   4  -3  -7 -15   .    .   .   .   .
    ace-4    18   4  -3  -6 -10   .    .   .   .   .
    ace-3    12   5  -1  -4  -6   .    .   .   .   .
    ace-2    11   5   1  -1  -3   .    .   .   .   .`,
  noDas: `
    ace-ace -13 -14 -15 -15 -16 -12  -10 -10 -10  -8
    10-10    11   9   7   5   5  13   20   .   .   .
    9-9       0  -1  -2  -4  -5   6  -14 -12   .   0
    8-8     spl spl spl spl spl spl  spl 11*  6*  -2
    7-7     -14 -16 spl spl spl spl    .   .   .   .
    6-6       0  -1  -4  -6  -7  0*    .   .   .   .
    5-5       .   .   .   .   .   .    .   .   .   .
    4-4       .  18  11   7   8   .    .   .   .   .
    3-3       8   4  -1  -4  -5 13*    .   .   .   .
    2-2       9   5   0  -4  -7 spl    .   .   .   .`,
  das: `
    ace-ace -13 -14 -15 -15 -16 -12  -10 -10 -10  -8
    10-10    11   9   7   5   5  13   20   .   .   .
    9-9      -2  -3  -4  -5  -6   3  -14 -12   .   0
    8-8     spl spl spl spl spl spl  spl 18*  8*  -2
    7-7     -14 -16 spl spl spl spl   -1   .   .   .
    6-6      -3  -5  -7  -9 -10 11*    .   .   .   .
    5-5       .   .   .   .   .   .    .   .   .   .
    4-4      17   4   0  -2  -6   .    .   .   .   .
    3-3      -2  -6  -9 -11 -11 spl    0   .   .   .
    2-2      -1  -4  -6  -9 -10 spl   11   .   .   .`,
  // Two-card pages, p. 256: unsplit pairs.
  pairStand: `
    8-8     spl  spl  spl  spl  spl  spl  spl sp/- sp/- h/sp
    7-7    h/sp h/sp  spl  spl  spl  spl   20   13    0    2
    6-6    h/sp h/sp h/sp h/sp h/sp    h    h    h    h    h`,
  pairDouble: `
    5-5      -8   -9  -11  -12  -14   -6   -3   -1    4    3
    4-4      16   10    6    2    1   14    .    .    .    .`,
});

/** Table A2, High-Low, Four Decks, H17 (p. 259). */
const A2 = table("A2", {
  stand: `
    soft18  -14 -15 -14 -15 -15   .  -15   h   h   h
    17        .   .   .   .   .   .    .   .   .  -4
    16       -9 -10 -11 -12 -14   9    7   5   0   3
    15       -5  -7  -8  -9 -11  10   10   8   4   5
    14       -3  -5  -6  -7  -9  17    h   h   h   9
    13        0  -2  -3  -4  -7   h    h   h   h  15
    12        3   1   0  -1  -3   h    h   h   h   h`,
  double: `
    11      -11 -12 -13 -14 -16  -9   -6  -4  -4   0
    10       -8  -9 -10 -11 -13  -6   -4  -1   4   3
    9         1   0  -2  -4  -6   3    7   .   .   .
    8        13   9   5   3   1  14    .   .   .   .
    7         .  16  12   9   8   .    .   .   .   .
    6         .  20  15  11  12   .    .   .   .   .
    5         .  20  15  12  13   .    .   .   .   .
    ace-9    10   8   6   5   4  14    .   .   .   .
    ace-8     8   5   3   1   0  17    .   .   .   .
    ace-7     0  -2  -6  -8 -13  20    .   .   .   .
    ace-6     1  -3  -7 -10 -14   .    .   .   .   .
    ace-5    15   3  -3  -6 -13   .    .   .   .   .
    ace-4    18   6   0  -4 -10   .    .   .   .   .
    ace-3    14   6   1  -1  -5   .    .   .   .   .
    ace-2    12   7   3   0  -2   .    .   .   .   .`,
  noDas: `
    ace-ace -11 -12 -13 -13 -14  -9   -8  -7  -8  -4
    10-10    11   8   6   5   4  13   20   .   .   .
    9-9      -1  -2  -3  -4  -6   6   -8  -9   .   2
    8-8     spl spl spl spl spl spl  spl 17*  6*  -1
    7-7      -8 -10 -12 -14 -16 spl    .   .   .   .
    6-6       1  -1  -3  -5  -7   .    .   .   .   .
    5-5       .   .   .   .   .   .    .   .   .   .
    4-4       .  18  12   8   7   .    .   .   .   .
    3-3       8   3   0  -2  -5 13*    .   .   .   .
    2-2       7   3   0  -4  -7 spl    .   .   .   .`,
  das: `
    ace-ace -11 -12 -13 -13 -14  -9   -8  -7  -8  -4
    10-10    11   8   6   5   4  13   20   .   .   .
    9-9      -2  -4  -5  -6  -8   3   -8  -9   .   1
    8-8     spl spl spl spl spl spl  spl 18*  8*  -1
    7-7     -10 -11 -13 -14 -16 spl 5/19*  .   .   .
    6-6      -2  -4  -6  -8 -10   .    .   .   .   .
    5-5       .   .   .   .   .   .    .   .   .   .
    4-4      14   6   1  -1  -6   .    .   .   .   .
    3-3       0  -3  -7  -9 -11 spl    4   .   .   .
    2-2      -2  -5  -7  -9 -11 spl    5   .   .   .`,
  // Two-card pages, p. 260: unsplit pairs.
  pairStand: `
    8-8     spl  spl  spl  spl  spl  spl  spl sp/- sp/- h/sp
    7-7    h/sp h/sp h/sp h/sp h/sp  spl   20    h   11    8
    6-6    h/sp h/sp h/sp h/sp h/sp    h    h    h    h    h`,
  pairDouble: `
    5-5      -8   -9  -10  -11  -13   -6   -4   -1    4    3
    4-4      13    9    5    2    1   14    .    .    .    .`,
});

/** Table A3, High-Low, One Deck, S17 (p. 263). */
const A3 = table("A3", {
  stand: `
    soft18  -17 -18 -15 -16 -17   .  -16   h   h  -1
    17        .   .   .   .   .   .  -19 -19   .  -6
    16       -8 -10 -12 -13 -11  11   10   5   1   8
    15       -4  -6  -8  -9 -10  12   12   8   5   9
    14       -2  -4  -6  -7  -8  16    h   h   h  13
    13        0  -1  -3  -4  -4   h    h   h   h  20
    12        4   2   0   0   0   h    h   h   h   h`,
  double: `
    11      -11 -12 -13 -14 -15  -8   -5  -3  -3   0
    10       -8  -9 -10 -11 -12  -6   -3   0   4   4
    9         1   0  -2  -4  -5   3    8   .   .   .
    8        14   9   5   3   2  14    .   .   .   .
    7         .  17  11   9   9   .    .   .   .   .
    6         .   .  15  11  15   .    .   .   .   .
    5         .   .  16  12  16   .    .   .   .   .
    ace-9    10   9   7   5   5  15    .   .   .   .
    ace-8     9   4   2   1   0  16    .   .   .   .
    ace-7     1  -1 -10 -10 -13  18    .   .   .   .
    ace-6     0  -4  -8 -14 -15   .    .   .   .   .
    ace-5    15   4  -3  -7 -15   .    .   .   .   .
    ace-4    19   5  -3  -6 -10   .    .   .   .   .
    ace-3    13   5   0  -3  -6   .    .   .   .   .
    ace-2    11   6   1  -1  -3   .    .   .   .   .`,
  noDas: `
    ace-ace -13 -14 -15 -15 -16 -12  -10 -10 -10  -7
    10-10    11   9   7   5   5  13   20   .   .   .
    9-9       0   0  -2  -4  -3   6  -14 -12   .   1
    8-8     spl spl spl spl spl spl  spl 11*  6* -16
    7-7     -16 -17 spl spl spl spl    .   .   .   .
    6-6       1  -1  -4  -6  -7  0*    .   .   .   .
    5-5       .   .   .   .   .   .    .   .   .   .
    4-4       .  18  12   8  18   .    .   .   .   .
    3-3       8   4  -1  -4 -10 13*    .   .   .   .
    2-2       9   5   0  -4  -8 spl    .   .   .   .`,
  das: `
    ace-ace -13 -14 -15 -15 -16 -12  -10 -10 -10  -7
    10-10    11   9   7   5   5  13   20   .   .   .
    9-9      -1  -2  -4  -5  -5   3  -14 -12   .   1
    8-8     spl spl spl spl spl spl  spl 18*  8* -16
    7-7     -16 -17 spl spl spl spl   -1   .   .   .
    6-6      -2  -5  -7  -9 -11 11*    .   .   .   .
    5-5       .   .   .   .   .   .    .   .   .   .
    4-4      18   5   0  -2  -4   .    .   .   .   .
    3-3      -4  -7  -9 -11 -13 spl    0   .   .   .
    2-2      -2  -4  -6  -9 -11 spl   11   .   .   .`,
  // Two-card pages, p. 264: unsplit pairs.
  pairStand: `
    8-8     spl  spl  spl  spl  spl  spl  spl sp/- sp/- h/sp
    7-7    h/sp h/sp  spl  spl  spl  spl   20   13    0    7
    6-6    h/sp h/sp h/sp h/sp h/sp    h    h    h    h    h`,
  pairDouble: `
    5-5      -8   -9  -11  -12  -13   -6   -3   -1    4    4
    4-4      16   10    6    2    2   14    .    .    .    .`,
});

/** Table A4, High-Low, Four Decks, S17 (p. 267). */
const A4 = table("A4", {
  stand: `
    soft18  -15 -15 -15 -15 -17   .  -15   h   h   1
    17        .   .   .   .   .   .    .   .   .  -6
    16       -8 -10 -11 -12 -13   9    7   5   0   8
    15       -5  -6  -7  -9  -9  10   10   8   4  10
    14       -3  -4  -6  -7  -7  17    h   h   h  14
    13        0  -1  -3  -4  -4   h    h   h   h  20
    12        3   2   0  -1   0   h    h   h   h   h`,
  double: `
    11      -11 -12 -13 -14 -15  -9   -6  -4  -4   1
    10       -8  -9 -10 -11 -13  -6   -4  -1   4   4
    9         1   0  -2  -4  -6   3    7   .   .   .
    8        13   9   5   3   1  14    .   .   .   .
    7         .  16  12   9   9   .    .   .   .   .
    6         .  20  15  12  15   .    .   .   .   .
    5         .  20  15  12  16   .    .   .   .   .
    ace-9    10   8   6   5   4  14    .   .   .   .
    ace-8     8   5   3   1   1  17    .   .   .   .
    ace-7     0  -2  -6  -8 -10  20    .   .   .   .
    ace-6     1  -3  -7 -10 -13   .    .   .   .   .
    ace-5    15   4  -2  -6 -12   .    .   .   .   .
    ace-4    18   7   0  -4  -9   .    .   .   .   .
    ace-3    14   7   1  -1  -4   .    .   .   .   .
    ace-2    13   7   3   0  -1   .    .   .   .   .`,
  noDas: `
    ace-ace -11 -12 -12 -13 -14  -9   -8  -7  -8  -3
    10-10    11   8   6   5   4  13   20   .   .   .
    9-9       0  -2  -3  -4  -4   6   -8  -9   .   3
    8-8     spl spl spl spl spl spl  spl 17*  6* -11
    7-7      -9 -11 -13 -14 spl spl    .   .   .   .
    6-6       2   0  -3  -5  -7   .    .   .   .   .
    5-5       .   .   .   .   .   .    .   .   .   .
    4-4       .  19  13   8  18   .    .   .   .   .
    3-3       8   3   0  -2  -9 13*    .   .   .   .
    2-2       7   3   0  -4  -9 spl    .   .   .   .`,
  das: `
    ace-ace -11 -12 -12 -13 -14  -9   -8  -7  -8  -3
    10-10    11   8   6   5   4  13   20   .   .   .
    9-9      -2  -3  -5  -6  -6   3   -8  -9   .   3
    8-8     spl spl spl spl spl spl  spl 18*  8* -11
    7-7      -9 -11 -13 -14 spl spl 5/19*  .   .   .
    6-6      -1  -4  -6  -8 -10   .    .   .   .   .
    5-5       .   .   .   .   .   .    .   .   .   .
    4-4      15   6   1  -1  -4   .    .   .   .   .
    3-3       0  -4  -7  -9 -14 spl    4   .   .   .
    2-2      -3  -5  -7  -9 -12 spl    5   .   .   .`,
  // Two-card pages, p. 268: unsplit pairs.
  pairStand: `
    8-8     spl  spl  spl  spl  spl  spl  spl sp/- sp/- h/sp
    7-7    h/sp h/sp h/sp h/sp  spl  spl   20    h   11   12
    6-6    h/sp h/sp h/sp h/sp h/sp    h    h    h    h    h`,
  pairDouble: `
    5-5      -8   -9  -10  -11  -13   -6   -4   -1    4    4
    4-4      13    9    5    3    1   14    .    .    .    .`,
});

/* ------------------------------------------------------------------ */
/* Surrender                                                           */
/* ------------------------------------------------------------------ */

/** Columns of the one-deck surrender pages: early vs 10, early & late vs 7/8/9, late vs 10 and ace. */
const SURRENDER_COLUMNS = ["e10", "7", "8", "9", "l10", "lA"] as const;
type SurrenderColumn = typeof SURRENDER_COLUMNS[number];

/**
 * One-deck surrender, the rows the site reads (see the file comment). The
 * printed "early ace" column is left out: early surrender here is against a
 * ten only. Late-ace cells printed "a/b*" keep only a: the upper limit applies
 * "only if you cannot both surrender and buy insurance" (p. 253), and with
 * late surrender insurance is settled first.
 */
const ONE_DECK_SURRENDER: Record<"A1s" | "A3s", string> = {
  A1s: `
    10-7   4   .  18  12  11   .
    10-6  -4  12   6   2  -1  -3
    8-8   -1   .   .   5   1   .
    10-5  -3  11   6   2   0  -3
    10-4   0  14  13   8   4   4
    7-7   -5   .   8   2  -1  -3
    10-3   5   .  19  16  10  16
    10-2  10   .   .   .  17   .
    6-6    8   .   .  19  15   .`,
  A3s: `
    10-7   4   .  18  12  11   .
    10-6  -4  12   6   2  -1   0
    8-8   -1   .   .   5   1   .
    10-5  -3  11   6   2   0   0
    10-4   0  14  13   8   4   5
    7-7   -5   .   8   2  -1   0
    10-3   5   .  19  16  10  15
    10-2  10   .   .   .  17   .
    6-6    8   .   .  19  15   .`,
};

/** Chart row → the printed one-deck row it reads. */
const ONE_DECK_ROW: Record<string, string> = { "17": "10-7", "16": "10-6", "15": "10-5", "14": "10-4", "13": "10-3", "12": "10-2", "8,8": "8-8", "7,7": "7-7", "6,6": "6-6" };

/**
 * Tables 32 and 33, multiple decks. Wong: 8-8 has its own row because
 * splitting is an alternative; 7-7 is played as fourteen and 6-6 as twelve
 * ("there is no reason to separate 7-7 from other fourteens"). Against 8 and
 * 9 the two tables agree, as they must: those dealers cannot hold a natural.
 */
const MULTI_DECK_SURRENDER = {
  // Table 32, the ten column: early surrender, before the dealer checks for blackjack.
  early10: { "17": 5, "16": -5, "8,8": -2, "15": -2, "14": 0, "13": 3, "12": 8 } as Record<string, number>,
  // Table 33.
  late: {
    "8": { "16": 4, "15": 7 },
    "9": { "16": 0, "8,8": 7, "15": 2, "14": 6 },
    "10": { "16": -2, "8,8": 0, "15": 0, "14": 3, "13": 8 },
    "A-s17": { "16": -1, "15": 2, "14": 6 },
    "A-h17": { "16": -4, "15": 0, "14": 4 },
  } as Record<string, Record<string, number>>,
};

const oneDeckSurrender = Object.fromEntries((["A1s", "A3s"] as const).map((source) => [source, block(ONE_DECK_SURRENDER[source], SURRENDER_COLUMNS)])) as Record<"A1s" | "A3s", Map<string, Record<SurrenderColumn, string>>>;

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export interface WongGame { decks: number; hitSoft17: boolean }

export const wongTable = (game: WongGame): WongTable => (game.decks === 1 ? (game.hitSoft17 ? A1 : A3) : game.hitSoft17 ? A2 : A4);

/** The four appendix tables, for tests and the source notes. */
export const WONG_TABLES = { A1, A2, A3, A4 } as const;

export interface Sourced<T> { value: T; source: WongSource }

/**
 * The surrender threshold for a two-card hand, or undefined when Wong prints
 * nothing (never surrender). `early` is ES10: early against a ten, late
 * against everything else.
 */
export function surrenderGate(game: WongGame, early: boolean, row: string, dealer: Dealer): Sourced<Gate> | undefined {
  if (game.decks === 1) {
    const source = game.hitSoft17 ? "A1s" : "A3s";
    const printed = ONE_DECK_ROW[row] && oneDeckSurrender[source].get(ONE_DECK_ROW[row]);
    if (!printed) return undefined;
    const column: SurrenderColumn | undefined = dealer === "10" ? (early ? "e10" : "l10") : dealer === "A" ? "lA" : dealer === "7" || dealer === "8" || dealer === "9" ? dealer : undefined;
    const token = column && printed[column];
    return token && token !== "." ? { value: number(token), source } : undefined;
  }
  const key = row === "7,7" ? "14" : row === "6,6" ? "12" : row;
  if (dealer === "10" && early) {
    const value = MULTI_DECK_SURRENDER.early10[key];
    return value === undefined ? undefined : { value, source: "T32" };
  }
  const column = dealer === "A" ? (game.hitSoft17 ? "A-h17" : "A-s17") : dealer;
  const value = MULTI_DECK_SURRENDER.late[column]?.[key];
  return value === undefined ? undefined : { value, source: "T33" };
}

/** Table 11: take insurance at a count per deck of this or more. */
const INSURANCE: Record<number, number> = { 1: 1.4, 2: 2.4, 3: 2.7, 4: 2.9, 5: 3.0, 6: 3.0, 7: 3.1, 8: 3.1 };
export const insuranceGate = (decks: number): Sourced<number> => ({ value: INSURANCE[decks] ?? 3.3, source: "T11" });

/**
 * Table 30: when the dealer takes no hole card and you lose doubles and splits
 * to a natural, the only double against a ten or ace is eleven against a ten,
 * and the only split is aces. Everything else against those cards is "do not
 * double down or split" (p. 84).
 */
const NO_HOLE_CARD: Record<"A1" | "A2" | "A3" | "A4", { eleven10: number; aces10: number; acesA: number }> = {
  A1: { eleven10: 5, aces10: -9, acesA: 16 },
  A2: { eleven10: 4, aces10: -6, acesA: 24 },
  A3: { eleven10: 5, aces10: -9, acesA: 17 },
  A4: { eleven10: 4, aces10: -6, acesA: 24 },
};

export function noHoleCardDouble(game: WongGame, row: string, dealer: "10" | "A"): Sourced<Gate> {
  const source = wongTable(game).source as keyof typeof NO_HOLE_CARD;
  return { value: row === "11" && dealer === "10" ? NO_HOLE_CARD[source].eleven10 : "never", source: "T30" };
}

export function noHoleCardSplit(game: WongGame, row: string, dealer: "10" | "A"): Sourced<SplitGate> {
  const source = wongTable(game).source as keyof typeof NO_HOLE_CARD;
  if (row !== "A,A") return { value: { from: "never" }, source: "T30" };
  return { value: { from: dealer === "10" ? NO_HOLE_CARD[source].aces10 : NO_HOLE_CARD[source].acesA }, source: "T30" };
}
