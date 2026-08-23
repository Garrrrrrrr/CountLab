# CountLab as an iPhone home-screen app — design

**Date:** 2026-08-22
**Status:** approved design, not yet implemented
**Target:** installable PWA on iOS. No Capacitor, no App Store, no native shell.

## Goal

Make `countlab.ca` behave like a real phone app when added to an iPhone home
screen: correct edge-to-edge layout, no viewport lurch when typing, every drill
usable with no network, clean updates, and an install path other users can
actually find.

## Why PWA and not a native wrapper

The alternatives were weighed and rejected:

- **App Store via Capacitor** — needs a $99/yr Apple Developer account, macOS to
  build and sign (the maintainer is on Windows), and App Review, which applies
  guideline 4.2 ("minimum functionality") to web wrappers and simulated-gambling
  age ratings to a card-counting trainer. High cost, real rejection risk.
- **Private signed `.ipa`** — still needs Apple tooling and a Mac; free signing
  profiles expire every 7 days.
- **Native rewrite** — discards a working Next.js app.

The site is already a static export with a manifest, a service worker, and
mobile-aware chrome. The gap between it and a good phone app is defects and
polish, not architecture.

## Starting state

Verified in the repo, not assumed:

- `blackjack/next.config.ts` — `output: "export"`, `trailingSlash: true`.
- `blackjack/app/manifest.ts` — `display: "standalone"`, brand colours, four icons.
- `blackjack/app/layout.tsx` — `appleWebApp: { capable: true, statusBarStyle: "black-translucent" }`.
- `blackjack/public/sw.js` — 65 hand-rolled lines: network-first navigations,
  cache-first assets, offline fallback.
- `blackjack/components/AppShell.tsx` — bottom tab bar, drawer nav, 44px targets,
  and `env(safe-area-inset-*)` already written throughout.
- Deployed to GitHub Pages at `countlab.ca` by `.github/workflows/deploy.yml`.
- Built output is 7.21 MB across 212 files; 3.82 MB of that is 71
  deck-estimation JPEGs.

## Defects

Four verified defects, all of which surface only once installed.

| # | Defect | Evidence |
|---|---|---|
| 1 | Safe-area insets resolve to `0px` | `app/layout.tsx:36-38` exports `viewport` with only `themeColor`; no `viewportFit: "cover"`. Combined with `statusBarStyle: "black-translucent"`, which extends the web view under the status bar, the sticky header renders beneath the clock and the tab bar beneath the home indicator. |
| 2 | Focusing an input zooms the viewport | `app/globals.css:39-44` sets `input { font: inherit }`; the H17 grid's inputs inherit `text-sm` (14px) from the table. iOS Safari auto-zooms any input under 16px, so tabbing 320 cells lurches the viewport 320 times. |
| 3 | Offline is largely fiction | `public/sw.js:11` precaches only `/`, `/offline.html`, `/icon.svg`, `/manifest.webmanifest`. Everything else is network-first, so a route works offline only if already visited. |
| 4 | An update can break a live session | `public/sw.js:18,27` call `skipWaiting()` and `clients.claim()` unconditionally, and activate deletes every non-current cache. A page running old JS that then lazy-imports a content-hashed chunk can 404 mid-drill. |

A fifth issue is not strictly a PWA defect but gates offline entirely:

**`lib/supabase/AuthProvider.tsx:65`** calls `supabase.auth.getSession().then(...)`
and clears `loading` only inside `.then()`. There is no `.catch()`.
`components/AuthGate.tsx:51` is `if (loading) return null`. Any rejection on
that path wedges `loading` at `true` and the whole app renders nothing. The most
likely trigger is exactly the target scenario: offline cold start with an
expired access token.

Icons are a lesser issue: all three PNGs are colour-type 6 (RGBA), and there is
no 180×180 `apple-touch-icon`. iOS flattens home-screen icon transparency onto
black.

## Scope

In scope: the four defects, the `AuthProvider` fix, full offline coverage, a
correct update lifecycle, an install funnel, screen wake lock during drills, and
a best-effort streak badge.

