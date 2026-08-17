# Index tiers: implementation handoff

> **Superseded by the licensing decision (2026-08-17).** The proposed GPL-derived
> matrix, tier generator, generated coefficient artifacts, and matrix claims were
> removed rather than shipped under CountLab&rsquo;s Apache-2.0 project. The active
> training catalog is a legacy 17-deviation default set, documented
> in `THIRD_PARTY_NOTICES.md`. It has no insurance or surrender departures, so it
> cannot honestly implement the five-tier/matrix plan below without a new,
> independently calibrated source and production simulation.

Status: **design approved, not implemented.** This document is written for an
agent picking the work up cold. Read all of it before touching code — several of
the pitfalls in the last section will silently corrupt the output if missed.

## 1. What you are building

The Lab's "Deviations" control currently offers Beginner / Intermediate / Pro /
Perfect, backed by a *linear interpolation* between two measured curves. Replace
it with five tiers whose coefficients are each **separately simulated**, so no
displayed number is interpolated:

| Tier | Contents |
| --- | --- |
| None | Basic strategy, zero index plays |
| ~70% | Highest-EV subset |
| ~82% | Larger subset |
| ~92% | Illustrious 18 + Fab 4 |
| 100% | The complete Hi-Lo index matrix |

Two decisions are already made and are not open for revisiting:

1. **All five tiers come from one strategy source** — the full index table
   described in §3. Tier N is "the full table with only these transitions
   enabled". This makes the tiers strictly nested and exactly comparable: the
   only thing varying between them is index coverage, never basic-strategy
   convention.
2. **Tiers are ranked by measured EV and labelled with measured coverage.**
   If the ~70% tier actually measures 71.4%, the UI says 71%. Do not force the
   round numbers.

## 2. Why the obvious approach is wrong

Three findings drove the design. Each cost real investigation; do not re-derive.

**The current "Perfect (100%)" is already Illustrious 18 + Fab 4.** The index set
hand-written in `blackjack-simulator/simulate.py::choose_action` is exactly 22
plays: I18's eighteen plus Fab 4's four. So today's `RAW_COEFFICIENTS` is *not*
full index play, and "I18+Fab4" and "100%" cannot both be tiers unless 100%
becomes the complete matrix. The app has been mislabelling I18+Fab4 as perfect
play; fixing that label is part of this work.

**`simulate.py`'s index values differ from the app's own published I18/Fab4
table.** Compare `strategy_manifest()` against `ILLUSTRIOUS_18_DEVIATIONS` in
`blackjack/lib/blackjack/fullHiLoIndices.ts`: 16v9 (sim +4, app +5), 11vA (0 / 1),
10vA (+3 / +4), 9v7 (+3 / +4), 12v2 (+3 / +4), 12v5 (−2 / −1), 12v6 (−3 / −1),
10,10v6 (+4 / +5), 15vA surrender (−1 / +1). The Reference pages teach one set
and the Lab prices another. Driving every tier from the full table (§3) fixes
this too, because the table becomes the single source for both.

**Interpolation is not merely imprecise, it was anchored wrongly before.** An
earlier version shrank each count's edge toward the *neutral-count* edge, which
priced a +8 shoe at −0.21% for a basic-strategy player against a true +4.2%. That
is already fixed (it now interpolates between two measured curves), but it is why
"simulate it, don't model it" is the standing instruction here.

## 3. The data source

`blackjack/lib/blackjack/fullHiLoIndices.ts` embeds `RAW_HI_LO_INDICES`, a
tab-separated table derived from Eric Farmer's blackjack engine. Facts you need:

- 760 data rows (plus one `#` comment line — skip lines starting with `#`).
- Row format: `total  dealer  doubleFlag  splitFlag  surrenderFlag  initialAction`
  followed by `(index, action)` pairs, terminated by an index `>= 1000`.
- `total` is negative for soft hands. Range is −21..−12 and 4..21.
- A row with `splitFlag == 1` and an even total in 4..20 describes the **pair** of
  `total / 2` (so a pair of 8s is `total 16, splitFlag 1`; a hard 16 that is not a
  pair is `total 16, splitFlag 0`). `A,A` appears as soft 12 with `splitFlag 1`.
