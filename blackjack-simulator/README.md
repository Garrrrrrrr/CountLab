# CountLab blackjack coefficient simulator

This directory contains the reproducible research engine for the EV, variance,
and risk-of-ruin coefficients displayed by the CountLab blackjack app.

## Model

- six or eight standard decks;
- dealer hits soft 17 and peeks under an Ace or ten;
- blackjack pays 3:2;
- double on any first two cards and double after split;
- split to at most four hands, including resplitting aces;
- split aces receive one card, except that another Ace may be resplit;
- late surrender;
- one player spot;
- splitting is allowed to a maximum of four hands;
- Hi-Lo true count is floored using the exact undealt-card count;
- the audited coefficient run uses its documented H17 decision model;
- insurance is taken at a floored true count of +3 or greater;
- no burn card; a round that starts before the cut card is completed.

Each coefficient is conditional on the true count at the start of the round.
Profit is net profit per original one-unit wager, including insurance and all
split/double wagers. Standard deviation is the sample standard deviation of
that conditional profit distribution.

## Production result

`results/coefficients.json` contains 46,734,162,152 resolved rounds from
100,000,000 independently shuffled shoes for each of the nine supported
deck/penetration profiles. Overall EV 95% half-widths range from 0.0027 to
0.0036 percentage points. Every UI row exposes its own sample count and interval;
the sparsest extreme-count bucket has 3,245,268 observations and a 0.1254-point
95% half-width.

The no-index validation run used 4,351,969,160 rounds of the 6-deck, 75%-dealt
game and returned -0.49650% with a 0.00339-point 95% half-width and 1.14245
standard deviation. This is about 0.02 percentage points below published values
of approximately -0.47% to -0.48% for the same core rules. At this precision the
difference is systematic, not sampling noise, and should be treated as a model-
convention difference. Likely contributors are cut-card round weighting and
composition-dependent surrender details, which are not consistently specified
by comparison tables.

A separate 500,000,000-hand off-the-top run removes cut-card weighting. It
returned -0.48173% with a 0.01001-point 95% half-width, overlapping the commonly
published -0.473% benchmark for the core rules.

## Training-deviation source

The web app&rsquo;s drills and shoe-by-shoe simulator use the H17 Pro
17-deviation default Hi-Lo set. It intentionally contains no insurance or
surrender departures. The attribution and full MIT notice are in
`../THIRD_PARTY_NOTICES.md`. The audited coefficient curves predate this training
catalog and are calibrated from the matching H17 Pro policy.

## No-index counterpart

The app offers a Deviations skill setting, which has to price a player who only
captures part of the index EV. Doing that honestly needs the edge at every true
count with indices switched OFF, so the two measured curves can be interpolated:

    advantage(skill) = noIndex + skill * (withIndex - noIndex)

exact at skill 0 and skill 1, monotone between. Shrinking the audited curve
toward an invented anchor instead produces nonsense at the extremes: a +8 shoe is
worth about +4.2% to a pure basic-strategy player, not the near-zero value a
neutral-count anchor implies.

`noindex.py` runs the audited `run_configuration` code path with
`use_indices=False` across all nine production profiles, importing from
`simulate.py` rather than editing it so the recorded provenance hashes stay
valid. `results/no-index-coefficients.json` holds 46,823,345,536 resolved rounds
from 100,000,000 shoes per profile — the same statistical weight as the
production run — exported to
`blackjack/lib/blackjack/noIndexCoefficients.ts`.

As a cross-check, its 6-deck/4.5-dealt profile returned -0.497870% (95% half
width 0.003394) against the independently seeded `--validate` run's -0.496496%,
a 0.0014-point difference well inside both intervals.

## Are rounds independent?

`advantage.ts` builds variance per round from the per-true-count coefficients and
then treats rounds as independent draws from the true-count distribution, so N
rounds carry N times one round's variance and risk of ruin follows from
exp(-2 * B * mu / sigma^2). True counts are strongly autocorrelated inside a
shoe, so it is reasonable to worry that a ramped bettor's large wagers arrive in
runs and that the real bankroll swings harder than that model admits.

