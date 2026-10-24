# Basic-strategy audit

An independent, exact finite-deck calculator that checks every cell of the
site's basic-strategy grids (`blackjack/lib/blackjack/strategyTables.ts`, read
through `blackjack/lib/strategy`) for 180 rule sets: 1, 2, 4, 6 and 8 decks;
H17 and S17; double after split on and off; no, late and early-vs-10
surrender; doubling on any two cards, 9–11 or 10–11.

- Dealer probabilities are exact for the remaining composition after the
  player's two cards and the upcard are removed. Against a ten or ace, EVs are
  conditioned on the dealer not having blackjack (peek game); early surrender
  against a ten compares −0.5 with the unconditioned EV of playing on.
- Play after the first card is composition-dependent hit/stand. Splits play
  each hand from one pair card with the remaining shoe, resplitting to four
  hands (both resplit and no-resplit EVs are kept); split aces take one card.
- A total-dependent cell combines its two-card compositions by probability.

## Rerun

```bash
cd blackjack-simulator/basic_strategy
mkdir -p ev
for d in 1 2 4 6 8; do for s in h17 s17; do python ca.py $d $s ev/ev_${d}_${s}.json; done; done
(cd ../../blackjack && npx tsx --tsconfig tsconfig.json ../blackjack-simulator/basic_strategy/dump_app.ts ../blackjack-simulator/basic_strategy/app_actions.json)
python compare.py          # writes comparison_full.csv and discrepancies.csv
python export_fixture.py   # writes blackjack/lib/strategy/basic-strategy-audit.json
```

`blackjack/lib/strategy/audit.test.ts` then asserts the app's play for every
cell whose best action leads the runner-up by at least 0.002 units (141 of
50,400 cells are closer than that and are skipped). The generated `ev/`,
`app_actions.json` and CSV files are not committed.
