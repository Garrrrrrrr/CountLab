import { describe, expect, it } from "vitest";
import type { Card, Rank } from "@/lib/blackjack/types";
import { cellDecision, decideHand, playIndex, surrenderRule, takeInsurance, type CellRef } from "./engine";
import { DEALERS, type Dealer } from "./indices";
import { DEFAULT_TABLE_RULES, type TableRules } from "./rules";
import { STRATEGY_ROWS } from "@/lib/blackjack/strategyTables";

const rules = (patch: Partial<TableRules> = {}): TableRules => ({ ...DEFAULT_TABLE_RULES, ...patch });
const H17 = rules();
const S17 = rules({ hitSoft17: false });
const H17_NS = rules({ surrender: "none" });
const S17_NS = rules({ hitSoft17: false, surrender: "none" });
const H17_ES = rules({ surrender: "early" });
const hard = (row: string, dealer: Dealer): CellRef => ({ section: "hard", row, dealer });
const soft = (row: string, dealer: Dealer): CellRef => ({ section: "soft", row, dealer });
const pair = (row: string, dealer: Dealer): CellRef => ({ section: "pairs", row, dealer });
const at = (table: TableRules, cell: CellRef, tc?: number) => cellDecision(table, cell, tc).action;
const card = (rank: Rank): Card => ({ rank, suit: "spades" });

/** Asserts a play changes exactly at Wong's number: `below` one under it, `from` at it. */
function switchesAt(table: TableRules, cell: CellRef, number: number, below: string, from: string) {
  expect(at(table, cell, number - 1), `${cell.section} ${cell.row} v ${cell.dealer} at ${number - 1}`).toBe(below);
  expect(at(table, cell, number), `${cell.section} ${cell.row} v ${cell.dealer} at ${number}`).toBe(from);
}

describe("basic strategy grid fixes from the EV audit (no count)", () => {
  it("surrenders hard 17 v A in 4-8 deck H17 and stands on it in S17", () => {
    for (const decks of [4, 6, 8]) {
      expect(at(rules({ decks }), hard("17", "A"))).toBe("R");
      expect(at(rules({ decks, hitSoft17: false }), hard("17", "A"))).toBe("S");
    }
    expect(at(H17_NS, hard("17", "A"))).toBe("S");
  });

  it("fixes single-deck H17 15 v A, double-deck S17 11 v A and double-deck H17 soft 18 v 2", () => {
    expect(at(rules({ decks: 1 }), hard("15", "A"))).toBe("R");
    expect(at(rules({ decks: 2, hitSoft17: false }), hard("11", "A"))).toBe("D");
    expect(at(rules({ decks: 2 }), soft("A,7", "2"))).toBe("D");
  });

  it("lets 5,5 double wherever hard 10 may be doubled", () => {
    expect(at(rules({ doubling: "10-11" }), pair("5,5", "6"))).toBe("D");
    expect(at(rules({ doubling: "9-11" }), pair("5,5", "9"))).toBe("D");
    expect(at(rules({ doubling: "10-11" }), soft("A,7", "4"))).toBe("S");
  });
});

