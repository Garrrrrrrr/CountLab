/**
 * Prices every legal action for one chart cell, bucketed by true count, so a
 * published index can be checked against the count where two actions actually
 * cross instead of taken on trust.
 *
 * Run: npx tsx scripts/priceDeviationCell.ts <hand> <dealer> [h17|s17] [rounds] [flags]
 *   npx tsx scripts/priceDeviationCell.ts 16 10 h17 2000000
 *   npx tsx scripts/priceDeviationCell.ts "Soft 19" 4 s17
 *   npx tsx scripts/priceDeviationCell.ts 14 10 h17 6000000 --decks=1 --pen=0.65 --es10
 *
 * Flags: --decks=N (default 6), --pen=F (default 0.75), --es10 (early surrender
 * against a ten, so dealer blackjacks count), --no-das, --seed=N (default 7; run
 * several seeds in parallel and pool them by sample count for rare cells).
 */
import { DEFAULT_ADVANTAGE_RULES } from "../lib/blackjack/advantage";
import { priceCell } from "../lib/blackjack/deviationEv";

const hand = process.argv[2] ?? "16";
const dealer = process.argv[3] ?? "10";
const h17 = (process.argv[4] ?? "h17") === "h17";
const rounds = Number(process.argv[5] ?? 3_000_000);
const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const decks = Number(flag("decks") ?? 6);
const penetration = Number(flag("pen") ?? 0.75);
const earlySurrender = process.argv.includes("--es10");
const das = !process.argv.includes("--no-das");

const buckets = priceCell({
  rules: { ...DEFAULT_ADVANTAGE_RULES, decks, penetration, dealerHitsSoft17: h17, doubleAfterSplit: das },
  hand,
  dealer,
  rounds,
  replications: 200,
  seed: Number(flag("seed") ?? 7),
  earlySurrender,
});
console.log(`${hand} v ${dealer} (${h17 ? "H17" : "S17"}, ${decks}D/${Math.round(penetration * 100)}%, ${das ? "DAS" : "no DAS"} RSA ${earlySurrender ? "ES10" : "LS"}) — net units per one-unit base bet`);
console.log("  TC   n       stand      hit        double     split      surrender");
for (const bucket of buckets) {
  if (!bucket.samples) continue;
  const fmt = (value: number | undefined) => (value === undefined ? "     —    " : `${value >= 0 ? "+" : ""}${value.toFixed(4)}  `);
  console.log(
    `  ${String(bucket.trueCount).padStart(3)}  ${String(bucket.samples).padStart(6)}  ` +
    `${fmt(bucket.evs.S)}${fmt(bucket.evs.H)}${fmt(bucket.evs.D)}${fmt(bucket.evs.P)}${fmt(bucket.evs.R)}`,
  );
}
