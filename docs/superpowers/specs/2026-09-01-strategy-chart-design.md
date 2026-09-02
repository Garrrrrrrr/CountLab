# Configurable Basic Strategy Chart — design

**Date:** 2026-09-01
**Status:** approved design, not yet implemented
**Replaces:** the static GIF at `/reference/basic-strategy` (`DynamicPage.tsx`, `StrategyReference`)

## Goal

An interactive basic strategy chart at `/reference/basic-strategy` whose cells
respond to the table rules, with a second tab showing the Hi-Lo index deviations
as a chart of the same shape — no true-count slider. The reference the user
pointed at is `blackjacktrainer.fyi/charts?tab=strategy`; the difference asked
for is that its TC-preview tab becomes a plain deviation chart.

Making the chart rule-driven means the strategy engine has to become rule-driven
too. `lib/blackjack/basicStrategy.ts` today is a single branchy function that
honours `dealerHitsSoft17`, `doubleAfterSplit` and `lateSurrender`, and ignores
`decks` and `doubleRule` entirely. It is reimplemented on the new tables and
stays the app's single source of truth for basic strategy.

## Provenance

The reference site was inspected to answer "can we take from it". Its client
bundle (`_next/static/chunks/052x4y86j5zbg.js`) carries hand-authored per-ruleset
grids — hard totals 5–21 × 10 upcards, soft totals, pairs — using composite
codes such as `Rh`, plus a separate EV solver (`{stand, hit, double, split,
surrender, best, bestEv, dealerBust, assumesPeek}`) that powers its EV tab rather
than its strategy chart. Deviations are generated per ruleset by
`deviationsForRules({decks, soft17})`.

That confirmed the shape of the problem: a strategy chart does not need a runtime
solver, and full rule coverage is reachable with curated tables.

**None of their code or table literals are copied.** Basic strategy grids are
factual and published widely (Wizard of Odds, Griffin, Schlesinger); ours are
authored from those public references, and their rendered output is used only as
one cross-check among several. Every table in `strategyTables.ts` carries a
source citation in a comment.

## Scope

In scope:

- Rules that change cells: `decks` (1 / 2 / 4+), H17 vs S17, double-after-split,
  surrender (none / late / early), double restrictions (any / 9–11 / 10–11),
  and European no-hole-card.
- A shared chart grid renderer used by both tabs.
- Reimplementing `getBasicStrategyDecision` on the tables, behind its existing
  signature.
- Mapping the existing H17/S17 deviation catalogs onto grid coordinates.

Out of scope:

- **Any new EV or solver work.** No combinatorial analysis, no EV tab, no
  regeneration of `deviationRanking.generated.json` unless the parity gate below
  forces it.
- **Rules that do not change a cell**: blackjack payout, max splits, resplit
  aces, shuffle type. `sumRuleAdjustment` already prices these; a house-edge
  readout on this page is a plausible follow-up, not part of this work.
- **New deviation index sets.** The catalogs stay 4–8 deck H17/S17. Selecting 1
  or 2 decks changes the strategy tab only; the deviation tab says plainly that
  it is showing the 4–8 deck indices.
- The H17 chart drill and `bjaH17Chart.ts`. That transcription is a fixed printed
  artifact and is used here only as a test oracle.

## Data model

### Rows and columns

Row sets match `bjaH17Chart.ts` exactly, so the two modules can be compared cell
for cell and so the chart drill and this page teach the same layout:

| Section | Rows (top to bottom) |
|---|---|
| `pairs` | `A,A` `T,T` `9,9` `8,8` `7,7` `6,6` `5,5` `4,4` `3,3` `2,2` |
| `soft` | `A,9` `A,8` `A,7` `A,6` `A,5` `A,4` `A,3` `A,2` |
| `hard` | `17` `16` `15` `14` `13` `12` `11` `10` `9` `8` |

Columns are `CHART_DEALERS` from `bjaH17Chart.ts`: `2 3 4 5 6 7 8 9 10 A`.

Hard totals 18–21 are always stand and 5–7 always hit; both are stated as a
footnote rather than given rows, matching the printed chart.

### Composite codes

A grid cell holds a code, not a final action. The code resolves against the
rules at read time, which is what keeps the number of grids down to six.

| Code | Meaning |
|---|---|
| `H` `S` `P` | hit / stand / split, unconditional |
| `D` | double if allowed, else hit |
| `Ds` | double if allowed, else stand |
| `Ph` | split if DAS, else hit |
| `Pd` | split if DAS, else double |
| `Ps` | split if DAS, else stand |
| `Rh` | surrender if offered, else hit |
| `Rs` | surrender if offered, else stand |
| `Rp` | surrender if offered, else split |

This is the full vocabulary observed in the sourced data — eleven codes, no
others. `Pd` and `Ps` occur only in the single-deck pairs grids (4,4 v 5 and 6,
where hard 8 doubles; 9,9 v A under H17). `Rs` occurs at 1D/2D hard 17 v A and
1D pairs 7,7 v 10. `Rp` is 8,8 v A in the 4+ and 2D H17 grids.