describe("Wong table A4, four or more decks, S17", () => {
  it("stands, doubles and splits exactly at his numbers", () => {
    switchesAt(S17_NS, hard("16", "10"), 0, "H", "S");
    switchesAt(S17_NS, hard("15", "10"), 4, "H", "S");
    switchesAt(S17_NS, hard("16", "9"), 5, "H", "S");
    switchesAt(S17_NS, hard("12", "2"), 3, "H", "S");
    switchesAt(S17_NS, hard("12", "3"), 2, "H", "S");
    switchesAt(S17_NS, hard("12", "4"), 0, "H", "S");
    switchesAt(S17_NS, hard("12", "5"), -1, "H", "S");
    switchesAt(S17_NS, hard("12", "6"), 0, "H", "S");
    switchesAt(S17_NS, hard("13", "2"), 0, "H", "S");
    switchesAt(S17_NS, hard("13", "3"), -1, "H", "S");
    switchesAt(S17_NS, hard("17", "A"), -6, "H", "S");
    switchesAt(S17, hard("10", "10"), 4, "H", "D");
    switchesAt(S17, hard("10", "A"), 4, "H", "D");
    switchesAt(S17, hard("11", "A"), 1, "H", "D");
    switchesAt(S17, hard("9", "2"), 1, "H", "D");
    switchesAt(S17, hard("9", "7"), 3, "H", "D");
    switchesAt(S17, soft("A,8", "6"), 1, "S", "D");
    switchesAt(S17_NS, soft("A,7", "A"), 1, "H", "S");
    switchesAt(S17, pair("T,T", "4"), 6, "S", "P");
    switchesAt(S17, pair("T,T", "5"), 5, "S", "P");
    switchesAt(S17, pair("T,T", "6"), 4, "S", "P");
    switchesAt(S17, pair("9,9", "7"), 3, "S", "P"); // with DAS; 6 without
    switchesAt(rules({ hitSoft17: false, das: false }), pair("9,9", "7"), 6, "S", "P");
  });
});

describe("Wong table A2, four or more decks, H17", () => {
  it("reads the H17 numbers", () => {
    switchesAt(H17_NS, hard("12", "6"), -3, "H", "S");
    switchesAt(H17_NS, hard("16", "A"), 3, "H", "S");
    switchesAt(H17_NS, hard("15", "A"), 5, "H", "S");
    switchesAt(H17_NS, hard("14", "A"), 9, "H", "S");
    switchesAt(H17_NS, hard("17", "A"), -4, "H", "S");
    switchesAt(H17, hard("11", "A"), 0, "H", "D");
    switchesAt(H17, hard("10", "A"), 3, "H", "D");
    switchesAt(H17, soft("A,8", "6"), 0, "S", "D");
    switchesAt(H17, pair("9,9", "A"), 1, "S", "P"); // with DAS; 2 without
    switchesAt(rules({ das: false }), pair("9,9", "A"), 2, "S", "P");
    // Hard 7 v 6 doubles at +8 in A2 (and table 14); table 10 prints 9.
    switchesAt(H17, hard("7", "6"), 8, "H", "D");
  });

  it("reads past ±10 as always or never, as his summary tables do", () => {
    expect(at(H17_NS, hard("16", "2"), -10)).toBe("H"); // -9
    expect(at(H17_NS, hard("16", "4"), -10)).toBe("S"); // -11: always stand
    expect(at(H17, soft("A,7", "6"), -10)).toBe("D"); // -13: always double
    expect(at(H17, hard("8", "2"), 10)).toBe("H"); // 13: never double
  });
});

describe("Wong's pair rules", () => {
  it("splits 8,8 v 10 only below his starred number, then plays sixteen", () => {
    switchesAt(H17_NS, pair("8,8", "10"), 8, "P", "S"); // 8* with DAS
    switchesAt(rules({ surrender: "none", das: false }), pair("8,8", "10"), 6, "P", "S"); // 6* without
  });

  it("splits 7,7 v 8 from +5 with DAS (5/19*)", () => {
    switchesAt(H17_NS, pair("7,7", "8"), 5, "H", "P");
  });

  it("doubles 8 instead of splitting 4,4 without DAS, and splits it when 8 cannot be doubled", () => {
    const noDas = rules({ surrender: "none", das: false, hitSoft17: false });
    switchesAt(noDas, pair("4,4", "5"), 3, "H", "D");
    for (let tc = -10; tc <= 10; tc++) expect(at(noDas, pair("4,4", "5"), tc)).not.toBe("P");
    switchesAt({ ...noDas, doubling: "10-11" }, pair("4,4", "5"), 8, "H", "P");
    // With DAS splitting comes first: 4,4 v 5 splits from -1.
    switchesAt(rules({ surrender: "none", hitSoft17: false }), pair("4,4", "5"), -1, "H", "P");
  });

  it("plays an unsplit pair as its total", () => {
    switchesAt(H17, pair("5,5", "10"), 4, "H", "D");
    expect(playIndex(H17, pair("5,5", "A"))?.at).toBe(3);
  });
});

