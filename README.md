# Chase the Flush solver

An auditable Python research engine for the Chase the Flush tab at
`garricktse.com/blackjack/chase-flush/`. It models one standard 52-card deck and
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

The final 1x/fold decision is exact: 946 possible hidden dealer pairs with an
exposed card, or 14,190 dealer triples without one. The exposed-card 2x/check
decision is also exact when requested. It enumerates future boards first and
then all hidden dealer pairs for each board, so the later action can depend on
the visible board but cannot leak either hidden dealer card. Other early
decisions use reproducible conditional Monte Carlo backward induction.

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

This common-random-number design produces a paired confidence interval for the
information value. JSON includes seed, sample count, Git SHA, UTC date, rules,
paytable, runtime, CPU count, variance, standard error, confidence intervals,
average wager, and action counts.

## Commands

```bash
python -m pip install -r requirements.txt
python -m pytest -q
python analyze_hand.py --player "Ah 8h 4c" --dealer-visible "Kh" --board "2h 7s"
python analyze_hand.py --player "As Ks Js" --dealer-visible "Kh" --board "Ts 9s" --exact --debug-payoff
python interactive.py
python simulate.py --hands 10000000 --seed 12345 --decision-samples 8
python fitted_simulate.py --train-hands 2000000 --hands 20000000 --six-payout 50
python extract_strategy.py
python -m cProfile -o profile.out simulate.py --hands 1000 --seed 12345
```

`--hands` accepts large runs, but runtime grows with both hands and the cube of
`--decision-samples` at the opening decision. Parallelism and compiled/vectorized
kernels are not implemented in this version.

## Validation and final result

Wizard's page has a material internal inconsistency. The displayed current X-Tra
table pays **50:1** for six cards, but every six-card row in its base analysis is
calculated at **20:1**: for example, a qualified 3x six-card win is shown as +24,
not the +54 implied by 50:1. Its published −0.023907 EV, 3.564878 average wager,
and action frequencies therefore describe the older 20:1 game.

The solver was validated on that legacy 20:1 game using two million independent
training deals per policy and five million fresh holdout deals. The audit rerun
returned **-0.026063** (95% CI [-0.029602, -0.022524]) versus Wizard's
**-0.023907**. Wizard's value lies inside the interval; the difference is
-0.002156 against a 0.003539 sampling tolerance, so validation passed. The
machine-readable audit is `results/legacy20-validation-audit.json`.

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

This is an extremely high-confidence simulation estimate, not a literal exact
enumeration of the roughly 398.7 trillion complete game outcomes. Remaining
systematic uncertainty is policy approximation. Its observed scale is indicated,
but not formally bounded, by the legacy validation error (0.000524 units) and
convergence from 500,000 to 2,000,000 training deals.

## Project map

- `chase_flush/cards.py`: integer cards and parsing
- `chase_flush/hand_rank.py`: canonical evaluator and qualifier
- `chase_flush/payouts.py`: centralized net settlement
- `chase_flush/state.py`: hidden/visible state separation
- `chase_flush/solver.py`: conditional EV and backward induction
- `chase_flush/monte_carlo.py`: paired simulation and statistics
- `analyze_hand.py`, `interactive.py`, `simulate.py`: CLIs
- `tests/`: evaluator, qualifier, payouts, reveal cadence, and leakage tests
