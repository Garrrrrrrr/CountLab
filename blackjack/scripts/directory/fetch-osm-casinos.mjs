// Read OpenStreetMap casino POIs for private coordinate review. Cache stays ignored.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(process.argv[2] ?? "../tmp/directory/osm-casinos.json");
const areas = [
  [32, -125, 38, -114], [38, -125, 43, -114], [32, -114, 38, -103], [38, -114, 43, -103],
  [43, -125, 49.5, -114], [43, -114, 49.5, -103],
  [25, -107, 32, -95], [32, -103, 38, -94], [25, -95, 33, -86],
  [38, -103, 44, -93], [44, -103, 49.5, -93], [33, -94, 39, -84], [39, -94, 45, -84], [45, -94, 49.5, -84],
  [25, -86, 33, -75], [33, -86, 39, -75], [39, -84, 45, -74], [45, -84, 49.5, -66], [39, -74, 45, -66],
  [48, -125, 55, -110], [48, -110, 55, -95], [48, -95, 55, -80], [42, -83, 49, -70], [42, -70, 51, -52],
  [17, -68, 19, -65], [20, -81, 27, -72],
];
let cache = { boxes: {}, elements: {} };
try { cache = JSON.parse(await readFile(output, "utf8")); } catch { /* First run. */ }
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

async function fetchArea(box, depth = 0) {
  const id = box.join(",");
  if (id in cache.boxes) return;
  const [south, west, north, east] = box;
  const query = `[out:json][timeout:45];(nwr["amenity"="casino"](${south},${west},${north},${east});nwr["gambling"="casino"](${south},${west},${north},${east}););out center tags;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "CountLab private casino location audit/1.0" },
      body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(65000),
    });
    if (!response.ok) throw new Error(`Overpass ${response.status}`);
    const result = await response.json();
    const elements = result.elements ?? [];
    for (const item of elements) cache.elements[`${item.type}/${item.id}`] = item;
    cache.boxes[id] = elements.length;
    await writeFile(output, JSON.stringify(cache));
    process.stdout.write(`${Object.keys(cache.boxes).length} boxes; ${Object.keys(cache.elements).length} casino features; ${id}\n`);
    await delay(1000);
  } catch (error) {
    if (depth >= 3) { process.stderr.write(`Failed ${id}: ${error}\n`); return; }
    const splitLatitude = north - south >= east - west;
    const middle = splitLatitude ? (north + south) / 2 : (east + west) / 2;
    const halves = splitLatitude ? [[south, west, middle, east], [middle, west, north, east]]
      : [[south, west, north, middle], [south, middle, north, east]];
    process.stderr.write(`Splitting ${id} after ${error}\n`);
    for (const half of halves) await fetchArea(half, depth + 1);
  }
}
for (const box of areas) await fetchArea(box);
process.stdout.write(`Saved ${Object.keys(cache.elements).length} OSM casino features to ${output}\n`);