describe("Wong tables 32 and 33, surrender, multiple decks", () => {
  it("late surrender (table 33)", () => {
    switchesAt(H17, hard("16", "10"), -2, "H", "R");
    switchesAt(H17, hard("15", "10"), 0, "H", "R");
    switchesAt(H17, hard("14", "10"), 3, "H", "R");
    switchesAt(H17, hard("13", "10"), 8, "H", "R");
    switchesAt(H17, hard("16", "9"), 0, "H", "R");
    switchesAt(H17, hard("15", "9"), 2, "H", "R");
    switchesAt(H17, hard("14", "9"), 6, "H", "R");
    switchesAt(H17, hard("16", "8"), 4, "H", "R");
    switchesAt(H17, hard("15", "8"), 7, "H", "R");
    switchesAt(H17, pair("8,8", "10"), 0, "P", "R");
    switchesAt(H17, pair("8,8", "9"), 7, "P", "R");
    switchesAt(H17, pair("7,7", "10"), 3, "H", "R"); // 7-7 is played as fourteen
    switchesAt(H17, hard("16", "A"), -4, "H", "R");
    switchesAt(H17, hard("15", "A"), 0, "H", "R");
    switchesAt(H17, hard("14", "A"), 4, "H", "R");
    switchesAt(S17, hard("16", "A"), -1, "H", "R");
    switchesAt(S17, hard("15", "A"), 2, "H", "R");
    switchesAt(S17, hard("14", "A"), 6, "H", "R");
  });

  it("never surrenders what Wong prints no number for, even where basic strategy does", () => {
    // Basic strategy gives up 17 v A (H17) and 8,8 v A (H17); table 33 has no entry for either.
    expect(at(H17, hard("17", "A"))).toBe("R");
    for (let tc = -10; tc <= 10; tc++) expect(at(H17, hard("17", "A"), tc)).not.toBe("R");
    switchesAt(H17, hard("17", "A"), -4, "H", "S"); // and table A2's stand number
    expect(surrenderRule(H17, hard("17", "A"))).toMatchObject({ at: Infinity, basic: true });
  });

  it("early surrender against a ten (table 32), late against an ace", () => {
    switchesAt(H17_ES, hard("17", "10"), 5, "S", "R");
    switchesAt(H17_ES, hard("16", "10"), -5, "H", "R");
    switchesAt(H17_ES, hard("15", "10"), -2, "H", "R");
    switchesAt(H17_ES, hard("14", "10"), 0, "H", "R");
    switchesAt(H17_ES, hard("13", "10"), 3, "H", "R");
    switchesAt(H17_ES, hard("12", "10"), 8, "H", "R");
    switchesAt(H17_ES, pair("8,8", "10"), -2, "P", "R");
    switchesAt(H17_ES, pair("7,7", "10"), 0, "H", "R");
    switchesAt(H17_ES, pair("6,6", "10"), 8, "H", "R");
    expect(surrenderRule(H17_ES, hard("15", "A")).at).toBe(0);
  });
});

