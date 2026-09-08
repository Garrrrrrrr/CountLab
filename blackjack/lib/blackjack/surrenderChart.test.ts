import { describe, expect, it } from "vitest";
import { CHART_DEALERS } from "./bjaH17Chart";
import { deviationGridCells } from "./deviationChart";
import { resolveDeviation } from "./deviations";
import type { DeviationAction } from "./deviations";
import { chartCell } from "./strategyChart";
import type { StrategyChartRules, StrategySectionId } from "./strategyChart";
import { STRATEGY_ROWS } from "./strategyTables";
import { surrenderChart, toDeviationRules } from "./surrenderChart";

const base: StrategyChartRules = {
  decks: 6,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  surrender: "late",
  doubleRule: "any",
  europeanNoHoleCard: false,
};

const RULES: Array<[string, StrategyChartRules]> = [
  ["H17 late", base],
  ["H17 early vs 10", { ...base, surrender: "early" }],
  ["S17 late", { ...base, dealerHitsSoft17: false }],
  ["S17 early vs 10", { ...base, dealerHitsSoft17: false, surrender: "early" }],
];

const SECTIONS: StrategySectionId[] = ["hard", "soft", "pairs"];
const COUNTS = [-6, -4, -2, -1, 0, 1, 2, 3, 4, 5, 6, 8];

/** Catalog hand labels are not chart row labels. */
const handLabel = (section: StrategySectionId, row: string) => {
  if (section === "soft") return `Soft ${11 + Number(row.split(",")[1])}`;
  if (section === "pairs") return row === "T,T" ? "10,10" : row;
  return row;
};

/**
 * What the app told the player to do before surrender was split out: one
 * lookup, with surrender available, resolved against the catalog.
 */
function combinedPlay(rules: StrategyChartRules, section: StrategySectionId, row: string, dealer: string, tc: number): DeviationAction {
  const basic = chartCell(rules, section, row, dealer).action;
  return resolveDeviation(basic, handLabel(section, row), dealer, tc, toDeviationRules(rules)).action;
}

/**
 * What it tells the player now: check the surrender table first, and if it does
 * not take the hand, play it out from the hand table with surrender off.
 */
function splitPlay(rules: StrategyChartRules, section: StrategySectionId, row: string, dealer: string, tc: number): DeviationAction {
  const chart = surrenderChart(rules);
  const surrender = chart.cells.get(`${row}v${dealer}`);
  if (surrender && chart.coordinate.get(row)?.section === section) {
    const marker = surrender.marker;
    const gives = marker
      ? (marker.atOrBelow ? tc <= marker.index : tc >= marker.index)
        ? marker.row.transition.departure === "R"
        : marker.row.transition.baseline === "R"
      : surrender.surrenders;
    if (gives) return "R";
    if (marker) return marker.row.transition.departure === "R" ? marker.row.transition.baseline : marker.row.transition.departure;
  }
  const played = chartCell(rules, section, row, dealer, { canSurrender: false }).action;
  return resolveDeviation(played, handLabel(section, row), dealer, tc, { ...toDeviationRules(rules), lateSurrender: false, earlySurrenderVsTen: false }).action;
}

describe("splitting surrender out of the hand tables", () => {
  it("never changes the play, at any cell or any count", () => {
    // The whole point of the split is presentational. If the two-step lookup
    // ever disagrees with the one-step lookup it replaced, the chart is now
    // teaching a different game, and this is the guard against that.
    for (const [name, rules] of RULES) {
      for (const section of SECTIONS) {
        for (const row of STRATEGY_ROWS[section]) {
          for (const dealer of CHART_DEALERS) {
            for (const tc of COUNTS) {
              expect(
                splitPlay(rules, section, row, dealer, tc),
                `${name} ${section} ${row} v ${dealer} at ${tc}`,
              ).toBe(combinedPlay(rules, section, row, dealer, tc));
            }
          }
        }
      }
    }
  });

  it("leaves no surrender in the hand tables", () => {
    for (const [name, rules] of RULES) {
      for (const section of SECTIONS) {
        for (const row of STRATEGY_ROWS[section]) {
          for (const dealer of CHART_DEALERS) {
            expect(
              chartCell(rules, section, row, dealer, { canSurrender: false }).action,
              `${name} ${section} ${row} v ${dealer}`,
            ).not.toBe("R");
          }
        }
      }
    }
  });

  it("brings the starred stand indices back to life", () => {
    // These are the reason the split is worth doing. Every one of them carries
    // `overridesSurrender`, so with surrender in the hand tables they resolve
    // to nothing and the chart prints a bare R.
    const cells = deviationGridCells({ dealerHitsSoft17: true, lateSurrender: false });
    const starred = [["16", "10", 0], ["15", "10", 4], ["16", "9", 4], ["16", "A", 3], ["15", "A", 5]] as const;
    for (const [row, dealer, index] of starred) {
      const marker = cells.get(`hard:${row}v${dealer}`);
      expect(marker, `${row} v ${dealer}`).toBeDefined();
      expect(marker!.index, `${row} v ${dealer}`).toBe(index);
      expect(marker!.row.transition.departure, `${row} v ${dealer}`).toBe("S");
    }
    // 16 v 10 is the worked example: hit, stand from a true count of zero up.
    expect(chartCell(base, "hard", "16", "10", { canSurrender: false }).action).toBe("H");
  });

  it("carries the surrender decisions the hand tables gave up", () => {
    const chart = surrenderChart(base);
    expect(chart.rows).toContain("16");
    expect(chart.cells.get("16v10")?.surrenders).toBe(true);
    expect(chart.cells.get("16vA")?.surrenders).toBe(true);
    expect(chart.cells.get("17vA")?.surrenders).toBe(true);
    // An indexed surrender the hand table never showed as a surrender at all.
    expect(chart.cells.get("14v10")?.marker?.index).toBe(3);
    expect(chart.cells.get("16v8")?.marker?.index).toBe(4);
    // Nothing below a dealer 8 is ever given up.
    for (const dealer of ["2", "3", "4", "5", "6", "7"]) {
      for (const row of chart.rows) expect(chart.cells.get(`${row}v${dealer}`), `${row} v ${dealer}`).toBeUndefined();
    }
  });

  it("grows the ten column under early surrender vs 10", () => {
    const early = surrenderChart({ ...base, surrender: "early" });
    expect(early.cells.get("14v10")?.surrenders).toBe(true);
    expect(early.cells.get("8,8v10")?.surrenders).toBe(true);
    expect(early.cells.get("7,7v10")?.surrenders).toBe(true);
    expect(early.cells.get("13v10")?.marker?.index).toBe(3);
    expect(early.cells.get("12v10")?.marker?.index).toBe(8);
    expect(early.rows).toContain("8,8");
  });

  it("is empty at a table with no surrender", () => {
    const none = surrenderChart({ ...base, surrender: "none" });
    expect(none.rows).toHaveLength(0);
    expect(none.cells.size).toBe(0);
  });

  it("never lists a soft hand", () => {
    for (const [name, rules] of RULES) {
      for (const row of surrenderChart(rules).rows) {
        expect(row.startsWith("A,"), `${name} ${row}`).toBe(false);
      }
    }
  });
});