- Actions: `1=Stand 2=Hit 3=Double 4=Split 5=Surrender`.
- `initialAction` is the play *below the first index* — i.e. basic strategy for
  that context. **This is what makes the "None" tier possible from the same
  table.**
- Maximum 2 transitions per row; 300 rows carry at least one, yielding 328
  transitions total.

Parse it in Python directly from the `.ts` file so there is exactly one copy of
the data:

```python
import re, pathlib
raw = pathlib.Path("../blackjack/lib/blackjack/fullHiLoIndices.ts").read_text(encoding="utf-8")
table = re.search(r"RAW_HI_LO_INDICES = `(.*?)`;", raw, re.S).group(1)
rows = [l.split() for l in table.strip().splitlines() if l.strip() and not l.strip().startswith("#")]
```

**Licensing caveat, flag to the user before shipping:** the table is documented
as derived from a GPL-3.0 project, and CountLab is Apache-2.0. That tension
already exists in the shipped app; this work deepens the dependency. It is a
product decision, not yours to resolve, but do not let it ship unmentioned.

## 4. Implementation

### Step 1 — parameterized simulator: `blackjack-simulator/indextiers.py`

Follow the established pattern of `noindex.py`, `covariance.py` and
`rampvariance.py`: a **new file** that imports the njit primitives from
`simulate.py` and never edits it (see Pitfalls).

Note that this tier's strategy engine *replaces* `simulate.py::choose_action`
rather than masking it, because the full table supplies basic strategy too. You
still reuse `hilo`, `hand_value`, `floored_true_count`, `bucket_index`, and the
round/dealer/settlement loop structure.

Encode the table as flat numba-friendly arrays keyed by
`(total_slot, dealer, doubleFlag, splitFlag, surrenderFlag)`:

- `initial_action[key] -> int`
- `transition_count[key] -> int`
- `transition_index[key, k] -> int` (true-count threshold)
- `transition_action[key, k] -> int`
- `transition_enabled[key, k] -> bool`  ← **the tier mask**

Decision procedure: compute total/soft/pair, derive the three availability flags
from the live game state, look up the key, start from `initial_action`, then walk
transitions in order applying any whose `index <= tc` **and** whose
`transition_enabled` is true. Disabled transitions are skipped entirely, so the
player falls back to whatever the last enabled action was — which for the None
tier is always `initial_action`.

Insurance is not in the table; keep `simulate.py`'s rule (take at TC >= +3) and
make it a maskable play in its own right, since it is the single largest index by
EV and must be present in the ~70% tier.

The mask must be addressable two ways: by individual play (for Step 2) and by
named tier (for Step 4).

### Step 2 — rank the plays: `--rank` mode

Group the 328 transitions into **plays** keyed by `(hand label, dealer)`,
collapsing the availability-flag variants — a human learns "12 v 3", not "12 v 3
when doubling is allowed". Expect roughly 150 plays.

For each play, simulate with only that play enabled and record
`EV(play) − EV(none)`. Use a **reference ramp**, not flat betting: index EV is
realised disproportionately at high counts where the money is, so flat-betting
ranks the plays wrongly for this product's purpose. Use `RAMPS["1-12"]` from
`advantage.ts`, played at every count:

```
TC  -8..0  +1  +2  +3  +4..+8
u     1     2   4   8    12
```

on 6 decks / 4.5 dealt. 500k shoes per play is ample for an *ordering*
(~10s each, ~25 min for the full sweep).

Write `results/index-tier-ranking.json`.

Be honest in the doc comment about the method's limit: these are **standalone
marginal** contributions, and index plays interact slightly (15v10-stand against
15v10-surrender is the obvious pair). A greedy forward selection would be more
correct but costs O(N²) simulations. Standalone ranking is fine here because it
only decides *tier membership*; each tier's coefficients are then measured
exactly, so no displayed number inherits the approximation.

### Step 3 — define the tiers

Sort plays by descending marginal EV, accumulate, and cut where cumulative
coverage is nearest 70% and 82%. Coverage is measured on the same reference ramp:

```
coverage(T) = (EV_ramp(T) - EV_ramp(none)) / (EV_ramp(full) - EV_ramp(none))
```

