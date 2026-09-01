# Reference workflow analysis

Observed on 2026-08-13 and 2026-08-14 through an external product's normal
authenticated simulator, results tracker, and game-directory UI. This document records product
behavior only. It does not reproduce source code, branding, copy, or assets.
Test data created while exploring the Results Tracker (one game, one bankroll,
one $5,000 contribution) was deleted before ending the session; no session or
transaction records were left on the account.

## Starred stand indices and late surrender

The supplied H17/S17 Pro charts print a star on five H17 cells (16 v 9, 16 v 10, 16 v A,
15 v 10, 15 v A) and three S17 cells (16 v 9, 16 v 10, 15 v 10), marking a stand
index that takes precedence over the cell's surrender. CountLab applies those
indices **only where surrender is unavailable** — a no-surrender table, or a
hand that has already split or drawn.

The reason is measured, not assumed. `priceCell` in
`lib/blackjack/deviationEv.ts` prices every legal action for a chart cell,
bucketed by true count, from real shoe states (6 decks, 75% dealt, DAS, RSA, LS,
3:2). Standing on 15 or 16 against a ten or an ace comes out between −0.53 and
−0.61 per unit at *every* true count from −6 to +10, and it gets worse as the
count rises rather than better: a ten-rich shoe deals the dealer fewer stiff
hands to bust with, which hurts a stand far more than the extra tens help it.
Surrender is a flat −0.50, so it wins at every count.

```text
16 v 10 (H17, 6D/75%, DAS RSA LS) — net units per one-unit base bet
  TC       stand      hit     surrender
  -2     -0.5461  -0.5224     -0.5000
   0     -0.5461  -0.5399     -0.5000
  +2     -0.5421  -0.5644     -0.5000
  +4     -0.5577  -0.5875     -0.5000
  +6     -0.6104  -0.6366     -0.5000
```

The stand-versus-hit crossings themselves are right where the chart puts them —
16 v 10 near TC 0, 15 v A near +5 — so in a game without surrender these indices
are correct and worth having. They are only wrong as a replacement for a
surrender. Reproduce with:

```powershell
npx tsx scripts/priceDeviationCell.ts 16 10 h17 2000000
```

Honouring the star in a late-surrender game costs about 0.044 percentage points
of flat-bet edge, and about 0.25 units per 100 rounds on a 1-12 ramp, because
every one of those decisions happens at a count where the ramp has money out.

## The H17 chart's surrender windows, taught as printed

On 2026-08-23 the H17 catalog behind the reference page and the play drill was
rebuilt from the H17 chart itself, so all three teaching surfaces carry one set
of numbers (`h17Pro.test.ts` asserts the catalog's indices *are* the chart's 26
printed index cells). Two of those cells read backwards from the familiar Fab 4
indices, verified against the PDF's text layer rather than by eye:

| Cell | Printed | Reading |
| --- | --- | --- |
| Surrender 15 v 10 | `0-` | surrender at 0 and below, play the hand above |
| Surrender 16 v 9 | `-1-` | surrender at -1 and below, play the hand above |

Basic strategy surrenders both at every count, so as printed they *stop*
surrendering as the count climbs — hitting a 15 versus a ten at +1 to +3 with a
raised bet out. Priced over 250M rounds on a 1-12 ramp:

```text
h17-ls, units per 100 rounds
  15 v 10 surrender   -0.158 ± 0.001   fires 0.50/100
  16 v 9  surrender   -0.031 ± 0.000   fires 0.24/100
  15 v 10 stand +4    -0.069 ± 0.003   (standalone, versus a surrender the chart has closed)
  16 v 9  stand +4    -0.019 ± 0.002   (same)
  17 v A  surrender   -0.002 ± 0.001   marginal, and negative before this rebuild too
```

The whole H17 catalog is worth 0.04 units per 100 in a late-surrender game
against 0.38 without surrender, and that gap is these cells. They are shipped as
printed because the chart is what the drill grades and a silently different
reference teaches a third set of numbers; the cost is shown on the reference
page rather than hidden. Reversing them to the Fab 4 direction is a one-line
change to the two rows in `h17Pro.ts` plus the exemption in
`deviationRanking.test.ts`.

### The shipped coefficient curves use the corrected policy

