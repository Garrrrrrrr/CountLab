# Session Simulator methodology

## Version 1: profile-moment Monte Carlo

The first Session Simulator is deliberately not described as a card-by-card
shoe simulation. It samples from the audited true-count bucket profiles already
used by CountLab's EV and Counter's Edge calculators.

For each modeled round:

1. Sample a true-count bucket using its observed frequency `p(tc)`.
2. Resolve the configured units and simultaneous player hands at that bucket.
3. Compute conditional expected dollars:
   `mean(tc) = playerEdge(tc) × totalWager(tc)`.
4. Compute conditional standard deviation under the current multi-hand
   approximation:
   `sd(tc) = sdUnits(tc) × perHandWager(tc) × sqrt(playerHands)`.
5. Draw one normal conditional payoff with that mean and standard deviation and
   add it to the path bankroll.

The normal draw approximates a resolved-round payoff distribution from its first
two moments. It does not reproduce discrete blackjack outcomes, shoe depletion,
dealer covariance between simultaneous hands, or serial true-count correlation.
Those require the later card-by-card shoe engine.

## Analytical comparison

Expected EV is not estimated from the newly sampled paths. It is independently
aggregated from every bucket:

`EV/round = sum(p(tc) × playerEdge(tc) × totalWager(tc))`.

The simulated EV is the online mean of all generated round outcomes. Its
reported Monte Carlo standard error is:

`SE = sampleStandardDeviation(outcomes) / sqrt(observations)`.

The displayed 95% interval is `sampleMean ± 1.959964 × SE`. This interval
measures session-sampler noise only. It does not absorb uncertainty in the
underlying audited coefficients; that uncertainty remains available per bucket.

## Bankroll summaries

Every configured path starts at the supplied bankroll. The simulator records
ending bankroll, whether the path crossed zero, and its maximum peak-to-trough
drawdown. Paths continue after crossing zero so the unconstrained expectation is
not changed by an absorbing boundary; the crossing rate is therefore a risk
diagnostic, not a bankroll-management policy.

P10, median, and P90 are linearly interpolated empirical ending-bankroll
quantiles. Chance of profit is the fraction of paths ending above starting
bankroll. A single sampled path is retained for visualization; it is never
presented as the forecast.

## Reproducibility and execution

The user seed is hashed into a deterministic 32-bit pseudo-random stream. Normal
draws use a Box-Muller transform. Identical inputs and seed produce identical
results, covered by an automated regression test.

The calculation runs in a Web Worker. It yields between bounded batches so the
UI can receive progress and cancellation messages. Only aggregate counters,
path summaries, and at most roughly 200 chart points are retained.

## Supported profile scope

Version 1 supports only the existing audited profiles:

- 6 or 8 decks at the listed penetration points;
- H17, DAS, RSA, late surrender, American peek, 3:2;
- floored Hi-Lo with the audited index strategy;
- one underlying spot profile, with simultaneous-hand results using the
  explicitly labeled conditional-independence variance approximation.

Unsupported rules are not extrapolated. The future shuffled-shoe engine will
add rule-complete action and settlement modeling, actual TC serial dependence,
outcome rates, detailed shoe replay, and card-level validation.
