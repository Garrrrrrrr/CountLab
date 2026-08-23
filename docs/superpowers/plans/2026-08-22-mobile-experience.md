# Mobile Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CountLab usable on a phone — analysis pages that open on answers rather than forms, a chart drill that admits what it hides, and no control or text below touch thresholds.

**Architecture:** Almost entirely layout. Viewport-dependent *content* is handled with Tailwind's `sm:` visibility classes rather than JavaScript, because this is a static export with no viewport at prerender and render-time `matchMedia` would mismatch hydration. The one place that genuinely needs JS — collapsing sections on mount — uses a single `useLayoutEffect` that runs once. `/cvcx` already implements the target pattern, so Phase C applies an existing in-repo pattern rather than inventing one.

**Tech Stack:** Next.js 15 static export, React 19, Tailwind 3, TypeScript 5.9 (strict), Vitest 3 (no config, Node environment, no jsdom).

**Spec:** `docs/superpowers/specs/2026-08-22-mobile-experience-design.md`

## Global Constraints

- **Working directory is `blackjack/`** for all commands. Repo root is `CountLab/`.
- **Branch:** `mobile-experience` (created; spec committed as `9e1357c`). Do not commit to `main`.
- **No new dependencies.** No chart library changes — the charts measured fine.
- **No behaviour changes.** No calculation, default value, persisted shape, analytics event, or Supabase schema may change. Phase C in particular moves JSX only.
- **No desktop regression.** Every change is width-gated or an improvement at all widths. Verify at 390, 768 and 1280 before each commit.
- **Never decide layout from `matchMedia` during render.** Static export: the server has no viewport. Use `sm:` classes for content, or a mount-time `useLayoutEffect` for DOM state.
- **No jsdom, no component-test harness.** Extract pure logic and test that; layout is gated by the audit script.
- **Audit gate:** `docs/superpowers/mobile-audit.md`. At 390×844 a page passes with `hOverflow: false`, `overflow: 0`, `smallTap: 0`, `tinyText: 0`.
- **Verification per task:** `npm test`, `npm run lint` (runs `--max-warnings=0`), `npm run build`.

---

## File Structure

| File | Change |
|---|---|
| `blackjack/lib/blackjack/railScroll.ts` | **New.** Pure rail-scroll geometry: which fades to show, how many columns remain hidden. |
| `blackjack/lib/blackjack/railScroll.test.ts` | **New.** Tests for the above. |
| `blackjack/components/H17ChartDrill.tsx` | Legend compaction + touch route; rail affordances; cell height. |
| `blackjack/components/ui.tsx` | `PinnedStat` label size; `Section` collapse-on-mobile opt-in. |
| `blackjack/components/CvcxLab.tsx` | Control heights; apply collapse-on-mobile. |
| `blackjack/components/AnalyticsConsent.tsx` | Mobile layout. |
| `blackjack/components/SessionSimulator.tsx` | Adopt `Section` + sticky `PinnedStat`. |
| `blackjack/components/BankrollRecommender.tsx` | Same. |
| `blackjack/components/ScenarioComparison.tsx` | Same. |
| `blackjack/components/TripPlanner.tsx` | Same. |
| `docs/superpowers/mobile-audit.md` | Record post-change results. |

---

# Phase A — cross-cutting fixes

## Task 1: H17 legend — compact, and correct on touch

The legend consumes ~400px at 390px wide, and teaches `Shift + Y` / `Shift + D`, chords no touch keyboard can produce. The dock already offers `Y/N` and `Ds` buttons, so touch users are being taught the wrong thing.

Solved with `sm:` visibility, **not** JavaScript: both variants render, CSS picks one. That keeps the static export's HTML viewport-neutral.

**Files:**
- Modify: `blackjack/components/H17ChartDrill.tsx` (the `<ul>` legend block and the intro paragraph)

**Interfaces:**
- Consumes: `sectionLegend(section.id)` from `@/lib/blackjack/chartEntry`, which already returns `{ keys, combo, shows, meaning }`. `combo: true` marks exactly the two chord entries. No grammar change.
- Produces: nothing.

- [ ] **Step 1: Replace the legend list**

Find the `<ul className="mb-4 mt-2 flex flex-wrap ...">` legend block. Replace the whole `<ul>`…`</ul>` with:

```tsx
            <ul className="mb-4 mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-zinc-500 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
              {sectionLegend(section.id).map((entry) => (
                <li key={entry.keys.join("+")} className="inline-flex min-w-0 items-center gap-1.5">
                  {entry.combo ? (
                    <>
                      {/* Touch has no Shift key; the dock's own button is the route. */}
                      <kbd className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400 sm:hidden">
                        {entry.shows}
                      </kbd>
                      <span className="hidden shrink-0 items-center gap-1.5 sm:inline-flex">
                        {entry.keys.map((key, position) => (
                          <span key={key} className="inline-flex items-center gap-1.5">
                            {position > 0 && <span aria-hidden="true">+</span>}
                            <kbd className="rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">{key}</kbd>
                          </span>
                        ))}
                      </span>
                    </>
                  ) : (
                    <kbd className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">
                      {entry.keys[0]}
                    </kbd>
                  )}
                  <span className="text-zinc-600" aria-hidden="true">→</span>
                  <span className="truncate font-mono text-zinc-300">{entry.shows}</span>
                  <span className="hidden truncate sm:inline">({entry.meaning})</span>
                </li>
              ))}
              <li className="col-span-2 inline-flex min-w-0 items-center gap-1.5">
                <kbd className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">0–9</kbd>
                <span aria-hidden="true">then</span>
                <kbd className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">+</kbd>
                <span aria-hidden="true">or</span>
                <kbd className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">−</kbd>
                <span className="text-zinc-600" aria-hidden="true">→</span>
                <span className="truncate font-mono text-zinc-300">a true count, e.g. 4+</span>
                <span className="hidden sm:inline">(deviate at this count or beyond)</span>
              </li>
            </ul>
```

On a phone this is a two-column grid of key → token pairs with the prose meanings hidden; at `sm` and up it is the existing inline flow with meanings and the real chord.

- [ ] **Step 2: Make the intro paragraph's Shift mention desktop-only**

In the same file, the intro paragraph tells the reader to hold Shift. Wrap that clause so touch users are not instructed to use a key they lack. Replace the sentence fragment beginning `Each table&rsquo;s keys are listed above it; hold` and ending with `instead of typing two keys.` with:

```tsx
          Each table&rsquo;s keys are listed above it.
          <span className="hidden sm:inline">
            {" "}Hold{" "}
            <kbd className="rounded border border-white/15 bg-black/25 px-1 py-px font-mono text-[.68rem]">Shift</kbd>
            {" "}for the two-part answers (Y/N, Ds) instead of typing two keys.
          </span>
          <span className="sm:hidden"> Use the keypad below the chart for two-part answers.</span>
```

- [ ] **Step 3: Verify**

```bash
npm run lint && npm run build
```

Expected: both pass. Then serve and measure at 390×844 per `docs/superpowers/mobile-audit.md`. The legend block should be well under 200px tall and no `Shift` should be visible on the page at that width.

- [ ] **Step 4: Commit**

```bash
git add components/H17ChartDrill.tsx
git commit -m "fix: compact the H17 legend and stop teaching Shift on touch

The legend ran past seven lines at 390px and prominently taught
Shift+Y, a chord no touch keyboard can produce, while the dock already
offered a Y/N button. Both variants render and CSS picks one, so the
static export's HTML stays viewport-neutral."
```

---

## Task 2: Rail scroll geometry (pure)

The affordances in Task 3 need to know whether to fade each edge and how many columns remain hidden. That is arithmetic, it is easy to get subtly wrong, and it is the one genuinely testable unit in this plan — so it gets tests before Task 3 consumes it.

**Files:**
- Create: `blackjack/lib/blackjack/railScroll.ts`
- Test: `blackjack/lib/blackjack/railScroll.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `railState(m: RailMetrics): RailState` where
  `RailMetrics = { scrollLeft: number; scrollWidth: number; clientWidth: number; columnWidth: number }`
  and `RailState = { scrollable: boolean; atStart: boolean; atEnd: boolean; hiddenRight: number }`.

- [ ] **Step 1: Write the failing test**

Create `blackjack/lib/blackjack/railScroll.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { railState } from "./railScroll";

