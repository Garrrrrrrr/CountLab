/**
 * Runs the real public/sw.js against a mock Cache API. The worker is plain JS
 * with no build step, so the alternative is shipping it untested.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SHELL_URLS = ["/", "/training/deck-estimation/", "/offline.html", "/_next/static/chunks/app.js"];
const MEDIA_URLS = ["/deck-estimation/images/tray-0001.jpg", "/deck-estimation/images/tray-0002.jpg"];
const ORIGIN = "https://countlab.ca";

type Handler = (event: FakeEvent) => void;

interface FakeEvent {
  request: Request;
  respondWith(promise: Promise<Response>): void;
  waitUntil(promise: Promise<unknown>): void;
}

/** Minimal Cache/CacheStorage stand-in keyed by URL, with ignoreSearch support. */
class FakeCache {
  store = new Map<string, Response>();
  async add(url: string) {
    const response = await fetch(new Request(new URL(url, ORIGIN).toString()));
    if (!response.ok) throw new Error(`bad status ${response.status}`);
    this.store.set(new URL(url, ORIGIN).toString(), response);
  }
  async put(request: Request | string, response: Response) {
    this.store.set(typeof request === "string" ? new URL(request, ORIGIN).toString() : request.url, response);
  }
  async match(request: Request | string, options?: { ignoreSearch?: boolean }) {
    const url = typeof request === "string" ? new URL(request, ORIGIN).toString() : request.url;
    if (this.store.has(url)) return this.store.get(url);
    if (options?.ignoreSearch) {
      const bare = url.split("?")[0];
      for (const [key, value] of this.store) if (key.split("?")[0] === bare) return value;
    }
    return undefined;
  }
  async keys() {
    return [...this.store.keys()].map((url) => new Request(url));
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async match(request: Request | string, options?: { ignoreSearch?: boolean }) {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request, options);
      if (hit) return hit;
    }
    return undefined;
  }
}

/** Loads sw.js with its placeholders filled in and returns its event handlers. */
function loadWorker(version: string, cacheStorage: FakeCacheStorage) {
  const source = readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8")
    .replaceAll("__CACHE_VERSION__", version)
    .replace('["__PRECACHE_URLS__"]', JSON.stringify(SHELL_URLS))
    .replace('["__MEDIA_URLS__"]', JSON.stringify(MEDIA_URLS));

  const handlers = new Map<string, Handler>();
  const self = {
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    location: { origin: ORIGIN },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
  };
  new Function("self", "caches", "console", source)(self, cacheStorage, { warn: () => {} });

  const dispatch = async (type: string, request?: Request) => {
    const pending: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    handlers.get(type)!({
      request: request!,
      respondWith: (promise) => { responded = promise; },
      waitUntil: (promise) => { pending.push(promise); },
    });
    if (responded) await responded.catch(() => {});
    await Promise.all(pending);
    return responded;
  };
  return { dispatch };
}

// The Request constructor rejects mode: "navigate", so stand in with the three
// fields the worker actually reads.
const navigation = (url: string) =>
  ({ method: "GET", mode: "navigate", url: new URL(url, ORIGIN).toString() }) as unknown as Request;

let cacheStorage: FakeCacheStorage;
let online: boolean;

beforeEach(() => {
  cacheStorage = new FakeCacheStorage();
  online = true;
  vi.stubGlobal("fetch", vi.fn(async (input: Request | string) => {
    if (!online) throw new TypeError("Failed to fetch");
    const url = typeof input === "string" ? input : input.url;
    return new Response(`body:${new URL(url).pathname}`, { status: 200 });
  }));
});

describe("sw.js install", () => {
  it("splits the shell and the drill photos into separate caches", async () => {
    const worker = loadWorker("abc123", cacheStorage);
    await worker.dispatch("install");

    expect(await cacheStorage.keys()).toEqual(["countlab-abc123", "countlab-media-v1"]);
    expect((await cacheStorage.open("countlab-abc123")).store.size).toBe(SHELL_URLS.length);
    expect((await cacheStorage.open("countlab-media-v1")).store.size).toBe(MEDIA_URLS.length);
  });

  it("survives an individual precache entry failing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: Request | string) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/offline.html")) return new Response("nope", { status: 404 });
      return new Response("ok", { status: 200 });
    }));
    const worker = loadWorker("abc123", cacheStorage);
    await worker.dispatch("install");
    expect((await cacheStorage.open("countlab-abc123")).store.size).toBe(SHELL_URLS.length - 1);
  });
});

describe("sw.js activate", () => {
  it("evicts the previous deploy's shell but keeps the photos", async () => {
    await loadWorker("old", cacheStorage).dispatch("install");
    expect(await cacheStorage.keys()).toContain("countlab-old");

    const next = loadWorker("new", cacheStorage);
    await next.dispatch("install");
    await next.dispatch("activate");

    const remaining = await cacheStorage.keys();
    expect(remaining).toContain("countlab-new");
    expect(remaining).toContain("countlab-media-v1");
    expect(remaining).not.toContain("countlab-old");
  });

  it("does not re-download photos it already holds", async () => {
    await loadWorker("old", cacheStorage).dispatch("install");
    const calls = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    await loadWorker("new", cacheStorage).dispatch("install");
    const media = (fetch as unknown as { mock: { calls: { toString(): string }[][] } }).mock.calls
      .slice(calls)
      .filter(([input]) => String((input as Request).url ?? input).includes("/deck-estimation/images/"));
    expect(media).toHaveLength(0);
  });
});

describe("sw.js offline fetch", () => {
  it("serves a precached route without touching the network", async () => {
    const worker = loadWorker("abc123", cacheStorage);
    await worker.dispatch("install");
    online = false;
    const mock = fetch as unknown as { mock: { calls: unknown[] } };
    const before = mock.mock.calls.length;

    const response = await worker.dispatch("fetch", navigation("/training/deck-estimation/"));
    expect(await (await response!).text()).toBe("body:/training/deck-estimation/");
    // The point of cache-first: no doomed round trip on every offline page load.
    expect(mock.mock.calls.length).toBe(before);
  });

  it("serves drill photos offline", async () => {
    const worker = loadWorker("abc123", cacheStorage);
    await worker.dispatch("install");
    online = false;

    const response = await worker.dispatch("fetch", new Request(`${ORIGIN}${MEDIA_URLS[0]}`));
    expect(await (await response!).text()).toBe(`body:${MEDIA_URLS[0]}`);
  });

  it("matches a precached route despite a query string", async () => {
    const worker = loadWorker("abc123", cacheStorage);
    await worker.dispatch("install");
    online = false;

    const response = await worker.dispatch("fetch", navigation("/training/deck-estimation/?from=home"));
    expect(await (await response!).text()).toBe("body:/training/deck-estimation/");
  });

  it("falls back to the offline page for an uncached route", async () => {
    const worker = loadWorker("abc123", cacheStorage);
    await worker.dispatch("install");
    online = false;

    const response = await worker.dispatch("fetch", navigation("/never-visited/"));
    expect(await (await response!).text()).toBe("body:/offline.html");
  });

  it("returns a network error rather than throwing for an uncached asset", async () => {
    const worker = loadWorker("abc123", cacheStorage);
    await worker.dispatch("install");
    online = false;

    const response = await (await worker.dispatch("fetch", new Request(`${ORIGIN}/_next/static/chunks/late.js`)))!;
    expect(response.type).toBe("error");
  });
});
