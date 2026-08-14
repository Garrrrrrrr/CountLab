# CountLab

CountLab - The All in One Solution for APs

Deployed at [countlab.ca](https://countlab.ca) via GitHub Pages (`.github/workflows/deploy.yml`).

## Layout

- [`blackjack/`](blackjack/README.md) — the Hi-Lo trainer and Counter's Edge Lab, a static-export
  Next.js app. This is what gets built and deployed.
- [`blackjack-simulator/`](blackjack-simulator/README.md) — Python engine that generates the
  per-true-count audit data the blackjack app's EV/bankroll pages are built on.
- [`chase-flush-solver/`](chase-flush-solver/README.md) — Python research engine behind the
  in-app Chase the Flush analyzer.
