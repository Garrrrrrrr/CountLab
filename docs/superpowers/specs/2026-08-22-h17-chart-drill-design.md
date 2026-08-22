# H17 Chart Drill — design

**Date:** 2026-08-22
**Status:** approved design, not yet implemented
**Source chart:** `BJA_H17.pdf` — Blackjack Apprenticeship "H17 Deviation Chart" (2018)

## Goal

A drill where the user reproduces the entire H17 deviation chart from memory by
typing into a grid: one keystroke per cell, Tab or Enter to advance, the whole
320-cell chart in one pass. Deviation cells require the index and its direction
(`4+`, `-1-`), not just a letter.

This is a *chart recall* drill. It is deliberately not the flashcard shape of the
two drills already in `components/Drills.tsx`, which present one hand at a time.

## Scope

In scope: the four printed tables (pair splitting, soft totals, hard totals, late
surrender), a fill-in grid with keyboard entry, two feedback modes, grading, and
recording finished runs into the existing statistics system.

Out of scope:

- The chart's `INSURANCE OR EVEN MONEY: TAKE AT 3+` line. It is a single footer
  fact, not a table cell, and the requested key grammar has no insurance keys. It
  renders as static text below the grid.
- Any change to the existing Deviations drill, the deviation reference page, or
  `deviationRanking`. The Pro catalogs stay the source of truth for
  those; this chart is a separate artifact used only by this drill.
- Rules settings. The drill ignores `decks` / `dealerHitsSoft17` /
  `doubleAfterSplit` / `lateSurrender` from `Settings`: it is a fixed printed
  chart, H17 by definition, and its `Y/N` cells carry the DAS condition inline.

## Chart data

New module `blackjack/lib/blackjack/bjaH17Chart.ts`.

Transcribed from the PDF's text layer with positions and span colours — index
cells are the ones printed in `#ef4850` — rather than read by eye. The module
header records that derivation.

```ts
export type ChartToken =
  | { kind: "action"; value: "Y" | "N" | "Y/N" | "H" | "S" | "D" | "Ds" | "SUR" }
  | { kind: "index"; value: number; when: "atOrAbove" | "atOrBelow" };

export type ChartSectionId = "pairs" | "soft" | "hard" | "surrender";

export interface ChartSection {
  id: ChartSectionId;
  label: string;              // "Pair splitting", …
  rows: string[];             // "A,A", "T,T", … in printed order
  dealers: string[];          // ["2","3","4","5","6","7","8","9","10","A"]
  cells: Record<string, ChartToken>;  // key: `${row}v${dealer}`
}
```

`4+` is `{ kind: "index", value: 4, when: "atOrAbove" }`; `-1-` is
`{ value: -1, when: "atOrBelow" }`. The chart's legend notes that `0-` and `0+`
mean *any negative / any positive running count*; that distinction affects only
explanatory copy, not the token the user types, so it is carried as a comment on
the module and surfaced in the results panel's footnote.

Blank cells in the late-surrender table are stored as `{ action: "N" }`, because
the agreed grammar has the user type `n` in them. An empty cell therefore always
means *unanswered*, never *answered "no"*.

### Verified contents

Dealer upcards run `2 3 4 5 6 7 8 9 10 A` across every table.

**Pair splitting** (100 cells)

| | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,A | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| T,T | N | N | 6+ | 5+ | 4+ | N | N | N | N | N |
| 9,9 | Y | Y | Y | Y | Y | N | Y | Y | N | N |
| 8,8 | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| 7,7 | Y | Y | Y | Y | Y | Y | N | N | N | N |
| 6,6 | Y/N | Y | Y | Y | Y | N | N | N | N | N |
| 5,5 | N | N | N | N | N | N | N | N | N | N |
| 4,4 | N | N | N | Y/N | Y/N | N | N | N | N | N |
| 3,3 | Y/N | Y/N | Y | Y | Y | Y | N | N | N | N |
| 2,2 | Y/N | Y/N | Y | Y | Y | Y | N | N | N | N |

**Soft totals** (80 cells)

| | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,9 | S | S | S | S | S | S | S | S | S | S |
| A,8 | S | S | 3+ | 1+ | 0- | S | S | S | S | S |
| A,7 | Ds | Ds | Ds | Ds | Ds | S | S | H | H | H |
| A,6 | 1+ | D | D | D | D | H | H | H | H | H |
| A,5 | H | H | D | D | D | H | H | H | H | H |
| A,4 | H | H | D | D | D | H | H | H | H | H |
| A,3 | H | H | H | D | D | H | H | H | H | H |
| A,2 | H | H | H | D | D | H | H | H | H | H |