`Rp` exists for 8,8 v A under H17 with late surrender, which today's
`basicStrategy.ts` already plays as surrender (`basicStrategy.ts:10`).

### Base grids

Six, keyed by deck class × dealer soft-17 rule:

```
decks: 1 | 2 | 4plus        soft17: h17 | s17
```

`4plus` covers 4, 6 and 8 decks as one chart, which is standard practice and
matches every published 4–8 deck chart in the repo.

### Rule resolution

Applied in order by the resolver, on top of the base grid:

1. **ENHC adjustment** — a rule, not a data layer. Against a dealer 10 or Ace
   only: a `D`/`Ds` cell demotes as if doubling were unavailable, and a
   `P`/`Ph`/`Pd`/`Ps` cell resolves instead on the corresponding hard or soft
   total row with both doubling and splitting unavailable. The single exception
   is `A,A` v 10, which still splits. No cells are stored for this.
2. **Early surrender override layer** — the only genuine extra data, and a short
   list: pairs `8,8` v 10 and v A; hard 5, 6, 7, 12, 13, 14, 15, 16, 17 v A;
   hard 14, 15, 16 v 10; hard 16 v 9. Hard 5–7 fall outside the rendered rows and
   appear as a footnote. Only consulted when `surrender === "early"`.
3. **Double restriction** — mechanical, no data. Under `9-11`, any `D` / `Ds` /
   `Dh` outside hard 9, 10, 11 demotes to its fallback; under `10-11`, outside
   hard 10 and 11. All soft doubles demote under both.
4. **Composite code resolution** — `Ds`/`Dh`/`D` demote when doubling is
   unavailable, `Ph` demotes when DAS is off, `Rh`/`Rs`/`Rp` demote when the
   table offers no surrender.

## Modules

### `lib/blackjack/strategyTables.ts`

Data only. The six base grids and the two override layers, laid out to read like
a printed chart the way `bjaH17Chart.ts` is, with a source citation per table and
per overridden cell. No logic.

### `lib/blackjack/strategyChart.ts`

Types, the code resolver, and the lookup everything else reads:

```ts
export type ChartCode = "H" | "S" | "P" | "D" | "Ds" | "Dh" | "Ph" | "Rh" | "Rs" | "Rp";
export type StrategySectionId = "pairs" | "soft" | "hard";

export interface StrategyChartRules {
  decks: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  surrender: "none" | "late" | "early";
  doubleRule: "any" | "9-11" | "10-11";
  europeanNoHoleCard: boolean;
}

/** The code after the override layers and double restriction, before composite resolution. */
export function chartCode(rules: StrategyChartRules, section: StrategySectionId, row: string, dealer: string): ChartCode;

/** The code resolved to what you actually do, plus the fallback it demoted from. */
export function chartCell(rules: StrategyChartRules, section: StrategySectionId, row: string, dealer: string): { action: Action; fallback?: Action; code: ChartCode };
```

### `lib/blackjack/basicStrategy.ts`

Reimplemented on `chartCell`. **Its exported signature does not change** —
`{ playerCards, dealerUpcard, rules, canSplit }` in, `{ action, fallback,
explanation }` out — so none of its nine consumers (`Drills.tsx`,
`FullShoeGame.tsx`, `shoeSimulation.ts`, `deviationEv.ts`, `deviations.ts`,
`countingTraining.ts`, `liveEv.ts`, and the two test files) need editing.

Behaviour it must preserve:

- `canSplit: false` falls through from the pair row to the hard or soft total row.
- Surrender and double are offered only on a two-card hand; three-card hands
  resolve on the hard/soft row with those codes demoted.
- `BlackjackRules` has no `surrender` or `europeanNoHoleCard` field. It keeps its
  `lateSurrender: boolean`, and the adapter maps it to `"late" | "none"`; ENHC
  defaults to false. Only the chart page constructs the wider
  `StrategyChartRules` directly.

## Deviations tab

Reads `deviationTrainingRows(rules)` — the existing resolver, unchanged — and
maps each catalog row's hand label onto a grid coordinate:

| Catalog label | Grid cell |
|---|---|
| `8`…`17` | `hard` row of the same name |
| `Soft 17` `Soft 18` `Soft 19` `Soft 20` | `soft` rows `A,6` `A,7` `A,8` `A,9` |
| `8,8` `9,9` | `pairs` rows of the same name |
| `10,10` | `pairs` row `T,T` |
| `Insurance` | no cell — rendered as a callout above the grid |

A cell with a deviation shows the departure action and its index (`S 0+`);
cells without one are muted. A test asserts every non-insurance catalog row maps
to exactly one real grid cell, so a label rename cannot silently drop a row.

The strategy tab uses the same map for its corner markers: a small marker on any
cell that has an index, with the index in the tooltip, and no index text in the
cell itself.

## Page and routing

- `components/StrategyChartPage.tsx` — rules panel plus `Tabs` (already in
  `ui.tsx`), replacing `StrategyReference` in `DynamicPage.tsx`'s page map.
- `components/ChartGrid.tsx` — one grid renderer, given rows, columns and a
  per-cell render function. Both tabs use it. Reuses the 44px cell sizing and
  mobile behaviour established for the H17 chart drill.
