// Add reviewable, approximate venue coordinates to a private import file.
// Run from blackjack/: NEXT_PUBLIC_MAPTILER_KEY=... node scripts/directory/geocode-staging.mjs ../tmp/directory/cbjn-2026-09-staging.json
// The input, cache, review report, and enriched JSON stay under the ignored tmp/directory directory.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const input = resolve(process.argv[2] ?? "../tmp/directory/cbjn-2026-09-staging.json");
const output = input.replace(/\.json$/i, "-geocoded.json");
const alternate = process.argv.includes("--casino-query");
const baseCachePath = input.replace(/\.json$/i, "-geocode-cache.json");
const cachePath = alternate ? input.replace(/\.json$/i, "-geocode-casino-cache.json") : baseCachePath;
const reviewPath = input.replace(/\.json$/i, "-coordinate-review.json");
const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const batchSize = 10;
const countryNames = { US: "United States", CA: "Canada", PR: "Puerto Rico", BS: "Bahamas" };
const subdivisions = {
  AB: "Alberta", AK: "Alaska", AL: "Alabama", AR: "Arkansas", AZ: "Arizona", BC: "British Columbia",
  CA: "California", CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", IA: "Iowa", ID: "Idaho", IL: "Illinois", IN: "Indiana",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", MA: "Massachusetts", MB: "Manitoba", MD: "Maryland",
  ME: "Maine", MI: "Michigan", MN: "Minnesota", MO: "Missouri", MS: "Mississippi", MT: "Montana",
  NB: "New Brunswick", NC: "North Carolina", ND: "North Dakota", NE: "Nebraska", NH: "New Hampshire",
  NJ: "New Jersey", NL: "Newfoundland and Labrador", NM: "New Mexico", NS: "Nova Scotia", NT: "Northwest Territories",
  NV: "Nevada", NY: "New York", OH: "Ohio", OK: "Oklahoma", ON: "Ontario", OR: "Oregon",
  PA: "Pennsylvania", PE: "Prince Edward Island", QC: "Quebec", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", SK: "Saskatchewan", TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia",
  VT: "Vermont", WA: "Washington", WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming", YT: "Yukon",
};

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function score(location, feature) {
  const name = normalize(location.name);
  const candidate = normalize(feature.text);
  const place = normalize(feature.place_name);
  const city = normalize(location.city);
  const region = normalize(subdivisions[location.subdivision] ?? location.subdivision);
  const country = normalize(countryNames[location.country] ?? location.country);
  const countryMatch = !!country && place.includes(country);
  if (!countryMatch || !Array.isArray(feature.center) || !Number.isFinite(feature.center[0]) || !Number.isFinite(feature.center[1])) return 0;
  let nameScore = 0;
  if (candidate === name) nameScore = 0.7;
  else if (name.length >= 5 && (candidate.startsWith(`${name} `) || candidate.endsWith(` ${name}`))) nameScore = 0.6;
  else if (name.length >= 5 && ` ${candidate} `.includes(` ${name} `)) nameScore = 0.55;
  else {
    const words = name.split(" ").filter((word) => word.length > 2 && !["casino", "hotel", "resort", "the"].includes(word));
    const matched = words.filter((word) => candidate.split(" ").includes(word)).length;
    if (words.length >= 2 && matched / words.length >= 0.8) nameScore = 0.48;
  }
  if (!nameScore) return 0;
  const cityMatch = !!city && place.includes(city);
  const regionMatch = !!region && place.includes(region);
  const streetNumber = location.address?.match(/\b\d{2,6}\b/)?.[0];
  const addressMatch = !!streetNumber && new RegExp(`\\b${streetNumber}\\b`).test(place);
  const transit = /\b(northbound|southbound|eastbound|westbound|bus stop|parking|buffet|patisserie)\b/.test(candidate);
  return Math.max(0, nameScore + (cityMatch ? 0.2 : regionMatch ? 0.13 : 0) + 0.1
    + (addressMatch ? 0.1 : 0) - (transit ? 0.3 : 0));
}

function query(location) {
  if (alternate) return [location.name, /casino/i.test(location.name) ? null : "casino", location.city,
    subdivisions[location.subdivision] ?? location.subdivision, countryNames[location.country] ?? location.country]
    .filter(Boolean).join(" ");
  const street = /^\d{1,6}\s+\S/.test(location.address ?? "") && !/[;,]/.test(location.address) ? location.address : null;
  return [location.name, street, location.city, location.subdivision, countryNames[location.country] ?? location.country]
    .filter(Boolean).join(" ");
}

