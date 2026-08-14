# CountLab feature roadmap

This roadmap converts the useful workflows observed in AP Toolbox into original
CountLab features. It is ordered by user value and engine dependency, not by
visual similarity to the reference product.

## Delivered foundation

- Versioned, local-first simulation library.
- Automatic persistence of completed simulation runs.
- Editable run names plus load, duplicate, and delete actions.
- Reusable named configurations containing bankroll, rules, ramp, seed, and
  experiment size.
- Side-by-side comparison of two runs across EV, average action, profit
  probability, zero crossing, and drawdown.
- Validated JSON export/import for portable backups.
- Profile methodology, deterministic seeds, Monte Carlo confidence intervals,
  TC frequency, and EV-contribution reporting.

## Next: real session and bankroll journal

Add append-only records for casino sessions, bankroll transactions, game
conditions, expenses, and notes. Derived views will compare actual results with
theoretical EV and confidence bands over selectable date ranges. Personal
location data remains local by default.

This phase should reuse saved game configurations and must distinguish a
session's realized profit from its generated EV.

## Next: card-level detailed simulation

The current session simulator is explicitly a fast profile-moment model. Shoe
and hand replay require the independently tested card-level engine described in
`architecture.md`; invented replay data is not acceptable.

Detailed mode will retain a bounded set of shoes and expose:

- shoe sorting by profit, loss, maximum count, and identifier;
- per-hand cards, actions, wagers, count, and settlement;
- strategy, deviation, and bet-sizing annotations;
- filters for splits, doubles, surrender, insurance, and mistakes.

High-speed mode will continue to omit replay data to protect memory and speed.

## Next: adaptive training workflow

- A scenario-level accuracy matrix for hard, soft, pair, surrender, and index
  decisions.
- Click-to-practice from any weak matrix cell.
- Custom drill sets filtered by rules, hand class, action, dealer card, or
  deviation collection.
- Spaced review weighted by errors, latency, recency, and user confidence.
- Stacked checkout shoes targeting rare positive counts and index decisions.
- Timed proficiency tests that score counting, conversion, play, and betting
  separately.

## Next: professional planning tools

- Side-by-side game comparison using a shared bankroll and ramp.
- Trip bankroll planning with finite-horizon loss probabilities and drawdown
  percentiles.
- Wong-in/out and multi-spot ramp editing with table-limit and chip-rounding
  constraints.
- Actual-versus-EV bankroll charts with uncertainty bands.
- Exportable CSV/JSON reports and read-only share packages.

## Later, backend-dependent features

Accounts, cross-device sync, shared bankrolls, venue directories, social
leaderboards, forums, and messaging require authentication, privacy controls,
moderation, and server persistence. They should follow the core analytical and
training workflows rather than delaying them.
