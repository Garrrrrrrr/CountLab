import { describe, expect, it } from "vitest";
import { H17_PRO_DEVIATIONS } from "./h17Pro";
import { BJA_H17_SECTIONS, CHART_DEALERS, cellKey, formatToken } from "./bjaH17Chart";
import { deviationTransition, resolveDeviation } from "./deviations";

const h17LateSurrender = { dealerHitsSoft17: true, lateSurrender: true };
const h17NoSurrender = { dealerHitsSoft17: true, lateSurrender: false };

/** The catalog's hand label for a printed chart row. */
const CHART_HAND: Record<string, string> = { "T,T": "10,10", "A,8": "Soft 19", "A,6": "Soft 17" };

/** Every index cell the chart prints, as `<hand> v <dealer> <token>`. */
const printedIndices = () => {
  const printed: string[] = [];
  for (const section of BJA_H17_SECTIONS) {
    for (const row of section.rows) {
      for (const dealer of CHART_DEALERS) {
        const token = section.cells.get(cellKey(section.id, row, dealer))!;
        if (token.kind === "index") printed.push(`${CHART_HAND[row] ?? row} v ${dealer} ${formatToken(token)}`);
      }
    }
  }
  return printed;
};

describe("H17 deviation catalog", () => {
  it("carries exactly the chart's printed indices, and no others", () => {
    // The reference page, the play drill and the chart drill all have to teach
    // one set of numbers. This is the guard against them drifting apart: the
    // catalog's indexed rows must be the chart's index cells, cell for cell.
    // Read through `deviationTransition`, so this compares the direction the
    // app actually teaches rather than the raw field: a two-sided cell stores
    // where the play reverts, and prints the opposite sign to its `direction`.
    const catalog = H17_PRO_DEVIATIONS
      .filter((row) => !row.always && row.hand !== "Insurance")
      .map((row) => {
        const { atOrBelow } = deviationTransition(row, h17LateSurrender);
        return `${row.hand} v ${row.dealer} ${row.index}${atOrBelow ? "-" : "+"}`;
      });

    expect([...catalog].sort()).toEqual([...printedIndices()].sort());
  });

  it("holds the chart's 30 decisions and its key boundaries", () => {
    expect(H17_PRO_DEVIATIONS).toHaveLength(30);
    // The chart's legend: "INSURANCE OR EVEN MONEY: TAKE AT 3+".
    expect(H17_PRO_DEVIATIONS.find((row) => row.hand === "Insurance")?.index).toBe(3);
    // The printed late surrenders: 17 v A, 16 v 10 and 16 v A.
    expect(H17_PRO_DEVIATIONS.filter((row) => row.always)).toHaveLength(3);
    expect(H17_PRO_DEVIATIONS.find((row) => row.hand === "10" && row.dealer === "10")?.index).toBe(4);
    expect(H17_PRO_DEVIATIONS.find((row) => row.hand === "10,10" && row.dealer === "4")?.index).toBe(6);
  });

  it("omits the cells the chart leaves blank", () => {
    // Other index charts carry these; this one prints nothing there, so the
    // drill must not ask for them.
    for (const [hand, dealer] of [["12", "5"], ["11", "A"], ["8", "5"], ["14", "10"], ["8,8", "10"], ["8,8", "A"]]) {
      expect(H17_PRO_DEVIATIONS.find((row) => row.hand === hand && row.dealer === dealer), `${hand} v ${dealer}`).toBeUndefined();
    }
    expect(resolveDeviation("H", "14", "10", 3, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("D", "11", "A", -2, h17LateSurrender).action).toBe("D");
  });

  it("applies starred stand indices only where surrender is unavailable", () => {
    // Standing on 15/16 versus a ten is worth about -0.53 to -0.58 at every
    // true count, so it never beats surrender's flat -0.50. The star is honoured
    // where the table (or the split hand) offers no surrender, and ignored where
    // it does. See the note on `overridesSurrender` and priceCell in deviationEv.
    expect(resolveDeviation("R", "16", "10", 0, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "16", "10", 4, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("H", "16", "10", -1, h17NoSurrender).action).toBe("H");
    expect(resolveDeviation("H", "16", "10", 0, h17NoSurrender).action).toBe("S");
    expect(resolveDeviation("R", "15", "A", 5, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("H", "15", "A", 5, h17NoSurrender).action).toBe("S");
  });

  it("stands above a surrender window the chart closes", () => {
    // 16 v 9 and 15 v 10 surrender at the bottom of the count only, so their
    // printed stand indices are live even in a game that offers surrender.
    expect(resolveDeviation("R", "16", "9", 4, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("H", "16", "9", 4, h17NoSurrender).action).toBe("S");
    expect(resolveDeviation("H", "16", "9", 3, h17NoSurrender).action).toBe("H");
    expect(resolveDeviation("R", "15", "10", 4, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("H", "15", "10", 3, h17NoSurrender).action).toBe("H");
    expect(resolveDeviation("H", "15", "10", 4, h17NoSurrender).action).toBe("S");
  });

  it("plays two-sided cells on both sides of their index, inclusive at the index", () => {
    // Basic strategy already makes these plays at TC 0, so the index is where
    // the chart reverts rather than where it departs. The chart prints these
    // as e.g. "-1-": the reverted play holds at that count too, not just below it.
    expect(resolveDeviation("S", "13", "2", -2, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "13", "2", -1, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "13", "2", 0, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("S", "12", "4", -1, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "4", 0, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "4", 1, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("D", "Soft 19", "6", 0, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("D", "Soft 19", "6", 1, h17LateSurrender).action).toBe("D");
    expect(resolveDeviation("S", "13", "2", -2, h17LateSurrender).belowIndex).toBe(true);
  });

  it("leaves one-sided cells and S17 tables untouched", () => {
    expect(resolveDeviation("H", "12", "2", 0, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("H", "12", "2", 3, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("R", "16", "A", 2, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "16", "A", 3, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("H", "16", "A", 3, h17NoSurrender).action).toBe("S");
    expect(resolveDeviation("H", "Soft 17", "2", 0, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("H", "Soft 17", "2", 1, h17LateSurrender).action).toBe("D");
    expect(resolveDeviation("S", "13", "2", -4, { dealerHitsSoft17: false, lateSurrender: true }).action).toBe("S");
  });

  it("surrenders inside the window the chart prints, and plays the hand above it", () => {
    // The chart surrenders 16 v 9 at -1 and below and 15 v 10 at 0 and below —
    // the reverse of the familiar Fab 4 indices, and verified against the PDF.
    expect(resolveDeviation("R", "16", "9", -2, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "16", "9", -1, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "16", "9", 0, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("R", "15", "10", 0, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "15", "10", 1, h17LateSurrender).action).toBe("H");
    // 15 v A runs the other way: surrender at -1 and above, hit below it.
    expect(resolveDeviation("R", "15", "A", -2, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("R", "15", "A", -1, h17LateSurrender).action).toBe("R");
    // With no surrender every one of them falls back to the hit/stand indices.
    expect(resolveDeviation("H", "16", "9", -2, h17NoSurrender).action).toBe("H");
    expect(resolveDeviation("H", "15", "10", 0, h17NoSurrender).action).toBe("H");
  });
});
