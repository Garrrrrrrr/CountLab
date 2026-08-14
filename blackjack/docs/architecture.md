# CountLab architecture

## Current application boundary

CountLab remains the existing Next.js application in this directory. A second
scaffold would duplicate navigation, persistence, and already-working trainers.
New work therefore evolves the current app incrementally while preserving its
static-export deployment.

## Target layers

```text
app/                         Next.js routing and layouts
components/                  shared visual components and legacy page adapters
features/
  simulator/                 table and simulation UI state
  strategy/                  trainer UI and attempt presentation
  counting/                  counting/deck-estimation UI
  analysis/                  EV, risk, TC distribution, result explorer
lib/
  blackjack/
    cards/                   card/deck/shoe primitives
    rules/                   versioned rules and validation
    hand/                    totals, legal actions, settlement values
    strategy/                basic strategy and deviations
    counting/                pluggable systems and TC conversion
    betting/                 ramp validation and wager selection
    simulation/              pure round/session engine and result reducers
  statistics/                persistence repository and analytics
workers/                     thin worker protocols around pure simulation
docs/                        methodology, reference analysis, specifications
```

Existing files move toward this shape only when touched for real functionality;
there is no high-risk all-at-once directory migration.

## Core contracts

```ts
interface CountingSystem {
  id: string;
  name: string;
  tag(card: Card): number;
  trueCount(runningCount: number, decksRemaining: number, method: TrueCountMethod): number;
}

interface BetRamp {
  id: string;
  unit: number;
  points: Array<{ trueCount: number; units: number }>;
}

interface SimulationRequest {
  rules: BlackjackRules;
  countingSystemId: string;
  ramp: BetRamp;
  rounds: number;
  roundsPerHour: number;
  seed?: string;
  detail: "summary" | "sampled-shoes";
}
```

`BlackjackRules` is the sole rule authority. It must describe hole-card and
peek behavior separately, because American peek, no-peek, ENHC, and OBO settle
doubled/split wagers differently.

## Engine principles

- Pure functions own card math, legal actions, strategy, settlement, and
  aggregation. React owns presentation only.
- Randomness enters through an injected RNG. Seeded test runs are reproducible.
- The simulator returns event/result data; it does not call browser storage.
- A bounded progress callback is the only hot-loop side effect.
- Summary accumulators use numerically stable online moments. Confidence
  intervals use the reported sample size and standard error.
- Detailed replay is opt-in and bounded. Million-round runs never retain every
  card or hand in React memory.
- Workers communicate with versioned request/progress/result/cancel messages.
- Cancellation is checked between batches and shoes.

## Strategy architecture

Basic strategy is a rule-indexed decision engine returning a preferred action,
legal fallback, and explanation. Deviations decorate that decision only when
their rule predicate and count condition match. UI components never contain
strategy matrices or count thresholds.

Action legality is resolved before coaching. For example, a three-card soft 18
cannot be marked wrong for standing merely because the two-card preferred play
is double; the engine compares against its legal fallback.

## Persistence

Browser persistence is accessed through repositories with schema versions and
migrations. Attempt events are append-oriented and contain feature, scenario,
answer, correctness, latency, timestamp, and optional confidence. Derived
statistics are recomputable and are not the only stored truth.

## Verification

- Unit tests cover cards, hands, rules, legal actions, strategy, deviations,
  ramps, settlement, seeded RNG, and accumulator math.
- Golden tests cover known basic-strategy and payout cases.
- Simulation tests use deterministic short shoes and statistical sanity bounds;
  stochastic tests never assert a guessed exact EV.
- Browser checks exercise keyboard and pointer flows, mobile layouts, worker
  progress/cancel, persistence, and console errors.
- Each analytical view links to methodology and displays exact assumptions.