Pin the resulting play lists as explicit constants in `indextiers.py` — do not
recompute the ranking at simulation time, or the tiers stop being reproducible.
Record the flat-bet coverage alongside the ramped figure for reference.

The ~92% tier is **not** ranked: it is exactly the I18 + Fab 4 play list from
`ILLUSTRIOUS_18_DEVIATIONS` and `FAB_4_DEVIATIONS`, using **the table's own index
values**, not the curated file's. Measure where it lands and label it with that.

### Step 4 — production runs

Five tiers × nine deck/penetration profiles × 100,000,000 shoes, matching the
existing artifacts' statistical weight. On a 32-core machine one profile is
~150s, so budget **~2 hours** wall clock. Run it backgrounded; stdout is buffered
and will look empty until it finishes, so check liveness with process CPU time
rather than the log.

Emit `results/index-tier-<slug>.json` per tier and export one TypeScript module,
`blackjack/lib/blackjack/indexTierCoefficients.ts`, shaped like the existing
`noIndexCoefficients.ts`:

```ts
export const INDEX_TIER_METADATA = { /* generatedUtc, sourceSha256, coverage per tier, ... */ } as const;
export const INDEX_TIER_COEFFICIENTS: Record<TierKey, Record<string, readonly RawCoefficient[]>> = { ... };
```

### Step 5 — TypeScript

`lib/blackjack/advantage.ts`:

- `getCountProfile(rules, deviationSkill = 1)` becomes
  `getCountProfile(rules, tier: IndexTier = "full")` — a **table lookup, not a
  blend**. Delete the `mix`/`Math.hypot` interpolation block; `standardError` and
  `samples` now come straight from the tier's own run.
- `AdvantageInput.deviationSkill?: number` becomes `indexTier?: IndexTier`.
- `NO_INDEX_COEFFICIENTS` folds into the tier table as the `none` tier. Keep the
  file or retire it, but do not leave two sources for the same curve.

`lib/blackjack/ruleAdjustments.ts`: replace `DEVIATION_SKILL` with an
`INDEX_TIERS` record carrying key, label, measured coverage and play count.
`isEstimated(flags, ...)` must stop treating a non-perfect tier as "estimated" —
**every tier is now audited**, so only the rule deltas make a scenario estimated.
That is a real behaviour change: the amber "estimated" badge should disappear for
all five tiers at baseline rules.

`lib/blackjack/cvcx.ts`: `CvcxScenario.deviationSkill` → `indexTier`; thread it
through `analyzeCvcx`, `createOptimalRamp`, `riskSizedUnit`.

`lib/blackjack/cvcxLibrary.ts`: `CvcxTemplateConfig.deviationSkillLevel` is
persisted in localStorage. Add `indexTier?: IndexTier`, keep
`deviationSkillLevel?` as deprecated-optional, and migrate on load
(`beginner→~70`, `intermediate→~82`, `pro→i18fab4`, `perfect→full`). There is an
existing precedent for this in the same file: `templateHandSchedule`. Silently
dropping saved scenarios is not acceptable.

### Step 6 — UI

`components/CvcxLab.tsx` — the Deviations `<Select>` in the "Table rules"
section, the section's collapsed summary string, the amber estimate note, and the
"Scope and method" section text all reference deviation skill. Label options with
measured coverage and play count, e.g. `Illustrious 18 + Fab 4 (92% · 22 plays)`.

`components/BankrollRecommender.tsx` calls `getCountProfile(rules)` with no
second argument; confirm the new default is the intended tier.

## 5. Validation gates

Do not believe a run that fails any of these.

1. **Off-the-top.** The None tier's first-round 6-deck edge must land near
   **−0.4817%** (the existing 500M-hand `--off-top` run), which itself matches the
   published ≈0.48% house edge for 6D H17/DAS/RSA/LS/peek/3:2. If the None tier
   is off by more than a few hundredths of a point, the table's `initialAction`
   is not being read as basic strategy — that is the single most likely bug.
2. **No-index flat bet.** None tier, 6D/4.5, flat one unit: expect ≈ **−0.4979%**
   (`results/no-index-coefficients.json`) or **−0.4965%** (`validation.json`,
   different seed). Both have ±0.0034 half-widths.
