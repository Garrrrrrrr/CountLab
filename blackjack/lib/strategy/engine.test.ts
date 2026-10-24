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

/** Asserts a play changes exactly at `index`: `below` one step on the far side, `above` at the index. */
function switchesAt(table: TableRules, cell: CellRef, index: number, dir: "up" | "down", before: string, after: string) {
  const far = dir === "up" ? index - 1 : index + 1;
  expect(at(table, cell, far), `${cell.section} ${cell.row} v ${cell.dealer} at ${far}`).toBe(before);
  expect(at(table, cell, index), `${cell.section} ${cell.row} v ${cell.dealer} at ${index}`).toBe(after);
}

describe("basic strategy grid fixes from the EV audit", () => {
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

  it("plays single-deck 14 v 10 on under early surrender, and gives it up from two decks", () => {
    expect(at(rules({ decks: 1, surrender: "early" }), hard("14", "10"))).toBe("H");
    expect(at(rules({ decks: 2, surrender: "early" }), hard("14", "10"))).toBe("R");
  });

  it("lets 5,5 double wherever hard 10 may be doubled", () => {
    expect(at(rules({ doubling: "10-11" }), pair("5,5", "6"))).toBe("D");
    expect(at(rules({ doubling: "9-11" }), pair("5,5", "9"))).toBe("D");
    expect(at(rules({ doubling: "10-11" }), soft("A,7", "4"))).toBe("S");
  });
});

describe("Illustrious 18 and Fab 4, S17 shoe game", () => {
  it("switches each play exactly at its published index", () => {
    switchesAt(S17_NS, hard("16", "10"), 0, "up", "H", "S");
    switchesAt(S17_NS, hard("15", "10"), 4, "up", "H", "S");
    switchesAt(S17, pair("T,T", "5"), 5, "up", "S", "P");
    switchesAt(S17, pair("T,T", "6"), 4, "up", "S", "P");
    switchesAt(S17, hard("10", "10"), 4, "up", "H", "D");
    switchesAt(S17, hard("12", "3"), 2, "up", "H", "S");
    switchesAt(S17, hard("12", "2"), 3, "up", "H", "S");
    switchesAt(S17, hard("11", "A"), 1, "up", "H", "D");
    switchesAt(S17, hard("9", "2"), 1, "up", "H", "D");
    switchesAt(S17, hard("10", "A"), 4, "up", "H", "D");
    switchesAt(S17, hard("9", "7"), 3, "up", "H", "D");
    // I18 stand indices on the negative side: stand at the index, hit one below.
    switchesAt(S17, hard("13", "2"), -2, "down", "S", "H");
    switchesAt(S17, hard("12", "4"), -1, "down", "S", "H");
    switchesAt(S17, hard("12", "5"), -3, "down", "S", "H");
    switchesAt(S17, hard("12", "6"), -2, "down", "S", "H");
    switchesAt(S17, hard("13", "3"), -3, "down", "S", "H");
  });

  it("surrenders at the Fab 4 thresholds", () => {
    switchesAt(S17, hard("14", "10"), 3, "up", "H", "R");
    switchesAt(S17, hard("15", "10"), 0, "up", "H", "R");
    switchesAt(S17, hard("15", "9"), 2, "up", "H", "R");
    switchesAt(S17, hard("15", "A"), 1, "up", "H", "R");
  });

  it("takes insurance at +3", () => {
    expect(takeInsurance(2)).toBe(false);
    expect(takeInsurance(3)).toBe(true);
    expect(takeInsurance(undefined)).toBe(false);
  });
});

describe("Blackjack Apprenticeship H17 chart", () => {
  it("reads 0- as a negative count and 0+ as zero or more", () => {
    // 12 v 4 "0-": hit only below zero. The old resolver hit at exactly 0.
    switchesAt(H17, hard("12", "4"), -1, "down", "S", "H");
    // Soft 19 v 6 is a basic double in H17; "0-" stands only below zero.
    expect(at(H17, soft("A,8", "6"), 0)).toBe("D");
    expect(at(H17, soft("A,8", "6"), -1)).toBe("S");
    // 15 v 10 surrender "0-": surrender at 0 and up, play on below.
    switchesAt(H17, hard("15", "10"), 0, "up", "H", "R");
    switchesAt(H17, hard("16", "9"), 0, "up", "H", "R");
    switchesAt(H17_NS, hard("16", "10"), 0, "up", "H", "S");
  });

  it("prints the rest of the chart's indices where they belong", () => {
    switchesAt(H17, hard("13", "2"), -1, "down", "S", "H");
    switchesAt(H17, hard("11", "A"), -2, "down", "D", "H");
    switchesAt(H17, hard("10", "A"), 3, "up", "H", "D");
    switchesAt(H17, soft("A,6", "2"), 1, "up", "H", "D");
    switchesAt(H17, soft("A,8", "4"), 3, "up", "S", "D");
    switchesAt(H17, soft("A,8", "5"), 1, "up", "S", "D");
    switchesAt(H17, hard("8", "6"), 2, "up", "H", "D");
    switchesAt(H17, pair("T,T", "4"), 6, "up", "S", "P");
    switchesAt(H17, hard("15", "A"), -1, "up", "H", "R");
    switchesAt(H17, hard("16", "8"), 4, "up", "H", "R");
    switchesAt(H17_NS, hard("16", "A"), 3, "up", "H", "S");
    switchesAt(H17_NS, hard("15", "A"), 5, "up", "H", "S");
    expect(at(H17, hard("16", "10"), -10)).toBe("R");
    expect(at(H17, hard("17", "A"), -10)).toBe("R");
  });
});

