import { describe, expect, it } from "vitest";
import audit from "./basic-strategy-audit.json";
import { cellDecision } from "./engine";
import type { Dealer } from "./indices";
import type { TableRules } from "./rules";

/**
 * Every clear-cut basic-strategy cell must match an exact finite-deck EV
 * calculation, for 180 rule sets (1, 2, 4, 6 and 8 decks; H17 and S17; DAS on
 * and off; no, late and early-vs-10 surrender; any, 9-11 and 10-11 doubling).
 * Cells decided by less than 0.002 units, or by how resplits are modelled, are
 * stored as "?" and skipped: published charts disagree on those too.
 */
describe("basic strategy against the exact EV audit", () => {
  for (const [key, best] of Object.entries(audit.sets)) {
    it(key, () => {
      const [decks, soft17, das, surrender, ...doubling] = key.split("-");
      const rules: TableRules = {
        decks: Number(decks),
        hitSoft17: soft17 === "h17",
        das: das === "das",
        surrender: surrender as TableRules["surrender"],
        doubling: doubling.join("-") as TableRules["doubling"],
        noHoleCard: false,
      };
      const wrong: string[] = [];
      audit.cells.forEach((cell, position) => {
        const expected = best[position];
        if (expected === "?") return;
        const [section, rest] = cell.split(":");
        const [row, dealer] = rest.split("v");
        const action = cellDecision(rules, { section: section as "hard" | "soft" | "pairs", row, dealer: dealer as Dealer }, undefined).action;
        if (action !== expected) wrong.push(`${cell}: app ${action}, EV-optimal ${expected}`);
      });
      expect(wrong).toEqual([]);
    });
  }
});
