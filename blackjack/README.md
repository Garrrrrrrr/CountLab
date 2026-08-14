# CountLab

The blackjack Hi-Lo trainer hosted at `garricktse.com/blackjack/`. The whole
app sits behind a password gate; see "Password gate" below before your first
`npm run dev`.

```bash
npm ci
npm run dev
```

Run `npm test`, `npm run lint`, and `npm run build` before release. The production build is a static export in `out/` and is deployed with the parent website's GitHub Pages workflow.

## Password gate

CountLab is a fully static export with no server, so there is no real
server-side login. Instead, `scripts/generate-auth.mjs` runs automatically
before `dev`/`build` (via `predev`/`prebuild`) and turns a `COUNTLAB_PASSWORD`
environment variable into a salted, 210,000-iteration PBKDF2-SHA256 hash
written to the gitignored `lib/auth/authConfig.generated.ts`. The plaintext
password is never committed, never written to any tracked file, and never
sent over the network; `components/PasswordGate.tsx` verifies it entirely in
the browser with the Web Crypto API and only then reveals the app. Because
every route is statically pre-rendered, the exported HTML for a locked route
contains only the lock screen, not the real page content — see
`docs/reference-analysis.md` for why that matters.

This is an access deterrent appropriate for a personal static site, not
content encryption: the exported JS bundle and the password hash itself are
still on GitHub Pages and technically downloadable, so treat it as "keeps
casual visitors out," not "protects secrets."

**Local development:** create `blackjack/.env.local` (gitignored) with:

```
COUNTLAB_PASSWORD=choose-your-own-password
```

**Deployed site:** add a repository secret named `COUNTLAB_PASSWORD` in
GitHub → Settings → Secrets and variables → Actions. `.github/workflows/static.yml`
passes it to the build step. Changing the secret and redeploying rotates the
password and signs everyone out (sessions are tied to the current hash).

Without `COUNTLAB_PASSWORD` set, the build still succeeds but generates a
random, unknown password, so the site builds locked and inaccessible — this
is intentional, not a bug.

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
