# iPhone Home-Screen App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `countlab.ca` behave like a real iPhone app when added to the home screen — correct edge-to-edge layout, no viewport zoom when typing, every drill usable offline, clean updates, and an install path other users can find.

**Architecture:** Stay a PWA. No Capacitor, no native shell. Fix four verified defects that only surface once installed, generate a real precache manifest from the static export at build time, and add a small `lib/pwa/` module set consumed by the shell, the install prompt, and analytics. All new logic is written as pure functions so it can be unit-tested in Vitest's default Node environment — this repo has no jsdom and no component tests, and this plan does not add either.

**Tech Stack:** Next.js 15 static export (`output: "export"`, `trailingSlash: true`), React 19, Tailwind 3, TypeScript 5.9 (strict, `allowJs: false`), Vitest 3 (no config file, Node environment), `tsx` for build scripts, hand-rolled service worker, GitHub Pages deploy.

**Spec:** `docs/superpowers/specs/2026-08-22-ios-home-screen-app-design.md`

## Global Constraints

- **Working directory for all commands is `blackjack/`** unless a step says otherwise. The repo root is `CountLab/`; the app lives in `blackjack/`.
- **Branch:** `ios-home-screen-app` (already created, spec committed as `ac63558`). Do not commit to `main`.
- **No new runtime dependencies.** `tsx` is already a devDependency and may be used in build scripts.
- **Do not modify the Supabase schema** (`blackjack/supabase/schema.sql`) or `.github/workflows/`. Analytics additions must land in `jsonb` columns only.
- **Do not add jsdom, testing-library, or any component-test harness.** Extract logic into pure functions and test those.
- **Vitest has no config file.** Default `include` picks up `**/*.test.ts` anywhere outside `node_modules`, and the default environment is `node` — tests must not touch `window`, `document`, or `navigator` directly.
- **`tsconfig.json` sets `allowJs: false`, `strict: true`, `include: ["**/*.ts"]`.** Any `.ts` file importing an untyped `.js`/`.mjs` module fails `next build`.
- **Brand background colour is `#101411`** (matches `manifest.ts` and the `viewport.themeColor`).
- **Verification before any task is considered done:** `npm test`, `npm run lint`, `npm run build` all pass. `lint` runs with `--max-warnings=0`.

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `blackjack/lib/pwa/standalone.ts` | Pure environment classification: standalone / iOS / iOS-Safari / installability. Consumed by AppShell, InstallPrompt, analytics. |
| `blackjack/lib/pwa/standalone.test.ts` | Tests for the above. |
| `blackjack/lib/pwa/settleWithTimeout.ts` | Pure promise guard so a hung or rejected promise can never wedge UI state. |
| `blackjack/lib/pwa/settleWithTimeout.test.ts` | Tests for the above. |
| `blackjack/lib/pwa/useWakeLock.ts` | React hook holding a screen wake lock while a drill is active. |
| `blackjack/lib/pwa/appBadge.ts` | Best-effort home-screen icon badge. Never prompts for permission. |
| `blackjack/components/InstallPrompt.tsx` | Install affordance: native prompt on Android/desktop, instructions on iOS Safari. |
| `blackjack/components/UpdateToast.tsx` | "New version — Reload" toast wired to the waiting service worker. |
| `blackjack/scripts/precacheManifest.ts` | Pure mapping from exported file paths to precache request URLs. |
| `blackjack/scripts/precacheManifest.test.ts` | Tests for the above. |
| `blackjack/public/apple-touch-icon.png` | Opaque 180×180 iOS home-screen icon. |
| `docs/superpowers/device-checklist-ios.md` | The manual on-device checks that cannot run in CI. |

**Modified files**

| File | Change |
|---|---|
| `blackjack/app/layout.tsx` | `viewportFit: "cover"`; apple touch icon; mount `InstallPrompt` and `UpdateToast`. |
| `blackjack/app/globals.css` | 16px input font floor on coarse pointers. |
| `blackjack/public/sw.js` | Precache placeholder, resilient install, update lifecycle. |
| `blackjack/scripts/stamp-sw-version.mjs` → `.ts` | Also injects the precache manifest; runs via `tsx`. |
| `blackjack/package.json` | `postbuild` runs through `tsx`. |
| `blackjack/lib/pwa/registerServiceWorker.ts` | Update detection and the activate/reload handshake. |
| `blackjack/lib/supabase/AuthProvider.tsx` | Guard `getSession()` so `loading` cannot wedge. |
| `blackjack/components/AppShell.tsx` | Hide external Home link when standalone; paint streak badge. |
| `blackjack/components/CountingDrills.tsx` | Wake-lock opt-in for five drills. |
| `blackjack/components/FullShoeGame.tsx` | Wake-lock opt-in. |
| `blackjack/lib/analytics/types.ts` | `DisplayMode`, `EventContext.display_mode`, `install_prompt` event. |
| `blackjack/lib/analytics/context.ts` | Populate `display_mode`. |

---

# Phase 1 — Correct once installed

These are bug fixes. Nothing later in this plan is worth doing until they land.

## Task 1: Enable safe areas and stop input zoom

Two one-line-scale fixes that together account for most of "it looks like a real app". Neither is unit-testable (CSS and framework metadata); both are verified by build plus the device checklist in Task 14.

**Files:**
- Modify: `blackjack/app/layout.tsx:36-38`
- Modify: `blackjack/app/globals.css` (append near the existing `button, input, select` block at lines 39-47)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. Activates ~8 existing `env(safe-area-inset-*)` rules in `AppShell.tsx` and `globals.css`.

**Background:** `app/layout.tsx` currently exports `viewport` with only `themeColor`. Without `viewportFit: "cover"` the `env(safe-area-inset-*)` custom environment variables resolve to `0px`. Because `layout.tsx:33` also sets `statusBarStyle: "black-translucent"`, which extends the web view under the status bar, the installed app renders its sticky header beneath the clock and its bottom tab bar beneath the home indicator.

- [ ] **Step 1: Add `viewportFit` to the viewport export**

In `blackjack/app/layout.tsx`, replace:

```tsx
export const viewport: Viewport = {
  themeColor: "#101411",
};
```

with:

```tsx
export const viewport: Viewport = {
  themeColor: "#101411",
  // Required for env(safe-area-inset-*) to resolve to anything but 0px. The
  // shell already pads for the notch and home indicator throughout; with
  // appleWebApp.statusBarStyle "black-translucent" the web view extends under
  // the status bar, so without this the header renders beneath the clock.
  viewportFit: "cover",
};
```

- [ ] **Step 2: Add the input font-size floor**

In `blackjack/app/globals.css`, immediately after the existing `button { touch-action: manipulation; }` rule (line 45-47), add:

```css
/* iOS Safari zooms the viewport when focusing any control whose computed
   font-size is under 16px. `input { font: inherit }` above means the H17
   chart's cells inherit the table's 14px, so tabbing the grid would lurch the
   viewport on every cell. Chosen over maximum-scale=1, which suppresses the
   same zoom but breaks pinch-zoom accessibility. */
@media (pointer: coarse) {
  input,
  select,
  textarea {
    font-size: max(16px, 1em);
  }
}
```

- [ ] **Step 3: Verify the build is clean**

Run, from `blackjack/`:

```bash
npm run lint && npm run build
```

Expected: both pass. Then confirm the viewport meta actually carries the property:

```bash
grep -o 'viewport-fit=cover' out/index.html | head -1
```

Expected: prints `viewport-fit=cover`. If it prints nothing, the `viewport` export did not take effect — check that you edited the `viewport` export and not `metadata`.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "fix: activate safe-area insets and stop iOS input zoom

viewport-fit=cover makes the ~8 env(safe-area-inset-*) rules already
written across AppShell and globals.css resolve to real values; without
it they were 0px and black-translucent put the header under the clock.

