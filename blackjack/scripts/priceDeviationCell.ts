/**
 * Prices every legal action for one chart cell, bucketed by true count, so a
 * published index can be checked against the count where two actions actually
 * cross instead of taken on trust.
 *
 * Run: npx tsx scripts/priceDeviationCell.ts <hand> <dealer> [h17|s17] [rounds]
 *   npx tsx scripts/priceDeviationCell.ts 16 10 h17 2000000
 *   npx tsx scripts/priceDeviationCell.ts "Soft 19" 4 s17
 */
import { DEFAULT_ADVANTAGE_RULES } from "../lib/blackjack/advantage";
import { priceCell } from "../lib/blackjack/deviationEv";

const hand = process.argv[2] ?? "16";
const dealer = process.argv[3] ?? "10";
const h17 = (process.argv[4] ?? "h17") === "h17";
const rounds = Number(process.argv[5] ?? 3_000_000);

const buckets = priceCell({
  rules: { ...DEFAULT_ADVANTAGE_RULES, dealerHitsSoft17: h17 },
  hand,
  dealer,
  rounds,
  replications: 200,
  seed: 7,
});
console.log(`${hand} v ${dealer} (${h17 ? "H17" : "S17"}, 6D/75%, DAS RSA LS) — net units per one-unit base bet`);
console.log("  TC   n       stand      hit        double     split      surrender");
for (const bucket of buckets) {
  if (!bucket.samples) continue;
  const fmt = (value: number | undefined) => (value === undefined ? "     —    " : `${value >= 0 ? "+" : ""}${value.toFixed(4)}  `);
  console.log(
    `  ${String(bucket.trueCount).padStart(3)}  ${String(bucket.samples).padStart(6)}  ` +
    `${fmt(bucket.evs.S)}${fmt(bucket.evs.H)}${fmt(bucket.evs.D)}${fmt(bucket.evs.P)}${fmt(bucket.evs.R)}`,
  );
}
