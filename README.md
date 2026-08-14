# CountLab

The blackjack Hi-Lo trainer hosted at `garricktse.com/blackjack/`.

```bash
npm ci
npm run dev
```

Run `npm test`, `npm run lint`, and `npm run build` before release. The production build is a static export in `out/` and is deployed with the parent website's GitHub Pages workflow.

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