describe("Wong tables A1 and A3, one deck", () => {
  const one = rules({ decks: 1 });
  it("reads the one-deck numbers", () => {
    switchesAt({ ...one, surrender: "none" }, hard("16", "10"), 1, "H", "S");
    switchesAt({ ...one, surrender: "none" }, hard("15", "10"), 5, "H", "S");
    switchesAt(one, hard("10", "9"), 0, "H", "D");
    switchesAt(one, hard("8", "5"), 2, "H", "D");
    // 11* with DAS: split below +11, which is past +10, so always.
    for (let tc = -10; tc <= 10; tc++) expect(at(one, pair("6,6", "7"), tc)).toBe("P");
    switchesAt(rules({ decks: 1, das: false, surrender: "none" }), pair("6,6", "7"), 0, "P", "H"); // 0*
  });

  it("surrenders from the ten-card row of the one-deck surrender page", () => {
    const es = rules({ decks: 1, surrender: "early" });
    switchesAt(es, hard("14", "10"), 0, "H", "R");
    switchesAt(es, hard("16", "10"), -4, "H", "R");
    switchesAt(es, hard("17", "10"), 4, "S", "R");
    switchesAt(es, pair("8,8", "10"), -1, "P", "R");
    switchesAt(es, pair("7,7", "10"), -5, "H", "R");
    switchesAt(one, hard("16", "10"), -1, "H", "R");
    switchesAt(one, hard("16", "A"), -3, "H", "R");
    switchesAt(rules({ decks: 1, hitSoft17: false }), hard("16", "A"), 0, "H", "R");
  });
});

describe("Wong table 11, insurance", () => {
  it("varies with the number of decks", () => {
    expect(takeInsurance({ decks: 6 }, 2)).toBe(false);
    expect(takeInsurance({ decks: 6 }, 3)).toBe(true);
    expect(takeInsurance({ decks: 1 }, 1)).toBe(false);
    expect(takeInsurance({ decks: 1 }, 2)).toBe(true);
    expect(takeInsurance({ decks: 2 }, 2)).toBe(false);
    expect(takeInsurance({ decks: 8 }, 3)).toBe(false); // 3.1
    expect(takeInsurance({ decks: 8 }, 4)).toBe(true);
    expect(takeInsurance({ decks: 6 }, undefined)).toBe(false);
  });
});

describe("Wong table 30, no hole card", () => {
  const enhc = rules({ noHoleCard: true });
  it("doubles only eleven against a ten and splits only aces", () => {
    switchesAt(enhc, hard("11", "10"), 4, "H", "D");
    for (let tc = -10; tc <= 10; tc++) {
      expect(at(enhc, hard("11", "A"), tc)).toBe("H");
      expect(at(enhc, hard("10", "10"), tc)).toBe("H");
      expect(at(enhc, pair("9,9", "A"), tc)).toBe("S");
    }
    switchesAt(enhc, pair("A,A", "10"), -6, "H", "P");
    expect(at(enhc, pair("8,8", "10"), 0)).toBe("S");
  });
});

