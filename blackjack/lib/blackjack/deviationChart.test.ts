import { describe, expect, it } from "vitest";
import { CHART_DEALERS } from "./bjaH17Chart";
import { deviationGridCells } from "./deviationChart";
import { STRATEGY_ROWS } from "./strategyTables";

const valid = new Set(
  (["pairs", "soft", "hard"] as const).flatMap((section) =>
    STRATEGY_ROWS[section].flatMap((row) => CHART_DEALERS.map((dealer) => section + ":" + row + "v" + dealer)),
  ),
);

describe("deviationGridCells", () => {
  for (const dealerHitsSoft17 of [true, false]) {
    for (const lateSurrender of [true, false]) {
      it("maps every live catalog row onto a real grid cell", () => {
        const cells = deviationGridCells({ dealerHitsSoft17, lateSurrender });
        expect(cells.size).toBeGreaterThan(0);
        for (const key of cells.keys()) expect(valid.has(key), key + " is not a grid cell").toBe(true);
      });
    }
  }

  it("translates the catalog hand labels", () => {
    const cells = deviationGridCells({ dealerHitsSoft17: true, lateSurrender: true });
    expect(cells.has("pairs:T,Tv4")).toBe(true);
    expect(cells.has("soft:A,9v4")).toBe(true);
    expect(cells.has("hard:16v9")).toBe(true);
  });

  it("excludes insurance, which has no chart cell", () => {
    for (const key of deviationGridCells({ dealerHitsSoft17: true, lateSurrender: true }).keys()) {
      expect(key).not.toContain("Insurance");
    }
  });
});
