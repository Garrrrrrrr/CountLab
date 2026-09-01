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

The typed client in `lib/analytics/` records canonical, privacy-conscious
events for identity and sessions, SPA page views, feature adoption, auth,
drills and question outcomes, table-game hands, calculator/simulation usage,
acquisition, errors, Web Vitals, and normalized Supabase/worker performance.
Anonymous activity is linked to an opaque Supabase user id after login without
using email as an analytics identifier. Potentially sensitive financial values
are bucketed and unsafe keys/PII-shaped strings are scrubbed in both the browser
and Postgres.

`AnalyticsProvider` starts one document-level autocapture listener as a safety
net. It emits semantic `element_clicked`, `rage_click_detected`,
`dead_click_detected`, and scroll-milestone events; explicit product events
remain the source of truth. Low-priority events are durably batched and
deduplicated by `event_id`, while conversions, completions, and errors flush
immediately. Batches, session rollups, identity links, and deletion requests go
through `supabase/functions/analytics`; the browser has no direct raw-table
write permission.

Only `admin_users` can open `/admin` or call its security-definer aggregate
RPCs. The dashboard includes DAU/WAU/MAU, comparisons and segments, funnels,
retention cohorts, feature and acquisition analytics, drill accuracy/speed and
hard scenarios, pages/friction, errors, Web Vitals, API distributions, data
quality, safe exports, and a deliberately pseudonymous high-level visitor
view. It does not expose user email addresses or stored answer text. See
`docs/analytics.md` for the event catalog, ownership, retention, and operating
notes. Follow `docs/analytics-production-setup.md` for the complete Supabase,
GitHub Actions, admin-access, Cron, verification, and troubleshooting runbook.

Grant yourself access after your first sign-up by re-running the relevant
statement in `supabase/schema.sql`, or directly:

```sql
insert into admin_users (user_id) select id from auth.users where email = 'you@example.com';
```

The nav only shows the "Analytics" link once `is_admin()` returns true for
the signed-in user.

Apply `supabase/schema.sql` before deploying the Edge Functions. The Pages
workflow does not migrate the database. Then configure these server-only Edge
secrets and deploy both functions:

```bash
supabase secrets set ANALYTICS_HASH_SALT=replace-with-random-secret \
  ANALYTICS_ALLOWED_ORIGINS=https://countlab.ca,https://www.countlab.ca \
  ANALYTICS_CRON_SECRET=replace-with-another-random-secret \
  ANALYTICS_ALERT_WEBHOOK_URL=https://your-webhook.example
supabase functions deploy analytics
supabase functions deploy analytics-alerts
```

The repository's `deploy-analytics-functions.yml` automates subsequent
function deployments when GitHub has `SUPABASE_ACCESS_TOKEN` (secret) and
`SUPABASE_PROJECT_ID` (variable). Schedule `analytics-alerts` with the matching
`x-cron-secret`, and schedule the admin-only `analytics_purge()` function to
enforce the configured retention policy.

**Local development:** create `blackjack/.env.local` (gitignored) with:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT=false
NEXT_PUBLIC_ANALYTICS_PERFORMANCE_SAMPLE_RATE=1
```

The anon key is meant to be public — it's embedded in the client bundle by
design. Access control comes from the Row Level Security policies in
`supabase/schema.sql`, not from keeping this key secret.

**Deployed site:** add `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` as repository **variables** (not secrets —
they're public values, see above) in GitHub → Settings → Secrets and
variables → Actions → Variables tab; `.github/workflows/deploy.yml` passes
them to the build step.
Set `NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT=true` where analytics must wait for
explicit opt-in. The performance sample rate accepts a value from 0 to 1 and
never samples critical product, conversion, completion, or error events.

The EV and bankroll pages use reproducible per-true-count aggregates generated
by [`../blackjack-simulator`](../blackjack-simulator/README.md). The deployed
audit JSON records every bucket's sample count, payoff moments, confidence
interval, seed, software versions, strategy manifest, and generator source hash.
The current production artifact contains 116,818,680,110 resolved rounds from
250,000,000 shoes for each of nine deck/penetration profiles.

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
