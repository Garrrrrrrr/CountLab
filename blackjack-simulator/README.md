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
- the measured player's playing decisions use the documented H17 index set;
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

The strategy deliberately has a concrete definition rather than relying on a
label such as "I18 + Fab 4," whose exact indices and boundary conventions vary
with rules and source. See `strategy_manifest()` in `simulate.py` for every
departure used by the production run.

## Commands

```powershell
python -m pytest -q
python simulate.py --validate --shoes 200000 --tasks 32
python simulate.py --off-top --shoes 500000000 --tasks 256 --output results/off-top-validation.json
python simulate.py --all --shoes 2000000 --tasks 64 --output results/coefficients.json
```

`--shoes` is the total requested number of shoes per configuration, divided
across deterministic independent task seeds. Repeating a command with the same
seed, task count, and software versions produces the same integer aggregates.
