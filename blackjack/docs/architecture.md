# CountLab architecture

CountLab is a Next.js static export (`output: "export"`) served from GitHub
Pages at countlab.ca. There is no application server: every page is
prerendered HTML plus client components, accounts and sync run against
Supabase from the browser, and a hand-written service worker makes visited
pages and the discard-tray photos work offline.

## Layout

```text
app/                       one real route per page (page.tsx renders a feature),
                           legacy URLs as tiny redirect pages, metadata, sitemap
components/
  ui/                      the kit: Button, Card, Segmented, Stepper, Sheet, toast…
  blackjack/               PlayingCard, ActionPad, NumberPad, TrayPhoto
  drill/DrillKit.tsx       Setup → Play (full screen) → Summary frame for drills
  shell/                   AppShell (phone tab bar, desktop sidebar, focus mode),
                           consent bar, update prompt, password-recovery sheet
features/                  one folder per page or tool: home, train (+ each drill),
                           charts, calculator, journal, progress, settings, auth,
                           legal, admin, misc
lib/
  strategy/                the only decision engine (see below)
  blackjack/               shoe, hand values, Hi-Lo, counting drills, tray photos,
                           journal, calculator models and coefficients
  full-shoe/               the full-shoe table: round engine, grading (bets, plays,
                           count checks) and the session controller
  strategy-drills/         question generators and grading for the strategy drills
  statistics/              drill history, settings and progress storage + sync
  supabase/                auth provider, per-account storage scope, sync
  analytics/               privacy-minimized first-party analytics client
  routes.ts                the site map: nav, titles, descriptions, redirects
workers/                   web workers for heavy calculations
e2e/                       Playwright specs against the static export
docs/design-system.md      tokens, components and the mobile rules every page follows
```

## One strategy engine

`lib/strategy` answers every blackjack decision on the site. Charts, drills
and the full-shoe table call it, so they cannot disagree.

- **Basic strategy** comes from the total-dependent grids in
  `lib/blackjack/strategyTables.ts` (1, 2 and 4–8 decks × H17/S17), whose
  composite codes (`Ds`, `Ph`, `Rh`…) resolve against the table's rules in
  `lib/blackjack/strategyChart.ts`. `lib/strategy/audit.test.ts` holds every
  clear-cut cell of 180 rule sets to an exact finite-deck EV calculation
  (`blackjack-simulator/basic_strategy/`).
- **Index plays** live in `lib/strategy/indices.ts` as plain data: "play X at a
  true count at or above N" (or at or below). A row is used only where it
  changes basic strategy for the reader's rules; each names its source.
- **Surrender** is one threshold per hand ("surrender at or above N"), with
  Wong's early-surrender table replacing the ten column under ES10.
- `engine.ts` decides in table order: insurance, surrender, then the play.
  `chart.ts` turns that into chart tables, count ladders and the index list.

## Data and sync

All user data goes through `lib/statistics/storage.ts`, `lib/blackjack/journal.ts`
and the other library modules, which write to an account-scoped
`localStorage` namespace (`lib/supabase/accountStorage.ts`) and sync to Supabase
in the background for signed-in readers. Guests use the "guest" scope; signing
in switches scope and never merges guest data unless the reader imports it in
Settings. Storage keys and record shapes are unchanged from earlier versions,
so existing history, journals and settings carry over.

## Verification

- `npm test`: unit tests for the engines, storage, sync and the EV audit.
- `npm run test:e2e`: Playwright against the built export on desktop,
  iPhone SE and iPhone 13 viewports (set `PLAYWRIGHT_CHROMIUM_PATH` to use a
  preinstalled Chromium).
- The deploy workflow runs both, then re-checks the live site's offline worker.