The production artifact was regenerated on 2026-08-23 from the corrected
`h17_pro.py` policy. It sampled 250 million shoes for each of nine
profiles (116,818,680,110 resolved rounds in total), with seed `20260821`.
Its source checksum is
`101b81bcae4df274788780b69fca60de41fbffa76eca3d30980e73f7fec3a7a1` and is
embedded in both the JSON evidence and TypeScript artifact.

The regenerated curve applies late surrender before the chart's starred stand
indices, so it no longer prices the losing 15/16-versus-ten-or-ace stand. This
restores the missing non-negative-count index value to the analytical model and
keeps it aligned with the shoe simulator and trainers.

To reproduce the artifact:

```powershell
python h17_pro.py --shoes 250000000 --tasks 256 --seed 20260821 --output results/h17-pro-coefficients.json --typescript ../blackjack/lib/blackjack/h17ProCoefficients.ts
```

**Regeneration status.** `h17_pro.py::h17_pro_pro_action` now uses the taught
policy: 10 v 10 against 4 splits at +6, 16 v 9 stands at +4 where surrender is
unavailable, and unprinted 14 v 10 / 8,8 surrender rows are absent. The
existing coefficient artifact remains the last audited run until the required
250M-shoe, nine-profile regeneration completes; new evidence and its source
checksum must be committed together before the curve is called audited.

## Observable workflow

The simulator is a single form divided into three quickly switchable views:

1. **Setup** configures deck count, cut-off penetration, H17/S17, DAS, late
   surrender, RSA, blackjack payout, a packaged deviation set, hand count,
   high-speed mode, and rounds per hour.
2. **Betting** configures bankroll, base unit, and a custom true-count-to-bet
   table. It immediately derives bankroll units and the largest wager.
3. **Strategy** shows the hard, soft, and pair basic-strategy matrices and lets
   the user switch H17/S17.

Deviation packages are grouped by H17 and S17 and presented as four
progressive learning levels each, exposed as a card picker (not a plain
`<select>`) with a live "EV coverage" badge:

| Ruleset | Beginner | Intermediate | Pro | BJA |
| --- | --- | --- | --- | --- |
| H17 | 70% EV, 12 deviations | 82% EV, 20 deviations | 92% EV, 34 deviations | 92% EV, 33 deviations |
| S17 | 70% EV, 13 deviations | 82% EV, 20 deviations | 92% EV, 33 deviations | 92% EV, 31 deviations |

"BJA" sits alongside "Pro" at the same advertised EV coverage with a
slightly different deviation count, implying it is a curated external
index list (Blackjack Apprenticeship) rather than a fourth difficulty
tier. Neither the coverage formula nor the BJA source is disclosed in the
UI. The bet-spread editor is a fixed vertical stack of eight repeated
"True Count" / "Bet" input pairs (not an addable/removable list), so the
maximum ramp resolution is capped and unused high-count buckets cannot be
pruned from the form.

Submitting a standard 100,000-hand run completed in a few seconds and
navigated to a persistent, shareable result URL
(`/dashboard/results/{uuid}`), confirming the run executes server-side. The
result screen is short — one metric row plus one chart, not a long page:

- headline "AV Per Hour" (average value, i.e. hourly EV), hands simulated,
  and total modeled hours (hands simulated ÷ rounds-per-hour, so it is
  fully derived from Setup inputs, not separately configurable here);
- one sampled bankroll trajectory chart with starting, ending, peak, and
  low values. In an observed run the chart's "Starting" value ($7,413) did
  not equal the configured starting bankroll ($10,000) — it is the value at
  the first plotted checkpoint, not hand zero, which is easy to
  misread as the actual starting bankroll;
- a separate "Explore Shoes" drill-down with total shoes (2,317 for a
  100K-hand/43-hand-average-shoe run), aggregate profit, average
  profit/shoe, win rate, and a paginated (50/page), sortable (profit, loss,
  max TC) table of shoe id / hands / profit / TC min / TC max / a "View"
  link;
- a hand replayer per shoe: large player/dealer card art, the action taken,
  bet, running count, true count, total wager, and net result for the
  active hand, prev/next navigation, and a full per-hand table (dealer
  up/hole cards, TC at deal, TC min/max, result) that jumps the replayer to
  any row on click. Split hands are visually distinguishable in the table
  but their individual results are not separated from the row's summed
  result, which is hard to audit for a 3+ way split.

Standard mode retained shoe/hand detail. The setup described a separate
high-speed mode that omits per-shoe data for larger statistical runs. This
was not run to completion during this pass. The browser initiated the
simulation through the product's normal simulation API; no private
endpoints or server implementation were inspected.

