# Double Down Madness solver

Exact combinatorial solver and Monte Carlo engine for **Double Down Madness**, the
Light & Wonder blackjack variant where the player may double on any number of
cards and keep playing afterwards, paid for by the dealer's 22 pushing every
standing wager.

Built to answer one question — **is this game beatable?** — and to review the
claim in [this r/blackjack thread](https://www.reddit.com/r/blackjack/comments/1uv5xj5/i_simulated_double_down_madness_blackjack_and/)
that it is countable with a Hi-Lo 1-2-4-8-16 ramp.

This is a research engine, not gambling advice.

## Why exact, not Monte Carlo

The thread's top comment gives the right method: compute the **effect of removal**
per rank and derive a counting system from it, rather than assuming Hi-Lo. EORs
are 0.01–0.1% effects against a per-round standard deviation of ~1.67, so
resolving one rank by simulation needs ~10^10 rounds. Re-solving the shoe exactly
with one card removed costs one solve per rank and has no sampling error.

Two features of the game make an exact solve tractable: there is **no splitting**,
so the player state is just a multiset of drawn ranks; and a **double is a hit at
a larger stake** that forfeits nothing, so value is linear in the wager and the
recursion collapses to

```
v(s) = max( stand(s), hit(s), 2·hit(s) )      hit(s) = Σ_r p_r · v(s + r)
```

— double exactly when the post-draw continuation EV is positive.

## Layout

| Path | What it is |
|---|---|
| `ddm/rules.py` | `DDMRules`; every rule with its source, and the two source discrepancies |
| `ddm/cards.py`, `ddm/hand.py` | rank/composition primitives, hand arithmetic |
| `ddm/dealer.py` | exact composition-aware dealer outcome distributions |
| `ddm/exact.py` | the composition-dependent player solver |
| `ddm/strategy.py` | chart extraction, Wizard's published chart, fixed-chart evaluation |
| `ddm/eor.py` | effects of removal, counting systems, betting/insurance correlation |
| `ddm/indices.py` | fixed-size biased compositions, exact index derivation and scoring |
| `ddm/bankroll.py` | CountLab-compatible risk, N0, bankroll and ramp optimisation |
| `ddm/montecarlo.py` | Numba kernel: real shoes, cut card, penetration, ramps, counts |
| `solve_exact.py` | house edge CLI, `--grid` for the validation grid |
| `extract_strategy.py` | derive a chart, diff it against Wizard, price both |
| `compute_eor.py` | per-rank EOR and the counting systems it implies |
| `compute_indices.py` | exact true-count index generation |
| `simulate.py` | penetration, TC estimation, ramp and bankroll analysis CLI |
| `validate_wizard.py` | every published number, PASS/FAIL |

## Running

```bash
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/python -m pytest -q
./.venv/bin/python validate_wizard.py           # fast checks
./.venv/bin/python validate_wizard.py --full    # + exact solves and 1e9-round MC
```

An exact solve of one 6-deck configuration takes ~70 s; the Monte Carlo kernel
runs ~20 M rounds/s across 12 cores once compiled.

See [`docs/findings.md`](docs/findings.md) for the final verdict and audited
numbers. [`docs/HANDOFF.md`](docs/HANDOFF.md) preserves the implementation
history and modelling rationale.
