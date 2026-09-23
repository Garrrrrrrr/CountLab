// Merge only venue-level online matches into a private staging file.
// City centers and administrative points are deliberately never used.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const input = resolve(process.argv[2] ?? "../tmp/directory/cbjn-2026-09-staging.json");
const stem = input.replace(/\.json$/i, "");
const staged = JSON.parse(await readFile(input, "utf8"));
const review = JSON.parse(await readFile(`${stem}-coordinate-review.json`, "utf8"));
let cityCache = {};
try { cityCache = JSON.parse(await readFile(`${stem}-city-cache.json`, "utf8")); } catch { /* Locality cross-check cache is optional. */ }
let osm = { elements: {} };
try { osm = JSON.parse(await readFile(resolve(process.argv[3] ?? "../tmp/directory/osm-casinos.json"), "utf8")); } catch { /* OSM cache is optional. */ }

const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[&'’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const stop = new Set(["casino", "hotel", "resort", "the", "and", "at", "club", "lodge", "gaming", "inc", "llc"]);
const tokens = (value) => normalize(value).split(" ").filter((token) => token.length > 2 && !stop.has(token));
const countryNames = { US: "united states", CA: "canada", PR: "puerto rico", BS: "bahamas" };
const subdivisionNames = { AZ:"arizona", CA:"california", CO:"colorado", IA:"iowa", MI:"michigan", MS:"mississippi", NV:"nevada", NY:"new york", OK:"oklahoma", WA:"washington", WI:"wisconsin", AB:"alberta", BC:"british columbia", ON:"ontario", SK:"saskatchewan" };
const venueWords = /\b(casino|hotel|resort|lodge|club|gaming|racino|poker|raceway|saloon|inn|bingo)\b/i;
const administrative = /\b(museum|library|school|preschool|university|church|cemetery|parking|airport|station|fire|hospital|mall|office|city hall|spa|barbecue|cafe|restaurant|market|apartments?|dentist|dental|kids|beach club|showroom|fitness|pool|garage|rink|theatre|theater)\b/i;
const venueSubdivision = /\b(poker room|sportsbook|spa tower|suite|restaurant|bar|lounge|gift shop)\b/i;
const distanceKm = (first, second) => {
  const rad = Math.PI / 180, latitude = (first[1] - second[1]) * rad, longitude = (first[0] - second[0]) * rad;
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(first[1] * rad) * Math.cos(second[1] * rad) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
};

function placeMatches(location, place) {
  const text = normalize([place.text, place.place_name, place.address].filter(Boolean).join(" "));
  const nameTokens = tokens(location.name);
  if (!nameTokens.length || nameTokens.some((token) => !text.includes(token))) return false;
  const country = normalize(countryNames[location.country] ?? location.country);
  const region = normalize(subdivisionNames[location.subdivision] ?? location.subdivision);
  const heading = String(location.source_heading ?? "");
  const headingCities = [...heading.matchAll(/,\s*([^,.(]+?)(?:,\s*(?:US|OK|CO|MI|NY|MS|WA|CA|AZ))?(?:\)|$)/gi)]
    .map((match) => normalize(match[1])).filter((value) => value.length > 2);
  const city = normalize(location.city).replace(/\s+(area|east of|north of)$/g, "");
  const placeName = normalize(place.place_name);
  const cityMatch = !city || placeName.includes(city) || text.includes(city) || headingCities.some((value) => placeName.includes(value) || text.includes(value));
  // Geocoders sometimes label a venue with its county (for example Clark)
  // instead of the source's city (Las Vegas). An exact street address plus
  // matching venue name and state is stronger evidence than that city label.
  const number = location.address?.match(/\b\d{2,6}\b/)?.[0];
  const streetTokens = tokens(location.address).filter((token) => !/^(street|avenue|road|drive|boulevard|highway|parkway|lane|way|north|south|east|west)$/.test(token));
  const addressMatch = !!number && new RegExp(`\\b${number}\\b`).test(text)
    && streetTokens.some((token) => text.includes(token));
  return (!country || placeName.includes(country)) && (!region || placeName.includes(region)) && (cityMatch || addressMatch);
}

function coordinateFromOsm(location) {
  const candidates = Object.values(osm.elements ?? {}).map((item) => {
    const tags = item.tags ?? {};
    const point = item.lat != null && item.lon != null ? [item.lon, item.lat] : item.center && [item.center.lon, item.center.lat];
    if (!point || !tags.name || !placeMatches(location, { text: tags.name, place_name: [tags.name, tags["addr:city"], tags["addr:state"], tags["addr:country"]].filter(Boolean).join(", "), address: [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") })) return null;
    const name = normalize(tags.name);
    const nameTokens = tokens(location.name);
    const exact = name === normalize(location.name) || nameTokens.every((token) => name.includes(token));
    return exact && !administrative.test(tags.name) ? { center: point, place_name: [tags.name, tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", "), source: "OpenStreetMap named casino POI" } : null;
  }).filter(Boolean);
  return candidates[0] ?? null;
}

function coordinateFromMapTiler(location, decision) {
  const requestedName = normalize(location.name);
  const candidates = (decision?.candidates ?? []).filter((candidate) => {
    const exactName = normalize(candidate.text) === requestedName || normalize(candidate.text).startsWith(`${requestedName} `);
    const hasStreetAddress = /\b\d{1,6}\b/.test(candidate.place_name ?? "");
    return candidate.score >= 0.78 && Array.isArray(candidate.center) && placeMatches(location, candidate)
      && !administrative.test(candidate.text) && !venueSubdivision.test(candidate.text)
      && (venueWords.test(candidate.text) || venueWords.test(candidate.place_name) || exactName && hasStreetAddress);
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aVenue = venueWords.test(a.text) || venueWords.test(a.place_name) ? 1 : 0;
    const bVenue = venueWords.test(b.text) || venueWords.test(b.place_name) ? 1 : 0;
    return bVenue - aVenue || b.score - a.score;
  });
  return { center: candidates[0].center, place_name: candidates[0].place_name, source: "MapTiler named venue POI" };
}

function coordinateFromNearbyVenue(location, decision) {
  const locality = cityCache[`${location.city}|${location.subdivision}|${location.country}`]
    ?.find((feature) => normalize(feature.text) === normalize(location.city) && Array.isArray(feature.center));
  if (!locality) return null;
  const stateName = normalize(locality.place_name?.split(",").at(-2));
  const country = normalize(countryNames[location.country] ?? location.country);
  const requested = normalize(location.name);
  const streetAddress = /^\d{2,6}\s+(?!and\b|at\b)/i.test(location.address ?? "");
  const number = streetAddress ? location.address.match(/^\d{2,6}/)?.[0] : null;
  const candidates = (decision?.candidates ?? []).filter((candidate) => {
    const name = normalize(candidate.text);
    const place = normalize(candidate.place_name);
    if (!Array.isArray(candidate.center) || !venueWords.test(candidate.text) || administrative.test(candidate.text) || venueSubdivision.test(candidate.text)
      || !place.includes(stateName) || !place.includes(country) || distanceKm(candidate.center, locality.center) > 10) return false;
    if (name !== requested && !name.startsWith(`${requested} `) && !name.endsWith(` ${requested}`)) return false;
    if (number && !new RegExp(`\\b${number}\\b`).test(place)) return false;
    return true;
  });
  // A named POI in the same locality is useful only when unambiguous.
  if (candidates.length !== 1) return null;
  return { center: candidates[0].center, place_name: candidates[0].place_name, source: "MapTiler named nearby venue POI" };
}

const reviewByKey = new Map(review.decisions.map((decision) => [decision.source_location_key, decision]));
const decisions = [];
const exact = new Map();
for (const location of staged.locations) {
  const decision = reviewByKey.get(location.source_location_key);
  // Recheck every venue-level result. The first pass intentionally left some
  // similarly named POIs for review (for example a casino spa or parking lot);
  // only named casino/resort/hotel POIs survive this stricter audit.
  const online = coordinateFromOsm(location) ?? coordinateFromMapTiler(location, decision) ?? coordinateFromNearbyVenue(location, decision);
  if (online) {
    const normalized = { ...location, longitude: Number(online.center[0].toFixed(7)), latitude: Number(online.center[1].toFixed(7)),
      coordinate_quality: "verified", coordinate_source: `${online.source}: ${online.place_name}` };
    exact.set(location.source_location_key, normalized);
    decisions.push({ source_location_key: location.source_location_key, name: location.name, status: "exact", coordinate_source: normalized.coordinate_source });
  } else {
    decisions.push({ source_location_key: location.source_location_key, name: location.name, status: "unmapped", previous_status: decision?.status ?? "missing" });
  }
}
function addExact(location) { return exact.get(location?.source_location_key) ?? location; }
staged.locations = staged.locations.map(addExact);
staged.rows = staged.rows.map((row) => ({ ...row, normalized_location: addExact(row.normalized_location) }));
await writeFile(`${stem}-exact.json`, JSON.stringify(staged, null, 2));
await writeFile(`${stem}-exact-review.json`, JSON.stringify({ summary: { locations: decisions.length, exact: decisions.filter((d) => d.status === "exact").length, unmapped: decisions.filter((d) => d.status === "unmapped").length }, decisions }, null, 2));
process.stdout.write(`Exact venue coordinates: ${exact.size}/${staged.locations.length}; unmapped: ${staged.locations.length - exact.size}\nPrivate import file: ${stem}-exact.json\n`);
