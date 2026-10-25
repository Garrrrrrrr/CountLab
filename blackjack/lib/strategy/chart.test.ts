import { describe, expect, it } from "vitest";
import { basicNeverWithCount, buildChart, cellKey, conflictNotes } from "./chart";
import { wongPlay } from "./engine";
import { DECK_OPTIONS, rulesSummary, type TableRules } from "./rules";
import { WONG_RANGE } from "./wong";

const ALL_RULES: TableRules[] = DECK_OPTIONS.flatMap((decks) => [true, false].flatMap((hitSoft17) => [true, false].flatMap((das) =>
  (["none", "late", "early"] as const).flatMap((surrender) => (["any", "9-11", "10-11"] as const).flatMap((doubling) =>
    [false, true].map((noHoleCard) => ({ decks, hitSoft17, das, surrender, doubling, noHoleCard })))))));

/**
 * A cell whose basic-strategy play Wong never makes at any count must carry the footnote, or the
 * chart shows "Split" over an "H any" strip with nothing to say why.
 */
describe("basic strategy against Wong at every count", () => {
  it("flags exactly the cells where the two never agree, for every rule set", () => {
    const found = new Set<string>();
    for (const rules of ALL_RULES) {
      const chart = buildChart(rules);
      for (const table of Object.values(chart.tables)) {
        for (const cell of table.cells.values()) {
          let agrees = false;
          for (let tc = -WONG_RANGE - 1; tc <= WONG_RANGE + 1 && !agrees; tc++) agrees = wongPlay(rules, cell.ref, tc).action === cell.basic.action;
          expect(basicNeverWithCount(cell), `${rulesSummary(rules)} ${cellKey(cell.ref)}`).toBe(!agrees);
          if (!agrees) found.add(`${rules.decks}D${rules.das ? " DAS" : ""}${rules.noHoleCard ? " ENHC" : ""} ${cellKey(cell.ref)} ${cell.basic.action}>${cell.index!.play}`);
        }
      }
      // The surrender table's own conflict (basic gives up, Wong never does) is footnoted separately;
      // the reverse, Wong always surrendering a hand basic strategy plays, never happens.
      for (const rule of chart.surrender?.cells.values() ?? []) expect(rule.at === -Infinity && !rule.basic).toBe(false);
    }
    // H17/S17, surrender and doubling never change the list, so they are left out of the names.
    const enhc88 = DECK_OPTIONS.flatMap((decks) => [`${decks}D DAS ENHC pairs:8,8v10 H>S`, `${decks}D ENHC pairs:8,8v10 H>S`]);
    expect([...found].sort()).toEqual(["2D DAS ENHC pairs:6,6v7 P>H", "2D DAS pairs:6,6v7 P>H", ...enhc88].sort());
  });

  it("explains the two-deck 6,6 v 7 split honestly", () => {
    const rules: TableRules = { decks: 2, hitSoft17: true, das: true, surrender: "late", doubling: "any", noHoleCard: false };
    const cells = [...buildChart(rules).tables.pairs.cells.values()].filter(basicNeverWithCount);
    expect(conflictNotes(rules, cells)).toEqual([
      "6,6 v 7: basic strategy, exact for 2 decks, splits; Wong's numbers hit at every count (CountLab uses his four-deck numbers for every multiple-deck game).",
    ]);
  });
});
