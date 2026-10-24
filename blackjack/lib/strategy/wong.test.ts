import { describe, expect, it } from "vitest";
import { DEALERS, type Dealer } from "./indices";
import { gate, WONG_TABLES, type Gate, type SplitGate, type WongTable } from "./wong";

/**
 * Wong prints the four-deck numbers twice: in full in appendix A (A2, A4) and
 * cut to −10…+10 in chapter 3's summary tables 9 and 10 (pp. 46–49). Both are
 * transcribed separately, so every in-range cell is read twice from two
 * different pages; a slip in either shows up here.
 *
 * Notation of tables 9 and 10: "-" stand (or do not double/split), "h" hit
 * (or do not double/split), "db" double, "spl" split, a number, "n*" split
 * below n.
 */
const TABLE_9 = {
  // Columns 2 3 4 5 6 7 8 9 10 A.
  stand: `
    17   -   -   -   -   -   -   -   -   -  -6
    16  -8 -10   -   -   -   9   7   5   0   8
    15  -5  -6  -7  -9  -9  10  10   8   4  10
    14  -3  -4  -6  -7  -7   h   h   h   h   h
    13   0  -1  -3  -4  -4   h   h   h   h   h
    12   3   2   0  -1   0   h   h   h   h   h
    A,7  -   -   -   -   -   -   -   h   h   1`,
  double: `
    11  db  db  db  db  db  -9  -6  -4  -4   1
    10  -8  -9 -10  db  db  -6  -4  -1   4   4
    9    1   0  -2  -4  -6   3   7   h   h   h
    8    h   9   5   3   1   h   h   h   h   h
    7    h   h   h   9   9   h   h   h   h   h
    A,9 10   8   6   5   4   -   -   -   -   -
    A,8  8   5   3   1   1   -   -   -   -   -
    A,7  0  -2  -6  -8 -10   -   -   h   h   h
    A,6  1  -3  -7 -10  db   h   h   h   h   h
    A,5  h   4  -2  -6  db   h   h   h   h   h
    A,4  h   7   0  -4  -9   h   h   h   h   h
    A,3  h   7   1  -1  -4   h   h   h   h   h
    A,2  h   7   3   0  -1   h   h   h   h   h`,
  noDas: `
    A,A spl spl spl spl spl -9  -8  -7  -8  -3
    T,T  -   8   6   5   4   -   -   -   -   -
    9,9  0  -2  -3  -4  -4   6  -8  -9   -   3
    8,8 spl spl spl spl spl spl spl spl  6* spl
    7,7 -9 spl spl spl spl spl   h   h   h   h
    6,6  2   0  -3  -5  -7   h   h   h   h   h
    3,3  8   3   0  -2  -9 spl   h   h   h   h
    2,2  7   3   0  -4  -9 spl   h   h   h   h`,
  das: `
    A,A spl spl spl spl spl -9  -8  -7  -8  -3
    T,T  -   8   6   5   4   -   -   -   -   -
    9,9 -2  -3  -5  -6  -6   3  -8  -9   -   3
    8,8 spl spl spl spl spl spl spl spl  8* spl
    7,7 -9 spl spl spl spl spl   5   h   h   h
    6,6 -1  -4  -6  -8 -10   h   h   h   h   h
    4,4  h   6   1  -1  -4   h   h   h   h   h
    3,3  0  -4  -7  -9 spl spl   4   h   h   h
    2,2 -3  -5  -7  -9 spl spl   5   h   h   h`,
};

const TABLE_10 = {
  stand: `
    17   -   -   -   -   -   -   -   -   -  -4
    16  -9 -10   -   -   -   9   7   5   0   3
    15  -5  -7  -8  -9   -  10  10   8   4   5
    14  -3  -5  -6  -7  -9   h   h   h   h   9
    13   0  -2  -3  -4  -7   h   h   h   h   h
    12   3   1   0  -1  -3   h   h   h   h   h
    A,7  -   -   -   -   -   -   -   h   h   h`,
  double: `
    11  db  db  db  db  db  -9  -6  -4  -4   0
    10  -8  -9 -10  db  db  -6  -4  -1   4   3
    9    1   0  -2  -4  -6   3   7   h   h   h
    8    h   9   5   3   1   h   h   h   h   h
    7    h   h   h   9   9   h   h   h   h   h
    A,9 10   8   6   5   4   -   -   -   -   -
    A,8  8   5   3   1   0   -   -   -   -   -
    A,7  0  -2  -6  -8  db   -   -   h   h   h
    A,6  1  -3  -7 -10  db   h   h   h   h   h
    A,5  h   3  -3  -6  db   h   h   h   h   h
    A,4  h   6   0  -4 -10   h   h   h   h   h
    A,3  h   6   1  -1  -5   h   h   h   h   h
    A,2  h   7   3   0  -2   h   h   h   h   h`,
  noDas: `
    A,A spl spl spl spl spl -9  -8  -7  -8  -4
    T,T  -   8   6   5   4   -   -   -   -   -
    9,9 -1  -2  -3  -4  -6   6  -8  -9   -   2
    8,8 spl spl spl spl spl spl spl spl  6*  -1
    7,7 -8 -10 spl spl spl spl   h   h   h   h
    6,6  1  -1  -3  -5  -7   h   h   h   h   h
    3,3  8   3   0  -2  -5 spl   h   h   h   h
    2,2  7   3   0  -4  -7 spl   h   h   h   h`,
  das: `
    A,A spl spl spl spl spl -9  -8  -7  -8  -4
    T,T  -   8   6   5   4   -   -   -   -   -
    9,9 -2  -4  -5  -6  -8   3  -8  -9   -   1
    8,8 spl spl spl spl spl spl spl spl  8*  -1
    7,7 -10 spl spl spl spl spl  5   h   h   h
    6,6 -2  -4  -6  -8 -10   h   h   h   h   h
    4,4  h   6   1  -1  -6   h   h   h   h   h
    3,3  0  -3  -7  -9 spl spl   4   h   h   h
    2,2 -2  -5  -7  -9 spl spl   5   h   h   h`,
};

