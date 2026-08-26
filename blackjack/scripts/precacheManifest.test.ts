import { describe, expect, it } from "vitest";
import { toMediaUrls, toPrecacheUrls } from "./precacheManifest";

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

describe("toMediaUrls", () => {
  it("collects the drill photos the shell precache leaves out", () => {
    const files = ["index.html", "deck-estimation/images/tray-2.jpg", "deck-estimation/images/tray-1.jpg"];
    expect(toMediaUrls(files)).toEqual(["/deck-estimation/images/tray-1.jpg", "/deck-estimation/images/tray-2.jpg"]);
  });
  it("splits the export cleanly, so nothing is cached twice or dropped", () => {
    const files = ["index.html", "deck-estimation/manifest.json", "deck-estimation/images/tray-1.jpg"];
    expect(toPrecacheUrls(files)).toEqual(["/", "/deck-estimation/manifest.json"]);
    expect(toMediaUrls(files)).toEqual(["/deck-estimation/images/tray-1.jpg"]);
  });
  it("still honors the global exclusions", () => {
    expect(toMediaUrls(["sw.js", "opengraph-image.png", "index.html"])).toEqual([]);
  });
});
