// Fetch address candidates only for private venues with a street address.
// Run from blackjack/ with NEXT_PUBLIC_MAPTILER_KEY set.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve("../tmp/directory");
const staged = JSON.parse(await readFile(resolve(root, "cbjn-2026-09-staging.json"), "utf8"));
const review = JSON.parse(await readFile(resolve(root, "cbjn-2026-09-staging-exact-review.json"), "utf8"));
const officialAddresses = await readFile(resolve(root, "official-addresses.json"), "utf8").then(JSON.parse).catch(() => ({}));
const unresolved = new Set(review.decisions.filter((item) => item.status === "unmapped").map((item) => item.source_location_key));
const target = staged.locations.filter((item) => unresolved.has(item.source_location_key)
  && (officialAddresses[item.source_location_key] || /^\d{2,6}\s+/.test(item.address ?? "")));
const path = resolve(root, "cbjn-2026-09-staging-address-cache.json");
const cache = await readFile(path, "utf8").then(JSON.parse).catch(() => ({}));
const pending = target.filter((item) => !(item.source_location_key in cache));
const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
if (!key) throw new Error("NEXT_PUBLIC_MAPTILER_KEY is required.");
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
try {
  const page = await browser.newPage();
  await page.goto("https://countlab.ca/directory/", { waitUntil: "domcontentloaded" });
  for (const item of pending) {
    const official = officialAddresses[item.source_location_key];
    const query = official
      ? [official.address, official.locality, official.region, official.country].filter(Boolean).join(" ")
      : [item.address, item.subdivision, item.country].filter(Boolean).join(" ");
    const result = await page.evaluate(async ({ query, key, country }) => {
      const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${encodeURIComponent(key)}&limit=5&autocomplete=false&country=${country.toLowerCase()}`);
      if (!response.ok) throw new Error(`MapTiler returned ${response.status}`);
      return response.json();
    }, { query, key, country: official?.country ?? item.country });
    cache[item.source_location_key] = (result.features ?? []).map((feature) => ({
      text: feature.text, place_name: feature.place_name, center: feature.center, place_type: feature.place_type,
    }));
    await writeFile(path, JSON.stringify(cache, null, 2));
    process.stdout.write(`Address candidates: ${Object.keys(cache).length}/${target.length}\n`);
    await new Promise((done) => setTimeout(done, 300));
  }
} finally { await browser.close(); }
