# Chase the Flush solver

An auditable Python research engine for the Chase the Flush tab at
the site's `/blackjack/chase-flush/` tab. It models one standard 52-card deck and
does not include the optional Same Suit bet.

## Rules

Source of truth: [Wizard of Odds: Chase the Flush](https://wizardofodds.com/games/chase-the-flush/),
accessed 2026-08-13.

- Ante and X-Tra Bonus are one unit each.
- Three private cards are dealt to player and dealer.
- With zero board cards, check or wager 3x. Then two community cards appear.
- Check or wager 2x. Then the last two community cards appear.
- Wager 1x or fold. A fold loses both initial units.
- Hands compare longest flush first, then every rank in that flush descending.
- The dealer qualifies with a three-card flush of 9-high or better. Four or more
  suited cards always qualify.
- If the dealer does not qualify, Ante pushes before hand comparison. All-In and
  X-Tra still resolve. Ties push all wagers.
- X-Tra pays 250 / 50 / 5 / 1 to one for a 7 / 6 / 5 / 4-card player flush when
  the player wins; otherwise a sub-four-card winning flush pushes X-Tra.

`ActualState` contains the complete deal. `InformationState` contains only the
player cards, exposed board, and optional single exposed dealer card. Solver APIs
accept only `InformationState`; this is enforced by construction and regression
tested.

## Methods

Interactive decisions are now exact at every stage. A Numba nopython kernel
uses four 13-bit suit masks and exhaustive board-conditioned backward induction:

- river: 946 exposed or 14,190 unexposed dealer completions;
- 2x stage: 979,110 exposed or 15,340,290 unexposed terminal assignments;
- exposed opening: 1,104,436,080 terminal assignments;
- unexposed opening: more than 18 billion terminal assignments.

Future actions are chosen only after averaging over every hidden dealer hand
for the corresponding visible board. Thus neither the exact solver nor its
optimized loop can condition an action on hidden cards.

Every decision value has one convention: **expected final net profit for the
whole hand in Ante units**. Returned stakes are not profit. Terminal children
already include Ante, X-Tra, and All-In settlement, so a parent check branch is
only the expectation of its optimal child values; it never adds a current-state
payoff. The canonical settlement object exposes these three components
separately, and X-Tra is independent of the All-In multiple.

The simulator plays the same terminal deal under four information policies:

- baseline: exposed card ignored;
- final only: visible at 1x/fold;
- from 2x: visible at the 2x and final decisions;
- full exposed: visible from the initial 3x decision.

Full-game policy evaluation uses common random numbers and stores integer
`count`, `sum`, and `sum_squares` aggregates instead of individual outcomes.
The paired information-value variance is calculated directly from deal-level
differences. PCG64DXSM streams are split by NumPy `SeedSequence` batch keys, so
runs are reproducible and resumable across different worker counts. Stopping is
based on the paired confidence interval, not merely the sign of its sample mean.

## Commands

```bash
python -m pip install -r requirements.txt
python -m pytest -q
python analyze_hand.py --player "Ah 8h 4c" --dealer-visible "Kh" --board "2h 7s"
python analyze_hand.py --player "As Ks Js" --dealer-visible "Kh" --board "Ts 9s" --exact --debug-payoff
python interactive.py
python simulate.py --mode paired --hands 1000000000 --workers auto --seed 12345
python simulate.py --mode paired --until-converged --precision 0.0001 --confidence 0.999 --max-hands 100000000000 --resume
python simulate.py --mode paired --quality near-exact --until-converged --workers auto
python fitted_simulate.py --train-hands 2000000 --hands 20000000 --six-payout 50
python benchmark.py --workers auto
python extract_strategy.py
python -m cProfile -o profile.out simulate.py --hands 1000 --seed 12345
```

`near-exact` requires at least 100 million full-game evaluation hands and targets
a 99.9% paired half-width of 0.001. `extreme` targets a 99.99% half-width of
0.0001. These presets apply to fixed-policy full-game evaluation; individual
hands use exact enumeration and therefore have zero sampling error.

## Validation and final result

Wizard's page has a material internal inconsistency. The displayed current X-Tra
table pays **50:1** for six cards, but every six-card row in its base analysis is
calculated at **20:1**: for example, a qualified 3x six-card win is shown as +24,
not the +54 implied by 50:1. Its published −0.023907 EV, 3.564878 average wager,
and action frequencies therefore describe the older 20:1 game.

The fresh high-precision legacy validation used 20 million holdout deals. It
returned **-0.0267002**, SE **0.0008975**, and a 99.9% interval of
**[-0.0296534, -0.0237470]** versus Wizard's **-0.023907**. The z-score is
**-3.112**, within the prespecified two-sided 99.9% boundary of 3.291, so the
validation passes. The nonzero difference is policy approximation, not Monte
Carlo noise, and is retained as a stated systematic limitation.

The new paired current-50 run also used 20 million fresh deals:

- baseline EV +0.03498685, SE 0.00101749;
- exposed EV +0.12140385, SE 0.00101032;
- paired information value **+0.08641700**, SE **0.00018455**;
- paired 99.9% CI **[+0.08580973, +0.08702427]**;
- exposed average action 3.52708285 and edge/action 3.44205%.

The exact aggregate files are `results/high-precision-baseline20.json` and
`results/high-precision-current50-paired.json`.

The final calculation then retrained at the requested current 50:1 paytable and
used 20,000,000 independent paired holdout deals:

| Information schedule | EV / Ante | 95% CI | Average wager | EV / action |
|---|---:|---:|---:|---:|
| Ignored | +0.035836 | [+0.033835, +0.037838] | 3.549260 | +1.0097% |
| Final decision only | +0.089762 | [+0.087795, +0.091729] | 3.445498 | +2.6052% |
| Starting at 2x | +0.109810 | [+0.107837, +0.111783] | 3.477121 | +3.1586% |
| All decisions | **+0.122279** | **[+0.120291, +0.124266]** | **3.527184** | **+3.4665%** |

Full exposed-card edge is +12.2279% relative to Ante and +6.1140% relative to
the mandatory two-unit initial wager. Its paired incremental value over normal
play is **+0.086442**, 95% CI **[+0.086080, +0.086804]**, standard error
0.0001848 Ante units.

Stage decomposition is +0.053926 from final-decision access, another +0.020048
from 2x-stage access, and another +0.012469 from opening-stage access.

The 20-million-hand primary result is in `results/final-current50.json`.
Conditional rank and suit analysis uses a separate five-million-hand holdout in
`results/dealer-card-analysis.json`; legacy validation is in
`results/legacy20-validation-2m.json`. Strategy changes are sampled in
`results/strategy-differences.json`.

Exposed-card rank is strongly directional. Conditional full-strategy EV ranges
from −0.337492 when an Ace is exposed to +0.305566 when a deuce is exposed. The
information itself is most valuable for an Ace (+0.194436) and least valuable
for a deuce (+0.044832), because high exposed cards reveal the greatest threat.
Cards 9 through Ace average −0.025682 total EV and +0.120938 information value;
cards 2 through 8 average +0.247734 and +0.056577 respectively.

When the exposed card is higher than every player card in the same suit, total EV
is −0.621811 but information value is +0.183210. When it is not higher, those
figures are +0.223343 and +0.039179. Matching the player's dominant initial suit
has +0.039147 total EV versus +0.146486 for another suit. These categories are
descriptive conditional results, not an additive decomposition.

The measured all-core fixed-policy rate on this machine is 118,349 hands/second
in the isolated benchmark (121,362/second during the 20-million paired run).
At the conservative benchmark rate, 1B / 10B / 100B / 1T / 4T hands require
about 2.35 / 23.47 / 234.71 / 2,347.11 / 9,388.43 hours. Improving or replacing
the fitted policy inference has far better return than blindly running trillions
of samples: Monte Carlo error is already much smaller than observed policy error.

## Project map

- `chase_flush/cards.py`: integer cards and parsing
- `chase_flush/hand_rank.py`: canonical evaluator and qualifier
- `chase_flush/payouts.py`: centralized net settlement
- `chase_flush/state.py`: hidden/visible state separation
- `chase_flush/solver.py`: conditional EV and backward induction
- `chase_flush/compiled_exact.py`: Numba exact decision enumeration
- `chase_flush/high_precision.py`: paired multicore/resumable evaluation
- `chase_flush/statistics.py`: exact integer aggregates and confidence intervals
- `benchmark.py`: compiled and full-policy throughput benchmark
- `analyze_hand.py`, `interactive.py`, `simulate.py`: CLIs
- `tests/`: evaluator, qualifier, payouts, reveal cadence, and leakage tests