describe("whole-chart invariants", () => {
  const cells: CellRef[] = (["hard", "soft", "pairs"] as const).flatMap((section) => STRATEGY_ROWS[section].flatMap((row) => DEALERS.map((dealer) => ({ section, row, dealer }))));
  const counts = Array.from({ length: 25 }, (_, index) => index - 12);

  it("gives H17 and S17 the same play against 7 through 10 at every count", () => {
    for (const decks of [1, 6]) for (const surrender of ["none", "late", "early"] as const) {
      for (const cell of cells.filter((entry) => ["7", "8", "9", "10"].includes(entry.dealer))) {
        for (const tc of [undefined, ...counts]) {
          expect(at(rules({ decks, surrender }), cell, tc), `${decks}D ${surrender} ${cell.section} ${cell.row} v ${cell.dealer} @ ${tc}`)
            .toBe(at(rules({ decks, surrender, hitSoft17: false }), cell, tc));
        }
      }
    }
  });

  it("changes each play at most once across the count range", () => {
    for (const decks of [1, 2, 6]) for (const hitSoft17 of [true, false]) for (const das of [true, false]) {
      const table = rules({ decks, hitSoft17, das, surrender: "none" });
      for (const cell of cells) {
        const plays = counts.map((tc) => at(table, cell, tc));
        const flips = plays.filter((play, index) => index > 0 && play !== plays[index - 1]).length;
        expect(flips, `${decks}D ${cell.section} ${cell.row} v ${cell.dealer}: ${plays.join("")}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("never surrenders a hand later under early surrender than under late", () => {
    for (const decks of [1, 2, 4, 6, 8]) for (const hitSoft17 of [true, false]) for (const das of [true, false]) {
      for (const cell of cells.filter((entry) => entry.section !== "soft" && entry.dealer === "10")) {
        const early = surrenderRule(rules({ decks, hitSoft17, das, surrender: "early" }), cell).at;
        const late = surrenderRule(rules({ decks, hitSoft17, das, surrender: "late" }), cell).at;
        expect(early, `${decks}D ${hitSoft17 ? "H17" : "S17"} ${das ? "DAS" : "no DAS"} ${cell.section} ${cell.row} v 10`).toBeLessThanOrEqual(late);
      }
    }
  });

  it("never recommends surrender where the table has none", () => {
    for (const table of [H17_NS, S17_NS, rules({ noHoleCard: true })]) {
      for (const cell of cells) for (const tc of counts) expect(at(table, cell, tc)).not.toBe("R");
    }
  });
});

describe("live hands", () => {
  it("applies stand numbers to drawn hands and drops doubles they cannot make", () => {
    expect(decideHand({ cards: [card("6"), card("4"), card("6")], upcard: card("K"), rules: H17, tc: 1 }).action).toBe("S");
    expect(decideHand({ cards: [card("A"), card("5"), card("3")], upcard: card("4"), rules: H17, tc: 4 }).action).toBe("S");
    expect(decideHand({ cards: [card("A"), card("8")], upcard: card("4"), rules: H17, tc: 4 }).action).toBe("D");
    // Hard 7, below the printed chart, doubles at Wong's +9 against a 5.
    expect(decideHand({ cards: [card("4"), card("3")], upcard: card("5"), rules: H17, tc: 9 }).action).toBe("D");
  });

  it("plays an unsplittable pair as its total", () => {
    expect(decideHand({ cards: [card("A"), card("A")], upcard: card("6"), rules: H17, canSplit: false }).action).toBe("H");
    expect(decideHand({ cards: [card("8"), card("8")], upcard: card("6"), rules: H17, canSplit: false }).action).toBe("S");
    expect(decideHand({ cards: [card("8"), card("8")], upcard: card("6"), rules: H17 }).action).toBe("P");
  });

  it("only surrenders original two-card hands", () => {
    expect(decideHand({ cards: [card("10"), card("6")], upcard: card("10"), rules: H17 }).action).toBe("R");
    expect(decideHand({ cards: [card("10"), card("6")], upcard: card("10"), rules: H17, canSurrender: false }).action).toBe("H");
    expect(decideHand({ cards: [card("10"), card("6")], upcard: card("10"), rules: H17, canSurrender: false, tc: 0 }).action).toBe("S");
  });
});

describe("chart model", () => {
  it("flags hard cells basic strategy surrenders and prints Wong's numbers", async () => {
    const { buildChart, cellKey, countLadder, indexList } = await import("./chart");
    const chart = buildChart(H17);
    expect(chart.tables.hard.cells.get(cellKey(hard("16", "10")))?.surrenderFirst).toBe(true);
    expect(chart.tables.hard.cells.get(cellKey(hard("16", "10")))?.index).toMatchObject({ play: "S", dir: "up", at: 0, source: "A2" });
    expect(chart.surrender?.cells.get(cellKey(hard("16", "10")))?.at).toBe(-2);
    expect(chart.surrender?.cells.get(cellKey(hard("16", "8")))).toMatchObject({ at: 4, source: "T33" });
    expect(chart.insuranceAt).toBe(3);
    expect(buildChart(rules({ decks: 1 })).insuranceAt).toBe(1.4);
    expect(buildChart(H17_NS).surrender).toBeNull();
    expect(countLadder(H17, hard("15", "10"), -3, 3)).toEqual([
      { from: -3, to: -1, action: "H", fallback: undefined },
      { from: 0, to: 3, action: "R", fallback: "H" },
    ]);
    const list = indexList(S17);
    expect(list[0].id).toBe("insurance");
    expect(list[1].id).toBe("hard:16v10");
    expect(new Set(list.map((entry) => entry.id)).size).toBe(list.length);
  });
});
