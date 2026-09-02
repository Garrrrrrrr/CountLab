# CountLab product specification

## Product promise

CountLab is a professional, local-first blackjack training and analysis studio.
It teaches Hi-Lo as a coordinated skill: counting, deck estimation, true-count
conversion, play variation, and bet sizing. Analysis features clearly separate
audited analytical inputs from Monte Carlo estimates.

Hi-Lo is the first counting-system plug-in. Engines accept a counting-system
interface so tags, true-count conversion, insurance indices, and deviation
catalogs can be added without rewriting UI components.

## Primary navigation

- Dashboard
- Full Shoe / realistic combined practice
- Basic Strategy
- Deviations
- Running Count, True Count, and Deck Estimation
- Betting trainer
- EV & Risk Lab
- Bankroll and risk tools
- Session Simulator
- Counter's Edge / CVCX-style post-simulation analysis
- Statistics and mistake review
- Settings and rules

The existing sidebar remains the fast desktop navigation. Mobile retains a
small bottom bar plus the complete drawer.

## Shared rules

All rule-aware features consume a versioned structured object. The target rule
surface includes:

- decks and penetration;
- H17/S17;
- DAS and double restrictions;
- late or early surrender;
- resplitting, RSA, and maximum split hands;
- 3:2, 6:5, or explicit blackjack payout;
- American hole card and peek behavior;
- European no-hole-card behavior;
- original-bets-only settlement;
- insurance availability.

The UI must never imply that an unavailable ruleset was calculated. Analytical
profiles and simulation results carry their exact rule metadata.

## Training requirements

### Basic strategy

Generate hard, soft, pair, and surrender situations; accept H/S/D/P/R from
buttons or keyboard; use legal-action fallback rules; provide immediate
explanation; record response time and per-scenario accuracy. Filters include all,
category-only, difficult, and missed scenarios.

### Counting

Support single-card, card-group, continuous-shoe, timed, and speed drills.
Display speed is configurable. True-count drills include positive and negative
counts plus floor, truncate, and nearest rounding at full-, half-, or
quarter-deck estimation resolution.

### Deviations

Represent each play with hand, dealer card, threshold, comparison operator,
normal action, deviating action, applicable rules, and source metadata. Drills
sample both sides of the threshold and record accuracy per deviation. The
supplied H17 Pro 34-play catalog is the active reference set.

### Combined practice

The Full Shoe table coordinates counting, deck estimation, strategy,
deviations, and bet-ramp coaching. Assistance data is hidden by default or by
user choice. Checkpoints separately score running count, true count, play, and
betting.

### Testing out

Test Out is the assessment counterpart to the drills. An exam is a configurable
list of sections — running count, deck estimation, true-count conversion, basic
strategy, index deviations, bet sizing, and a capstone shoe — run in sequence,
each against its own question count, its own clock, and its own pass mark. The
table rules the exam grades against are configurable too, so a player can
certify for the specific game they are about to play.

Passing requires clearing the overall bar *and* every enabled section's floor.
An average alone would let a strong count hide a weak index game.

Sections are graded over their configured length, so questions a clock swallows
score as wrong rather than being dropped from the denominator; a section running
out of time does not end the exam. The capstone shoe is the exception, because a
round yields a variable number of checkpoints: it is graded over the checkpoints
reached and fails outright if the clock stopped it short of its rounds.

An exam deliberately does not autosave. Every drill resumes where it left off,
but a resumable exam would let a taker dodge a section's clock by closing the
tab, so leaving the page ends the attempt and records nothing — an abandoned
attempt is not a failed one.

A pass is a certification with an expiry. It is derived from the session log
rather than stored separately: the passing session carries the exam identity and
its validity window, so expiry is its date plus that window. Certifications
therefore inherit sync, backup, and history for free, and show as current,
expiring, or lapsed on the practice hub.

## Analysis requirements

### EV and risk

Inputs include bankroll, unit/ramp, rules/profile, penetration, pace, player
spots, wonging, and count frequency. Outputs include EV per round/hour, units
per hour, average and maximum action, variance/SD, N0, SCORE/c-SCORE when
defined, lifetime and finite-horizon risk, and transparent formulas.

### Session simulation

The final engine models shuffled shoes, cut card, counting, betting, legal
actions, deviations, dealer play, settlement, and supported rule variants. It
runs in a Web Worker, reports progress, supports cancellation and deterministic
seeds, and offers 10K/100K/1M presets subject to device capacity.

Results include estimates and uncertainty, TC distribution, bet frequency, EV
contribution, outcome rates, many-path bankroll percentiles, and drawdowns.
Detailed mode may retain bounded shoe/hand replay data; high-speed mode does
not. Unsupported rules or incomplete settlement paths are visibly blocked,
never silently approximated.

## Analytics and persistence

Local storage is abstracted behind repositories for settings, custom ramps,
sessions, attempt events, and mistakes. Statistics cover today, 7 days, 30
days, and all time. Adaptive practice weights incorrect, slow, and recently
missed scenarios with bounded spaced repetition.

An authenticated backend can later implement the same repository contracts.

## Delivery phases

1. Harden the shared rule/strategy/counting foundation and existing trainers.
2. Complete deviations, combined practice, mistake tracking, and adaptive
   selection.
3. Add the independent session-simulation worker and TC/EV breakdowns.
4. Add advanced analytics, replay, mobile polish, and performance tuning.

Every phase ships functioning behavior with tests. Incomplete calculations are
labeled and excluded from authoritative results.
