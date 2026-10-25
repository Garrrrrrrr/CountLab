/**
 * Writes the site's strategy (basic strategy plus Wong's count plays, surrender and insurance)
 * as a lookup table for ../blackjack-simulator/wong.py, so the calculator's coefficients price
 * exactly the plays the charts teach.
 *
 *   npx tsx scripts/export-sim-strategy.ts '{"surrender":"early"}' ../blackjack-simulator/strategy/6d-h17-das-es10.json
 *
 * Tables are indexed [row][dealer 1-10, ace = 1][true count + 11][permissions], with permissions
 * = canDouble + 2·canSurrender (+ 4·canSplit for pairs). Counts past ±11 play as ±11: Wong's
 * numbers stop at ±10.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { cellDecision, DEFAULT_TABLE_RULES, insuranceAt, type CellRef, type Dealer, type TableRules } from "@/lib/strategy";
import type { Action } from "@/lib/blackjack/types";

const CODE: Record<Action, number> = { H: 0, S: 1, D: 2, P: 3, R: 4 };
const TC = 11;
const DEALER: Dealer[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** `basicOnly` ignores the count everywhere: a validation table to compare with the audited no-index run. */
export function strategyTable(rules: TableRules, basicOnly = false) {
  const grid = (ref: (dealer: Dealer) => CellRef | Action, split: boolean) =>
    DEALER.map((dealer) => {
      const target = ref(dealer);
      return Array.from({ length: 2 * TC + 1 }, (_, offset) =>
        Array.from({ length: split ? 8 : 4 }, (_, flags) => {
          if (typeof target === "string") return CODE[target];
          const permissions = { canDouble: Boolean(flags & 1), canSurrender: Boolean(flags & 2), canSplit: Boolean(flags & 4) };
          return CODE[cellDecision(rules, target, basicOnly ? undefined : offset - TC, permissions).action];
        }));
    });
  // Hard totals 4-21 by index 0-17; soft totals 12-21 by index 0-9; pairs by rank 1-10.
  const hard = Array.from({ length: 18 }, (_, index) => {
    const total = index + 4;
    return grid((dealer) => (total < 5 ? "H" : total >= 18 ? "S" : { section: "hard", row: String(total), dealer }), false);
  });
  const soft = Array.from({ length: 10 }, (_, index) => {
    const total = index + 12;
    return grid((dealer) => (total === 12 ? "H" : total === 21 ? "S" : { section: "soft", row: `A,${total - 11}`, dealer }), false);
  });
  const pairs = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return grid((dealer) => ({ section: "pairs", row: rank === 1 ? "A,A" : rank === 10 ? "T,T" : `${rank},${rank}`, dealer }), true);
  });
  return { rules, tcRange: TC, insuranceAt: insuranceAt(rules), hard, soft, pairs };
}

if (process.argv[1]?.endsWith("export-sim-strategy.ts")) {
  const [patch = "{}", output, mode] = process.argv.slice(2);
  if (!output) throw new Error("usage: export-sim-strategy.ts '<rules JSON>' <output.json> [basic]");
  const rules: TableRules = { ...DEFAULT_TABLE_RULES, ...JSON.parse(patch) };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ ...strategyTable(rules, mode === "basic"), insuranceAt: mode === "basic" ? 99 : insuranceAt(rules) }));
  console.log(`Wrote ${output} for`, rules);
}
