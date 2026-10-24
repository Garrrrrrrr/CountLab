# CountLab

CountLab - The All in One Solution for APs

Deployed at [countlab.ca](https://countlab.ca) via GitHub Pages (`.github/workflows/deploy.yml`).

## Layout

- [`blackjack/`](blackjack/README.md) — the CountLab website, a static-export
  Next.js app: Hi-Lo drills with real discard-tray photos, strategy and index
  charts, a full-shoe checkout, a bankroll calculator and a session journal.
  This is what gets built and deployed.
- [`blackjack-simulator/`](blackjack-simulator/README.md) — Python engine that generates the
  per-true-count audit data the calculator is built on, and the exact
  finite-deck calculator that audits the site's basic strategy
  ([`basic_strategy/`](blackjack-simulator/basic_strategy/README.md)).
- [`chase-flush-solver/`](chase-flush-solver/README.md) — Python research engine for Chase the
  Flush (its in-app table was retired in the October 2026 remake).
- [`ddm-solver/`](ddm-solver/README.md) — exact combinatorial solver and Monte Carlo engine for
  Double Down Madness, researching whether the variant is countable.
