import { describe, expect, it } from "vitest";
import { BJA_H17_SECTIONS, CHART_DEALERS, cellKey, chartToken, formatToken } from "./bjaH17Chart";
import type { ChartSection, ChartToken } from "./bjaH17Chart";
import { ES10_H17_SECTIONS, chartSections } from "./es10Chart";
import { resolveDeviation } from "./deviations";
import type { DeviationAction, DeviationRules } from "./deviations";

const early: DeviationRules = { dealerHitsSoft17: true, lateSurrender: true, earlySurrenderVsTen: true };

const surrenderSection = (sections: readonly ChartSection[]) => sections.find((s) => s.id === "surrender")!;
const es10 = surrenderSection(ES10_H17_SECTIONS);
const bja = surrenderSection(BJA_H17_SECTIONS);

/** The catalog's hand label for a printed chart row. */
const HAND: Record<string, string> = { "8,8": "8,8" };
const handOf = (row: string) => HAND[row] ?? row;

/** What basic strategy does with the row when it is not surrendered. */
const PLAYED_OUT: Record<string, DeviationAction> = { "17": "S", "8,8": "P" };
const playedOut = (row: string) => PLAYED_OUT[row] ?? "H";

describe("the early-surrender-vs-10 H17 chart", () => {
  it("changes only the ten column of the surrender table", () => {
    // Early and late surrender can only differ where the dealer can hold a
    // natural, so every other column has to be the printed chart untouched.
    for (const row of bja.rows) {
      for (const dealer of CHART_DEALERS) {
        if (dealer === "10") continue;
        expect(formatToken(chartToken(es10, row, dealer)), `${row} v ${dealer}`)
          .toBe(formatToken(chartToken(bja, row, dealer)));
      }
    }
  });

  it("leaves the pair, soft and hard tables alone", () => {
    for (const chartSection of ES10_H17_SECTIONS) {
      if (chartSection.id === "surrender") continue;
      expect(chartSection).toBe(BJA_H17_SECTIONS.find((candidate) => candidate.id === chartSection.id));
    }
  });

  /**
   * The guard on the convention translation. The chart prints where the play
   * departs from its basic-strategy background, so a cell this rule surrenders
   * prints Wong's index minus one, as a downward index. Rather than assert the
   * arithmetic, every printed cell is replayed through the shared catalog: if
   * the chart and the play drill ever disagree about a count, this fails.
   */
  it("agrees with the shared catalog at every ten-column cell", () => {
    for (const row of es10.rows) {
      const token = chartToken(es10, row, "10");
      const hand = handOf(row);
      const plays = (tc: number) => resolveDeviation(playedOut(row), hand, "10", tc, early).action;
      const surrendersAt = (tc: number) => expect(plays(tc), `${row} v 10 at ${tc}`).toBe("R");
      const playsOutAt = (tc: number) => expect(plays(tc), `${row} v 10 at ${tc}`).toBe(playedOut(row));

      if (token.kind === "action") {
        expect(token.value, `${row} v 10`).toBe("N");
        for (const tc of [-6, 0, 6]) playsOutAt(tc);
        continue;
      }
      if (token.when === "atOrAbove") {
        // Printed "5+": surrender from the index up, play it out below.
        surrendersAt(token.value);
        surrendersAt(token.value + 1);
        playsOutAt(token.value - 1);
      } else {
        // Printed "-6-": play it out at the index and below, surrender above.
        playsOutAt(token.value);
        playsOutAt(token.value - 1);
        surrendersAt(token.value + 1);
      }
    }
  });

  it("carries the rows late surrender has no entry for", () => {
    // Hard 13 and 12 surrender against a ten only once the dealer's natural is
    // on the table, so the printed late-surrender chart has no row for them.
    expect(es10.rows).toContain("13");
    expect(es10.rows).toContain("12");
    expect(bja.rows).not.toContain("13");
    expect(bja.rows).not.toContain("12");
  });

  it("fills in the 8,8 row the printed chart omits", () => {
    const cell = (dealer: string) => formatToken(chartToken(es10, "8,8", dealer));
    expect(cell("9")).toBe("7+");
    expect(cell("10")).toBe("-3-");
    // The app's own strategy grid surrenders 8,8 against an ace under H17 late
    // surrender; printing "N" here would teach the opposite of the chart page.
    expect(cell("A")).toBe("SUR");
    expect(bja.rows).not.toContain("8,8");
  });

  it("is well formed the same way the printed chart is", () => {
    const seen = new Set<string>();
    for (const chartSection of ES10_H17_SECTIONS) {
      expect(chartSection.cells.size).toBe(chartSection.rows.length * CHART_DEALERS.length);
      for (const row of chartSection.rows) {
        for (const dealer of CHART_DEALERS) {
          const key = cellKey(chartSection.id, row, dealer);
          expect(seen.has(key), key).toBe(false);
          seen.add(key);
          expect(chartSection.cells.get(key)).toBeDefined();
        }
      }
    }
  });

  it("selects the printed chart for late surrender", () => {
    expect(chartSections("late")).toBe(BJA_H17_SECTIONS);
    expect(chartSections("early10")).toBe(ES10_H17_SECTIONS);
  });
});

describe("chart tokens", () => {
  it("prints downward indices with a trailing minus", () => {
    const token: ChartToken = { kind: "index", value: -6, when: "atOrBelow" };
    expect(formatToken(token)).toBe("-6-");
  });
});