- `/reference/deviations` redirects to `/reference/basic-strategy` via
  `LEGACY_REDIRECTS`, and `DeviationReferencePage.tsx` is retired.

### What retiring the deviation page costs

That page carries more than a list of indices: a measured EV impact and
fires-per-100 per row, a plain-English `deviationSentence`, and the
`DEVIATION_RANKING_METADATA` methodology footnotes. A grid cell cannot hold all
of it. The chosen split is:

- **Into the cell:** departure action and index.
- **Into the cell's tooltip and its mobile tap-out:** EV impact with its 95%
  interval, fires-per-100, and the sentence.
- **Kept below the grid:** the methodology paragraphs and the widest-interval
  figure, verbatim.
- **Dropped:** the sortable table itself, its EV-order sort, and its text search.

Sorting 30-odd rows by EV is the one genuinely useful thing the grid cannot do.
If that matters, the fallback is the "grid plus table" layout that was offered
during design — the table component would be kept rather than deleted.

**Routing defect to fix in passing:** `lib/routes.ts` builds redirect routes as
`Object.keys(LEGACY_REDIRECTS).map((route) => [route])`, which produces a single
slug segment. Existing keys are single-segment so it works today, but
`"reference/deviations"` would generate a literal `["reference/deviations"]` and
break static generation. Change it to `route.split("/")`.

### Rules state

The page opens on `storage.settings()` — `decks`, `dealerHitsSoft17`,
`doubleAfterSplit`, `lateSurrender` are all already there — and holds changes in
local component state. It does not write back to `Settings`, so browsing a
single-deck chart cannot silently retune the drills. `doubleRule` and ENHC have
no `Settings` field and default to `"any"` / false.

## Testing

The parity gate is what makes it safe to put the whole app on these tables.

1. **Parity pin.** For 6 decks H17 and 6 decks S17, both with DAS and late
   surrender, the new tables must reproduce today's `getBasicStrategyDecision`
   across every hand × upcard, including the `canSplit: false` fall-through.
   Written first, against the current function, before it is replaced. Every
   difference is adjudicated individually and annotated with which side was
   wrong; none are accepted silently.

   This is also the gate on `deviationRanking.generated.json`. Those EV figures
   were measured against the current basic strategy, and `deviationTransition`
   calls it to classify rows as live or dormant. If parity holds on these two
   profiles, the committed ranking stays valid and needs no regeneration. If a
   real difference is found and accepted, the ranking must be regenerated in the
   same change.

2. **In-repo oracle.** `bjaH17Chart.ts` is an audited transcription of a printed
   4–8 deck H17 chart. Its non-index cells must equal the `4plus`/`h17` grid
   resolved with DAS and late surrender. The pair translation is stated
   precisely: `Y` means the pairs cell resolves to split; `Y/N` means its code is
   `Ph`; `N` means the code is not `P`/`Ph`/`Rp` *and* the cell resolves to the
   same action as the corresponding hard or soft total row. Index cells are
   excluded: their basic
   play is only knowable through `deviationTransition`, which calls basic
   strategy, so comparing them would be circular.

3. **Table integrity.** Every grid has the right rows and exactly 10 columns,
   every code is in the vocabulary, and the soft section contains no bare `D`.

4. **Resolver units.** Each demotion path: no-DAS, no-surrender, both double
   restrictions, and the interaction where a restricted double demotes a `Ds` to
   stand rather than hit.

5. **Deviation mapping.** No orphan catalog rows, no cell claimed twice.

6. **1D/2D cross-check.** Each single- and double-deck grid checked cell by cell
   against its cited published reference, as an explicit test listing the cells
   that differ from the 4+ chart.

## Risks

- **Parity fails on a real cell.** Most likely in the surrender rows, where the
  current function has hand-written precedence for 8,8 and for 15/16. Handled by
  test 1: adjudicate, annotate, and regenerate the ranking if the change is
  accepted.
- **1D/2D data quality.** These grids are the least-reviewed data in the change
  and have no in-repo oracle. Mitigated by citing a specific published source per
  table and by test 6 making the differences explicit rather than implicit.
- **Early surrender is the weakest-value item.** Almost no live game offers it,
  and it is a whole extra data layer. It is sequenced last precisely so it can be
  cut without disturbing anything else.

## Build order

1. `strategyChart.ts` types and resolver, with the parity pin written against the
   existing function (tests 1, 3, 4).
2. The `4plus` H17 and S17 grids; parity pin and the `bjaH17Chart` oracle pass
   (test 2).
3. Reimplement `basicStrategy.ts` on the tables; full suite green with the nine
   consumers untouched.
4. `ChartGrid.tsx` and `StrategyChartPage.tsx` strategy tab; route swap and the
   `lib/routes.ts` segment fix.
5. Deviation tab, mapping and callout (test 5); retire
   `DeviationReferencePage.tsx` and add the redirect.
6. 1D and 2D grids (test 6).
7. Double restrictions and ENHC override layer.
8. Early surrender override layer — cuttable.
