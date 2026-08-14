# Reference analysis: the reference product

Observed on 2026-08-13 and 2026-08-14 through the normal authenticated UI at
`external simulator`, `/dashboard/results` (Results
Tracker), and `/dashboard/game-directory`. This document records product
behavior only. It does not reproduce source code, branding, copy, or assets.
Test data created while exploring the Results Tracker (one game, one bankroll,
one $5,000 contribution) was deleted before ending the session; no session or
transaction records were left on the account.

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
However the reference product computes nothing: "Hourly EV" is a bare optional number
the user types in per session, with no link back to the Simulator's rules,
ramp, or audited profiles. A user must already know their own EV from
elsewhere (their own math, or a separate simulator run) and re-enter it by
hand every time; nothing enforces it matches what was actually played.

Other notable details:

- **CSV import and export** per bankroll, both directions, described as
  additive ("adds sessions... without removing any current data").
- **Share with Friends**: read-only bankroll invites to other the reference product
  accounts; a **Shared Bankrolls** / **Friend Bankrolls** section on the
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
  ledger, while keeping a single local-first data store rather than the reference product separate Game/Bankroll backend entities.
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