**Hard totals** (100 cells)

| | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| 17 | S | S | S | S | S | S | S | S | S | S |
| 16 | S | S | S | S | S | H | H | 4+ | 0+ | 3+ |
| 15 | S | S | S | S | S | H | H | H | 4+ | 5+ |
| 14 | S | S | S | S | S | H | H | H | H | H |
| 13 | -1- | S | S | S | S | H | H | H | H | H |
| 12 | 3+ | 2+ | 0- | S | S | H | H | H | H | H |
| 11 | D | D | D | D | D | D | D | D | D | D |
| 10 | D | D | D | D | D | D | D | D | 4+ | 3+ |
| 9 | 1+ | D | D | D | D | 3+ | H | H | H | H |
| 8 | H | H | H | H | 2+ | H | H | H | H | H |

**Late surrender** (40 cells; blank in print, stored and typed as `N`)

| | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| 17 | N | N | N | N | N | N | N | N | N | SUR |
| 16 | N | N | N | N | N | N | 4+ | -1- | SUR | SUR |
| 15 | N | N | N | N | N | N | N | 2+ | 0- | -1+ |
| 14 | N | N | N | N | N | N | N | N | N | N |

320 cells total, 26 of them indices (3 pairs, 4 soft, 14 hard, 5 surrender).

Note that the chart as printed makes 15 vs 10 surrender at TC ≤ 0 (surrender
table `0-`) but stand at TC ≥ +4 (hard table `4+`), leaving +1 to +3 as a hit.
That is reproduced exactly as printed; the drill grades against the chart, not
against an independent EV calculation.

## Cell grammar

New module `blackjack/lib/blackjack/chartEntry.ts` — pure, no React, unit tested.

Each cell holds a **buffer** (the raw keys typed so far). A reducer consumes one
key and returns the next buffer plus a disposition:

```ts
type Disposition = "pending" | "commit" | "ignore";
export function feedKey(section: ChartSectionId, buffer: string, key: string):
  { buffer: string; disposition: Disposition };
export function parseEntry(section: ChartSectionId, buffer: string): ChartToken | null;
```

`commit` means the buffer is now an unambiguous token and focus advances by
itself. `pending` means the buffer is a legal prefix and focus stays. `ignore`
means the key is not in the section's alphabet and nothing changes — no error
state, no beep.

| Section | Keys | Commits immediately | Holds for a second key |
|---|---|---|---|
| Pairs | `y` `n` | `n` → N | `y` → Y, or `y`+`n` → Y/N |
| Soft | `h` `s` `d` | `h` → H, `s` → S | `d` → D, or `d`+`s` → Ds |
| Hard | `h` `s` `d` | all three | — |
| Surrender | `r` `n` | `r` → SUR, `n` → N | — |

Index entry is available in every section: an optional leading `-`, then one or
two digits, then a terminating `+` or `-` which commits. `4+`, `0-`, `0+`, `6+`,
`-1-`, `-1+` are all legal. A leading `+` is ignored — the chart never prints
one.

Only `y` (pairs) and `d` (soft) hold, and both resolve on Tab or Enter. There are
no timers anywhere in the grammar.

Backspace deletes the last character of the buffer; on an already-empty cell it
moves focus to the previous cell without clearing it.

A buffer that is not a legal token when the run is graded — a bare `4` with no
sign, say — is kept as raw text, grades as wrong, and is shown in the results as
what the user typed. Entry is case-insensitive.

## Grid component

New `blackjack/components/H17ChartDrill.tsx`.

Renders one `<table>` per active section: dealer upcards as the header row, hand
labels as a sticky first column, and one focusable cell per data position. Cells
are real `<input>` elements (so mobile keyboards and screen readers behave) with
`autoComplete="off"`, `inputMode="text"`, and `aria-label` of the form
`Hard 16 versus 9`; keystrokes are intercepted in `onKeyDown` and routed through
`feedKey`, so the input's own value is always the committed buffer.

Navigation:

- **Tab / Enter** — commit the buffer and advance. Wraps from end of row to start
  of the next row, and from the last cell of a section into the first cell of the
  next section when the whole chart is active. Stops on the final cell.
- **Shift+Tab** — back one cell, same wrapping in reverse.
- **Arrow keys** — move within the current section's table without committing.
- **Click** — focuses that cell.

Label and header cells are not focusable, so Tab never leaves the grid.

Controls above the grid, using the existing `Select` from `components/ui.tsx`:

- **Section** — Whole chart (default) · Pair splitting · Soft totals · Hard
  totals · Late surrender.
- **Feedback** — Check as I go (default) · Grade at the end.