The 16px floor stops iOS auto-zooming on focus, which the H17 grid's
inherited 14px cells triggered on every one of 320 cells."
```

---

## Task 2: Opaque 180×180 apple-touch-icon

**Files:**
- Create: `blackjack/public/apple-touch-icon.png`
- Modify: `blackjack/app/layout.tsx:32`

**Interfaces:**
- Consumes: nothing.
- Produces: `/apple-touch-icon.png` as a static asset. Task 6's precache generator will include it automatically.

**Background:** all three existing PNGs (`icon-192`, `icon-512`, `icon-maskable-512`) are PNG colour-type 6 (RGBA). iOS does not honour transparency in home-screen icons; it flattens onto black. `layout.tsx:32` currently points `apple` at `/icon-192.png`. iOS wants 180×180 for modern devices.

- [ ] **Step 1: Generate the icon**

The command below is verified working on this machine (Windows, PowerShell). It composites `icon-512.png` onto the brand background and writes true 24-bit RGB with no alpha channel. Run it from the repo root:

```powershell
Add-Type -AssemblyName System.Drawing
$src = "blackjack\public\icon-512.png"
$dst = "blackjack\public\apple-touch-icon.png"
$in  = [System.Drawing.Image]::FromFile((Resolve-Path $src))
$bmp = New-Object System.Drawing.Bitmap 180, 180, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#101411"))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($in, 0, 0, 180, 180)
$g.Dispose(); $in.Dispose()
$bmp.Save((Join-Path (Get-Location) $dst), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
```

- [ ] **Step 2: Verify it is 180×180 with no alpha channel**

```powershell
$b = [System.IO.File]::ReadAllBytes("blackjack\public\apple-touch-icon.png")
$w = [BitConverter]::ToUInt32(($b[19..16]),0); $h = [BitConverter]::ToUInt32(($b[23..20]),0)
"{0}x{1} colorType={2}" -f $w, $h, $b[25]
```

Expected: `180x180 colorType=2`. Colour-type 2 is RGB with no alpha. If it prints `colorType=6`, the `Format24bppRgb` pixel format argument was dropped — redo Step 1.

- [ ] **Step 3: Point the metadata at it**

In `blackjack/app/layout.tsx`, replace:

```tsx
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
```

with:

```tsx
  // iOS ignores alpha in home-screen icons and flattens onto black, so the
  // apple icon is a dedicated opaque 180x180 rather than the RGBA icon-192.
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
```

- [ ] **Step 4: Verify the build emits it**

```bash
npm run build && ls -la out/apple-touch-icon.png && grep -o 'apple-touch-icon' out/index.html | head -1
```

Expected: the file exists in `out/` and `apple-touch-icon` appears in the emitted HTML.

- [ ] **Step 5: Commit**

```bash
git add public/apple-touch-icon.png app/layout.tsx
git commit -m "fix: add opaque 180x180 apple-touch-icon

All three existing icons are RGBA and iOS flattens home-screen icon
transparency onto black. Ships a dedicated opaque icon on the #101411
brand background at the size modern iPhones ask for."
```

---

## Task 3: `lib/pwa/standalone.ts` — environment classification

Foundation for Tasks 4, 10 and 11. Written as pure functions over an injected probe object so it tests in Vitest's Node environment with no DOM.

**Files:**
- Create: `blackjack/lib/pwa/standalone.ts`
- Test: `blackjack/lib/pwa/standalone.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface PwaEnv { displayModeStandalone: boolean; navigatorStandalone: boolean; userAgent: string; maxTouchPoints: number }`
  - `isStandalone(env: PwaEnv): boolean`
  - `isIOS(env: PwaEnv): boolean`
  - `isIOSSafari(env: PwaEnv): boolean`
  - `installAffordance(env: PwaEnv): "none" | "ios-instructions" | "native"`
  - `readPwaEnv(): PwaEnv` — browser-only accessor, returns a neutral env during SSR.

- [ ] **Step 1: Write the failing test**

Create `blackjack/lib/pwa/standalone.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  installAffordance,
  isIOS,
  isIOSSafari,
  isStandalone,
  type PwaEnv,
} from "./standalone";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0 Mobile/15E148 Safari/604.1";
const IPADOS_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const MAC_SAFARI = IPADOS_SAFARI;
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36";

const env = (over: Partial<PwaEnv>): PwaEnv => ({
  displayModeStandalone: false,
  navigatorStandalone: false,
  userAgent: ANDROID_CHROME,
  maxTouchPoints: 0,
  ...over,
});

describe("isStandalone", () => {
  it("is false in a normal browser tab", () => {
    expect(isStandalone(env({}))).toBe(false);
  });

  it("trusts the display-mode media query", () => {
    expect(isStandalone(env({ displayModeStandalone: true }))).toBe(true);
  });

  it("trusts navigator.standalone, which is the only signal on older iOS", () => {
    expect(isStandalone(env({ navigatorStandalone: true, userAgent: IPHONE_SAFARI }))).toBe(true);
  });
});

describe("isIOS", () => {
  it("detects an iPhone", () => {
    expect(isIOS(env({ userAgent: IPHONE_SAFARI }))).toBe(true);
  });

  it("detects iPadOS 13+, which reports itself as a Macintosh", () => {
    expect(isIOS(env({ userAgent: IPADOS_SAFARI, maxTouchPoints: 5 }))).toBe(true);
  });

  it("does not mistake a real Mac for an iPad", () => {
    expect(isIOS(env({ userAgent: MAC_SAFARI, maxTouchPoints: 0 }))).toBe(false);
  });

  it("is false on Android", () => {
    expect(isIOS(env({ userAgent: ANDROID_CHROME }))).toBe(false);
  });
});

describe("isIOSSafari", () => {
  it("accepts Safari on iOS", () => {
    expect(isIOSSafari(env({ userAgent: IPHONE_SAFARI }))).toBe(true);
  });

  it("rejects Chrome on iOS, which cannot install a PWA at all", () => {
    expect(isIOSSafari(env({ userAgent: IPHONE_CHROME }))).toBe(false);
  });

  it("rejects non-iOS browsers", () => {
    expect(isIOSSafari(env({ userAgent: ANDROID_CHROME }))).toBe(false);
  });
});

