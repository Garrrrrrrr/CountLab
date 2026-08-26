// Hand-rolled service worker for the static-export CountLab site. No server, no
// webpack precache manifest — just cache-first for built assets and page
// navigations, with an offline fallback page.
//
// __CACHE_VERSION__ is replaced with the deploy's git short hash by
// scripts/stamp-sw-version.ts (a postbuild step) so every deploy busts stale
// caches; the literal placeholder is only ever seen in local dev.
const CACHE_VERSION = "__CACHE_VERSION__";
const CACHE_NAME = `countlab-${CACHE_VERSION}`;
// The discard-tray photos are ~4 MB and their filenames never change, so they
// live outside the versioned cache. A deploy replaces the shell and leaves this
// cache intact instead of re-downloading every JPEG over cellular. Because it
// survives deploys, re-shooting a photo under an existing filename requires
// bumping this name to evict the old copy.
const MEDIA_CACHE_NAME = "countlab-media-v1";
const MEDIA_PREFIX = "/deck-estimation/images/";
const OFFLINE_URL = "/offline.html";
// Both are replaced wholesale by the postbuild script. These remain valid in
// dev, where the worker is never registered.
const PRECACHE_URLS = ["__PRECACHE_URLS__"];
const MEDIA_URLS = ["__MEDIA_URLS__"];

// addAll rejects atomically; one bad URL must not abandon every entry.
async function cacheAllSettled(cache, urls) {
  const results = await Promise.allSettled(urls.map((url) => cache.add(url)));
  return results.filter((result) => result.status === "rejected").length;
}

/**
 * Fills the media cache with whatever it is still missing. After the first
 * install this is a no-op, which is the point: subsequent deploys re-download
 * the shell only.
 */
async function warmMediaCache() {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const cached = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
  const missing = MEDIA_URLS.filter((url) => !cached.has(url));
  if (!missing.length) return;
  // Chunked so a phone on a slow link is not asked for 71 photos at once while
  // the shell is still settling.
  for (let i = 0; i < missing.length; i += 6) {
    await cacheAllSettled(cache, missing.slice(i, i + 6));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        const failed = await cacheAllSettled(cache, PRECACHE_URLS);
        if (failed) console.warn(`[countlab] ${failed}/${PRECACHE_URLS.length} precache entries failed`);
      })
      // Photos come second so the shell is usable as early as possible, and stay
      // inside waitUntil so the worker is not killed mid-download.
      .then(() => warmMediaCache().catch((error) => console.warn("[countlab] media precache failed", error))),
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
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME && key !== MEDIA_CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Cache-first against a named cache, falling back to the network and storing what it gets. */
function cacheFirst(event, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // waitUntil keeps the worker alive long enough for the write to land.
          if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
          return response;
        })
        // Offline with nothing cached: fail as a network error rather than
        // resolving undefined, which would throw inside respondWith.
        .catch(() => Response.error());
    }),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Cache-first: every exported route is precached, so going to the network
    // first only bought a doomed round trip on every offline page load. A deploy
    // still reaches the user, via the new worker's cache and the update prompt.
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
            return response;
          })
          .catch(() => caches.match(OFFLINE_URL).then((offline) => offline || Response.error()));
      }),
    );
    return;
  }

  if (url.pathname.startsWith(MEDIA_PREFIX)) {
    // Photos the warm-up missed still land in the media cache, so a drill played
    // once online stays playable offline.
    event.respondWith(cacheFirst(event, MEDIA_CACHE_NAME));
    return;
  }

  event.respondWith(cacheFirst(event, CACHE_NAME));
});