describe("pairs played as their total", () => {
  it("doubles 5,5 v 10 like hard 10", () => {
    switchesAt(H17, pair("5,5", "10"), 4, "up", "H", "D");
    expect(playIndex(H17, pair("5,5", "A"))?.at).toBe(3);
  });

  it("surrenders 7,7 v 10 as a hard fourteen and never borrows a stand index onto a split pair", () => {
    switchesAt(H17, pair("7,7", "10"), 3, "up", "H", "R");
    switchesAt(H17_ES, pair("7,7", "10"), 0, "up", "H", "R");
    expect(playIndex(H17_NS, pair("8,8", "10"))).toBeUndefined();
    expect(at(H17_NS, pair("8,8", "10"), 6)).toBe("P");
  });
});

describe("early surrender against a ten (Wong table 32)", () => {
  it("uses the ten-column thresholds and keeps late surrender against an ace", () => {
    switchesAt(H17_ES, hard("17", "10"), 5, "up", "S", "R");
    switchesAt(H17_ES, hard("16", "10"), -5, "up", "H", "R");
    switchesAt(H17_ES, hard("15", "10"), -2, "up", "H", "R");
    switchesAt(H17_ES, hard("14", "10"), 0, "up", "H", "R");
    switchesAt(H17_ES, hard("13", "10"), 3, "up", "H", "R");
    switchesAt(H17_ES, hard("12", "10"), 8, "up", "H", "R");
    switchesAt(H17_ES, pair("8,8", "10"), -2, "up", "P", "R");
    expect(surrenderRule(H17_ES, hard("15", "A")).at).toBe(-1);
    expect(at(H17_ES, hard("17", "A"), -10)).toBe("R");
  });
});

describe("whole-chart invariants", () => {
  const cells: CellRef[] = (["hard", "soft", "pairs"] as const).flatMap((section) => STRATEGY_ROWS[section].flatMap((row) => DEALERS.map((dealer) => ({ section, row, dealer }))));
  const counts = Array.from({ length: 25 }, (_, index) => index - 10);

  it("gives H17 and S17 the same play against 7 through 10 at every count", () => {
    for (const surrender of ["none", "late", "early"] as const) {
      for (const cell of cells.filter((entry) => ["7", "8", "9", "10"].includes(entry.dealer))) {
        for (const tc of [undefined, ...counts]) {
          expect(at(rules({ surrender }), cell, tc), `${surrender} ${cell.section} ${cell.row} v ${cell.dealer} @ ${tc}`)
            .toBe(at(rules({ surrender, hitSoft17: false }), cell, tc));
        }
      }
    }
  });

  it("changes each shoe-game decision at most once across the count range", () => {
    for (const table of [H17, S17, H17_NS, S17_NS, H17_ES, rules({ hitSoft17: false, surrender: "early" })]) {
      for (const cell of cells) {
        const plays = counts.map((tc) => at(table, cell, tc));
        const flips = plays.filter((play, index) => index > 0 && play !== plays[index - 1]).length;
        expect(flips, `${cell.section} ${cell.row} v ${cell.dealer}: ${plays.join("")}`).toBeLessThanOrEqual(1);
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
  it("applies stand indices to drawn hands and drops doubles they cannot make", () => {
    expect(decideHand({ cards: [card("6"), card("4"), card("6")], upcard: card("K"), rules: H17, tc: 1 }).action).toBe("S");
    expect(decideHand({ cards: [card("A"), card("5"), card("3")], upcard: card("4"), rules: H17, tc: 4 }).action).toBe("S");
    expect(decideHand({ cards: [card("A"), card("8")], upcard: card("4"), rules: H17, tc: 4 }).action).toBe("D");
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
  it("flags hard cells basic strategy surrenders and lists their thresholds", async () => {
    const { buildChart, cellKey, countLadder, indexList } = await import("./chart");
    const chart = buildChart(H17);
    expect(chart.tables.hard.cells.get(cellKey(hard("16", "10")))?.surrenderFirst).toBe(true);
    expect(chart.tables.hard.cells.get(cellKey(hard("16", "10")))?.index?.at).toBe(0);
    expect(chart.surrender?.cells.get(cellKey(hard("17", "A")))?.at).toBe(-Infinity);
    expect(chart.surrender?.cells.get(cellKey(hard("16", "8")))?.at).toBe(4);
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
