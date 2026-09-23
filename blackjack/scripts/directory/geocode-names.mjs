// Fetch venue-name POI candidates for the private coordinate review.
// Run from blackjack/ with NEXT_PUBLIC_MAPTILER_KEY set.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve("../tmp/directory");
const staged = JSON.parse(await readFile(resolve(root, "cbjn-2026-09-staging.json"), "utf8"));
const review = JSON.parse(await readFile(resolve(root, "cbjn-2026-09-staging-exact-review.json"), "utf8"));
const unresolved = new Set(review.decisions.filter((item) => item.status === "unmapped").map((item) => item.source_location_key));
const target = staged.locations.filter((item) => unresolved.has(item.source_location_key));
const path = resolve(root, "cbjn-2026-09-staging-name-cache.json");
const cache = await readFile(path, "utf8").then(JSON.parse).catch(() => ({}));
const pending = target.filter((item) => !(item.source_location_key in cache));
const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
if (!key) throw new Error("NEXT_PUBLIC_MAPTILER_KEY is required.");

const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
try {
  const page = await browser.newPage();
  await page.goto("https://countlab.ca/directory/", { waitUntil: "domcontentloaded" });
  for (const country of [...new Set(pending.map((item) => item.country))]) {
    const group = pending.filter((item) => item.country === country);
    for (let offset = 0; offset < group.length; offset += 10) {
      const batch = group.slice(offset, offset + 10);
      const results = await page.evaluate(async ({ names, key, country }) => {
        const path = names.map(encodeURIComponent).join(";");
        const response = await fetch(`https://api.maptiler.com/geocoding/${path}.json?key=${encodeURIComponent(key)}&types=poi&limit=10&autocomplete=false&country=${country.toLowerCase()}`);
        if (!response.ok) throw new Error(`MapTiler returned ${response.status}`);
        return response.json();
      }, { names: batch.map((item) => item.name), key, country });
      const lists = Array.isArray(results) ? results : [results];
      if (lists.length !== batch.length) throw new Error("Unexpected MapTiler batch size.");
      for (let index = 0; index < batch.length; index++) {
        cache[batch[index].source_location_key] = (lists[index].features ?? []).map((feature) => ({
          text: feature.text, place_name: feature.place_name, center: feature.center,
        }));
      }
      await writeFile(path, JSON.stringify(cache, null, 2));
      process.stdout.write(`Named POI candidates: ${Object.keys(cache).length}/${target.length}\n`);
    }
  }
} finally { await browser.close(); }