// The measured H17 case: a 552px table in a 332px rail, ten 44px columns.
const h17 = { scrollWidth: 552, clientWidth: 332, columnWidth: 44 };

describe("railState", () => {
  it("reports a rail that fits as not scrollable", () => {
    const s = railState({ scrollLeft: 0, scrollWidth: 300, clientWidth: 332, columnWidth: 44 });
    expect(s.scrollable).toBe(false);
    expect(s.atStart).toBe(true);
    expect(s.atEnd).toBe(true);
    expect(s.hiddenRight).toBe(0);
  });

  it("at rest shows no start fade and counts the columns off-screen", () => {
    const s = railState({ ...h17, scrollLeft: 0 });
    expect(s.scrollable).toBe(true);
    expect(s.atStart).toBe(true);
    expect(s.atEnd).toBe(false);
    // 220px hidden across 44px columns.
    expect(s.hiddenRight).toBe(5);
  });

  it("scrolled to the end shows no end fade", () => {
    const s = railState({ ...h17, scrollLeft: 220 });
    expect(s.atStart).toBe(false);
    expect(s.atEnd).toBe(true);
    expect(s.hiddenRight).toBe(0);
  });

  it("tolerates sub-pixel scroll positions at both extremes", () => {
    // Browsers report fractional scrollLeft; a strict === would flicker the fade.
    expect(railState({ ...h17, scrollLeft: 0.4 }).atStart).toBe(true);
    expect(railState({ ...h17, scrollLeft: 219.6 }).atEnd).toBe(true);
  });

  it("counts partially visible columns as still hidden", () => {
    // 100px scrolled leaves 120px hidden: two full columns and part of a third.
    expect(railState({ ...h17, scrollLeft: 100 }).hiddenRight).toBe(3);
  });

  it("never reports a negative hidden count when over-scrolled", () => {
    expect(railState({ ...h17, scrollLeft: 400 }).hiddenRight).toBe(0);
  });

  it("does not divide by zero when the column width is unknown", () => {
    const s = railState({ ...h17, scrollLeft: 0, columnWidth: 0 });
    expect(s.hiddenRight).toBe(0);
    expect(s.scrollable).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run lib/blackjack/railScroll.test.ts
```

Expected: FAIL — cannot resolve `./railScroll`.

- [ ] **Step 3: Write the implementation**

Create `blackjack/lib/blackjack/railScroll.ts`:

```ts
/**
 * Geometry for a horizontally scrolling rail, so a table can say what it is
 * hiding instead of hiding it silently.
 *
 * Pure and unit-tested because the edge cases bite in ways that are hard to
 * see: browsers report fractional `scrollLeft`, so exact comparisons make an
 * edge fade flicker, and an unconditional fade sits over the last column at the
 * end of the rail and reads as a rendering fault.
 */

export interface RailMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  /** Width of one column, used to turn hidden pixels into a column count. */
  columnWidth: number;
}

export interface RailState {
  scrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
  /** Columns still off-screen to the right; a partly visible column counts. */
  hiddenRight: number;
}

/** Browsers report fractional scroll offsets; compare with a tolerance. */
const EPSILON = 1;

export function railState({ scrollLeft, scrollWidth, clientWidth, columnWidth }: RailMetrics): RailState {
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  const clamped = Math.min(Math.max(scrollLeft, 0), maxScroll);
  const remaining = maxScroll - clamped;
  return {
    scrollable: maxScroll > EPSILON,
    atStart: clamped <= EPSILON,
    atEnd: remaining <= EPSILON,
    hiddenRight: columnWidth > 0 ? Math.ceil(remaining / columnWidth) : 0,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run lib/blackjack/railScroll.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/blackjack/railScroll.ts lib/blackjack/railScroll.test.ts
git commit -m "feat: add pure rail scroll geometry

Fractional scrollLeft makes exact edge comparisons flicker, and an
unconditional end fade sits over the last column and reads as a
rendering fault. Both are cheap to get wrong and cheap to test."
```

---

## Task 3: H17 column affordances and cell height

The rail keeps scrolling — it stops being silent about it. Cell height rises to the touch minimum at the same time, because both change the table's width budget and splitting them would mean measuring twice.

**Files:**
- Modify: `blackjack/components/H17ChartDrill.tsx`

**Interfaces:**
- Consumes: `railState` from `@/lib/blackjack/railScroll` (Task 2).
- Produces: nothing.

- [ ] **Step 1: Track rail state per section**

Add the import:

```tsx
import { railState, type RailState } from "@/lib/blackjack/railScroll";
```

Inside the component, add state and a measuring callback. Keyed by section id because each section renders its own rail:

```tsx
  const [rails, setRails] = useState<Record<string, RailState>>({});
  const measureRail = useCallback((id: string, node: HTMLDivElement | null) => {
    if (!node) return;
    const firstCell = node.querySelector("tbody td");
    setRails((current) => ({
      ...current,
      [id]: railState({
        scrollLeft: node.scrollLeft,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        columnWidth: firstCell ? firstCell.getBoundingClientRect().width : 0,
      }),
    }));
  }, []);
```

- [ ] **Step 2: Wrap each rail and render the affordances**

Replace the rail wrapper `<div className="-mx-1 overflow-x-auto px-1">` with a positioned wrapper carrying the fade and the hidden-column count. `section.id` is in scope inside the sections map:

```tsx
            <div className="relative">
              <div
                ref={(node) => measureRail(section.id, node)}
                onScroll={(event) => measureRail(section.id, event.currentTarget)}
                className="-mx-1 snap-x snap-mandatory overflow-x-auto px-1"
              >
```

Close it after the existing `</table>` with the affordances:

```tsx
              </div>
              {rails[section.id]?.scrollable && !rails[section.id]?.atEnd && (
                <>
                  {/* Painted only while columns remain, or it covers the last
                      column at the end of the rail and looks like a bug. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#0c100d] to-transparent"
                  />
                  <p className="pointer-events-none absolute bottom-1 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[.65rem] font-medium text-zinc-300">
                    {rails[section.id].hiddenRight} more →
                  </p>
                </>
              )}
            </div>
```

- [ ] **Step 3: Snap columns and raise cell height**

On the `<td>` wrapping each input, add `snap-start` so a swipe lands on a dealer column rather than mid-cell:

```tsx
                          <td key={dealer} className="snap-start">
```

On the cell `<input>`, change `h-9` to `h-11` (36px → 44px):

```tsx
                              className={`h-11 w-full min-w-[2.4rem] rounded-md border bg-black/25 text-center font-mono text-zinc-100 outline-none ${cellTone(cell, index)}`}
```

To stop the table getting wider — which would worsen what the rail hides — reduce the sticky row-label column's padding from `px-2` to `px-1.5` on both the `<th scope="row">` and the header `<th>`.

- [ ] **Step 4: Verify**

```bash
npm test && npm run lint && npm run build
```

Then serve and measure at 390×844. Expected: cells report 44px tall; swiping the rail snaps to columns; the fade and "N more →" appear at rest and disappear once scrolled to the end. Confirm at 1280 that the fade never appears, since the table fits.

- [ ] **Step 5: Commit**

```bash
git add components/H17ChartDrill.tsx
git commit -m "feat: make the H17 rail say what it is hiding

Each table was 552px in a 332px rail -- 220px, four dealer upcards --
hidden with no indication. Adds a scroll-position-driven edge fade, a
remaining-column count, and column snapping, and raises cells from 36px
to the 44px touch minimum."
```

---

## Task 4: `PinnedStat` label size and tiny-text audit

**Files:**
- Modify: `blackjack/components/ui.tsx:239`

**Interfaces:** none.

- [ ] **Step 1: Raise the label size**

In `PinnedStat`, the label is `text-[.6rem]` — 9.6px. Change to `text-[.7rem]` (11.2px):

```tsx
      <p className="truncate text-[.7rem] font-medium uppercase tracking-[.08em] text-zinc-500">
        {label}
      </p>
```

Leave the `sub` line at `text-[.65rem]`? No — that is 10.4px and also fails. Raise it too:

```tsx
      <p className="truncate text-[.7rem] font-medium text-emerald-400">{sub}</p>
```

- [ ] **Step 2: Audit the remaining sub-11px usages**

```bash
grep -rnE 'text-\[\.(5[0-9]|6[0-8])rem\]' components
```

For each hit, decide individually and do **not** blanket-raise:
- **Raise** anything carrying a number, label, or prose a user must read.
- **Leave** keycap glyphs and decorative badges at `text-[.68rem]` (10.9px); they are legible as glyphs and raising them damages dense layouts for no gain.

Record the decision for each in the commit message.

- [ ] **Step 3: Verify**

```bash
npm run lint && npm run build
```

Then measure `/cvcx` at 390×844: `tinyText` should drop from 8 toward 0.

- [ ] **Step 4: Commit**

```bash
git add components/ui.tsx
git commit -m "fix: raise PinnedStat label and sub text above 11px

Both were under the readable floor at 9.6px and 10.4px, and PinnedStat
is where most of the sub-11px usages in components/ resolve. Keycap
glyphs are deliberately left at 10.9px: they are legible as glyphs and
raising them costs dense layouts for nothing."
```

---

## Task 5: CVCX control heights

**Files:**
- Modify: `blackjack/components/CvcxLab.tsx:112-114`

**Interfaces:** none.

- [ ] **Step 1: Add the touch minimum**

The ½X, 2X and Reset buttons are `px-3 py-1.5` with no minimum height, measuring 30px. Add `min-h-11` to each of the three:

```tsx
          <button type="button" onClick={() => onScale(0.5)} className="min-h-11 rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">½X</button>
          <button type="button" onClick={() => onScale(2)} className="min-h-11 rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">2X</button>
          <button type="button" onClick={onReset} className="min-h-11 rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">Reset</button>
```

- [ ] **Step 2: Sweep the rest of the page**

Measure `/cvcx` at 390×844 with the audit script. For every entry in `smallTapSample`, add `min-h-11` (and `min-w-11` for icon-only controls). Repeat until `smallTap` is 0.

- [ ] **Step 3: Verify**

```bash
npm run lint && npm run build
```

Expected: pass, and `/cvcx` reports `smallTap: 0`.

- [ ] **Step 4: Commit**

```bash
git add components/CvcxLab.tsx
git commit -m "fix: raise CVCX controls to the 44px touch minimum

The scale and reset controls measured 30px tall."
```

---

## Task 6: Consent banner on mobile

It renders about 490px tall on an 844px screen — roughly 40% of the viewport — because `AnalyticsConsent.tsx:32` caps at `min(80svh,30rem)` and the choices stack full-width below `sm`.

**Files:**
- Modify: `blackjack/components/AnalyticsConsent.tsx:32-39`

**Interfaces:** none.

- [ ] **Step 1: Tighten the container**

Change the height cap so it cannot take a third of a phone screen:

```tsx
    <aside aria-label="Analytics privacy choices" className="fixed inset-x-3 bottom-[calc(.75rem+env(safe-area-inset-bottom))] z-[100] mx-auto max-h-[min(45svh,30rem)] max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur sm:p-5">
```

- [ ] **Step 2: Shorten the copy on small screens**

Keep the full explanation at `sm` and above; show a shorter version below it. Replace the body paragraph with:

```tsx
      <p className="mt-1 text-sm leading-6 text-zinc-400">
        <span className="sm:hidden">
          CountLab uses privacy-minimised analytics to improve training. It never records
          passwords, email addresses, notes, or exact bankrolls.
        </span>
        <span className="hidden sm:inline">
          CountLab uses first-party, privacy-minimized analytics to improve training. It never
          records passwords, email addresses, notes, exact bankrolls, or advertising identifiers.
        </span>
      </p>
```

- [ ] **Step 3: Put the choices side by side**

Both choices must stay equally prominent — this is a consent surface, and making the decline harder to reach to save height is not acceptable. Side by side, equal width:

```tsx
      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button className="w-full sm:w-auto" onClick={() => choose(true)}>Allow analytics</Button>
        <GhostButton className="w-full sm:w-auto" onClick={() => choose(false)}>Essential storage only</GhostButton>
```

- [ ] **Step 4: Verify**

```bash
npm run lint && npm run build
```

Then at 390×844 confirm the banner is under 280px tall (a third of the viewport) and both buttons are fully visible without scrolling inside it, with equal width and both at least 44px tall.

- [ ] **Step 5: Commit**

```bash
git add components/AnalyticsConsent.tsx
git commit -m "fix: stop the consent banner eating 40% of a phone screen

Capped at 45svh instead of 80svh, with shorter copy and side-by-side
choices below sm. Both choices keep equal width and prominence: this is
a consent surface, so saving height by demoting the decline is not on
the table."
```

---

# Phase B — CVCX default open state

## Task 7: `Section` collapse-on-mobile

**Files:**
- Modify: `blackjack/components/ui.tsx` (the `Section` component, lines 189-226)

**Interfaces:**
- Produces: `Section` gains an optional `collapseOnMobile?: boolean` prop. Task 8 consumes it.

**Background — why this needs care.** `Section`'s `open` is documented at `ui.tsx:185-188` as *initial DOM state only*, so a reader's expand and collapse choices survive recalculation. Two tempting approaches are wrong here:

- Computing `open` from `matchMedia` during render — this is a static export, the server has no viewport, so server and client disagree and hydration mismatches.
- Holding `open` in reactive state — it would reassert the collapse after the reader opens a section, fighting the documented behaviour.

A one-time `useLayoutEffect` avoids both: it runs only on the client, only once, and commits before paint so there is no visible collapse flash.

- [ ] **Step 1: Add an isomorphic layout effect**

`ui.tsx` carries `"use client"`, but client components still prerender in a static export, and React warns that `useLayoutEffect` does nothing on the server. Add `useLayoutEffect` and `useRef` to the existing React import (`ui.tsx:2`, which already imports `useEffect` and `useState`), then define this just above `Section`:

```tsx
/**
 * `useLayoutEffect` on the client, `useEffect` on the server. This is a static
 * export, so client components still prerender, and React warns about a bare
 * useLayoutEffect during that pass. The client branch is what matters: it
 * commits before paint, so a section never flashes open and then snaps shut.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
```

- [ ] **Step 2: Add the prop and the effect**

```tsx
export function Section({
  title,
  summary,
  icon,
  tone = "neutral",
  open = true,
  collapseOnMobile = false,
  id,
  children,
}: {
  title: string;
  summary: string;
  icon: string;
  tone?: "neutral" | "accent";
  open?: boolean;
  /**
   * Start closed on phone-width screens only. Applied once on mount rather
   * than during render: this is a static export, so the prerendered HTML has
   * no viewport and a render-time media query would mismatch hydration. Once,
   * so it never overrides the reader's own later choice.
   */
  collapseOnMobile?: boolean;
  id?: string;
  children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useIsomorphicLayoutEffect(() => {
    if (!collapseOnMobile) return;
    // Matches Tailwind's `sm` breakpoint. Layout effect, so this commits
    // before paint and the reader never sees the section flash open.
    if (window.matchMedia("(max-width: 639px)").matches && details.current) {
      details.current.open = false;
    }
  }, [collapseOnMobile]);

  return (
    <details ref={details} id={id} open={open} className="surface group rounded-2xl border border-white/[.07]">
```

The rest of the component is unchanged.

- [ ] **Step 3: Verify**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass. No visual change yet, since no caller passes the prop.

- [ ] **Step 4: Commit**

```bash
git add components/ui.tsx
git commit -m "feat: let a Section start collapsed on phone widths

Applied once on mount in a layout effect rather than during render: a
static export has no viewport at prerender, so a render-time media
query would mismatch hydration, and reactive state would fight the
reader's own expand choices."
```

---

## Task 8: Apply collapse-on-mobile to CVCX

**Files:**
- Modify: `blackjack/components/CvcxLab.tsx` (the `<Section>` at lines ~579, 604, 663, 692)

**Interfaces:**
- Consumes: `collapseOnMobile` from Task 7.

- [ ] **Step 1: Mark the four input-heavy sections**

Four of nine sections default to open and hold the 66 inputs. Add `collapseOnMobile` to each of: **Bankroll and pace** (~579), **Table rules** (~604), **Bet spread** (~663), and the outcome section titled `` {`Where this lands over ${compact(hours)} hours`} `` (~692). For example:

```tsx
        <Section
          title="Bankroll and pace"
          collapseOnMobile
```

Leave **Scenario summary** (~552) open: it states what is being modelled, so the page opens on a readable answer plus the sticky results bar rather than on four screens of inputs. Leave the four already-`open={false}` sections alone.

- [ ] **Step 2: Verify the target metric**

```bash
npm run lint && npm run build
```

Then measure `/cvcx` at 390×844. Expected: `screensTall` drops from **8.8 to under 3**. At 1280 the page must be unchanged — all sections open.

- [ ] **Step 3: Confirm no collapse flash**

Reload `/cvcx` at 390 several times and watch: the sections must never render open and then snap shut. If they do, the effect is running after paint — confirm it is `useLayoutEffect`, not `useEffect`.

- [ ] **Step 4: Commit**

```bash
git add components/CvcxLab.tsx
git commit -m "fix: open CVCX on its numbers, not on 66 inputs

The page already had nine Sections, five PinnedStats and a sticky
results bar; it was 8.8 viewports tall on a phone only because four
input-heavy sections defaulted to open at every width. Scenario summary
stays open so the page still opens on a readable answer."
```

---

# Phase C — adopt the pattern on the remaining analysis pages

Each task is one page, one commit, and can stop after any page without leaving the app inconsistent. **Move markup only** — no calculation, default, or persisted shape changes.

The pattern to copy is `CvcxLab.tsx`: inputs grouped in `<Section>`s with `collapseOnMobile` on the input-heavy ones, and the page's headline figures in a sticky bar built from `PinnedStat`. The sticky bar wrapper to reuse verbatim is `CvcxLab.tsx:525`.

## Task 9: SessionSimulator

Largest and most-used of the four (512 lines, 37 inputs, 2.6 viewports), so it goes first and proves the repetition.

**Files:**
- Modify: `blackjack/components/SessionSimulator.tsx`

- [ ] **Step 1: Record the baseline**

Before editing, run the page with a fixed set of inputs and write down every displayed number. This is the comparison for Step 4.

- [ ] **Step 2: Add the sticky results bar**

Import `PinnedStat` and `Section` from `@/components/ui`. Directly below the page heading, add the bar, reusing CVCX's wrapper classes exactly:

```tsx
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-4 mb-4 border-y border-white/[.07] bg-[#0c100d]/95 px-4 py-2.5 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {/* Three or four headline figures this page already computes. */}
        </div>
      </div>
```

Fill it with the figures the page already shows as its primary outcome. Do not compute anything new.

- [ ] **Step 3: Group the inputs into Sections**

Wrap the existing input groups in `<Section title=… summary=… icon=… collapseOnMobile>`, following the page's existing visual grouping. Use Font Awesome icon names already used elsewhere in the repo. Change no input, default, or handler.

- [ ] **Step 4: Verify nothing moved but the markup**

```bash
npm test && npm run lint && npm run build
```

Then load the page with the Step 1 inputs and compare every number against the baseline. Any difference means markup surgery changed behaviour — stop and fix before committing.

Then measure at 390×844: `screensTall` should fall, `smallTap` and `tinyText` should be 0. At 1280 the page must look and behave as before.

- [ ] **Step 5: Commit**

```bash
git add components/SessionSimulator.tsx
git commit -m "feat: give the Session Simulator the CVCX mobile pattern

Sections plus a sticky PinnedStat bar, so the page opens on its results
instead of 37 inputs. Markup only -- outputs verified identical against
a pre-change baseline."
```

---

## Task 10: BankrollRecommender

**Files:**
- Modify: `blackjack/components/BankrollRecommender.tsx` (371 lines)

- [ ] **Step 1: Record the baseline** — as Task 9 Step 1.
- [ ] **Step 2: Add the sticky results bar** — same wrapper as Task 9 Step 2, filled with this page's headline figures.
- [ ] **Step 3: Group the inputs into Sections** — as Task 9 Step 3.
- [ ] **Step 4: Verify** — `npm test && npm run lint && npm run build`, numbers identical to the baseline, then measure at 390 and check 1280.
- [ ] **Step 5: Commit**

```bash
git add components/BankrollRecommender.tsx
git commit -m "feat: give the Bankroll Recommender the CVCX mobile pattern

Markup only -- outputs verified identical against a pre-change baseline."
```

---

## Task 11: ScenarioComparison

**Files:**
- Modify: `blackjack/components/ScenarioComparison.tsx` (217 lines)

This page's primary content is a comparison, so check first whether it renders a wide table. If it does, give it the Task 3 rail treatment (`railState`, edge fade, hidden count, `snap-start`) rather than a sticky stat bar, which suits a form-driven page and not a comparison.

- [ ] **Step 1: Record the baseline** — as Task 9 Step 1.
- [ ] **Step 2: Choose the treatment** — sticky `PinnedStat` bar if the page is form-driven; the Task 3 rail affordances if its centre is a wide table. Both if it has each.
- [ ] **Step 3: Group any input groups into Sections** — as Task 9 Step 3.
- [ ] **Step 4: Verify** — as Task 10 Step 4.
- [ ] **Step 5: Commit**

```bash
git add components/ScenarioComparison.tsx
git commit -m "feat: make Compare Scenarios readable on a phone

Markup only -- outputs verified identical against a pre-change baseline."
```

---

## Task 12: TripPlanner

**Files:**
- Modify: `blackjack/components/TripPlanner.tsx` (158 lines, the smallest)

- [ ] **Step 1: Record the baseline** — as Task 9 Step 1.
- [ ] **Step 2: Add the sticky results bar** — same wrapper as Task 9 Step 2.
- [ ] **Step 3: Group the inputs into Sections** — as Task 9 Step 3. At 158 lines this page may already be short enough that only the sticky bar is warranted; if grouping would add structure without reducing height, skip it and say so in the commit message.
- [ ] **Step 4: Verify** — as Task 10 Step 4.
- [ ] **Step 5: Commit**

```bash
git add components/TripPlanner.tsx
git commit -m "feat: give the Trip Planner the CVCX mobile pattern

Markup only -- outputs verified identical against a pre-change baseline."
```

---

## Task 13: Re-run the audit and record results

**Files:**
- Modify: `docs/superpowers/mobile-audit.md`

- [ ] **Step 1: Re-run the full audit**

Follow `docs/superpowers/mobile-audit.md` at 390×844 with seeded history, across `/dashboard`, `/cvcx`, `/simulation`, `/statistics`, `/journal`, `/compare`, `/trip-planner`, `/bet-spread-recommender`, `/training/h17-chart`, `/training/checklist`, `/training/running-count`.

- [ ] **Step 2: Record the after table**

Add an "After, <date>" table beside the existing baseline, in the same columns. Any page still failing a pass condition gets a named row explaining why it was accepted, rather than being quietly omitted.

- [ ] **Step 3: Check the two non-phone widths**

Confirm at 768 and 1280 that nothing regressed: sections open, no fades, no stray mobile-only copy.

- [ ] **Step 4: Commit**

```bash
git add ../docs/superpowers/mobile-audit.md
git commit -m "docs: record post-change mobile audit results"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|---|---|
| A1 legend compact + touch-correct | 1 |
| A2 column affordances | 2 (geometry), 3 (UI) |
| A3 cell height | 3 |
| A4 `PinnedStat` label size | 4 |
| A5 CVCX control heights | 5 |
| A6 consent banner | 6 |
| B collapse mechanism | 7 |
| B applied to CVCX | 8 |
| C SessionSimulator / BankrollRecommender / ScenarioComparison / TripPlanner | 9, 10, 11, 12 |
| Audit as regression gate | 13, plus a verify step in every task |

**Deviation from the spec, deliberate:** the spec allowed that Phase B's collapse rule "if expressed as a predicate" would get a unit test. It is not expressed that way — it is a component prop plus a one-line media query, and wrapping that in a predicate purely to have something to assert would be a test of a config object. Phase B is gated by the audit's `screensTall` measurement instead. The genuinely testable geometry lives in Task 2 and is tested there.

**Type consistency:** `RailMetrics` / `RailState` / `railState` (Task 2 → 3, 11); `collapseOnMobile` (Task 7 → 8, 9, 10, 12); `Section` and `PinnedStat` signatures unchanged apart from the added optional prop, so no existing caller breaks.

**Known judgement call:** Tasks 9–12 cannot quote the exact JSX to wrap without reading four large components, so each specifies the pattern, the exact sticky-bar markup to reuse, and a before/after numeric baseline as the correctness gate. That gate — not the diff — is what proves markup surgery changed nothing.
