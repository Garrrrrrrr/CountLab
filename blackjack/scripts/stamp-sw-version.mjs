// Runs as the "postbuild" npm lifecycle script, after `next build` has written
// the static export to out/. Stamps a per-deploy cache version into the copy of
// sw.js in out/ so every deploy busts old service-worker caches; public/sw.js
// (the source Next.js copies verbatim into out/) is left untouched in git.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const srcPath = path.join(process.cwd(), "public", "sw.js");
const outPath = path.join(process.cwd(), "out", "sw.js");

if (!existsSync(outPath)) {
  console.warn("[stamp-sw-version] out/sw.js not found; skipping (did the static export run?).");
  process.exit(0);
}

let version;
try {
  version = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  version = String(Date.now());
}

const source = readFileSync(srcPath, "utf8");
if (!source.includes("__CACHE_VERSION__")) {
  console.warn("[stamp-sw-version] public/sw.js has no __CACHE_VERSION__ placeholder; leaving out/sw.js as-is.");
  process.exit(0);
}

writeFileSync(outPath, source.replaceAll("__CACHE_VERSION__", version));
console.log(`[stamp-sw-version] stamped out/sw.js with cache version ${version}`);
