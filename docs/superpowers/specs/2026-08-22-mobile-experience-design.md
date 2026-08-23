# Mobile experience — design

**Date:** 2026-08-22
**Status:** approved design, not yet implemented
**Scope:** phone-width layout and interaction. No new dependencies.

## Goal

Make CountLab genuinely usable on a phone: reachable analysis pages, a chart
drill that admits what it is hiding, and no controls or text below the
thresholds a touch device needs.

## How this was evaluated

Measured in Chrome at 390×844, device pixel ratio 3, `mobile,touch` emulation,
against eighteen days of seeded drill history so populated screens were assessed
rather than empty states. Per page: document scroll width versus viewport,
elements overflowing the viewport with no scrollable ancestor, interactive
elements under 44×44, text nodes under 11px, and horizontal rail overflow.

## What is already right

Recorded so that later work does not "fix" it:

- **No horizontal overflow anywhere.** `/dashboard`, `/cvcx`, `/simulation`,
  `/statistics`, `/training/h17-chart`, `/training/running-count` all measured
  `scrollWidth === innerWidth` at 390px.
- **Tap targets are largely deliberate.** 95 uses of `min-h-11` across
  `components/`, against a handful of violations.
- **Charts are legible.** The three Recharts figures on `/statistics` render
  324px wide inside a 358px card with readable axes. An early read of a
  downscaled screenshot suggested they were broken; at full resolution they are
  not. No chart work is in scope.
- **Inputs are 16px**, so iOS does not zoom on focus.
- Safe-area insets, the bottom tab bar, the drawer, and the drills' touch docks
  all behave. The H17 dock's fourteen buttons are every one 44×44.

## Findings

| # | Finding | Evidence |
|---|---|---|
| 1 | Analysis pages are walls of form | `/cvcx` is 8.8 viewports tall with 66 inputs; `/simulation` has 37 |
| 2 | H17 hides 40% of every table | each rail is 552px wide in a 332px viewport — 220px off-screen; dealer 8, 9, 10 and A unreachable without a sideways swipe |
| 3 | H17 legend is oversized and wrong on touch | consumes roughly 400px of vertical space at 390px, wrapping past seven lines, and teaches `Shift + Y` — a chord no touch keyboard has |
| 4 | H17 cells are under the tap minimum | 42×36 |
| 5 | Sub-11px text | 27 usages across 10 files; `/cvcx` renders captions at 9.6px |
| 6 | Consent banner eats the viewport | `AnalyticsConsent.tsx:32` caps at `min(80svh,30rem)`, and its buttons stack full-width below `sm`, rendering ~490px tall on an 844px screen |
| 7 | Sub-44px controls in CVCX | `CvcxLab.tsx:112-114` — ½X, 2X, Reset are `px-3 py-1.5` with no `min-h`, measuring 30px tall |

Finding 3 is a regression introduced by this repo's own earlier chart-legend
work, not a pre-existing defect.

## Root cause of finding 1

`/cvcx` already implements the pattern this work would otherwise invent: nine
`Section` collapsibles, five `PinnedStat` figures, and a sticky results bar at
`CvcxLab.tsx:525` that is already mobile-aware (`grid-cols-2 sm:grid-cols-4`,
offset by `env(safe-area-inset-top)`).

It is still 8.8 viewports tall because only four of the nine sections pass
`open={false}` (`CvcxLab.tsx:721, 730, 757, 797`). `Section` defaults to
`open = true`, so the remaining five — Scenario summary, Bankroll and pace,
Table rules, Bet spread, and the outcome section — render expanded at every
width. Those five hold the 66 inputs.

The other four analysis pages use none of the pattern: `SessionSimulator`,
`TripPlanner`, `ScenarioComparison` and `BankrollRecommender` contain zero
`Section`, zero `PinnedStat`, and no sticky bar.

So this is not a redesign. Phase B is a default-state change, and Phase C
applies an existing in-repo pattern to four pages that never adopted it.

## Scope

In scope: findings 1–7 as phases A, B and C below.

Out of scope:

- Any new dependency, and any chart library change — the charts measured fine.
- Navigation restructure. The drawer and bottom tab bar work.
- Drill logic, grading, storage, analytics events, and the Supabase schema.
- Desktop layout. Every change is either width-gated or an improvement at all
  widths; none may regress the desktop view.

## Phase A — cross-cutting fixes

Independently shippable, and worth landing first.

**A1. H17 legend, compact and touch-correct.** Two problems in one block. At
390px it wraps past seven lines; and it presents `Shift + Y` and `Shift + D`,
which a touch keyboard cannot produce. Below `sm` the legend renders as a
compact grid of key/meaning pairs, and the two compound entries present the
dock's own `Y/N` and `Ds` buttons as the touch route rather than the chord. The
chord stays documented at `sm` and above, where a hardware keyboard is likely.
`sectionLegend()` already returns `combo: true` for exactly those entries, so
the distinction is available without changing the grammar.

**A2. H17 column affordances.** The rail keeps scrolling; it stops being silent
about it. A right-edge fade over the rail while more columns remain, `scroll-snap`
per column so a swipe lands cleanly on a dealer upcard rather than mid-cell, and
a count of columns still hidden. The fade must be driven by scroll position, not
painted unconditionally, or it will sit over the last column at the end of the
rail and read as a rendering fault.

**A3. H17 cell height.** 36px to 44px. The row label column shrinks to keep the
table's total width from growing, since widening the rail worsens A2.

