# CountLab

The blackjack Hi-Lo trainer hosted at `countlab.ca`. Accounts and per-user
data run on Supabase; see "Accounts (Supabase)" below before your first
`npm run dev`.

```bash
npm ci
npm run dev
```

Run `npm test`, `npm run lint`, and `npm run build` before release. The production build is a static export in `out/`, deployed by this repo's own GitHub Pages workflow (`.github/workflows/deploy.yml`) to `countlab.ca`.

## Accounts (Supabase)

CountLab is a fully static export with no server, so auth runs entirely
client-side against Supabase (`@supabase/supabase-js`) — email/password
sign-up and sign-in, no server-side session needed. `lib/supabase/client.ts`
builds the browser client from two public env vars, and
`lib/supabase/AuthProvider.tsx` + `components/AuthGate.tsx` gate every route
except `/terms` and `/privacy` behind a signed-in Supabase user.

Per-account data (trainer settings, drill session history, bankroll/Kelly
journal) is cached in `localStorage` for instant reads and synced to Supabase
in the background — see `supabase/schema.sql` for the table/RLS definitions
and the "Data sync" note in `lib/statistics/storage.ts` /
`lib/blackjack/journal.ts`.

**Setup (one-time):** create a project at [supabase.com](https://supabase.com),
run `supabase/schema.sql` in its SQL editor, and enable the Email provider
under Authentication → Providers.

`supabase/schema.sql` also defines per-user rate limits and row size caps
enforced by Postgres triggers, so they hold even for direct PostgREST calls
that skip the app. If you already ran an older copy of this file, re-run it —
every statement is idempotent (`create or replace`, `drop ... if exists` then
`create`) and safe to apply on top of an existing schema.

### Analytics and the admin dashboard

Every meaningful user action is recorded to the `analytics_events` table
defined in `supabase/schema.sql` — see `lib/analytics/track.ts`, called from
every game, drill, and tool component. That includes page views,
auth (sign-in/up/out, Google, guest mode), every hand dealt/decided/settled
in Full Shoe, Ultimate Texas Hold'em, and Chase the Flush, every drill
question answered (running count, true count, deck estimation, basic
strategy, deviations, missing card, the integrated Full Shoe drill),
simulation runs and results, CVCX/journal template saves and loads, journal
entries and transactions, settings saves, and data export/import/clear.
Guests are tracked too, under a per-device anonymous id, so no account is
required for an event to show up.

On top of those explicit calls, `lib/analytics/autocapture.ts` installs a
single document-level click listener (`initAutocapture()`, started once from
`AppShell`) that fires a generic `ui_click` event for every click on a
button, link, or other interactive element app-wide — the same "autocapture"
approach product analytics tools (PostHog, Amplitude, GA4) use as a safety
net for anything not explicitly instrumented. It also detects **rage
clicks** (3+ clicks in the same spot within 0.8s) and tracks **scroll
depth** (25/50/75/100%, re-armed on every route change) and **outbound link
clicks**. These are intentionally excluded from the admin dashboard's "Top
actions" chart (`NOISY_EVENTS` in `components/AdminPage.tsx`) since they'd
otherwise drown out the higher-signal named events — they get their own
metric tiles instead.

Only accounts listed in `admin_users` can read that data back, via the
`/admin` page (`components/AdminPage.tsx`). It shows aggregate charts
(events per day, top actions, most-viewed pages), plus a **visitor
directory** — every signed-in user (by email) and guest (by anonymous id)
with a first-seen/last-seen timestamp and event count — where clicking a
visitor pulls their full timeline of what they did and when, via the
`admin_visitor_summary()` and `admin_visitor_events()` Postgres functions in
`supabase/schema.sql`.

Grant yourself access after your first sign-up by re-running the relevant
statement in `supabase/schema.sql`, or directly:

```sql
insert into admin_users (user_id) select id from auth.users where email = 'you@example.com';
```

The nav only shows the "Analytics" link once `is_admin()` returns true for
the signed-in user.

**Local development:** create `blackjack/.env.local` (gitignored) with:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

The anon key is meant to be public — it's embedded in the client bundle by
design. Access control comes from the Row Level Security policies in
`supabase/schema.sql`, not from keeping this key secret.

**Deployed site:** add `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` as repository **variables** (not secrets —
they're public values, see above) in GitHub → Settings → Secrets and
variables → Actions → Variables tab; `.github/workflows/deploy.yml` passes
them to the build step.

The EV and bankroll pages use reproducible per-true-count aggregates generated
by [`../blackjack-simulator`](../blackjack-simulator/README.md). The deployed
audit JSON records every bucket's sample count, payoff moments, confidence
interval, seed, software versions, strategy manifest, and generator source hash.
The current production artifact contains 46,734,162,152 resolved rounds from
100,000,000 shoes for each of nine deck/penetration profiles.

The Counter's Edge Lab at `/cvcx/` is a CVCX-style post-simulation workspace
over those profiles. It includes custom and Kelly-weight bet ramps, wong-in
points, risk-sized units, EV/variance, c-SCORE, DI, N0, lifetime and finite-trip
risk, bankroll and goal calculators, result percentiles, probable ranges, and
side-by-side penetration comparisons. It deliberately labels the exact fixed
ruleset supported by the audit data rather than extrapolating unsupported game
rules or multi-hand correlations.

The Chase the Flush tab includes an in-browser conditional-EV hand analyzer. Its
auditable Python research engine, CLIs, tests, and machine-readable results live
in [`../chase-flush-solver`](../chase-flush-solver/README.md).