Out of scope:

- Web Push and any push backend. Deliberately dropped.
- Capacitor, Xcode, App Store, `.ipa` signing.
- Changes to drill logic, the Supabase schema, or the analytics event catalog
  beyond one new dimension.
- Any change to `next.config.ts`'s export mode or the Pages deploy workflow.

## Phase 1 — Correct once installed

Bug fixes. Nothing later matters until these land.

1. **Enable safe areas.** Add `viewportFit: "cover"` to the `viewport` export in
   `app/layout.tsx`. This activates roughly eight `env(safe-area-inset-*)` rules
   already present in `AppShell.tsx` and `globals.css`. No new layout code.

2. **Floor input font size at 16px on touch.** One rule in `globals.css`:

   ```css
   @media (pointer: coarse) {
     input, select, textarea { font-size: max(16px, 1em); }
   }
   ```

   Chosen over `maximum-scale=1`, which suppresses the same zoom but degrades
   pinch-zoom accessibility. The H17 table already scrolls horizontally
   (`min-w-[34rem]`), so wider cells cost scroll distance, not layout.

3. **Add an opaque 180×180 `apple-touch-icon.png`** on the `#101411` brand
   background and point `metadata.icons.apple` at it.

4. **Make `loading` un-wedgeable.** Add a `.catch()` to the `getSession()` chain
   in `AuthProvider.tsx` that clears `loading`, plus a timeout fallback so a
   promise that never settles cannot blank the app either. Correct independent
   of PWA work.

5. **Hide the header's external "Home" link when standalone**
   (`AppShell.tsx:235`). Polish, not a fix: the manifest's `start_url` is `/`
   with no explicit `scope`, so scope defaults to `/` and following the link
   stays inside the standalone window. But a "Home" affordance is meaningless in
   an installed app and phone header space is scarce.

## Phase 2 — Real offline

6. **Generate the precache manifest at build time.** Extend the existing
   postbuild hook to walk `out/` and inject the asset list next to the existing
   version stamp.

   The hook converts from `.mjs` to TypeScript and runs via `tsx`. This is
   forced by the test in the Testing section: `tsconfig.json` sets
   `allowJs: false` with `strict: true` and includes `**/*.ts`, so a `.test.ts`
   importing an untyped `.mjs` generator fails type-checking during
   `next build`. `tsx` is already a devDependency and `scripts/` already holds
   `.ts` files (`rankDeviations.ts`, `priceDeviationCell.ts`), so this follows
   existing convention rather than adding tooling. `postbuild` becomes
   `tsx scripts/stamp-sw-version.ts`; CI is unaffected because `npm ci`
   installs devDependencies.

   URL mapping is the load-bearing detail. `trailingSlash: true` means the
   browser requests `/training/h17-chart/`, so the generator must map
   `out/training/h17-chart/index.html` to `/training/h17-chart/`, and
   `out/index.html` to `/`. Precaching file paths instead of request URLs
   produces a cache that never hits.

   Include: route URLs, `_next/static/**` (content-hashed), CSS, JSON data,
   icons, `offline.html`. Exclude: `sw.js` itself, `sitemap.xml`, `robots.txt`,
   `opengraph-image`, `.nojekyll`, and the deck-estimation JPEGs.

   `public/sw.js` carries a placeholder that keeps the file valid JavaScript in
   dev, matching the existing `__CACHE_VERSION__` convention:

   ```js
   const PRECACHE_URLS = ["__PRECACHE_URLS__"];
   ```

   The script replaces that exact token with `JSON.stringify(urls)`. The
   unstamped dev copy stays syntactically valid and is never registered, since
   `registerServiceWorker` returns early outside production.

7. **Split precache from runtime cache.** App shell, every exported route, JS,
   CSS, JSON and icons precache eagerly — roughly 3.4 MB. The 71 deck-estimation
   photos stay runtime-cached on first use; one drill should not double every
   user's install cost. They remain available offline once that drill has been
   opened.