**A4. `PinnedStat` label size.** `text-[.6rem]` (9.6px) to 11px at
`ui.tsx:239`. One edit at the source, because `PinnedStat` is where most of the
27 sub-11px usages resolve. The remaining usages are audited individually; a
`text-[.68rem]` (10.9px) keycap glyph is not the same problem as a 9.6px caption
carrying a number, and blanket-raising every one of them would damage dense
layouts for no gain.

**A5. CVCX control heights.** `CvcxLab.tsx:112-114` gain `min-h-11`.

**A6. Consent banner.** Below `sm`, the two choices sit side by side rather than
stacked full-width, the body copy is shortened, and the height cap drops. The
target is under a third of an 844px viewport. Both choices stay equally
prominent — this is a consent surface, and making "Essential storage only"
harder to reach than "Allow analytics" is not an acceptable way to save height.

## Phase B — CVCX default open state

Below `sm`, collapse four of the five default-open sections — Bankroll and pace,
Table rules, Bet spread, and the outcome section — and leave Scenario summary
open. Scenario summary states what is currently being modelled, so keeping it
open means the page opens on a readable answer plus the sticky results bar,
rather than on four screens of inputs. The other four are one tap away.

The mechanism needs care and is the one genuinely subtle piece of this spec.
`Section`'s `open` is documented at `ui.tsx:185-188` as *initial DOM state only*:
the value never changes between renders, which is what lets a reader's own
expand and collapse choices survive recalculation. Two approaches are therefore
ruled out:

- Deciding `open` from `matchMedia` during render. This is a static export;
  the prerendered HTML has no viewport, so the server and client would disagree
  and hydration would mismatch.
- Holding `open` in reactive state. That would reassert a collapse after the
  reader has opened a section, fighting the documented behaviour.

The chosen mechanism is a one-time `useLayoutEffect` on mount that, when the
viewport is below `sm`, sets `open = false` on the relevant `<details>` elements
before the browser paints. It runs once, so it never overrides a later choice,
and because `useLayoutEffect` commits before paint there is no visible collapse
flash. `Section` gains an opt-in prop rather than every caller reaching into the
DOM.

## Phase C — adopt the pattern on the remaining analysis pages

`SessionSimulator` (512 lines, 37 inputs), `BankrollRecommender` (371),
`ScenarioComparison` (217) and `TripPlanner` (158) each gain the structure
`/cvcx` already uses: inputs grouped into `Section`s, the page's headline
figures in a sticky `PinnedStat` bar, and the Phase B collapse behaviour.

Each page is independent and ships on its own. Grouping is per page and follows
that page's existing visual grouping — this phase moves markup, and must not
change any calculation, default, or persisted shape. The largest, most-used page
goes first so the pattern is proven before it is repeated.

## Testing

The repo has no component or end-to-end tests and this work adds none; nearly
all of it is layout, which those tests would assert badly.

- **Vitest** covers the one piece of real logic: if Phase B's collapse rule is
  expressed as a predicate over section id and viewport width, that predicate is
  pure and gets a unit test. Layout itself does not.
- **The measurement script from the evaluation is the regression gate.** It is
  checked into `docs/superpowers/mobile-audit.md` so the same numbers can be
  reproduced. Re-run at 390×844 after each phase; the pass condition is zero
  horizontal overflow, zero interactive elements under 44×44, zero text under
  11px, and `/cvcx` under three viewports tall.
- **Manual check at three widths** — 390 (iPhone), 768 (tablet), 1280 (desktop)
  — per phase, confirming no desktop regression.

Verification before completion: `npm test`, `npm run lint`, `npm run build`.

## Risks

- **Phase C is markup surgery on large components.** The risk is a silent
  behaviour change while moving JSX. Mitigation: one page per commit, no
  calculation touched, and each page's numbers compared against `main` before
  and after with the same inputs.
- **`useLayoutEffect` and static export.** It does not run during prerender, so
  the exported HTML ships expanded sections and a phone collapses them on mount.
  This is correct but must be verified as flash-free on a real device rather
  than assumed.
- **A2's fade could mask content** if painted unconditionally at the end of the
  rail. Called out in A2; drive it from scroll position.

## Files

New:

- `docs/superpowers/mobile-audit.md` — the measurement script and thresholds

Edited, Phase A:

- `blackjack/components/H17ChartDrill.tsx` — legend, rail affordances, cell height
- `blackjack/components/ui.tsx` — `PinnedStat` label size
- `blackjack/components/CvcxLab.tsx` — control heights
- `blackjack/components/AnalyticsConsent.tsx` — mobile layout
- `blackjack/app/globals.css` — rail fade and scroll-snap helpers, if not utility-only

Edited, Phase B:

- `blackjack/components/ui.tsx` — `Section` collapse-on-mobile opt-in
- `blackjack/components/CvcxLab.tsx` — apply it

Edited, Phase C:

- `blackjack/components/SessionSimulator.tsx`
- `blackjack/components/BankrollRecommender.tsx`
- `blackjack/components/ScenarioComparison.tsx`
- `blackjack/components/TripPlanner.tsx`

## Sequencing

A first: it is small, independent, and fixes the two findings that are outright
defects (3 and 7). B completes `/cvcx` and validates the collapse mechanism on
the page that already has the structure. C repeats it, one page per commit, and
can stop after any page without leaving the app inconsistent.
