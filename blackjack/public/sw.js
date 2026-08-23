// Hand-rolled service worker for the static-export CountLab site. No server, no
// webpack precache manifest — just cache-first for built assets and network-first
// for page navigations, with an offline fallback page.
//
// __CACHE_VERSION__ is replaced with the deploy's git short hash by
// scripts/stamp-sw-version.ts (a postbuild step) so every deploy busts stale
// caches; the literal placeholder is only ever seen in local dev.
const CACHE_VERSION = "__CACHE_VERSION__";
const CACHE_NAME = `countlab-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
// Replaced wholesale by the postbuild script. This remains valid in dev, where
// the worker is never registered.
const PRECACHE_URLS = ["__PRECACHE_URLS__"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll rejects atomically; one bad URL must not abandon every cache.
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))).then((results) => {
        const failed = results.filter((result) => result.status === "rejected").length;
        if (failed) console.warn(`[countlab] ${failed}/${PRECACHE_URLS.length} precache entries failed`);
      }),
    ),
  );
  // Do not skip waiting here: old pages may still need their hashed chunks.
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    }),
  );
});