## Results Tracker: real-session bankroll journal

`/dashboard/results` is a separate feature from the simulator: a real-money
session and bankroll journal, structured as three nested entities rather than
a flat session list.

- **Game** — a user-defined label (e.g. "Blackjack", "Poker") with a color
  swatch, created independently of any bankroll. Purely organizational.
- **Bankroll** — a named, currency-denominated pool of money belonging to one
  game (USD/CAD/GBP/EUR/MXN observed). Created with an optional "Initial
  Bankroll Size," which becomes the first entry in a separate
  **Contributions** ledger (not a session). A bankroll can be marked
  Active/Hidden and opted in or out of the main dashboard aggregate, and can
  auto-tag every session logged inside it with its game type.
- **Session** — one real-play entry: bankroll (required), date, duration
  split into separate hour/minute fields, profit/loss (required, signed),
  an optional manually-typed "Hourly EV," an optional venue (Google
  Maps place search, not free text), optional notes, and an optional
  "Trespassed" checkbox ("Mark this session if you were trespassed from the
  venue") — a distinctive, AP-community-specific field with no generic
  bankroll-tracker equivalent; worth adopting on our own venue/session
  concept regardless of the broader Game/Bankroll modeling choices.

Each bankroll detail page also has its own **Manual Transactions** ledger,
separate from both sessions and contributions — a third, distinct
money-movement record whose purpose (comps? expenses? corrections?) is not
labeled in the UI copy.

The bankroll's home page and the per-game page both show the same metric set
over 24H/7D/30D/90D/1Y/All windows: total profit, session count, hours,
average $/hour, and — critically — **"EV Generated"** alongside actual
profit. This confirms actual-vs-theoretical-EV comparison is a validated,
already-shipped concept in this product category, not a speculative idea.
However the observed product computes nothing: "Hourly EV" is a bare optional number
the user types in per session, with no link back to the Simulator's rules,
ramp, or audited profiles. A user must already know their own EV from
elsewhere (their own math, or a separate simulator run) and re-enter it by
hand every time; nothing enforces it matches what was actually played.

Other notable details:

- **CSV import and export** per bankroll, both directions, described as
  additive ("adds sessions... without removing any current data").
- **Share with Friends**: read-only bankroll invites to accounts on the same
  service; a **Shared Bankrolls** / **Friend Bankrolls** section on the
  tracker home lists bankrolls shared with or by the user. Backend-dependent
  social feature.
- Deleting a bankroll or a game is gated by a "type the exact name to
  confirm" pattern inside an inline expanding warning panel (not a modal,
  not a plain `confirm()`), listing exactly what will be destroyed
  (session/bankroll/contribution counts) before the destructive button
  enables. This is a good, low-friction-but-safe pattern worth reusing
  verbatim for CountLab's own destructive actions (delete run, clear
  journal, etc.), which currently use a plain `confirm()`.

## Game Directory: crowdsourced venue map

`/dashboard/game-directory` is a Google-Maps-based, community-maintained
directory of casino venues (367 total observed), clustered by region, with
search-by-city/state/casino, filters, and user-submitted "Add Venue." This is
a social/crowdsourced data product requiring a live backend, moderation, and
a critical mass of contributing users — out of scope for a local-first
single-user site. The narrower, buildable idea worth extracting is a
**private, per-user venue list**: promote the journal's free-text location
field to a small structured/reusable entity (name, saved rules, saved ramp)
so repeat trips to the same venue don't require re-entering its ruleset, with
no crowdsourcing or backend required.

## What works well

- Setup, betting, and strategy are close together, so configuration changes do
  not require navigating through unrelated pages.
- Bankroll units and maximum action update alongside the ramp.
- A simulation can be explored from aggregate result, to shoe, to individual
  hand. This is unusually useful for explaining variance.
- Standard versus high-speed modes communicate a meaningful storage/detail
  tradeoff.
- H17/S17 strategy and deviation packages are visible before starting a run.
- A completed simulation gets a persistent, shareable result URL rather than
  only living in local browser state.
- The Games → Bankrolls → Sessions hierarchy cleanly supports tracking
  multiple bankrolls (different games, trips, or currencies) without forcing
  everything into one flat ledger.
- The destructive-delete confirmation (type the exact name, itemized
  consequences, inline expanding panel) is friction exactly where friction is
  wanted, and nowhere else.
