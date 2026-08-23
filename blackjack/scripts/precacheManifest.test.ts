import { describe, expect, it } from "vitest";
import { toPrecacheUrls } from "./precacheManifest";

describe("toPrecacheUrls", () => {
  it("maps index documents to trailing-slash routes", () => {
    expect(toPrecacheUrls(["index.html", "training/h17-chart/index.html"])).toEqual(["/", "/training/h17-chart/"]);
  });
  it("keeps assets and non-index documents at their request paths", () => {
    expect(toPrecacheUrls(["_next/static/chunks/a.js", "404.html"])).toEqual(["/404.html", "/_next/static/chunks/a.js"]);
  });
  it("omits files not useful for offline views", () => {
    expect(toPrecacheUrls(["sw.js", "sitemap.xml", "robots.txt", ".nojekyll", "opengraph-image.png", "deck-estimation/images/tray.jpg"])).toEqual([]);
  });
  it("keeps small drill metadata and install assets", () => {
    expect(toPrecacheUrls(["deck-estimation/manifest.json", "offline.html", "icon.svg", "manifest.webmanifest", "apple-touch-icon.png"])).toEqual(["/apple-touch-icon.png", "/deck-estimation/manifest.json", "/icon.svg", "/manifest.webmanifest", "/offline.html"]);
  });
  it("sorts, deduplicates, and normalizes Windows separators", () => {
    expect(toPrecacheUrls(["b.css", "training\\h17-chart\\index.html", "a.css", "b.css"])).toEqual(["/a.css", "/b.css", "/training/h17-chart/"]);
  });
});