Plus a **Submit** button, always enabled, and **End drill** matching the other
drills' affordance.

## Feedback and grading

*Check as I go*: a cell turns green or red the moment it commits, and a red cell
shows the chart's token beneath the user's entry.

*Grade at the end*: cells stay neutral until Submit, then colour all at once.

Grading compares the parsed token to the chart token — value and, for indices,
direction. `Y/N` must be entered as `y`+`n`; `Ds` as `d`+`s`.

Submitting early is allowed; unanswered cells count as wrong and are listed
separately as skipped rather than as mistakes. Results show overall accuracy,
per-section accuracy, elapsed time, and every miss as
`Hard 16 vs 9 — you: S · chart: 4+`, reusing the `Mistake` shape and
`SessionSummary` component the other drills already use.

## Persistence, statistics, routing

- `DrillType` in `lib/statistics/storage.ts` gains `"H17 Chart"`. That union is
  the only place drill types are enumerated, so the statistics page, streaks,
  Supabase sync, and CSV export pick the new type up without further changes.
- A finished run calls the same `record(...)` helper the other drills use, with
  `questions` = the active cell count, `categories` keyed by the four section
  labels, and `streak` = the longest run of consecutive correct cells in chart
  order.
- Mid-run state auto-saves through the existing `useDrillProgress` /
  `loadDrillProgress` pair: `{ entries, section, feedback, elapsedMs }`, where
  `entries` is `Record<cellKey, string>` of raw buffers. A reload resumes exactly
  where the user left off.
- New route `training/h17-chart` added to `ROUTES` in `lib/routes.ts` and to the
  component map in `components/DynamicPage.tsx`, with a card on the training
  index and a `drillLinks` entry.
- Nav item in `components/AppShell.tsx` under Training.
- `h17_chart` added to `FeatureId` / `FEATURES` in `lib/analytics/config.ts`.
  Analytics stays coarse: `drill_started` on mount and one submit event carrying
  overall and per-section accuracy. No per-cell events — 320 of them per run
  would swamp the queue.

## Attribution

The indices and actions are facts and are implemented as data. The page credits
Blackjack Apprenticeship as the source chart, `THIRD_PARTY_NOTICES.md` gains an
entry naming the PDF, and the grid is styled to CountLab's dark theme rather than
reproducing the source chart's own visual design.

## Testing

`npm test` (Vitest) covers the two pure modules:

- `chartEntry.test.ts` — each section's alphabet; immediate vs held commits;
  `y`+`n` → Y/N and `d`+`s` → Ds; index parsing across `4+`, `0-`, `0+`, `6+`,
  `-1-`, `-1+`; ignored keys leave the buffer untouched; backspace behaviour;
  illegal buffers parse to `null`.
- `bjaH17Chart.test.ts` — section dimensions and a 320-cell total; all 26 index
  cells asserted by value and direction; spot checks on the cells most likely to
  be mis-transcribed (surrender 15 v 10 = `0-`, hard 15 v 10 = `4+`, 9,9 v 7 =
  `N`, T,T v 4 = `6+`, 16 v 9 surrender = `-1-`); a full text snapshot of the
  chart so any later edit shows as a readable diff; and an assertion that every
  token used in a section is inside that section's grammar alphabet, which ties
  the data and the parser together.

The repo has no component tests, so tab order, wrapping across sections, the
sticky column, and the mobile dock are verified by driving the page in a browser.

Verification before completion: `npm test`, `npm run lint`, `npm run build`.

## Mobile

Each table scrolls horizontally inside its own container with the hand-label
column pinned. A token pad in the existing `MobileActionDock` offers `Y` `N`
`Y/N` `H` `S` `D` `Ds` `SUR`, the digits, and `+` `-`, so a phone run never needs
the OS alphabetic keyboard. The dock's contents switch to the active section's
alphabet.

## Files

New:

- `blackjack/lib/blackjack/bjaH17Chart.ts`
- `blackjack/lib/blackjack/bjaH17Chart.test.ts`
- `blackjack/lib/blackjack/chartEntry.ts`
- `blackjack/lib/blackjack/chartEntry.test.ts`
- `blackjack/components/H17ChartDrill.tsx`

Edited:

- `blackjack/lib/statistics/storage.ts` — `DrillType`
- `blackjack/lib/routes.ts` — `ROUTES`
- `blackjack/components/DynamicPage.tsx` — route map, training card, `drillLinks`
- `blackjack/components/AppShell.tsx` — nav item
- `blackjack/lib/analytics/config.ts` — `FeatureId`, `FEATURES`
- `THIRD_PARTY_NOTICES.md` — source attribution
