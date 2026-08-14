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
