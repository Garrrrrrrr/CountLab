/** Map static-export paths to the browser request URLs a worker must cache. */
const EXCLUDED_EXACT = new Set(["sw.js", "sitemap.xml", "robots.txt", ".nojekyll"]);
const EXCLUDED_PREFIXES = ["opengraph-image"];
/**
 * Discard-tray photos are bulky (~4 MB) but their filenames are stable across
 * deploys, so the worker keeps them in a cache that is not version-stamped.
 * Splitting them out here is what lets a release swap the shell without
 * re-downloading every JPEG.
 */
const MEDIA_PREFIXES = ["deck-estimation/images/"];

/** Strips the leading `./`, normalizes separators, and drops files no worker should hold. */
function normalize(raw: string): string | null {
  const file = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!file || EXCLUDED_EXACT.has(file) || EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))) return null;
  return file;
}

function toRequestUrl(file: string): string {
  if (file === "index.html") return "/";
  if (file.endsWith("/index.html")) return `/${file.slice(0, -"index.html".length)}`;
  return `/${file}`;
}

const isMedia = (file: string) => MEDIA_PREFIXES.some((prefix) => file.startsWith(prefix));

function collect(files: readonly string[], keep: (file: string) => boolean): string[] {
  const urls = new Set<string>();
  for (const raw of files) {
    const file = normalize(raw);
    if (file && keep(file)) urls.add(toRequestUrl(file));
  }
  return [...urls].sort();
}

/** The app shell: routes, chunks, and metadata that a deploy replaces wholesale. */
export function toPrecacheUrls(files: readonly string[]): string[] {
  return collect(files, (file) => !isMedia(file));
}

/** Immutable drill photos, cached separately so deploys do not evict them. */
export function toMediaUrls(files: readonly string[]): string[] {
  return collect(files, isMedia);
}