async function geocode(page, locations) {
  const queries = locations.map(query);
  const response = await page.evaluate(async ({ queries, key, country }) => {
    const path = queries.map(encodeURIComponent).join(";");
    const url = `https://api.maptiler.com/geocoding/${path}.json?key=${encodeURIComponent(key)}&types=poi&limit=5&autocomplete=false&country=${country.toLowerCase()}`;
    const result = await fetch(url);
    if (!result.ok) throw new Error(`MapTiler geocoding returned ${result.status}`);
    return result.json();
  }, { queries, key, country: locations[0].country });
  const batches = Array.isArray(response) ? response : [response];
  if (batches.length !== locations.length) throw new Error(`Expected ${locations.length} geocoding results, received ${batches.length}`);
  return batches.map((batch) => (batch.features ?? []).map((feature) => ({
    text: feature.text, place_name: feature.place_name, center: feature.center, place_type: feature.place_type,
  })));
}

async function geocodeWithRetry(page, locations) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await geocode(page, locations); }
    catch (error) {
      if (String(error).includes("returned 403")) throw error;
      if (attempt < 2) await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)));
    }
  }
  if (locations.length === 1) {
    process.stderr.write(`No geocoding result for ${locations[0].source_location_key}; review manually.\n`);
    return [[]];
  }
  const middle = Math.floor(locations.length / 2);
  return [
    ...await geocodeWithRetry(page, locations.slice(0, middle)),
    ...await geocodeWithRetry(page, locations.slice(middle)),
  ];
}

if (!key) throw new Error("Set NEXT_PUBLIC_MAPTILER_KEY to the site's public browser key.");
const staged = JSON.parse(await readFile(input, "utf8"));
if (!Array.isArray(staged.locations) || !Array.isArray(staged.rows)) throw new Error("Expected a private directory staging JSON file.");
const locations = staged.locations.filter((location) => location.source_location_key && (location.latitude == null || location.longitude == null));
const originalCache = alternate ? JSON.parse(await readFile(baseCachePath, "utf8")) : {};
const previousReview = alternate ? JSON.parse(await readFile(reviewPath, "utf8")) : null;
const unresolved = alternate ? new Set(previousReview.decisions.filter((decision) => decision.status !== "matched").map((decision) => decision.source_location_key)) : null;
const targets = unresolved ? locations.filter((location) => unresolved.has(location.source_location_key)) : locations;
let cache = {};
try { cache = JSON.parse(await readFile(cachePath, "utf8")); } catch { /* First run. */ }
const pending = targets.filter((location) => !cache[location.source_location_key]);
if (pending.length) {
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  try {
    const page = await browser.newPage();
    await page.goto("https://countlab.ca/directory/", { waitUntil: "domcontentloaded" });
    for (const country of [...new Set(pending.map((location) => location.country))]) {
      const group = pending.filter((location) => location.country === country);
      for (let offset = 0; offset < group.length; offset += batchSize) {
        const chunk = group.slice(offset, offset + batchSize);
        const results = await geocodeWithRetry(page, chunk);
        for (let index = 0; index < chunk.length; index++) cache[chunk[index].source_location_key] = results[index];
        await writeFile(cachePath, JSON.stringify(cache, null, 2));
        process.stdout.write(`Geocoded ${Object.keys(cache).length} of ${targets.length} private venues${alternate ? " with casino search" : ""}\n`);
      }
    }
  } finally { await browser.close(); }
}

const decisions = locations.map((location) => {
  const features = [...(originalCache[location.source_location_key] ?? []), ...(cache[location.source_location_key] ?? [])];
  const uniqueFeatures = [...new Map(features.map((feature) => [`${feature.text}|${feature.center?.join(",")}`, feature])).values()];
  const candidates = uniqueFeatures.map((feature) => ({
    ...feature, score: Number(score(location, feature).toFixed(2)),
  })).sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const runnerUp = candidates[1];
  const accepted = !!top && top.score >= 0.78 && (!runnerUp || top.score - runnerUp.score >= 0.08);
  return {
    source_location_key: location.source_location_key, name: location.name, city: location.city,
    subdivision: location.subdivision, country: location.country, address: location.address,
    status: accepted ? "matched" : candidates.length ? "review" : "missing",
    candidates,
  };
});
const matched = new Map(decisions.filter((decision) => decision.status === "matched")
  .map((decision) => [decision.source_location_key, decision.candidates[0]]));
function addCoordinate(location) {
  const feature = matched.get(location.source_location_key);
  if (!feature) return location;
  return {
    ...location, longitude: Number(feature.center[0].toFixed(7)), latitude: Number(feature.center[1].toFixed(7)),
    coordinate_quality: "approximate", coordinate_source: `MapTiler POI geocoding: ${feature.place_name}`,
  };
}
staged.locations = staged.locations.map(addCoordinate);
staged.rows = staged.rows.map((row) => ({ ...row, normalized_location: addCoordinate(row.normalized_location) }));
await writeFile(output, JSON.stringify(staged, null, 2));
await writeFile(reviewPath, JSON.stringify({ source: staged.source.title, summary: {
  locations: locations.length,
  matched: decisions.filter((decision) => decision.status === "matched").length,
  review: decisions.filter((decision) => decision.status === "review").length,
  missing: decisions.filter((decision) => decision.status === "missing").length,
}, decisions }, null, 2));
process.stdout.write(`Private output: ${output}\nReview: ${reviewPath}\n`);
