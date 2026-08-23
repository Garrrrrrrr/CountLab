# Mobile audit

The measurement behind `specs/2026-08-22-mobile-experience-design.md`, kept so
the same numbers can be reproduced rather than re-derived by eye.

Layout regressions are invisible to this repo's test suite — there is no
component or end-to-end harness, and adding one to assert pixel geometry would
be worse than this. So the gate is a script you run in a real browser.

## Running it

Serve the app (`npm run dev`, or `npx serve out` after a build), then in Chrome
DevTools emulate **390×844, DPR 3, mobile + touch**. Device emulation matters:
resizing the window alone leaves `innerWidth` wrong and reports clean.

Seed history first. Empty states measure clean and tell you nothing:

```js
const drills = ["Running Count","True Count","Basic Strategy","Deviations","H17 Chart","Full Shoe","Deck Estimation"];
const sessions = [];
for (let d = 0; d < 18; d++) {
  const date = new Date(Date.now() - d * 86400000).toISOString();
  for (const drill of drills.slice(0, 3 + (d % 5))) {
    const q = 40 + ((d * 7 + drill.length) % 90);
    const c = Math.round(q * (0.72 + ((d % 5) * 0.05)));
    sessions.push({ id: `seed-${d}-${drill}`, drill, questions: q, correct: c,
      accuracy: Math.round((c / q) * 100), averageResponseTime: 800 + (d % 6) * 220,
      bestStreak: 5 + (d % 14), date, mistakes: [] });
  }
}
localStorage.setItem("hilo:sessions", JSON.stringify(sessions));
```

Then run the audit on each page:

```js
(() => {
  const vw = innerWidth, de = document.documentElement;
  const scrollable = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  const all = [...document.querySelectorAll('main *')];
  const over = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > vw + 1 && !scrollable(el);
  });
  const tap = [...document.querySelectorAll('main button, main a, main input, main select')]
    .map((el) => ({ r: el.getBoundingClientRect(), l: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) }))
    .filter((x) => x.r.width > 0 && x.r.height > 0 && (x.r.height < 44 || x.r.width < 44));
  const tiny = all.filter((el) => el.textContent?.trim() && !el.children.length
    && parseFloat(getComputedStyle(el).fontSize) < 11);
  const rails = [...document.querySelectorAll('main .overflow-x-auto')]
    .map((el) => ({ hidden: el.scrollWidth - el.clientWidth })).filter((x) => x.hidden > 0);
  return {
    path: location.pathname,
    screensTall: +(de.scrollHeight / innerHeight).toFixed(1),
    hOverflow: de.scrollWidth > vw + 1,
    overflow: over.length,
    smallTap: tap.length, tapSample: tap.slice(0, 5).map((x) => `${x.l} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
    tinyText: tiny.length, tinySample: tiny.slice(0, 3).map((el) => `${parseFloat(getComputedStyle(el).fontSize)}px "${el.textContent.trim().slice(0, 18)}"`),
    inputs: document.querySelectorAll('main input, main select').length,
    railsHidingContent: rails,
  };
})();
```

Note that `.mobile-action-dock` appears twice in the DOM on every page: `AppShell`
keeps `FullShoeGame` mounted inside a `hidden` wrapper, so its dock measures
0×0. Filter with `:not(.hidden *)` or check `closest('.hidden')` before
concluding a page's dock is broken.

## Pass conditions

Per page, at 390×844:

| Measure | Pass |
|---|---|
| `hOverflow` | `false` |
| `overflow` | `0` |
| `smallTap` | `0` |
| `tinyText` | `0` |
| `/cvcx` `screensTall` | under `3` |

`railsHidingContent` is expected to be non-empty on `/training/h17-chart` — that
table is meant to scroll. What it must not do is scroll *silently*; see A2 in
the design.

## Baseline, 2026-08-22

Measured before any of the design's phases landed.

| Page | Screens | hOverflow | Overflow | Small tap | Tiny text | Inputs |
|---|---|---|---|---|---|---|
| `/dashboard` | — | false | 0 | 3 | 0 | — |
| `/cvcx` | 8.8 | false | 0 | 3 | 8 | 66 |
| `/simulation` | 2.6 | false | 0 | 5 | 0 | 37 |
| `/statistics` | 4.9 | false | 0 | 0 | 0 | — |
| `/training/h17-chart` | 3.7 | false | 0 | — | — | 320 cells |
| `/training/running-count` | 1.3 | false | 0 | 0 | 0 | 23 |

H17 rails hid 220px of 552px each, across all four tables. Chart wrappers on
`/statistics` measured 324px inside 358px cards — the charts are fine, and an
early judgement that they were broken came from reading a downscaled screenshot
rather than measuring.