- "EV Generated" alongside actual profit, on both the per-bankroll and
  per-game dashboards, validates that actual-vs-theoretical-EV framing is
  something real users of this product category already expect to see.

## Friction and ambiguity

- The ramp editor repeats generic “True Count” and “Bet” fields without making
  threshold semantics, units, validation, or duplicate handling obvious.
- Penetration is entered as decks cut off, while many players think in decks
  dealt or percentage; only one representation is visible.
- Several switches depend on nearby text rather than having strong individual
  accessible names.
- The advertised EV-coverage percentages do not expose assumptions or a
  derivation. They should not be treated as portable across games.
- The result emphasizes one sampled bankroll path. A single trajectory can be
  mistaken for a forecast unless confidence intervals and distributional
  summaries are equally prominent.
- The observed summary did not foreground standard error, confidence interval,
  N0, SCORE, risk of ruin, TC frequency, or EV contribution by count.
- The strategy matrix is useful for inspection but is separate from an
  explanation of why a play changes or which configured rules affect it.
- Configuration is not organized around an explicit, reusable rule object in
  the UI, making unsupported combinations difficult for a user to identify.
- The results-page "Starting" bankroll figure is the first sampled
  checkpoint, not hand zero, and can visibly disagree with the bankroll the
  user actually configured — an easy, silent misread.
- "Hourly EV" in the journal is a free-typed number with no connection to the
  Simulator's rules/ramp/audited profiles, so it can silently drift from what
  was actually played and cannot be trusted as ground truth.
- Sessions, Bankroll Contributions, and Manual Transactions are three
  separate ledgers per bankroll with overlapping purposes and no in-UI
  explanation of when to use which.
- The bet-spread editor is a fixed-length stack of input pairs rather than an
  addable/removable list, capping ramp resolution.
- Split-hand results in the shoe hand table are summed into one row rather
  than broken out per resulting hand, making split outcomes hard to audit.

## Independent improvements for CountLab

- Use one versioned `BlackjackRules` value across practice, strategy, EV, and
  simulation engines; show unsupported combinations explicitly.
- Offer penetration as cut-off decks, decks dealt, and percentage with a single
  canonical internal value.
- Pair every simulation estimate with sample size, standard error, confidence
  interval, seed, model version, and assumptions.
- Put TC frequency, player edge, wager, and EV contribution in one inspectable
  table.
- Present many-path percentiles and drawdown distributions before any single
  sample path.
- Keep an optional shoe/hand audit trail in detailed mode, and make its memory
  cost explicit before running.
- Allow deterministic seeded runs, cancellation, progress, and background Web
  Worker execution.
- Connect surprising simulated hands directly to the strategy/deviation trainer
  and mistake-review queue.
- Preserve fast keyboard navigation and make every form control properly
  labeled.
- Compute a logged session's theoretical EV and its standard deviation from
  the same audited rules/ramp/pace engine the session was configured with,
  rather than a free-typed number, so realized results and theoretical EV can
  never silently disagree about what was actually played. (Implemented:
  `theoreticalSessionOutcome` in `lib/blackjack/journalAnalysis.ts`.)
- Support more than one tracked bankroll (e.g. per trip, per casino, or a
  training vs. real-money split) without forcing everything into one flat
  ledger, while keeping a single local-first data store rather than separate
  Game/Bankroll backend entities.
- Reuse a single "type the exact name to confirm" inline destructive-delete
  pattern across the site instead of `confirm()` for any action that deletes
  more than one record (clear journal, delete a saved run, clear statistics).
- Give completed simulation runs and journal date-range views a shareable,
  reloadable state (e.g. a URL-encoded or exportable snapshot) beyond the
  local-only `simulationLibrary`/`journalLibrary` storage that exists today.
- Let a saved venue/location on a journal session remember its own rules and
  ramp, so re-entering the same casino auto-fills its known ruleset instead
  of requiring the user to re-specify it every session.
- Add an optional "backed off / trespassed" flag on a journal session, tied
  to its venue, so a player can see at a glance which venues are no longer
  playable before planning a trip.
- Keep the shoe/hand replayer's per-hand ledger honest about splits: show
  each resulting hand's own result rather than a single summed row.

## Comparison rule

Future comparisons should evaluate task completion, clarity, mathematical
transparency, and teaching value. Visual similarity to the reference is not a
goal.
