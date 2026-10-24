// Dumps the app engine's play for every grid cell under every audited rule set.
// Run from blackjack/: npx tsx --tsconfig tsconfig.json ../blackjack-simulator/basic_strategy/dump_app.ts ../blackjack-simulator/basic_strategy/app_actions.json
import { writeFileSync } from "fs";
import { cellDecision, gridCode, type Dealer, type TableRules } from "../../blackjack/lib/strategy";
import { STRATEGY_ROWS } from "../../blackjack/lib/blackjack/strategyTables";

const DEALERS: Dealer[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
const out: unknown[] = [];
for (const decks of [1, 2, 4, 6, 8])
  for (const h17 of [true, false])
    for (const das of [true, false])
      for (const sur of ["none", "late", "early"] as const)
        for (const dbl of ["any", "9-11", "10-11"] as const) {
          const rules: TableRules = { decks, hitSoft17: h17, das, surrender: sur, doubling: dbl, noHoleCard: false };
          for (const section of ["pairs", "soft", "hard"] as const)
            for (const row of STRATEGY_ROWS[section])
              for (const dealer of DEALERS) {
                const decision = cellDecision(rules, { section, row, dealer }, undefined);
                out.push({ decks, h17, das, sur, dbl, section, row, dealer, action: decision.action, fallback: decision.fallback ?? null, code: gridCode(rules, { section, row, dealer }) });
              }
        }
writeFileSync(process.argv[2], JSON.stringify(out));
console.log("cells", out.length);
