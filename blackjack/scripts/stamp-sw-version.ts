// Runs after the static export and stamps the generated worker in out/.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toMediaUrls, toPrecacheUrls } from "./precacheManifest";

const srcPath = path.join(process.cwd(), "public", "sw.js");
const outDir = path.join(process.cwd(), "out");
const outPath = path.join(outDir, "sw.js");

function walk(dir: string, base = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(path.join(dir, entry.name), relative) : [relative];
  });
}

if (!existsSync(outPath)) {
  console.warn("[stamp-sw-version] out/sw.js not found; skipping (did the static export run?).");
  process.exit(0);
}

let version: string;
try {
  version = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  version = String(Date.now());
}

const source = readFileSync(srcPath, "utf8");
const placeholders = ["__CACHE_VERSION__", '["__PRECACHE_URLS__"]', '["__MEDIA_URLS__"]'];
if (placeholders.some((placeholder) => !source.includes(placeholder))) {
  console.warn("[stamp-sw-version] public/sw.js is missing a placeholder; leaving out/sw.js as-is.");
  process.exit(0);
}

const files = walk(outDir);
const urls = toPrecacheUrls(files);
const mediaUrls = toMediaUrls(files);
writeFileSync(
  outPath,
  source
    .replaceAll("__CACHE_VERSION__", version)
    .replace('["__PRECACHE_URLS__"]', JSON.stringify(urls))
    .replace('["__MEDIA_URLS__"]', JSON.stringify(mediaUrls)),
);
const megabytes = (list: readonly string[]) => {
  const bytes = list.reduce((sum, url) => {
    const diskPath = path.join(outDir, (url.endsWith("/") ? `${url}index.html` : url).replace(/^\//, ""));
    return sum + (existsSync(diskPath) ? readFileSync(diskPath).byteLength : 0);
  }, 0);
  return (bytes / 1024 / 1024).toFixed(2);
};
console.log(
  `[stamp-sw-version] stamped out/sw.js with cache version ${version}; ` +
    `precaching ${urls.length} URLs (${megabytes(urls)} MB) + ${mediaUrls.length} media URLs (${megabytes(mediaUrls)} MB)`,
);
