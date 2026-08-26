import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

type SourceBucket = {
  tc: number;
  frequency: number;
  ev_per_round: number;
  sd: number;
  ramp_bet: number;
};

type SourceResult = {
  rounds: number;
  cut_decks: number;
  tc_mode: string;
  csm: boolean;
  buckets: SourceBucket[];
};

type SourceFile = { results: SourceResult[] };

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = join(scriptDirectory, "..");
const resultDirectory = join(appDirectory, "..", "ddm-solver", "results");

const readResults = (filename: string) =>
  (JSON.parse(
    readFileSync(join(resultDirectory, filename), "utf8").replace(/-?Infinity|NaN/g, "null"),
  ) as SourceFile).results;

const sources = [
  { id: "main", filename: "main_hilo_indices_10b.json", select: (row: SourceResult) => row.cut_decks === 1, policy: "indices" },
  ...[2, 2.5, 3, 3.5].map((cutDecks) => ({ id: `cut-${cutDecks}`, filename: "penetration_threshold_500m.json", select: (row: SourceResult) => row.cut_decks === cutDecks, policy: "indices" })),
  ...[4, 4.25, 4.5, 4.75, 5].map((cutDecks) => ({ id: `cut-${cutDecks}`, filename: "penetration_break_even_1b.json", select: (row: SourceResult) => row.cut_decks === cutDecks, policy: "indices" })),
  ...[4.05, 4.1, 4.15, 4.2].map((cutDecks) => ({ id: `cut-${cutDecks}`, filename: "penetration_break_even_fine_1b.json", select: (row: SourceResult) => row.cut_decks === cutDecks, policy: "indices" })),
  { id: "half", filename: "tc_modes_fixed_ramp_1b.json", select: (row: SourceResult) => row.tc_mode === "half", policy: "indices" },
  { id: "full", filename: "tc_modes_fixed_ramp_1b.json", select: (row: SourceResult) => row.tc_mode === "full", policy: "indices" },
  { id: "insurance", filename: "fixed_ramp_insurance_only_1b.json", select: () => true, policy: "insurance" },
  { id: "basic", filename: "fixed_ramp_no_indices_1b.json", select: () => true, policy: "basic" },
  { id: "csm", filename: "csm_flat_100m.json", select: () => true, policy: "basic" },
] as const;

const profiles = sources.map((source) => {
  const result = readResults(source.filename).find(source.select);
  if (!result) throw new Error(`No matching result in ${source.filename}`);
  return {
    id: source.id,
    rounds: result.rounds,
    cutDecks: result.csm ? null : result.cut_decks,
    tcMode: result.csm ? "none" : result.tc_mode,
    policy: source.policy,
    source: relative(appDirectory, join(resultDirectory, source.filename)),
    buckets: result.buckets.map((bucket) => ({
      tc: bucket.tc,
      frequency: bucket.frequency,
      unitEv: bucket.ev_per_round / bucket.ramp_bet,
      unitSd: bucket.sd / bucket.ramp_bet,
    })),
  };
});

const output = join(appDirectory, "lib", "ddm", "profileBuckets.generated.json");
writeFileSync(output, `${JSON.stringify({ profiles }, null, 2)}\n`);
console.log(`Wrote ${profiles.length} DDM bucket profiles to ${relative(appDirectory, output)}`);