8. **Install robustly.** Replace `cache.addAll(PRECACHE_URLS)` with
   `Promise.allSettled` over individual `cache.add` calls. `addAll` rejects
   atomically, so across ~130 URLs a single failure would abandon the entire
   precache.

9. **Fix the update lifecycle.**
   - Remove the unconditional `skipWaiting()` from `install`.
   - Add a `message` listener honouring `{ type: "SKIP_WAITING" }`.
   - In `lib/pwa/registerServiceWorker.ts`, watch `updatefound` and the
     installing worker's `statechange`; when it reaches `installed` while
     `navigator.serviceWorker.controller` exists, an update is waiting.
   - Surface a "New version — Reload" toast. Accepting posts `SKIP_WAITING` to
     `registration.waiting`; a one-shot `controllerchange` listener then reloads,
     guarded by a flag against reload loops.

   This closes the window in which a page running old JS requests a hashed chunk
   that activate has already evicted, because eviction now happens only after the
   user has opted in and the page immediately reloads.

10. **Verify offline genuinely works.** Guest mode plus `localStorage` means
    drills need no network. The Phase 1 `AuthProvider` fix is what makes a
    signed-in cold start survive. Supabase sync failures must stay non-fatal.

## Phase 3 — Install funnel

`countlab.ca` is public, so installability is a product feature.

11. **`lib/pwa/standalone.ts`** — pure, unit-testable detection:
    - standalone: `matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true`; the legacy flag is still required on iOS.
    - iOS: user-agent test plus the iPadOS 13+ case, which reports as Macintosh
      and needs `navigator.maxTouchPoints > 1` to disambiguate.
    - Safari specifically, because Chrome and Firefox on iOS cannot install a
      PWA at all and must never be shown instructions that cannot work.

12. **`components/InstallPrompt.tsx`** — captures `beforeinstallprompt` on
    Android and desktop and offers a real install button. iOS Safari fires no
    such event, so it instead shows Share → Add to Home Screen instructions.
    Dismissal persists in `localStorage`. Never rendered when already installed
    or in a browser that cannot install.

    Worth stating in the copy: iOS evicts service-worker caches and
    `localStorage` from *uninstalled* sites after roughly seven days of disuse.
    Installing is what protects a guest user's statistics. That is a real
    reason to install, not marketing.

13. **Analytics.** One new dimension recording whether a session is running
    standalone, plus an install-prompt outcome event. No new event types beyond
    that.

## Phase 4 — Capabilities

14. **`lib/pwa/useWakeLock.ts`** — `useWakeLock(active: boolean)`. Requests a
    screen wake lock while active, releases on deactivation and unmount, and
    re-acquires on `visibilitychange`, since iOS drops the sentinel whenever the
    document hides. Guarded by `"wakeLock" in navigator` and tolerant of
    rejection, which Low Power Mode causes.

    Opt-in is one line per drill, in exactly two files: `CountingDrills.tsx`
    (`RunningCountDrill`, `TrueCountDrill`, `DeckEstimationDrill`,
    `CountingBenchmark`, `ProficiencyTest`) and `FullShoeGame.tsx`. These are the
    drills the user watches rather than taps, which is why iOS dims and locks
    mid-run today. Tap-driven drills do not need it.

15. **Streak badge — best effort, never prompting.** `navigator.setAppBadge()`
    with the current streak from `lib/statistics/streaks.ts`, cleared when the
    streak is zero.

    Caveat recorded deliberately: WebKit appears to gate the Badging API on iOS
    behind notification permission, even with nothing being pushed. Push was
    explicitly de-scoped, so the implementation must paint a badge only when
    `Notification.permission` is *already* `"granted"` and no-op silently
    otherwise. It must never trigger a permission prompt. If device testing shows
    the badge never appears without one, delete the feature; a number on an icon
    does not justify a first-run permission dialog.

## Testing

The repo uses Vitest and has no component or end-to-end tests. That boundary is
respected: only genuinely pure logic gets unit tests.