`rampvariance.py` measures it directly: it plays a real ramped bettor through
real shuffled shoes and compares the measured variance of a whole shoe's profit
against `rounds_per_shoe x variance of one round`. Over 86,875,710 rounds
(2,000,000 shoes, 6 decks, 4.5 dealt) the ratio is 0.9944 for a 1-12 ramp wonging
in at TC +1 and 0.9967 for one wonging in at TC +2 -- at or just below 1.0, so
clustering does not inflate variance and the independent-rounds model is accurate
here, very slightly on the conservative side.

The same runs reconcile the whole pipeline end to end. For the TC +2 ramp the
real-card simulation gives $24.95/hr EV and $364.21/hr standard deviation against
the app's $24.86 and $364.36; for the TC +1 ramp, $22.25 and $310.76 against
$22.09 and $310.91. Risk of ruin on a 600-unit bankroll measures 10.47% and 6.30%
against the app's 10.57% and 6.44%.

## Simultaneous-hand covariance

`simulate.py` measures one spot, so it reports the variance of a single hand and
says nothing about how two or three hands played side by side co-vary. They are
strongly correlated, because every hand in a round is settled against one shared
dealer hand, and the app needs that correlation to size risk of ruin correctly
when the player spreads to multiple hands.

`covariance.py` measures it by reusing the audited kernel primitives from
`simulate.py` without editing that file, so the recorded `source_sha256` of the
production coefficients stays valid. It reports, per true-count bucket, the
variance of a single hero hand, the variance of the round total across `n` hero
hands, and the implied pairwise correlation.

`results/multi-hand-covariance.json` (6 decks, 4.5 dealt) gives rho = 0.37234
over 57,795,052 two-hand rounds, 0.37245 over 43,760,408 three-hand rounds, and
0.37237 over 35,339,997 four-hand rounds. `results/multi-hand-covariance-8deck.json`
(8 decks, 6 dealt) gives 0.37221 and 0.37225. Rho is flat across true counts
(0.362 to 0.384) and across deck counts, so the single constant

    Var(sum of n equal hands) = n * (1 + (n - 1) * rho) * Var(one hand)

reproduces every measured round-total variance to within 0.01%. The per-seat
standard deviations returned by this script (1.1436 at true count 0) also
reproduce the production coefficients (1.14377), which cross-validates the
kernel reuse. The constant is consumed by `SIMULTANEOUS_HAND_CORRELATION` in
`blackjack/lib/blackjack/advantage.ts`.

The strategy has a concrete definition: the supplied H17 Pro chart,
including its exact thresholds and boundary conventions. The production policy
is encoded directly in `h17_pro.py`.

## Commands

```powershell
python -m pytest -q
python simulate.py --validate --shoes 200000 --tasks 32
python simulate.py --off-top --shoes 500000000 --tasks 256 --output results/off-top-validation.json
python simulate.py --all --shoes 2000000 --tasks 64 --output results/coefficients.json
python noindex.py --shoes 100000000 --tasks 256 --output results/no-index-coefficients.json --typescript ../blackjack/lib/blackjack/noIndexCoefficients.ts
python covariance.py --shoes 2000000 --spots 2 3 4 --output results/multi-hand-covariance.json
python covariance.py --decks 8 --dealt 6 --shoes 1500000 --spots 2 3 --output results/multi-hand-covariance-8deck.json
python rampvariance.py --shoes 2000000 --units 0 0 0 0 0 0 0 0 0 2 4 6 8 10 12 12 12 --bankroll-units 600 --output results/ramp-variance-h17-pro.json
```

`--shoes` is the total requested number of shoes per configuration, divided
across deterministic independent task seeds. Repeating a command with the same
seed, task count, and software versions produces the same integer aggregates.