/** Where the book disagrees with itself: table 10 prints 9 for H17 hard 7 v 6; A2 and table 14 both print 8. The site reads A2. */
const KNOWN_MISPRINTS = new Set(["10 double 7 v 6"]);

const rows = (text: string) => text.trim().split("\n").map((line) => line.trim().split(/\s+/)).map(([label, ...cells]) => ({ label, cells }));

const fromSummary = (token: string): string => {
  if (token === "-" || token === "h") return "never";
  if (token === "db" || token === "spl") return "always";
  if (token.endsWith("*")) return `below ${Number(token.slice(0, -1))}`;
  return String(Number(token));
};
/** For hit/stand rows "-" is stand (always) and "h" is hit (never stand). */
const standFromSummary = (token: string) => (token === "-" ? "always" : token === "h" ? "never" : String(Number(token)));

const readGate = (value: Gate) => String(gate(value));
function readSplit(rule: SplitGate): string {
  const from = gate(rule.from);
  if (from === "never") return "never";
  const below = rule.below !== undefined && rule.below <= 10 ? rule.below : undefined;
  if (below === undefined) return String(from);
  return from === "always" ? `below ${below}` : `${from} below ${below}`;
}

function compare(name: string, summary: typeof TABLE_9, table: WongTable) {
  const mismatches: string[] = [];
  const check = (key: string, expected: string, actual: string) => {
    if (expected !== actual && !KNOWN_MISPRINTS.has(`${name} ${key}`)) mismatches.push(`${name} ${key}: table ${name} ${expected}, appendix ${actual}`);
  };
  for (const { label, cells } of rows(summary.stand)) cells.forEach((token, index) => check(`stand ${label} v ${DEALERS[index]}`, standFromSummary(token), readGate(table.stand.get(label)![DEALERS[index] as Dealer])));
  for (const { label, cells } of rows(summary.double)) cells.forEach((token, index) => check(`double ${label} v ${DEALERS[index]}`, fromSummary(token), readGate(table.double.get(label)![DEALERS[index] as Dealer])));
  for (const [kind, text] of [["noDas", summary.noDas], ["das", summary.das]] as const) {
    for (const { label, cells } of rows(text)) cells.forEach((token, index) => check(`${kind} ${label} v ${DEALERS[index]}`, fromSummary(token), readSplit(table.split[kind].get(label)![DEALERS[index] as Dealer])));
  }
  return mismatches;
}

describe("Wong's transcription", () => {
  it("matches summary table 9 (S17) cell for cell against appendix A4", () => {
    expect(compare("9", TABLE_9, WONG_TABLES.A4)).toEqual([]);
  });

  it("matches summary table 10 (H17) cell for cell against appendix A2", () => {
    expect(compare("10", TABLE_10, WONG_TABLES.A2)).toEqual([]);
    expect(readGate(WONG_TABLES.A2.double.get("7")!["6"])).toBe("8");
  });

  it("has a full row for every hand in every appendix table", () => {
    for (const table of Object.values(WONG_TABLES)) {
      expect([...table.stand.keys()]).toEqual(["A,7", "17", "16", "15", "14", "13", "12"]);
      expect([...table.double.keys()]).toEqual(["11", "10", "9", "8", "7", "6", "5", "A,9", "A,8", "A,7", "A,6", "A,5", "A,4", "A,3", "A,2"]);
      expect([...table.split.das.keys()]).toEqual(["A,A", "T,T", "9,9", "8,8", "7,7", "6,6", "5,5", "4,4", "3,3", "2,2"]);
    }
  });
});