- **`scripts/precacheManifest.test.ts`** — the URL mapping, which fails silently
  and expensively if wrong: `out/index.html` → `/`,
  `out/training/h17-chart/index.html` → `/training/h17-chart/`, `_next/static`
  passthrough, and exclusion of `sw.js`, `sitemap.xml`, `robots.txt` and the
  deck-estimation JPEGs. The generator is a pure function over a file list, so
  the test needs no filesystem fixture; walking `out/` stays in the caller.
  Vitest has no config file in this repo, so its default `include` picks up
  `scripts/**/*.test.ts` with no change needed.
- **`lib/pwa/standalone.test.ts`** — display-mode and `navigator.standalone`
  detection, the iPadOS-reports-as-Macintosh case, and Chrome-on-iOS correctly
  identified as unable to install.
- **Lighthouse PWA audit** against the built export, run locally through Chrome
  DevTools before any device testing.
- **Device checklist**, run once on a real iPhone, since none of the following
  can be verified in CI:
  1. Installed layout clears the notch and the home indicator.
  2. Tabbing the H17 grid does not zoom.
  3. Airplane-mode cold start reaches a usable drill.
  4. Install instructions appear in iOS Safari and not in iOS Chrome.
  5. Screen stays awake through a counting drill.
  6. Whether the badge appears without a notification prompt (decides item 15).
  7. Google sign-in from a standalone window — see Risks.

Verification before completion: `npm test`, `npm run lint`, `npm run build`.

## Risks

- **Google OAuth in standalone.** `AuthProvider.tsx:157-165` uses
  `signInWithOAuth` with a redirect to `${origin}/dashboard`. On iOS a
  cross-origin hop from a standalone window opens an in-app browser; if the PKCE
  verifier written to the originating context is not visible when the callback
  lands, the exchange fails. This has not been reproduced and will not be
  speculatively "fixed". It is on the device checklist. If it fails, the
  remedy is to prefer email/password in standalone, which needs no redirect,
  and the session then persists so the cost is one-time. Guest mode remains a
  full-featured fallback throughout.
- **Badge permission gating** — see item 15; resolved by device testing.
- **Precache size growth.** 3.4 MB is comfortable, but adding large assets to
  `public/` would silently inflate every install. The manifest generator should
  log its total so the number stays visible in build output.

## Files

New:

- `blackjack/lib/pwa/standalone.ts`
- `blackjack/lib/pwa/standalone.test.ts`
- `blackjack/lib/pwa/useWakeLock.ts`
- `blackjack/lib/pwa/appBadge.ts`
- `blackjack/components/InstallPrompt.tsx`
- `blackjack/components/UpdateToast.tsx`
- `blackjack/scripts/precacheManifest.ts`
- `blackjack/scripts/precacheManifest.test.ts`
- `blackjack/public/apple-touch-icon.png`

Edited:

- `blackjack/app/layout.tsx` — `viewportFit`, apple touch icon, mount new components
- `blackjack/app/globals.css` — 16px input floor
- `blackjack/public/sw.js` — precache placeholder, `allSettled` install, update lifecycle
- `blackjack/scripts/stamp-sw-version.mjs` → `.ts` — inject the precache manifest
- `blackjack/package.json` — `postbuild` runs the hook through `tsx`
- `blackjack/lib/pwa/registerServiceWorker.ts` — update detection and reload
- `blackjack/lib/supabase/AuthProvider.tsx` — `.catch()` and timeout on `getSession`
- `blackjack/components/AppShell.tsx` — hide external Home link when standalone
- `blackjack/components/CountingDrills.tsx` — wake lock opt-in
- `blackjack/components/FullShoeGame.tsx` — wake lock opt-in
- `blackjack/lib/analytics/types.ts`, `config.ts`, `track.ts` — standalone dimension

## Sequencing

Phases 1 and 2 must be correct and ship together; an install funnel pointing at
an app that renders under the clock and does not work offline is worse than no
funnel. Phases 3 and 4 are additive and independently shippable.
