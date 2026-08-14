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
- Real session and bankroll journal (`lib/blackjack/journal.ts`,
  `journalAnalysis.ts`, `components/SessionJournal.tsx`, routed at
  `/journal`): local-first casino session log and bankroll-transaction
  ledger. Unlike AP Toolbox's Results Tracker, a session's theoretical EV and
  standard deviation are computed from the same audited rules/ramp/pace
  engine as the Game & Bankroll Lab (`theoreticalSessionOutcome`), not typed
  in by hand, so realized results and theoretical EV cannot silently
  disagree about what was actually played. Per-session and date-range
  z-score/outlier classification, a cumulative actual-vs-theoretical chart
  with a combined-variance 95% band, and validated JSON export/import.

## Next: journal refinements (from Results Tracker analysis)

AP Toolbox's Results Tracker (`docs/reference-analysis.md`) validated the
actual-vs-EV concept but also revealed gaps the shipped journal doesn't cover
yet:

- Support more than one tracked bankroll (e.g. per trip, per casino, or a
  training vs. real-money split) inside the existing local-first
  `journalLibrary`, rather than one implicit bankroll.
- Let a saved venue/location remember its own rules and ramp, so logging a
  repeat trip to the same casino auto-fills its known ruleset instead of
  re-entering it every session. No crowdsourced directory — private,
  per-user only.
- CSV export (and ideally import) of journal sessions, alongside the
  existing JSON export/import.
- Adopt the "type the exact name to confirm" inline destructive-delete
  pattern (itemized consequences, expands in place, button disabled until
  the name matches) in place of `confirm()`, starting with journal/library
  clear actions.

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
- Exportable read-only share packages for a simulation run or journal
  date-range summary (journal session CSV export is tracked separately under
  journal refinements above).

## Later, backend-dependent features

Accounts, cross-device sync, shared bankrolls, venue directories, social
leaderboards, forums, and messaging require authentication, privacy controls,
moderation, and server persistence. They should follow the core analytical and
training workflows rather than delaying them.
