/** Map static-export paths to the browser request URLs a worker must cache. */
const EXCLUDED_EXACT = new Set(["sw.js", "sitemap.xml", "robots.txt", ".nojekyll"]);
const EXCLUDED_PREFIXES = ["deck-estimation/images/", "opengraph-image"];

export function toPrecacheUrls(files: readonly string[]): string[] {
  const urls = new Set<string>();
  for (const raw of files) {
    const file = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
    if (!file || EXCLUDED_EXACT.has(file) || EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
    if (file === "index.html") urls.add("/");
    else if (file.endsWith("/index.html")) urls.add(`/${file.slice(0, -"index.html".length)}`);
    else urls.add(`/${file}`);
  }
  return [...urls].sort();
}