describe("installAffordance", () => {
  it("offers nothing once already installed", () => {
    expect(installAffordance(env({ displayModeStandalone: true }))).toBe("none");
  });

  it("offers instructions on iOS Safari, which fires no install event", () => {
    expect(installAffordance(env({ userAgent: IPHONE_SAFARI }))).toBe("ios-instructions");
  });

  it("offers nothing in a browser that cannot install", () => {
    expect(installAffordance(env({ userAgent: IPHONE_CHROME }))).toBe("none");
  });

  it("defers to the native prompt everywhere else", () => {
    expect(installAffordance(env({ userAgent: ANDROID_CHROME }))).toBe("native");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run, from `blackjack/`:

```bash
npx vitest run lib/pwa/standalone.test.ts
```

Expected: FAIL — cannot resolve `./standalone`.

- [ ] **Step 3: Write the implementation**

Create `blackjack/lib/pwa/standalone.ts`:

```ts
/**
 * Which kind of environment the app is running in, as plain data so the
 * classification below stays pure and testable without a DOM. `readPwaEnv`
 * is the only browser-touching function in this module.
 */
export interface PwaEnv {
  /** `matchMedia("(display-mode: standalone)").matches` */
  displayModeStandalone: boolean;
  /** iOS-only legacy flag; still the only signal on older iOS versions. */
  navigatorStandalone: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

/** Browsers on iOS that are not Safari. None of them can install a PWA. */
const NON_SAFARI_IOS = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/;

export function isStandalone(env: PwaEnv): boolean {
  return env.displayModeStandalone || env.navigatorStandalone;
}

export function isIOS(env: PwaEnv): boolean {
  if (/iPad|iPhone|iPod/.test(env.userAgent)) return true;
  // iPadOS 13 and later report a desktop Macintosh user agent. Touch points
  // are what separate an iPad from an actual Mac.
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

export function isIOSSafari(env: PwaEnv): boolean {
  return isIOS(env) && !NON_SAFARI_IOS.test(env.userAgent);
}

/**
 * What install affordance, if any, to offer.
 *
 * - `none` — already installed, or a browser that cannot install.
 * - `ios-instructions` — iOS Safari, which never fires `beforeinstallprompt`
 *   and requires the user to go through the Share sheet by hand.
 * - `native` — wait for `beforeinstallprompt` and offer a real button.
 */
export function installAffordance(env: PwaEnv): "none" | "ios-instructions" | "native" {
  if (isStandalone(env)) return "none";
  if (isIOS(env)) return isIOSSafari(env) ? "ios-instructions" : "none";
  return "native";
}

/** Reads the live environment. Returns a neutral env during SSR/prerender. */
export function readPwaEnv(): PwaEnv {
  if (typeof window === "undefined") {
    return { displayModeStandalone: false, navigatorStandalone: false, userAgent: "", maxTouchPoints: 0 };
  }
  return {
    displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    userAgent: window.navigator.userAgent,
    maxTouchPoints: window.navigator.maxTouchPoints,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run lib/pwa/standalone.test.ts
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/pwa/standalone.ts lib/pwa/standalone.test.ts
git commit -m "feat: add pure PWA environment classification

Pure functions over an injected probe so they test in Vitest's node
environment with no DOM. Covers the two cases that break naive
detection: iPadOS 13+ reporting a Macintosh UA, and Chrome/Firefox on
iOS being unable to install a PWA at all."
```

---

## Task 4: Hide the external Home link when standalone

Polish, not a fix. The manifest's `start_url` is `/` with no explicit `scope`, so scope defaults to `/` and following the link stays inside the standalone window — it is not a dead end. But a "Home" affordance means nothing in an installed app, and phone header space is scarce.

**Files:**
- Modify: `blackjack/components/AppShell.tsx` (imports near line 8; header link at lines 235-242)

**Interfaces:**
- Consumes: `readPwaEnv`, `isStandalone` from `@/lib/pwa/standalone` (Task 3).
- Produces: nothing.

- [ ] **Step 1: Add standalone state to AppShell**

In `blackjack/components/AppShell.tsx`, add to the imports near line 8:

```tsx
import { isStandalone, readPwaEnv } from "@/lib/pwa/standalone";
```

Then add a state hook alongside the existing ones (near the `useState` block at lines 86-91) and an effect to populate it. It must be read in an effect rather than during render, because the server-rendered HTML is shared by every visitor and must not bake in one client's environment:

```tsx
  const [standalone, setStandalone] = useState(false);
```

and, next to the other effects (e.g. after the `registerServiceWorker` effect at line 131):

```tsx
  // Read after mount, never during render: this is a static export, so a value
  // computed at render time would be baked into the shared prerendered HTML.
  useEffect(() => { setStandalone(isStandalone(readPwaEnv())); }, []);
```

- [ ] **Step 2: Gate the Home link**

In the same file, the header contains an `<a href="/">` labelled "Go to CountLab home" (around lines 235-242). Wrap it so it renders only outside standalone. Replace the opening of that element:

```tsx
          {/* This deliberately leaves the Next.js base path to return to the portfolio. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
```

with:

```tsx
          {/* This deliberately leaves the Next.js base path to return to the portfolio.
              Hidden once installed: a "Home" affordance is meaningless inside a
              standalone window, and phone header space is scarce. */}
          {!standalone && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a
            href="/"
```

and close the conditional after that element's closing `</a>` tag:

```tsx
          </a>
          )}
```

- [ ] **Step 3: Verify**

```bash
npm run lint && npm run build
```

Expected: both pass. Lint is `--max-warnings=0`, so if moving the `eslint-disable-next-line` comment broke its association with the `<a>`, this will fail — the comment must sit on the line directly above the `<a>`.

- [ ] **Step 4: Commit**

```bash
git add components/AppShell.tsx
git commit -m "feat: hide the external Home link when running standalone

A 'Home' affordance means nothing inside an installed app and phone
header space is scarce. Read after mount, not during render, so the
shared prerendered HTML stays environment-neutral."
```

---

## Task 5: Make `loading` un-wedgeable

The most important fix in Phase 1 and the one that gates offline entirely.

`lib/supabase/AuthProvider.tsx:65` calls `supabase.auth.getSession().then(...)` and clears `loading` only inside `.then()`. There is no `.catch()`. `components/AuthGate.tsx:51` is `if (loading) return null`. Any rejection on that path wedges `loading` at `true` and the whole app renders nothing. The likeliest trigger is exactly the target scenario: an offline cold start with an expired access token.

**Files:**
- Create: `blackjack/lib/pwa/settleWithTimeout.ts`
- Test: `blackjack/lib/pwa/settleWithTimeout.test.ts`
- Modify: `blackjack/lib/supabase/AuthProvider.tsx:65-78`

**Interfaces:**
- Consumes: nothing.
- Produces: `settleWithTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T>`

- [ ] **Step 1: Write the failing test**

Create `blackjack/lib/pwa/settleWithTimeout.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { settleWithTimeout } from "./settleWithTimeout";

describe("settleWithTimeout", () => {
  it("passes through a value that resolves in time", async () => {
    await expect(settleWithTimeout(Promise.resolve("ok"), 1000, "fallback")).resolves.toBe("ok");
  });

  it("returns the fallback when the promise rejects", async () => {
    await expect(settleWithTimeout(Promise.reject(new Error("offline")), 1000, "fallback"))
      .resolves.toBe("fallback");
  });

  it("returns the fallback when the promise never settles", async () => {
    vi.useFakeTimers();
    try {
      const pending = settleWithTimeout(new Promise<string>(() => {}), 5000, "fallback");
      await vi.advanceTimersByTimeAsync(5000);
      await expect(pending).resolves.toBe("fallback");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not override a value that arrives before the deadline", async () => {
    vi.useFakeTimers();
    try {
      const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late but ok"), 1000));
      const guarded = settleWithTimeout(slow, 5000, "fallback");
      await vi.advanceTimersByTimeAsync(1000);
      await expect(guarded).resolves.toBe("late but ok");
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run lib/pwa/settleWithTimeout.test.ts
```

Expected: FAIL — cannot resolve `./settleWithTimeout`.

- [ ] **Step 3: Write the implementation**

Create `blackjack/lib/pwa/settleWithTimeout.ts`:

```ts
/**
 * Resolves with the promise's value, or with `fallback` if it rejects or does
 * not settle within `ms`. Never rejects.
 *
 * Exists because UI that clears a loading flag inside `.then()` alone will
 * hang forever on a rejected or stalled promise. Offline is the common case:
 * a cold start with an expired token can leave the whole app blank.
 */
export function settleWithTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), ms);
    promise.then((value) => finish(value)).catch(() => finish(fallback));
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run lib/pwa/settleWithTimeout.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Apply it in AuthProvider**

In `blackjack/lib/supabase/AuthProvider.tsx`, add to the imports:

```tsx
import { settleWithTimeout } from "@/lib/pwa/settleWithTimeout";
```

Then replace the `supabase.auth.getSession().then(...)` call that begins at line 65. The existing body is kept verbatim; only the promise it hangs off changes, plus the guard:

```tsx
    // Guarded because AuthGate renders nothing while `loading` is true: a
    // rejected or stalled getSession would blank the entire app. Offline cold
    // starts with an expired access token are the realistic trigger.
    settleWithTimeout(
      supabase.auth.getSession(),
      8000,
      { data: { session: null } } as Awaited<ReturnType<typeof supabase.auth.getSession>>,
    ).then(({ data }) => {
      if (cancelled) return;
      setCurrentUser(data.session?.user ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) {
        // Retry any writes that failed while this device was offline or while
        // the remote schema was being upgraded before merging its remote copy.
        runSync(() => pushLocalDataToRemote().then(() => pullRemoteData(data.session!.user.id)));
      }
      const oauthIntent = sessionStorage.getItem(OAUTH_INTENT_KEY);
      if (data.session?.user && oauthIntent === "sign-in") analytics.track("login_succeeded", { method: "google" });
      if (oauthIntent) sessionStorage.removeItem(OAUTH_INTENT_KEY);
    });
```

Note: falling back to a null session degrades to the signed-out view, from which guest mode is reachable and every drill works offline. It does not sign the user out — the Supabase session in `localStorage` is untouched and `onAuthStateChange` (line 79) still fires if the client recovers.

- [ ] **Step 6: Verify**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass, including the pre-existing suite.

- [ ] **Step 7: Commit**

```bash
git add lib/pwa/settleWithTimeout.ts lib/pwa/settleWithTimeout.test.ts lib/supabase/AuthProvider.tsx
git commit -m "fix: getSession can no longer wedge the app at a blank screen

AuthProvider cleared `loading` only inside .then() with no .catch(),
and AuthGate renders null while loading. A rejected or stalled
getSession blanked the entire app -- most likely on an offline cold
start with an expired token, which is exactly the scenario the offline
work targets.

Extracted as a pure helper so it can be tested without jsdom."
```

---

# Phase 2 — Real offline

Phase 1 and Phase 2 ship together. An install funnel pointing at an app that renders under the clock and does not work offline is worse than no funnel.

## Task 6: Precache manifest generator

The load-bearing detail is URL mapping. `trailingSlash: true` means the browser requests `/training/h17-chart/`, so the generator must emit that, not the file path `training/h17-chart/index.html`. Precaching file paths produces a cache that never hits.

**Files:**
- Create: `blackjack/scripts/precacheManifest.ts`
- Test: `blackjack/scripts/precacheManifest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `toPrecacheUrls(files: readonly string[]): string[]` — takes POSIX-style paths relative to `out/`, returns sorted request URLs.

- [ ] **Step 1: Write the failing test**

Create `blackjack/scripts/precacheManifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toPrecacheUrls } from "./precacheManifest";

describe("toPrecacheUrls", () => {
  it("maps the root document to /", () => {
    expect(toPrecacheUrls(["index.html"])).toEqual(["/"]);
  });

  it("maps a nested index.html to its trailing-slash route", () => {
    expect(toPrecacheUrls(["training/h17-chart/index.html"])).toEqual(["/training/h17-chart/"]);
  });

  it("passes hashed static assets through as-is", () => {
    expect(toPrecacheUrls(["_next/static/chunks/abc123.js"])).toEqual(["/_next/static/chunks/abc123.js"]);
  });

  it("keeps non-index html at its own path", () => {
    expect(toPrecacheUrls(["404.html"])).toEqual(["/404.html"]);
  });

  it("excludes the service worker itself, which must never be cached", () => {
    expect(toPrecacheUrls(["sw.js"])).toEqual([]);
  });

  it("excludes crawler and social files that no offline view needs", () => {
    expect(toPrecacheUrls(["sitemap.xml", "robots.txt", ".nojekyll", "opengraph-image.png"])).toEqual([]);
  });

  it("excludes the deck-estimation photos, which are runtime-cached on demand", () => {
    expect(toPrecacheUrls(["deck-estimation/images/tray-0001.jpg"])).toEqual([]);
  });

  it("keeps the deck-estimation manifest, which is small and drives the drill", () => {
    expect(toPrecacheUrls(["deck-estimation/manifest.json"])).toEqual(["/deck-estimation/manifest.json"]);
  });

  it("keeps icons, the offline page and the web manifest", () => {
    expect(toPrecacheUrls(["offline.html", "icon.svg", "manifest.webmanifest", "apple-touch-icon.png"]))
      .toEqual(["/apple-touch-icon.png", "/icon.svg", "/manifest.webmanifest", "/offline.html"]);
  });

  it("returns a sorted, de-duplicated list so the output is stable across builds", () => {
    expect(toPrecacheUrls(["b.css", "a.css", "b.css"])).toEqual(["/a.css", "/b.css"]);
  });

  it("normalises Windows path separators", () => {
    expect(toPrecacheUrls(["training\\h17-chart\\index.html"])).toEqual(["/training/h17-chart/"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run scripts/precacheManifest.test.ts
```

Expected: FAIL — cannot resolve `./precacheManifest`.

- [ ] **Step 3: Write the implementation**

Create `blackjack/scripts/precacheManifest.ts`:

```ts
/**
 * Turns the static export's file list into the URLs a service worker should
 * precache.
 *
 * The mapping is the whole point: `trailingSlash: true` means the browser
 * requests `/training/h17-chart/`, so precaching the file path
 * `training/h17-chart/index.html` would build a cache that never hits.
 *
 * Pure by design — walking `out/` stays in the caller so this can be tested
 * without a filesystem fixture.
 */

/** Never precached, matched against the normalised path. */
const EXCLUDED_EXACT = new Set(["sw.js", "sitemap.xml", "robots.txt", ".nojekyll"]);

/** Prefixes that are excluded wholesale. */
const EXCLUDED_PREFIXES = [
  // 3.8 MB of drill photography. Runtime-cached on first use instead, so one
  // drill does not more than double every user's install cost.
  "deck-estimation/images/",
  // Social card, only ever fetched by crawlers.
  "opengraph-image",
];

export function toPrecacheUrls(files: readonly string[]): string[] {
  const urls = new Set<string>();

  for (const raw of files) {
    const file = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
    if (!file) continue;
    if (EXCLUDED_EXACT.has(file)) continue;
    if (EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;

    if (file === "index.html") {
      urls.add("/");
    } else if (file.endsWith("/index.html")) {
      urls.add(`/${file.slice(0, -"index.html".length)}`);
    } else {
      urls.add(`/${file}`);
    }
  }

  return [...urls].sort();
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run scripts/precacheManifest.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/precacheManifest.ts scripts/precacheManifest.test.ts
git commit -m "feat: add precache URL mapping for the static export

trailingSlash routing means the browser asks for /training/h17-chart/,
so precaching training/h17-chart/index.html would build a cache that
never hits. Pure function over a file list, so no fixture is needed."
```

---

## Task 7: Convert the postbuild hook to TypeScript and inject the manifest

**Files:**
- Delete: `blackjack/scripts/stamp-sw-version.mjs`
- Create: `blackjack/scripts/stamp-sw-version.ts`
- Modify: `blackjack/package.json` (the `postbuild` script)
- Modify: `blackjack/public/sw.js:11` (add the placeholder)

**Interfaces:**
- Consumes: `toPrecacheUrls` from `./precacheManifest` (Task 6).
- Produces: a stamped `out/sw.js` whose `PRECACHE_URLS` is a real array and whose `CACHE_VERSION` is the git short hash.

**Background:** the hook must be TypeScript because Task 6's test is a `.test.ts` importing it, and `tsconfig.json` sets `allowJs: false` with `include: ["**/*.ts"]` — a `.ts` importing an untyped `.mjs` fails `next build`. `tsx` is already a devDependency and `scripts/` already holds `.ts` files.

- [ ] **Step 1: Add the placeholder to the service worker source**

In `blackjack/public/sw.js`, replace line 11:

```js
const PRECACHE_URLS = ["/", "/offline.html", "/icon.svg", "/manifest.webmanifest"];
```

with:

```js
// Replaced wholesale at build time by scripts/stamp-sw-version.ts with the
// real export manifest. Left as a single-element array so this file stays
// valid JavaScript in dev, where the worker is never registered anyway.
const PRECACHE_URLS = ["__PRECACHE_URLS__"];
```

- [ ] **Step 2: Write the new hook**

Create `blackjack/scripts/stamp-sw-version.ts`:

```ts
// Runs as the "postbuild" npm lifecycle script, after `next build` has written
// the static export to out/. Stamps two things into the copy of sw.js in out/:
// a per-deploy cache version so every deploy busts old caches, and the real
// precache manifest walked from out/ itself. public/sw.js (the source Next.js
// copies verbatim into out/) is left untouched in git.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toPrecacheUrls } from "./precacheManifest";

const srcPath = path.join(process.cwd(), "public", "sw.js");
const outDir = path.join(process.cwd(), "out");
const outPath = path.join(outDir, "sw.js");

if (!existsSync(outPath)) {
  console.warn("[stamp-sw-version] out/sw.js not found; skipping (did the static export run?).");
  process.exit(0);
}

/** Every file under out/, as paths relative to out/. */
function walk(dir: string, base = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? walk(path.join(dir, entry.name), relative)
      : [relative];
  });
}

let version: string;
try {
  version = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  version = String(Date.now());
}

const source = readFileSync(srcPath, "utf8");
if (!source.includes("__CACHE_VERSION__") || !source.includes('["__PRECACHE_URLS__"]')) {
  console.warn("[stamp-sw-version] public/sw.js is missing a placeholder; leaving out/sw.js as-is.");
  process.exit(0);
}

const urls = toPrecacheUrls(walk(outDir));
const stamped = source
  .replaceAll("__CACHE_VERSION__", version)
  .replace('["__PRECACHE_URLS__"]', JSON.stringify(urls));

writeFileSync(outPath, stamped);

// Surfaced so precache growth stays visible in build output rather than
// silently inflating every install.
const bytes = urls.reduce((sum, url) => {
  const file = url.endsWith("/") ? `${url}index.html` : url;
  const onDisk = path.join(outDir, file.replace(/^\//, ""));
  return sum + (existsSync(onDisk) ? readFileSync(onDisk).byteLength : 0);
}, 0);
console.log(
  `[stamp-sw-version] stamped out/sw.js with cache version ${version}; ` +
  `precaching ${urls.length} URLs (${(bytes / 1024 / 1024).toFixed(2)} MB)`,
);
```

- [ ] **Step 3: Point `postbuild` at it and delete the old hook**

In `blackjack/package.json`, replace:

```json
    "postbuild": "node scripts/stamp-sw-version.mjs",
```

with:

```json
    "postbuild": "tsx scripts/stamp-sw-version.ts",
```

Then delete the old file:

```bash
git rm scripts/stamp-sw-version.mjs
```

- [ ] **Step 4: Verify the stamped output**

```bash
npm run build
```

Expected: the build ends with a line like
`[stamp-sw-version] stamped out/sw.js with cache version <sha>; precaching 1xx URLs (3.xx MB)`.
The size should be roughly 3.4 MB — if it is near 7.2 MB the deck-estimation exclusion is not matching.

Then confirm the placeholder is gone and real routes are present:

```bash
grep -c '__PRECACHE_URLS__' out/sw.js; grep -o '"/training/h17-chart/"' out/sw.js
```

Expected: `0` (placeholder replaced), then `"/training/h17-chart/"`.

- [ ] **Step 5: Run the full suite**

```bash
npm test && npm run lint
```

Expected: all pass. `next build` in Step 4 already type-checked the new `.ts` files.

- [ ] **Step 6: Commit**

```bash
git add scripts/stamp-sw-version.ts public/sw.js package.json
git commit -m "build: generate the precache manifest from the static export

The postbuild hook now walks out/ and injects the real URL list
alongside the existing version stamp, and logs the precache size so
growth stays visible.

Converted to TypeScript and run via tsx because allowJs is false and
the generator's test is a .test.ts -- importing an untyped .mjs would
fail next build."
```

---

## Task 8: Service worker — resilient install and a safe update lifecycle

**Files:**
- Modify: `blackjack/public/sw.js:13-29` (install and activate handlers)

**Interfaces:**
- Consumes: the `PRECACHE_URLS` array injected by Task 7.
- Produces: a worker that honours `postMessage({ type: "SKIP_WAITING" })`. Task 9 depends on this message contract.

**Background:** two problems. `cache.addAll` rejects atomically, so across ~130 URLs a single failure abandons the entire precache. And `skipWaiting()` on install plus an activate that deletes every non-current cache means a new worker takes over immediately while a page is still running old JS — that page can then lazy-import a content-hashed chunk that has already been evicted, breaking mid-drill.

- [ ] **Step 1: Replace the install handler**

In `blackjack/public/sw.js`, replace:

```js
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});
```

with:

```js
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Individually, not addAll: addAll rejects atomically, so one bad URL
      // out of ~130 would abandon the whole precache and leave the app with
      // no offline support at all.
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))).then((results) => {
        const failed = results.filter((result) => result.status === "rejected").length;
        if (failed) console.warn(`[countlab] ${failed}/${PRECACHE_URLS.length} precache entries failed`);
      }),
    ),
  );
  // Deliberately no skipWaiting() here. The new worker waits until the page
  // asks for it, so a page running old JS can still fetch the hashed chunks
  // it was built against. See the message handler below.
});
```

- [ ] **Step 2: Add the message handler**

Immediately after the install handler, add:

```js
// The page offers the user a reload when it notices a waiting worker; this is
// how it opts in. Activation then evicts old caches safely, because the page
// reloads immediately afterwards.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
```

- [ ] **Step 3: Verify the activate handler is unchanged and still correct**

The existing activate handler (deleting non-current caches, then `clients.claim()`) stays exactly as it is. It is now safe because it only runs after the user has opted into the update and the page reloads immediately after. Do not modify it.

- [ ] **Step 4: Verify the build**

```bash
npm run build && node --check out/sw.js
```

Expected: build passes and `node --check` reports no syntax error in the stamped worker.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js
git commit -m "fix: make service worker install resilient and updates safe

addAll rejects atomically, so one bad URL out of ~130 would abandon the
entire precache; each entry is now added independently.

Dropped the unconditional skipWaiting: a new worker taking over while a
page still runs old JS could evict hashed chunks that page had yet to
import. The worker now waits for an explicit SKIP_WAITING message."
```

---

## Task 9: Update detection and the reload toast

**Files:**
- Modify: `blackjack/lib/pwa/registerServiceWorker.ts`
- Create: `blackjack/components/UpdateToast.tsx`
- Modify: `blackjack/app/layout.tsx` (mount the toast)

**Interfaces:**
- Consumes: the `SKIP_WAITING` message contract from Task 8.
- Produces: `onServiceWorkerUpdate(listener: (activate: () => void) => void): () => void` exported from `@/lib/pwa/registerServiceWorker`. Returns an unsubscribe function. The `activate` callback tells the waiting worker to take over and reloads the page.

- [ ] **Step 1: Extend the registration module**

Replace the entire contents of `blackjack/lib/pwa/registerServiceWorker.ts` with:

```ts
/** Registers the offline/installability service worker and reports updates. */

type UpdateListener = (activate: () => void) => void;

const listeners = new Set<UpdateListener>();
/** Held so a listener that subscribes after the update was found still hears about it. */
let pendingActivate: (() => void) | null = null;
let reloading = false;

/**
 * Subscribe to "a new version is installed and waiting". The callback receives
 * an `activate` function; calling it tells the waiting worker to take over and
 * reloads the page. Returns an unsubscribe function.
 */
export function onServiceWorkerUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  if (pendingActivate) listener(pendingActivate);
  return () => listeners.delete(listener);
}

function announce(registration: ServiceWorkerRegistration) {
  const activate = () => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  };
  pendingActivate = activate;
  listeners.forEach((listener) => listener(activate));
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  if (!("serviceWorker" in navigator)) return;

  // The new worker takes control only after the user opts in, so this fires
  // once and the reload is expected. The flag guards against a reload loop.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  const register = () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      // Already waiting when this page loaded — e.g. the user opened a second
      // tab after an update landed in the first.
      if (registration.waiting && navigator.serviceWorker.controller) announce(registration);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // `controller` is null on the very first install, when there is no
          // previous version and nothing to prompt about.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            announce(registration);
          }
        });
      });
    }).catch((error) => {
      console.error("[countlab] service worker registration failed", error);
    });
  };

  // This runs inside a React effect well after hydration, so `load` may have
  // already fired — a listener added after the fact would never call back.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}
