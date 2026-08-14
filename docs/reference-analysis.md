# Reference analysis: AP Toolbox simulator

Observed on 2026-08-13 through the normal authenticated UI at
`https://ap-toolbox.com/dashboard/simulate`. This document records product
behavior only. It does not reproduce source code, branding, copy, or assets.

## Observable workflow

The simulator is a single form divided into three quickly switchable views:

1. **Setup** configures deck count, cut-off penetration, H17/S17, DAS, late
   surrender, RSA, blackjack payout, a packaged deviation set, hand count,
   high-speed mode, and rounds per hour.
2. **Betting** configures bankroll, base unit, and a custom true-count-to-bet
   table. It immediately derives bankroll units and the largest wager.
3. **Strategy** shows the hard, soft, and pair basic-strategy matrices and lets
   the user switch H17/S17.

Deviation packages are grouped by H17 and S17 and presented as progressive
learning levels. The interface advertises a deviation count and an EV-coverage
percentage for each package. The observed package sizes ranged from roughly a
dozen plays to the low thirties.

Submitting a standard 100,000-hand run shows an in-progress state and then
navigates to a persistent result. The observed result contained:

- headline average value per hour, hands simulated, and total modeled hours;
- a sampled bankroll trajectory with starting, ending, peak, and low values;
- a shoe explorer with total shoes, aggregate profit, average profit per shoe,
  winning-shoe rate, pagination, and sorting;
- per-shoe hand count, profit, minimum/maximum true count, and a detail link;
- a hand replayer showing player/dealer cards, running count, true count,
  wager, result, and a clickable history for every hand in the shoe.

Standard mode retained shoe/hand detail. The setup described a separate
high-speed mode that omits per-shoe data for larger statistical runs. The
browser initiated the simulation through the product's normal simulation API;
no private endpoints or server implementation were inspected.

## What works well

- Setup, betting, and strategy are close together, so configuration changes do
  not require navigating through unrelated pages.
- Bankroll units and maximum action update alongside the ramp.
- A simulation can be explored from aggregate result, to shoe, to individual
  hand. This is unusually useful for explaining variance.
- Standard versus high-speed modes communicate a meaningful storage/detail
  tradeoff.
- H17/S17 strategy and deviation packages are visible before starting a run.

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

## Comparison rule

Future comparisons should evaluate task completion, clarity, mathematical
transparency, and teaching value. Visual similarity to the reference is not a
goal.