3. **I18+Fab4 flat bet.** Expect ≈ **−0.409%**, i.e. about **+0.087pp** over the
   None tier. That is the known flat-bet gain for a ~20-index set.
4. **Monotonicity.** EV must increase strictly across None → 70 → 82 → 92 → full
   at every profile, and each frequency vector must sum to 1.
5. **Nesting.** Assert in code that each tier's play set is a superset of the
   previous. The 92% tier is the exception — I18+Fab4 is a *named* set and may not
   be a strict superset of the measured 82% tier. If it isn't, say so in the UI
   rather than pretending the ladder is clean.
6. **Standard deviation** should stay ≈ **1.1424–1.1430** per round for every
   tier. A large move means the strategy engine is misreading the table.
7. **Regression.** `npx vitest run` (142 tests today), `npx tsc --noEmit`,
   `npm run lint`, `npm run build` all clean.

## 6. Pitfalls

- **Never edit `simulate.py`.** Its SHA-256 is recorded inside
  `results/coefficients.json`, `validation.json` and `off-top-validation.json`,
  and `tests/test_artifact.py` asserts the binding. Import from it instead.
- **Hash line endings.** Git checks these files out CRLF on Windows, so hashing
  raw bytes records a machine-dependent provenance hash. Copy `normalized_sha256`
  from `noindex.py`, which strips `\r`. Related: `test_artifact.py` currently
  **fails on any Windows checkout** for exactly this reason — it hashes raw bytes
  while the artifacts store the LF hash. That failure is pre-existing and not
  caused by your changes.
- **`AdvantageRules.useIndices` looks dead but is not.** The Session Journal
  persists it in its CSV column format and `journal.test.ts` asserts a round trip
  against `DEFAULT_ADVANTAGE_RULES`. Leave it alone. It is *not* the tier control.
- **`results/` is gitignored with an explicit allowlist.** Add a
  `!results/<name>.json` line per artifact you want tracked or it will vanish.
- **Do not reintroduce the hand-count or spread bugs.** The Lab was recently
  fixed so that one hand schedule drives every metric and Wong-in zeroes the live
  ramp. If you touch `CvcxLab.tsx`, keep `handsSchedule` and `activeRamp` as the
  single sources.
- **Buffered stdout.** Long background runs show an empty log until they exit.

## 7. Things already settled — do not redo

Measured this session, with artifacts in `blackjack-simulator/results/`:

- **Simultaneous-hand correlation ρ = 0.3724**, flat across true counts, hand
  counts (2/3/4) and deck counts. `Var(n hands) = n(1 + (n−1)ρ)·Var(1)`.
  Consumed by `SIMULTANEOUS_HAND_CORRELATION`.
- **The independent-rounds assumption is sound.** Real-shoe shoe-level variance
  over 86.9M rounds is 0.9944–0.9967 of the independent-rounds prediction, so
  count clustering does *not* inflate variance and the closed-form risk of ruin
  is accurate (marginally conservative). An earlier caveat claiming this model was
  optimistic was wrong; `rampvariance.py` disproves it.
- **End-to-end reconciliation.** For a 1-12 ramp wonging at TC +2 the real-card
  simulation gives $24.95/hr and ±$364.21/hr against the app's $24.86 and
  $364.36; risk of ruin 10.47% against 10.57%.

## 8. Files

New: `blackjack-simulator/indextiers.py`,
`results/index-tier-ranking.json`, `results/index-tier-<slug>.json` ×5,
`blackjack/lib/blackjack/indexTierCoefficients.ts`.

Modified: `advantage.ts`, `cvcx.ts`, `cvcxLibrary.ts`, `ruleAdjustments.ts`,
`CvcxLab.tsx`, `BankrollRecommender.tsx`, `engines.test.ts`,
`ruleAdjustments.test.ts`, `blackjack-simulator/README.md`,
`blackjack-simulator/.gitignore`.

`ruleAdjustments.test.ts` currently asserts the interpolation behaviour
(`reproduces the audited basic-strategy curve when deviationSkill is 0`,
`interpolates linearly between the two measured curves`, and a monotonic-EV
check). The first and last survive as tier assertions; the interpolation test
should be deleted, not adapted — there is no longer anything being interpolated.