```

- [ ] **Step 2: Create the toast**

Create `blackjack/components/UpdateToast.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { onServiceWorkerUpdate } from "@/lib/pwa/registerServiceWorker";
import { Button, GhostButton } from "./ui";

/**
 * Offers a reload when a new version is installed and waiting. Nothing swaps
 * underneath a running session until the user accepts.
 */
export function UpdateToast() {
  const [activate, setActivate] = useState<(() => void) | null>(null);

  useEffect(
    () => onServiceWorkerUpdate((run) => {
      // Wrapped: a bare function passed to setState would be called as an
      // updater instead of stored.
      setActivate(() => run);
    }),
    [],
  );

  if (!activate) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#101411]/95 p-3 shadow-2xl backdrop-blur-2xl lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      <p className="text-sm text-zinc-300">A new version of CountLab is ready.</p>
      <div className="flex gap-2">
        <GhostButton className="px-3 py-1.5 text-sm" onClick={() => setActivate(null)}>
          Later
        </GhostButton>
        <Button className="px-3 py-1.5 text-sm" onClick={activate}>
          Reload
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount it**

In `blackjack/app/layout.tsx`, add the import:

```tsx
import { UpdateToast } from "@/components/UpdateToast";
```

and render it inside `AnalyticsProvider`, next to `AnalyticsConsent`:

```tsx
            <AnalyticsConsent />
            <UpdateToast />
```

- [ ] **Step 4: Verify**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass. If `Button`/`GhostButton` reject the `className` prop, check their signatures in `components/ui.tsx:14` and `:24` and pass styling the way the surrounding code does.

- [ ] **Step 5: Commit**

```bash
git add lib/pwa/registerServiceWorker.ts components/UpdateToast.tsx app/layout.tsx
git commit -m "feat: prompt to reload when a new version is waiting

Completes the update lifecycle started in the worker: the page notices
a waiting worker, offers a reload, and only then sends SKIP_WAITING.
Guarded against reload loops, and handles the case where a worker was
already waiting before this page loaded."
```

---

## Task 10: Offline verification gate

No new code. This is the checkpoint that Phase 2 actually delivered what it promised, before any install funnel invites users in.

**Files:** none.

- [ ] **Step 1: Build and serve the export**

```bash
npm run build
npx serve out -l 4173
```

If `serve` is unavailable, any static file server rooted at `out/` works. The service worker requires `localhost` or HTTPS.

- [ ] **Step 2: Confirm the worker precaches everything**

In Chrome DevTools at `http://localhost:4173`: Application → Service Workers shows an activated worker. Application → Cache Storage → `countlab-<sha>` lists 100+ entries including `/`, `/training/h17-chart/`, and `/_next/static/...`.

- [ ] **Step 3: Confirm offline actually works**

DevTools → Network → set throttling to **Offline**, then hard-reload. Expected: the app loads, and navigating to `/training/h17-chart/` and `/training/running-count/` works **without having visited them first** in this session. This is the behaviour that did not exist before Task 7.

- [ ] **Step 4: Confirm a signed-out offline start is not blank**

Still offline, open a private window to `http://localhost:4173`. Expected: the sign-in view renders with a working "continue as guest" path — not a blank screen. This exercises Task 5.

- [ ] **Step 5: Record the result**

If any step fails, stop and fix before continuing — do not proceed to Phase 3. If all pass, no commit is needed; note the outcome in the task tracker.

---

# Phase 3 — Install funnel

Additive and independently shippable. `countlab.ca` is public, so installability is a product feature rather than a personal trick.

## Task 11: Install prompt

**Files:**
- Create: `blackjack/components/InstallPrompt.tsx`
- Modify: `blackjack/app/layout.tsx` (mount it)

**Interfaces:**
- Consumes: `installAffordance`, `readPwaEnv` from `@/lib/pwa/standalone` (Task 3).
- Produces: nothing importable.

**Background:** iOS Safari never fires `beforeinstallprompt`; installation is only possible through the Share sheet by hand, so iOS needs instructions rather than a button. Chrome and Firefox on iOS cannot install at all and must never be shown instructions that cannot work — `installAffordance` already encodes this.

Worth carrying in the copy: iOS evicts service-worker caches and `localStorage` from *uninstalled* sites after roughly seven days of disuse. Installing is what protects a guest user's statistics.

- [ ] **Step 1: Create the component**

Create `blackjack/components/InstallPrompt.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { installAffordance, readPwaEnv } from "@/lib/pwa/standalone";
import { Button, GhostButton } from "./ui";

const DISMISSED_KEY = "countlab-install-dismissed";

/** The Chromium-only event that lets a site trigger a real install prompt. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [mode, setMode] = useState<"none" | "ios-instructions" | "native">("none");
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    const affordance = installAffordance(readPwaEnv());
    if (affordance === "ios-instructions") setMode("ios-instructions");
    if (affordance !== "native") return;

    const onBeforeInstall = (event: Event) => {
      // Suppress Chrome's own mini-infobar so this component owns the moment.
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
      setMode("native");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (mode === "none") return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setMode("none");
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Either way the event is spent and cannot be reused.
    dismiss();
  };

  return (
    <div
      role="complementary"
      aria-label="Install CountLab"
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl border border-white/10 bg-[#101411]/95 p-4 shadow-2xl backdrop-blur-2xl lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      <p className="text-sm font-semibold text-zinc-100">Install CountLab</p>
      {mode === "ios-instructions" ? (
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          Tap the Share button, then <b className="text-zinc-300">Add to Home Screen</b>. Installing
          keeps it working offline and stops iOS clearing your saved statistics.
        </p>
      ) : (
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          Add CountLab to your home screen for offline drills and a full-screen app window.
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <GhostButton className="px-3 py-1.5 text-sm" onClick={dismiss}>
          Not now
        </GhostButton>
        {mode === "native" && (
          <Button className="px-3 py-1.5 text-sm" onClick={install}>
            Install
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount it**

In `blackjack/app/layout.tsx`, add the import and render it next to `UpdateToast`:

```tsx
import { InstallPrompt } from "@/components/InstallPrompt";
```

```tsx
            <AnalyticsConsent />
            <UpdateToast />
            <InstallPrompt />
```

- [ ] **Step 3: Verify**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add components/InstallPrompt.tsx app/layout.tsx
git commit -m "feat: offer installation, with iOS-specific instructions

iOS Safari never fires beforeinstallprompt, so it gets Share -> Add to
Home Screen instructions instead of a button; Chrome and Firefox on iOS
cannot install at all and are shown nothing. Dismissal persists."
```

---

## Task 12: Record standalone mode in analytics

**Files:**
- Modify: `blackjack/lib/analytics/types.ts` (near `DeviceType` at line 63, `EventContext` at line 326, `EventPropertyMap` at line 73)
- Modify: `blackjack/lib/analytics/context.ts` (the builder at line 175)

**Interfaces:**
- Consumes: `isStandalone`, `readPwaEnv` from `@/lib/pwa/standalone` (Task 3).
- Produces: `DisplayMode` type; `EventContext.display_mode`; the `install_prompt` event.

**Background and constraint:** `analytics_events.properties` and `.context` are `jsonb` columns, so adding a context field needs no migration. But `analytics_sessions.device_type` (schema line 533) is a **real column**, and `lib/analytics/client.ts:99-111` builds that session rollup payload. **Do not add `display_mode` to the rollup payload in `client.ts`** — that would require a schema change, which the spec puts out of scope.

- [ ] **Step 1: Add the type and context field**

In `blackjack/lib/analytics/types.ts`, next to `DeviceType` (line 63):

```ts
export type DisplayMode = "browser" | "standalone";
```

and in the `EventContext` interface next to `device_type?: DeviceType;` (line 326):

```ts
  display_mode?: DisplayMode;
```

- [ ] **Step 2: Add the event**

In the same file, inside `EventPropertyMap`, next to the other feature events:

```ts
  install_prompt: { outcome: "shown" | "accepted" | "dismissed"; surface: "native" | "ios_instructions" };
```

Leave it out of both `CRITICAL_EVENTS` (line 366) and `PASSIVE_EVENTS` (line 383); those are optional membership sets, not an exhaustive registry.

- [ ] **Step 3: Populate it**

In `blackjack/lib/analytics/context.ts`, add the import:

```ts
import { isStandalone, readPwaEnv } from "@/lib/pwa/standalone";
```

and add to the context object being built at line 175, next to `device_type: detectDeviceType(),`:

```ts
    display_mode: isStandalone(readPwaEnv()) ? "standalone" : "browser",
```

- [ ] **Step 4: Emit the event from the install prompt**

In `blackjack/components/InstallPrompt.tsx` (Task 11), add the import:

```tsx
import { analytics } from "@/lib/analytics";
```

Track the surface once it is shown — add at the end of the effect body, after `setMode`:

```tsx
    // `surface` mirrors the affordance so accepted/dismissed can be read
    // against how the prompt was actually presented.
```

Specifically, call `analytics.track("install_prompt", { outcome: "shown", surface: "ios_instructions" })` where `setMode("ios-instructions")` happens, and `analytics.track("install_prompt", { outcome: "shown", surface: "native" })` inside `onBeforeInstall` after `setMode("native")`. Then in `dismiss()`:

```tsx
    analytics.track("install_prompt", {
      outcome: "dismissed",
      surface: mode === "ios-instructions" ? "ios_instructions" : "native",
    });
```

and in `install()`, replace `await deferred.userChoice;` with:

```tsx
    const choice = await deferred.userChoice;
    analytics.track("install_prompt", { outcome: choice.outcome, surface: "native" });
```

Note that `install()` then calls `dismiss()`, which would double-track. Change `install()` to set the dismissed flag directly instead of calling `dismiss()`:

```tsx
    localStorage.setItem(DISMISSED_KEY, "1");
    setMode("none");
```

- [ ] **Step 5: Verify**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass. The analytics catalog is strongly typed, so a mismatch between the event's declared properties and the `track` calls surfaces as a type error here.

Confirm the session rollup was left alone:

```bash
grep -n 'display_mode' lib/analytics/client.ts
```

Expected: no output. Any match means the rollup payload was modified and would need a schema migration.

- [ ] **Step 6: Commit**

```bash
git add lib/analytics/types.ts lib/analytics/context.ts components/InstallPrompt.tsx
git commit -m "feat: record standalone mode and install-prompt outcomes

display_mode rides in the jsonb context column, so no schema migration
is needed; the session rollup, whose device_type is a real column, is
deliberately untouched."
```

---

# Phase 4 — Capabilities

## Task 13: Keep the screen awake during drills

**Files:**
- Create: `blackjack/lib/pwa/useWakeLock.ts`
- Modify: `blackjack/components/CountingDrills.tsx`
- Modify: `blackjack/components/FullShoeGame.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `useWakeLock(active: boolean): void`

**Background:** during a counting drill the user watches rather than taps, so iOS dims and locks the screen mid-run. The sentinel is released automatically whenever the document hides, so it must be re-acquired on `visibilitychange`.

- [ ] **Step 1: Write the hook**

Create `blackjack/lib/pwa/useWakeLock.ts`:

```ts
"use client";

import { useEffect } from "react";

/**
 * Holds a screen wake lock while `active`. Drills are watched rather than
 * tapped, so without this iOS dims and locks the screen mid-run.
 *
 * The sentinel is released by the browser whenever the document hides, so it
 * is re-acquired on visibilitychange. Failure is always tolerated: the API is
 * absent on older browsers and rejects outright in Low Power Mode.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      if (released || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Low Power Mode and permission-less contexts reject; not worth surfacing.
      }
    };

    const onVisibilityChange = () => { if (document.visibilityState === "visible") void acquire(); };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
```

If TypeScript does not know `WakeLockSentinel` or `navigator.wakeLock`, the DOM lib is older than expected — in that case declare them locally at the top of the file rather than widening `tsconfig`:

```ts
declare global {
  interface WakeLockSentinel { release(): Promise<void> }
  interface Navigator { wakeLock: { request(type: "screen"): Promise<WakeLockSentinel> } }
}
```

- [ ] **Step 2: Opt the drills in**

In `blackjack/components/CountingDrills.tsx`, add the import:

```tsx
import { useWakeLock } from "@/lib/pwa/useWakeLock";
```

Then add exactly one call per component, using that component's own phase state. Add each line just below the component's `useState` block, before its effects.

`RunningCountDrill` (line 102) — `RunningPhase` is declared at line 91 as
`"setup" | "show" | "answer" | "feedback" | "interruption" | "paused" | "done"`.
`"show"` is the case that matters most: cards flash past while the user does not
touch the screen.

```tsx
  useWakeLock(phase !== "setup" && phase !== "paused" && phase !== "done");
```

`TrueCountDrill` (line 213) — `phase` is `"setup" | "question" | "feedback" | "done"` (line 218):

```tsx
  useWakeLock(phase === "question" || phase === "feedback");
```

`ProficiencyTest` (line 272) — `phase` is `"setup" | "running" | "done"` (line 274):

```tsx
  useWakeLock(phase === "running");
```

`DeckEstimationDrill` (line 340) — already computes exactly the right flag at
line 346 (`const active = phase === "question" || phase === "feedback";`), so
reuse it rather than restating the condition:

```tsx
  useWakeLock(active);
```

**Do not add a wake lock to `CountingBenchmark` (line 446).** Despite sitting in
this file and being reachable from the Training nav, it is a mastery and
weak-spots dashboard that reads past sessions from storage — there is no timed
run to keep the screen alive for.

Finally, `blackjack/components/FullShoeGame.tsx` already receives an `active`
prop (see `AppShell.tsx:264`):

```tsx
  useWakeLock(active);
```

- [ ] **Step 3: Verify**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add lib/pwa/useWakeLock.ts components/CountingDrills.tsx components/FullShoeGame.tsx
git commit -m "feat: hold a screen wake lock during drills

Counting drills are watched rather than tapped, so iOS dims and locks
mid-run. Re-acquired on visibilitychange because the browser drops the
sentinel whenever the document hides, and released on unmount."
```

---

## Task 14: Streak badge — best effort, never prompting

**Files:**
- Create: `blackjack/lib/pwa/appBadge.ts`
- Modify: `blackjack/components/AppShell.tsx` (near the streak effect at lines 122-130)

**Interfaces:**
- Consumes: `streakDays`, already computed in `AppShell` at line 125.
- Produces: `setStreakBadge(streak: number): void`

**Background and constraint:** WebKit appears to gate the Badging API on iOS behind notification permission, even with nothing being pushed. Push was explicitly de-scoped for this project, so this must **never trigger a permission prompt** — it paints a badge only when permission is *already* granted and no-ops otherwise. Whether the badge ever appears is answered by the device checklist in Task 15. If it does not appear without a prompt, delete this task's changes; a number on an icon does not justify a first-run permission dialog.

- [ ] **Step 1: Write the module**

Create `blackjack/lib/pwa/appBadge.ts`:

```ts
/**
 * Paints the practice streak on the installed app icon.
 *
 * Best effort by design. WebKit appears to gate the Badging API on iOS behind
 * notification permission even though nothing is pushed, and this project
 * deliberately ships no notifications — so this never calls
 * Notification.requestPermission(). If permission was not already granted for
 * some other reason, it silently does nothing.
 */
export function setStreakBadge(streak: number): void {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const badged = navigator as Navigator & {
    setAppBadge(count?: number): Promise<void>;
    clearAppBadge(): Promise<void>;
  };
  const apply = streak > 0 ? badged.setAppBadge(streak) : badged.clearAppBadge();
  void apply.catch(() => {
    // Unsupported or refused; the badge is cosmetic and never worth surfacing.
  });
}
```

- [ ] **Step 2: Call it from AppShell**

In `blackjack/components/AppShell.tsx`, add the import:

```tsx
import { setStreakBadge } from "@/lib/pwa/appBadge";
```

and add an effect after the existing streak effect (which ends at line 130):

```tsx
  useEffect(() => { setStreakBadge(streakDays); }, [streakDays]);
```

- [ ] **Step 3: Verify**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass.

Confirm no permission request was introduced anywhere:

```bash
grep -rn 'requestPermission' lib components app
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add lib/pwa/appBadge.ts components/AppShell.tsx
git commit -m "feat: paint the practice streak on the installed app icon

Best effort only: never requests notification permission, which WebKit
appears to require for badging on iOS. Silently no-ops when permission
was not already granted. Device testing decides whether this stays."
```

---

## Task 15: Lighthouse audit and the device checklist

**Files:**
- Create: `docs/superpowers/device-checklist-ios.md` (repo root `docs/`, not `blackjack/docs/`)

**Interfaces:** none.

- [ ] **Step 1: Run a Lighthouse audit against the built export**

```bash
npm run build
npx serve out -l 4173
```

Audit `http://localhost:4173` in Chrome DevTools → Lighthouse, with the **Mobile** preset. Record the Performance, Accessibility, and Best Practices scores, and confirm the installability criteria pass (manifest, service worker, icons, theme colour). Fix anything flagged as an installability blocker before continuing; treat performance findings as informational for this plan.

- [ ] **Step 2: Write the checklist**

Create `docs/superpowers/device-checklist-ios.md`:

```markdown
# iOS device checklist

None of this can run in CI. Do it once on a real iPhone against the deployed
site, after adding CountLab to the home screen via Share → Add to Home Screen.

- [ ] **Safe areas.** The header clears the clock and battery; the bottom tab
      bar clears the home indicator. (Regression guard for the missing
      `viewport-fit=cover`.)
- [ ] **No input zoom.** Open the H17 Chart drill and tab through several cells.
      The viewport must not zoom or lurch on focus.
- [ ] **App icon.** The home-screen icon has the dark brand background with no
      black corners or halo.
- [ ] **Offline cold start.** Enable Airplane Mode, force-quit the app, reopen
      it. It must reach a usable drill — including a route not visited in the
      previous session.
- [ ] **Offline signed-out start.** Sign out, go offline, reopen. The sign-in
      view must render with a working "continue as guest" path, never a blank
      screen.
- [ ] **Update flow.** Deploy a change, reopen the installed app, and confirm
      the "A new version of CountLab is ready" toast appears and reloading
      picks up the change.
- [ ] **Install prompt targeting.** In mobile Safari (not installed) the Share →
      Add to Home Screen instructions appear. In Chrome on iOS, nothing appears.
      Neither appears once installed.
- [ ] **Wake lock.** Start a Running Count drill and leave the phone untouched
      for longer than the auto-lock interval. The screen must stay on, and must
      resume staying on after switching away and back.
- [ ] **Badge.** Check whether the streak number appears on the app icon
      *without* any notification permission prompt having been shown. If it
      does not, delete `lib/pwa/appBadge.ts` and its call in `AppShell.tsx` —
      a cosmetic badge does not justify a permission dialog.
- [ ] **Google sign-in from standalone.** Sign out inside the installed app and
      sign in with Google. If the redirect strands you in Safari or the session
      does not land back in the app, the PKCE verifier is not surviving the
      cross-origin hop. Remedy: prefer email/password in standalone, which
      needs no redirect. Guest mode remains a full fallback either way.
```

- [ ] **Step 3: Commit**

```bash
git add ../docs/superpowers/device-checklist-ios.md
git commit -m "docs: add the iOS device checklist

Captures the verification that cannot run in CI, including the two
questions this work deliberately left open: whether badging demands a
notification prompt, and whether Google OAuth survives a standalone
round trip."
```

---

## Self-Review

**Spec coverage** — every spec item maps to a task:

| Spec item | Task |
|---|---|
| 1 safe areas | 1 |
| 2 input font floor | 1 |
| 3 apple-touch-icon | 2 |
| 4 `loading` un-wedgeable | 5 |
| 5 hide Home link | 4 (needs `standalone.ts` from 3) |
| 6 precache manifest / TS hook | 6, 7 |
| 7 precache vs runtime split | 6 (exclusion), 7 (size log) |
| 8 resilient install | 8 |
| 9 update lifecycle | 8 (worker), 9 (page) |
| 10 offline verification | 10 |
| 11 `standalone.ts` | 3 |
| 12 `InstallPrompt` | 11 |
| 13 analytics dimension | 12 |
| 14 `useWakeLock` | 13 |
| 15 streak badge | 14 |
| Testing / device checklist | 15 |

**Ordering note:** spec item 5 sits in Phase 1 but consumes `standalone.ts`, which the spec lists under Phase 3. Resolved by pulling `standalone.ts` forward to Task 3, since three separate consumers depend on it (Home link, install prompt, analytics).

**Constraint conflict resolved:** the spec asks for a standalone analytics dimension while putting the Supabase schema out of scope. `analytics_events.context` is `jsonb` so the dimension needs no migration, but `analytics_sessions.device_type` is a real column — Task 12 therefore adds the field to the event context only and explicitly verifies `client.ts` was not touched.

**Type consistency** — names used across tasks match their definitions: `PwaEnv`/`isStandalone`/`installAffordance`/`readPwaEnv` (Task 3 → 4, 11, 12); `settleWithTimeout` (5); `toPrecacheUrls` (6 → 7); the `{ type: "SKIP_WAITING" }` message contract (8 → 9); `onServiceWorkerUpdate` (9); `useWakeLock` (13); `setStreakBadge` (14).

**Spec correction found while planning:** the spec lists `CountingBenchmark` among the drills that should hold a wake lock. It is not a drill — `CountingDrills.tsx:446-450` shows a mastery and weak-spots dashboard that reads past sessions from storage, with no timed run. Task 13 excludes it explicitly. The spec's Phase 4 wording should be treated as superseded by the plan here.

**No deferred details.** Every task names exact files, line anchors, and the real identifiers involved — including each drill's own phase values, read from `CountingDrills.tsx:91`, `:218`, `:274` and `:346`, rather than described generically.
