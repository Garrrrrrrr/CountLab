import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist");
const target = path.join(process.cwd(), "public", "vendor", "maplibre");
const worker = readFileSync(path.join(dist, "maplibre-gl-worker.mjs"), "utf8");
const sharedImport = 'from"./maplibre-gl-shared.mjs"';
if (!worker.includes(sharedImport)) throw new Error("MapLibre worker import changed; update the staged worker paths.");

mkdirSync(target, { recursive: true });
copyFileSync(path.join(dist, "maplibre-gl-shared.mjs"), path.join(target, "maplibre-gl-shared.js"));
writeFileSync(path.join(target, "maplibre-gl-worker.js"), worker.replace(sharedImport, 'from"./maplibre-gl-shared.js"'));
