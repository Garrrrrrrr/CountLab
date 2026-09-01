# Double Down Madness — handoff

**Question:** is Double Down Madness beatable? This reviews the claim in
[r/blackjack 1uv5xj5](https://www.reddit.com/r/blackjack/comments/1uv5xj5/i_simulated_double_down_madness_blackjack_and/)
(OP repo [zcheng32/double-down-madness-counting](https://github.com/zcheng32/double-down-madness-counting))
that the game is countable with a Hi-Lo 1-2-4-8-16 ramp, and implements the
method the thread's top comment asked for.

**Status:** complete. The engine, EOR analysis, indices, bankroll math, ramp
optimisation and sampled shoe analysis are implemented and validated. See
[`findings.md`](findings.md) for the verdict and final numbers. The sections
below preserve the original implementation handoff and investigation history.

**CountLab integration (August 2026):** `/double-down-madness` is now a full
Casino Games module with a persistent-shoe game/coach, exact hand analyzer,
strategy and deviation references, and a blackjack-style long-run EV
calculator. The EV calculator exposes unit, bankroll, pace, session length,
risk target, audited penetration/count/policy combinations, a 17-bucket custom
TC spread, presets, scaling, and wong-in shortcuts. It recomputes EV, variance,
hourly SD, N0, SCORE and bankroll risk from normalized simulation buckets; no
blackjack coefficients or penetration interpolation are used. Run
`npm run generate:ddm-buckets` in `blackjack/` to rebuild
`lib/ddm/profileBuckets.generated.json` from the solver artifacts.

---

## 1. Rules as implemented, with sources

Primary sources: [Wizard of Odds](https://wizardofodds.com/games/blackjack/double-down-madness/)
and the casino's posted rules at [Canterbury Park](https://www.canterburypark.com/blackjack/double-down-madness/).

- Player is dealt **one** card, dealer two (one hole). The player may act on a single card.
- Dealer peeks on 10/A; dealer blackjack beats everything. Insurance pays 2:1.
- **Double = double the total wager AND draw a card**, then play continues (hit/stand/re-double).
  Wager goes 1 → 2 → 4 → 8 …
- No split, no surrender. Dealer hits soft 17.
- **Dealer 22 → every non-busted wager pushes.**
- Player blackjack = ace + ten as the **first two cards**, paid at once, exempt from the
  dealer-22 push. V1 suited 2:1 / unsuited 3:2; V2 both 3:2; V3 suited 3:1 / unsuited 1:1.
- **A blackjack completed after a double pays blackjack odds on the doubled wager**
  (Canterbury: *"If you choose to double down and receive a blackjack, you will receive a
  complete blackjack payout."*). This is why a ten-value or ace first card always doubles.
- Push 22 side bet: 11:1 when the dealer totals 22.

### Modelling decisions worth knowing

**Suits are never tracked.** For an ace paired with a ten-value card, exactly 4 of the 16
ten-value cards per deck share its suit, so P(suited | blackjack) = 1/4 regardless of
depletion. `DDMRules.bj_multiplier` folds that into one expected payout: V1 = 1.625,
V2 = 1.5, **V3 = 1.5 as well**. That the two blend identically predicts Wizard's identical
2.07% house edge for V2 and V3 — confirmed exactly (both 2.0183% here).

**The hole card is unseen, not absent.** Dealing is exchangeable, so conditional on the
player's cards the hole is uniform over the remaining unseen pile, restricted by the peek.
That restriction leaks into the player's own draw probabilities. With U the unseen pile
(which still contains the hole), M = |U|, and A the count of ranks the hole may still be:

```
P(hole = r)      = c_r / A                        for allowed r
P(next draw = r) = (c_r / (M-1)) · (1 - [r allowed] / A)
```

Both reduce to `c_r / M` when nothing is excluded. This is exact, and
`test_peek_adjusted_draw_probabilities_match_brute_force` pins it to explicit enumeration.

**`ace_rule`.** The user confirmed the strict reading and Canterbury's posted rules agree:
*any* first-card ace draws exactly one card, hit or double. `"double_only"` (Wizard's
wording) is kept as a comparison switch. See finding 3 below — under V1 it makes no
difference at all.

---

## 2. Validation — all of it passing

`python validate_wizard.py --full`

| Check | Target (Wizard) | This engine | Verdict |
|---|---|---|---|
| P(dealer draws to 22), 6d H17 | 0.073536 | **0.073536** | exact to all 6 published digits |
| Push 22 house edge at 11:1 | 11.76% | **11.7565%** | pass |
| V2 and V3 house edge identical | yes | **yes**, both 2.0183% | pass |
| V1 → V2 house-edge gap | 1.12% | **1.133%** | pass |
| V1 house edge, 6 decks, cut card | 0.95% | **0.9442%** | pass |
| Average final wager | 1.57 | **1.5876** | pass |
| Element of risk, V1 | 0.61% | **0.595%** | pass |
| Basic strategy chart | his two chart images | **4 cells differ**, worth 0.003% | pass |
| MC (CSM) vs exact solver | must agree | 0.8799% ± 0.0104% vs 0.8860% exact | **cross-validated** |
| Cut card costs the player | 0.03% | **0.064%** | direction right, magnitude ~2× — open |
| 8 decks vs 6 | +0.03% | **+0.052%** | direction right, magnitude ~2× — open |

The last two are the only unresolved items. Both are differences Wizard quotes rounded to
two decimals, and both are second-order; they do not affect the beatability question, but
they should be explained rather than waved away.

Exact house edges on a fresh 6-deck shoe (`results/exact_grid.json`):

| Version | ace_rule | House edge | Avg wager |
|---|---|---|---|
| 1 | strict | 0.8853% | 1.5871 |
| 1 | double_only | 0.8853% | 1.5871 |
| 2 / 3 | strict | 2.0183% | 1.5871 |
| 1, 8 decks | strict | 0.9377% | 1.5875 |
| 1, **no dealer-22 push** | strict | **−10.1977%** | 1.8551 |

---

## 3. Findings so far

**1. The dealer-22 push *is* the game.** Remove it and the player has a **+10.2% edge**.
That single rule is worth about 11.1% and pays for unlimited re-doubling, hitting after
doubling, and acting on one card. It also explains the chart's shape: pushing on 22 strips
roughly 2 × 0.0735 ≈ 0.147 of EV from every *standing* hand, which is why correct play hits
hard 12 vs 2/3/4 and hard 13 vs 2, and stands rather than doubles soft 18 vs 2/3/4.

**2. One-card and multi-card totals are different decisions.** A lone ten that catches an
ace makes a **blackjack**, paid at 1.625× on the whole doubled wager; 4+6 reaching 21 is
just 21. Wizard's prose ("always double a ten-point first card") and his hard-10 chart row
(hit vs 10 and A) are therefore both correct and not in conflict — they are different hands.
Conflating them made our chart look 0.37% worse than his; splitting them (`Chart.first`)
dropped the gap to 0.003% and reproduced his hard-10 row exactly. **Anyone modelling this
game needs a separate first-card table.**

**3. The thread's central dispute dissolves.** Under Version 1 the strict and loose ace
readings give **identical** house edges (0.8853% both), because doubling a lone ace is
optimal against every upcard, so the hit restriction never binds. The interpretations only
diverge in V2/V3 (2.0183% strict vs 2.0165% loose), which is exactly where Wizard says to
hit A vs A. The OP's README states Wizard recommends hitting A vs A in *Version 1*; he does
not — he says that for Versions 2 and 3. So there was never a disagreement with Wizard to
explain, and the OP's headline deviation finding rests on a misreading of the source.

**4. Under the strict ace rule, soft 12 is unreachable.** A+A can only arise from an ace
first card, which ends the hand immediately. It is never a decision, so that chart row is
empty by construction rather than by omission.

**5. Our derived chart beats Wizard's published one by 0.003%** — 4 cells differ (first-card
4 vs 6, hard 4 vs 6, soft 15 vs 5, soft 17 vs 5), all marginal doubles. Practically, his
chart is fine.

---

## 4. What is built

| Module | State |
|---|---|
| `ddm/rules.py`, `cards.py`, `hand.py` | done, tested |
| `ddm/dealer.py` | done, validated to 6 digits |
| `ddm/exact.py` | done, validated |
| `ddm/strategy.py` | done, validated |
| `ddm/montecarlo.py` | done; flat-bet cross-validated, deviation path regression-tested |
| `ddm/eor.py` | done; exact V1 table in `results/eor_v1.json` |
| `solve_exact.py`, `extract_strategy.py`, `validate_wizard.py` | done |
| `compute_eor.py`, `compute_indices.py` | done and run |
| `tests/test_ddm.py` | 22 tests, all passing |
| `ddm/indices.py`, `ddm/bankroll.py`, `simulate.py` | done and sampled |
| `docs/findings.md` | done; replaces the planned `ddm/reports.py` layer |

Cached artifacts in `results/`: `exact_grid.json`, `chart_v1_strict.json`
(the derived V1 strict chart plus its exact house edge — **reuse this, it costs 70 s to
rebuild**), `strategy_v1_strict.json`, `validation.json`.

Final analysis artifacts also include `eor_v1.json`, `indices_v1_hilo.json`,
`main_hilo_indices_1b.json`, `sweep_hilo_indices_100m.json`, and the penetration,
TC-rounding, CSM and count-comparison runs cited by `findings.md`.

Performance: one exact 6-deck solve ≈ 70 s single-core (parallelise across configurations
with `multiprocessing`, as `solve_exact.py --grid` and `compute_eor.py` do). The Numba
kernel does ~20 M rounds/s across 12 cores after a ~30 s first compile; 10^9 rounds gives a
±0.010% confidence interval on the house edge.

---

## 5. Completed work (original handoff checklist)

### Step 1 — EOR and a derived counting system (task #5)

**Completed.** The resulting level-1 system is Hi-Lo (BC 0.9779); see findings.

The completed EOR command is:

```bash
./.venv/bin/python compute_eor.py --version 1 --ace-rule strict \
    --chart results/chart_v1_strict.json --json results/eor_v1.json
```

Issues found and fixed: the dynamic `SYSTEMS` import was replaced with a normal
top-level import, and the command now uses the current cached chart artifact
instead of the legacy chart that lacked the one-card plane.

It computes `EOR_r = EV(shoe − one card of rank r) − EV(full shoe)` by exact re-solve, in
two flavours: `fixed` (full-shoe chart held constant — this is the betting-relevant one)
and `optimal` (strategy re-optimised). Then it scores Hi-Lo, Hi-Opt II, Zen, Halves and KO
against those EORs, and proposes integer tag sets at several granularities.

**What to look for.** The dealer-22 push should distort the EORs away from standard
blackjack, because it devalues standing and therefore changes what a rich shoe is worth.
If Hi-Lo's betting correlation comes out well below ~0.95, the top comment's premise is
confirmed and the derived system matters. Report BC and insurance correlation for every
candidate, and pick the best small-integer system.

### Step 2 — strategy indices (task #6)

**Completed.** Ninety-one usable records and two ambiguous cells were emitted;
the simulator defaults to the top 18 positive-gain play indices plus insurance.

Write `ddm/indices.py`. For each chart cell, re-solve exactly at biased shoe compositions
representing a range of true counts, and find the TC where the optimal action flips. Emit
`{plane, row, upcard, threshold, action, direction}` records — that is already the schema
`montecarlo.deviation_arrays()` consumes, so indices drop straight into the kernel.

Build the biased composition by removing cards in proportion to the derived count's tags
until the target true count is reached, keeping the shoe size fixed. Report the EV gain of
each index so they can be ranked and truncated to a memorisable set.

Priority cells: everything near the hit/stand frontier (hard 12–16), the double/hit frontier
(hard 8–11, soft 15–18), insurance, and the first-card rows.

### Step 3 — bankroll math and ramp optimisation (task #7)

**Completed.** Risk functions mirror CountLab, and `simulate.py` emits every
listed metric. The `spots` sweep represents occupied table spots, not multiple
simultaneous hero hands.

Write `ddm/bankroll.py`. **Mirror `blackjack/lib/blackjack/cvcx.ts`** (`finiteHorizonRisk`,
`requiredBankroll`, `riskSizedUnit`, `normalCdf`, `resultPercentile`) and `advantage.ts`
(N0, SD model, `SIMULTANEOUS_HAND_CORRELATION = 0.3724`) so numbers stay consistent with the
rest of CountLab rather than inventing a second convention.

Then write the `simulate.py` CLI over `montecarlo.run()`:
- penetration sweep (cut 1.0 / 1.25 / 1.5 / 1.75 / 2.0 decks), 1–3 spots
- `tc_mode` in {exact, half, full} — the OP found this worth ~20% of EV/hour, so it is a
  real sensitivity, not a detail
- Hi-Lo vs the derived system, with and without indices
- ramp optimisation rather than assuming 1-2-4-8-16: maximise EV subject to a risk-of-ruin
  or Kelly-fraction constraint
- outputs: EV/round, EV/hour, SD/hour, N0, RoR, required bankroll, per-TC buckets with CI95

**Test the deviation path before trusting it.** `_apply_dev` in the kernel is implemented
but has no coverage. Add a test where a deviation that fires at every true count reproduces
a chart with that cell already changed.

**Then answer the CSM question.** u/Inside_Election9910 pointed out most shops deal this
game from a continuous shuffler, and the OP confirmed only Edmonton had a 6-deck shoe. Run
`csm=True` and state plainly that counting yields nothing there — the practical verdict may
well be "countable but almost nowhere available".

### Step 4 — findings report (task #8)

**Completed.** See [`findings.md`](findings.md).

`docs/findings.md`: the validation table, the beatability verdict with required penetration,
spread, bankroll and EV/hour, and a section answering the OP's four questions directly
(rules modelled correctly? dealer-22 logic right? simulation mistakes? what would make it
trustworthy?). Findings 1–5 above belong in it. Be explicit about what is exact and what is
sampled, and give confidence intervals on everything sampled.

---

## 6. Conventions to follow

From `blackjack/docs/architecture.md`, which governs this repo:

- Pure functions own card math and settlement; randomness is injected and seeded runs are
  reproducible.
- **Never edit `blackjack-simulator/simulate.py`** — it carries a recorded `source_sha256`.
  Import from it; `h17_pro.py` is the house template for that pattern. This package
  deliberately matches its conventions (ranks 1..10, floored true count, 17 TC buckets,
  `Z95`) so results are comparable.
- Stochastic tests assert statistical bounds on deterministic short shoes, never a guessed
  exact EV. Exact-solver tests assert closed-form values.
- Unsupported rules and incomplete settlement paths are visibly blocked, never silently
  approximated (`DealerSolver.distribution` raises on an exhausted composition rather than
  guessing).
- Emitted artifacts carry their full rule metadata; estimates are labelled distinctly from
  audited numbers.

Nothing here touches `blackjack/`, so the deploy workflow is unaffected. The countlab.ca lab
page is explicitly out of scope until the numbers are trusted.
