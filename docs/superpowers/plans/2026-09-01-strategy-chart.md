# Configurable Basic Strategy Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static GIF at `/reference/basic-strategy` with a rules-driven basic strategy chart plus a second tab showing Hi-Lo index deviations as a grid, with no true-count slider.

**Architecture:** Eighteen strategy grids (deck class `1`/`2`/`4plus` × `h17`/`s17` × `pairs`/`soft`/`hard`) stored as printed-looking text blocks holding *composite codes* (`Ds`, `Ph`, `Rh`, …). A resolver turns a code into a concrete action given the rules, which collapses DAS, surrender availability and double restrictions into the codes instead of multiplying the grids. `getBasicStrategyDecision` is reimplemented on top of this and stays the app's single source of truth; its signature is unchanged so its nine consumers are untouched.

**Tech Stack:** TypeScript, Next.js 16.3.2 (App Router, static export), React 19, Tailwind 3, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-01-strategy-chart-design.md`

## Global Constraints

- **Vitest only discovers `lib/**/*.test.ts` and `scripts/**/*.test.ts`** (`vitest.config.ts`). Every test in this plan lives in `lib/blackjack/`. Component behaviour is not unit-testable here — verify components by running the app.
- Run unit tests with `npx vitest run <path>`; the whole suite with `npm test`. Lint with `npm run lint` (`--max-warnings=0`). Typecheck with `npx tsc --noEmit`.
- Commit straight to `main`. No feature branches in this repo.
- Row labels and dealer columns must match `lib/blackjack/bjaH17Chart.ts` exactly: dealers `2 3 4 5 6 7 8 9 10 A`; pairs `A,A T,T 9,9 8,8 7,7 6,6 5,5 4,4 3,3 2,2`; soft `A,9`→`A,2`; hard `17`→`8`.
- The composite-code vocabulary is exactly eleven codes: `H S P D Ds Ph Pd Ps Rh Rs Rp`. There is no `Dh` — `D` means double-else-hit in both the hard and soft sections.
- Every table carries a provenance comment. Do not paste third-party component code into this repo; the grids are factual strategy data, transcribed into our own format and verified by the tests below.

---

### Task 1: Chart types and the composite-code resolver

**Files:**
- Create: `blackjack/lib/blackjack/strategyChart.ts`
- Test: `blackjack/lib/blackjack/strategyChart.test.ts`

**Interfaces:**
- Consumes: `Action` from `./types`.
- Produces: `ChartCode`, `StrategySectionId`, `StrategyChartRules`, `CHART_CODES`, `resolveCode(code, options) => { action: Action; fallback?: Action }`.

- [ ] **Step 1: Write the failing test**

Create `blackjack/lib/blackjack/strategyChart.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CHART_CODES, resolveCode } from "./strategyChart";

const all = { canDouble: true, canSplit: true, doubleAfterSplit: true, canSurrender: true };

describe("resolveCode", () => {
  it("passes unconditional codes straight through", () => {
    expect(resolveCode("H", all)).toEqual({ action: "H" });
    expect(resolveCode("S", all)).toEqual({ action: "S" });
    expect(resolveCode("P", all)).toEqual({ action: "P" });
  });

  it("doubles when allowed and records the fallback", () => {
    expect(resolveCode("D", all)).toEqual({ action: "D", fallback: "H" });
    expect(resolveCode("Ds", all)).toEqual({ action: "D", fallback: "S" });
  });

  it("demotes doubles to their own fallback", () => {
    expect(resolveCode("D", { ...all, canDouble: false })).toEqual({ action: "H" });
    expect(resolveCode("Ds", { ...all, canDouble: false })).toEqual({ action: "S" });
  });

  it("demotes DAS-conditional splits to their own fallback", () => {
    expect(resolveCode("Ph", { ...all, doubleAfterSplit: false })).toEqual({ action: "H" });
    expect(resolveCode("Ps", { ...all, doubleAfterSplit: false })).toEqual({ action: "S" });
    expect(resolveCode("Pd", { ...all, doubleAfterSplit: false })).toEqual({ action: "D", fallback: "H" });
  });

  it("splits DAS-conditional cells when DAS is on", () => {
    for (const code of ["Ph", "Pd", "Ps"] as const) {
      expect(resolveCode(code, all)).toEqual({ action: "P" });
    }
  });

  it("demotes a Pd to a hit when doubling is also unavailable", () => {
    expect(resolveCode("Pd", { ...all, doubleAfterSplit: false, canDouble: false })).toEqual({ action: "H" });
  });

  it("surrenders when offered and falls back otherwise", () => {
    expect(resolveCode("Rh", all)).toEqual({ action: "R", fallback: "H" });
    expect(resolveCode("Rh", { ...all, canSurrender: false })).toEqual({ action: "H" });
    expect(resolveCode("Rs", { ...all, canSurrender: false })).toEqual({ action: "S" });
    expect(resolveCode("Rp", { ...all, canSurrender: false })).toEqual({ action: "P" });
  });

  it("demotes an Rp to the pair's own fallback when splitting is unavailable", () => {
    expect(resolveCode("Rp", { ...all, canSurrender: false, canSplit: false })).toEqual({ action: "H" });
  });

  it("never splits when splitting is unavailable", () => {
    for (const code of ["P", "Ph", "Pd", "Ps"] as const) {
      expect(resolveCode(code, { ...all, canSplit: false }).action).not.toBe("P");
    }
  });

  it("lists exactly the eleven supported codes", () => {
    expect([...CHART_CODES].sort()).toEqual(["D", "Ds", "H", "P", "Pd", "Ph", "Ps", "Rh", "Rp", "Rs", "S"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd blackjack && npx vitest run lib/blackjack/strategyChart.test.ts`
Expected: FAIL — `Failed to resolve import "./strategyChart"`.

- [ ] **Step 3: Write minimal implementation**

Create `blackjack/lib/blackjack/strategyChart.ts`:

```ts
import { Action } from "./types";

/**
 * A printed chart cell. Codes are composite on purpose: `Ds` is "double if the
 * table lets you, otherwise stand". Folding the rule conditions into the cell
 * is what keeps the number of stored grids down to six instead of one per
 * combination of DAS, surrender and double restrictions.
 */
export type ChartCode = "H" | "S" | "P" | "D" | "Ds" | "Ph" | "Pd" | "Ps" | "Rh" | "Rs" | "Rp";

export const CHART_CODES: readonly ChartCode[] = ["H", "S", "P", "D", "Ds", "Ph", "Pd", "Ps", "Rh", "Rs", "Rp"];

export type StrategySectionId = "pairs" | "soft" | "hard";

export interface StrategyChartRules {
  decks: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  surrender: "none" | "late" | "early";
  doubleRule: "any" | "9-11" | "10-11";
  europeanNoHoleCard: boolean;
}

export interface CodeOptions {
  canDouble: boolean;
  canSplit: boolean;
  doubleAfterSplit: boolean;
  canSurrender: boolean;
}

export interface ResolvedCode {
  action: Action;
  /** Set only where the action is still conditional at the table (a double that may be refused). */
  fallback?: Action;
}

/**
 * One code plus the table's permissions becomes one action.
 *
 * Demotion cascades: an `Rp` on a table without surrender becomes a split, and
 * if that hand cannot be split either (it is already a drawn hand) it demotes
 * again through the pair's own fallback. Each code carries its fallback in its
 * own letters, so the cascade never needs to consult a different cell.
 */
export function resolveCode(code: ChartCode, options: CodeOptions): ResolvedCode {
  switch (code) {
    case "H":
    case "S":
      return { action: code };
    case "D":
      return options.canDouble ? { action: "D", fallback: "H" } : { action: "H" };
    case "Ds":
      return options.canDouble ? { action: "D", fallback: "S" } : { action: "S" };
    case "P":
      return options.canSplit ? { action: "P" } : { action: "H" };
    case "Ph":
      return options.canSplit && options.doubleAfterSplit ? { action: "P" } : resolveCode("H", options);
    case "Pd":
      return options.canSplit && options.doubleAfterSplit ? { action: "P" } : resolveCode("D", options);
    case "Ps":
      return options.canSplit && options.doubleAfterSplit ? { action: "P" } : resolveCode("S", options);
    case "Rh":
      return options.canSurrender ? { action: "R", fallback: "H" } : resolveCode("H", options);
    case "Rs":
      return options.canSurrender ? { action: "R", fallback: "S" } : resolveCode("S", options);
    case "Rp":
      return options.canSurrender ? { action: "R", fallback: "P" } : resolveCode("P", options);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd blackjack && npx vitest run lib/blackjack/strategyChart.test.ts`
Expected: PASS, 10 tests.

Note the `Rh`/`Rs`/`Rp` cases return a `fallback` because surrender can be refused on a drawn hand; the `resolveCode("P", options)` recursion is what makes the `Rp` → split → hit cascade work.

- [ ] **Step 5: Commit**

```bash
cd blackjack && git add lib/blackjack/strategyChart.ts lib/blackjack/strategyChart.test.ts
git commit -m "Add composite chart-code resolver for the strategy chart"
```

---

### Task 2: The 4+ deck grids, chart lookup, and the parity pin

**Files:**
- Create: `blackjack/lib/blackjack/strategyTables.ts`
- Modify: `blackjack/lib/blackjack/strategyChart.ts` (add `chartCode`, `chartCell`, `STRATEGY_ROWS`)
- Test: `blackjack/lib/blackjack/strategyChart.test.ts`, `blackjack/lib/blackjack/strategyTables.test.ts`

**Interfaces:**
- Consumes: `resolveCode`, `ChartCode`, `StrategyChartRules` from Task 1; `CHART_DEALERS`, `BJA_H17_SECTIONS`, `chartToken` from `./bjaH17Chart`; `getBasicStrategyDecision` from `./basicStrategy` (still the *old* implementation at this point — that is the point of the parity pin).
- Produces: `STRATEGY_ROWS`, `chartCode(rules, section, row, dealer) => ChartCode`, `chartCell(rules, section, row, dealer) => ResolvedCode & { code: ChartCode }`, and `STRATEGY_TABLES` from `strategyTables.ts`.

- [ ] **Step 1: Create the table data**

Create `blackjack/lib/blackjack/strategyTables.ts`. The grids are laid out to read like a printed chart so a diff stays legible, exactly as `bjaH17Chart.ts` does.

```ts
/**
 * Total-dependent basic strategy for 1, 2 and 4-8 deck games, H17 and S17.
 *
 * Cells hold composite codes (see `strategyChart.ts`): the rule conditions live
 * in the cell rather than in extra copies of the grid, so DAS, surrender
 * availability and double restrictions all resolve at read time.
 *
 * Provenance: transcribed into this repo's row/column layout from published
 * total-dependent basic strategy for these rule sets, and pinned by three tests
 * in `strategyTables.test.ts` and `strategyChart.test.ts` — parity against the
 * engine this replaces, agreement with the audited `bjaH17Chart.ts`
 * transcription, and the deck-class difference list.
 *
 * The `5,5` pairs row is not a splitting decision; it repeats the hard 10 row so
 * the grid has a cell everywhere the printed chart does.
 */
import { ChartCode, StrategySectionId } from "./strategyChart";

export type DeckClass = "1" | "2" | "4plus";
export type Soft17Rule = "h17" | "s17";

export const STRATEGY_ROWS: Record<StrategySectionId, readonly string[]> = {
  pairs: ["A,A", "T,T", "9,9", "8,8", "7,7", "6,6", "5,5", "4,4", "3,3", "2,2"],
  soft: ["A,9", "A,8", "A,7", "A,6", "A,5", "A,4", "A,3", "A,2"],
  hard: ["17", "16", "15", "14", "13", "12", "11", "10", "9", "8"],
};
```

Then the eighteen grids. Use this exact content — it is the verified data:

```ts
const TABLES: Record<`${DeckClass}/${Soft17Rule}`, Record<StrategySectionId, string>> = {
  "4plus/h17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S   S
      8,8    P   P   P   P   P   P   P   P   P  Rp
      7,7    P   P   P   P   P   P   H   H   H   H
      6,6   Ph   P   P   P   P   H   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H   H  Ph  Ph   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P   H   H   H   H
      2,2   Ph  Ph   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S  Ds   S   S   S   S   S
      A,7   Ds  Ds  Ds  Ds  Ds   S   S   H   H   H
      A,6    H   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   H   D   D   H   H   H   H   H
      A,2    H   H   H   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S   S
      16     S   S   S   S   S   H   H  Rh  Rh  Rh
      15     S   S   S   S   S   H   H   H  Rh  Rh
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   D
      10     D   D   D   D   D   D   D   D   H   H
      9      H   D   D   D   D   H   H   H   H   H
      8      H   H   H   H   H   H   H   H   H   H
    `,
  },
  "4plus/s17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S   S
      8,8    P   P   P   P   P   P   P   P   P   P
      7,7    P   P   P   P   P   P   H   H   H   H
      6,6   Ph   P   P   P   P   H   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H   H  Ph  Ph   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P   H   H   H   H
      2,2   Ph  Ph   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S   S   S   S   S   S   S
      A,7    S  Ds  Ds  Ds  Ds   S   S   H   H   H
      A,6    H   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   H   D   D   H   H   H   H   H
      A,2    H   H   H   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S   S
      16     S   S   S   S   S   H   H  Rh  Rh  Rh
      15     S   S   S   S   S   H   H   H  Rh   H
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   H
      10     D   D   D   D   D   D   D   D   H   H
      9      H   D   D   D   D   H   H   H   H   H
      8      H   H   H   H   H   H   H   H   H   H
    `,
  },
  // The 1D and 2D grids are added in Task 6. Until then these four keys are the
  // only ones populated, and `deckClass` below throws for 1 and 2 decks.
} as Record<`${DeckClass}/${Soft17Rule}`, Record<StrategySectionId, string>>;
```

Finish the module with the parser (mirroring `bjaH17Chart.ts`'s `section` helper) and the lookup map:

```ts
import { CHART_DEALERS } from "./bjaH17Chart";

const isChartCode = (value: string): value is ChartCode =>
  ["H", "S", "P", "D", "Ds", "Ph", "Pd", "Ps", "Rh", "Rs", "Rp"].includes(value);

function parseGrid(id: string, section: StrategySectionId, printed: string): Map<string, ChartCode> {
  const cells = new Map<string, ChartCode>();
  const lines = printed.trim().split("\n");
  const expected = STRATEGY_ROWS[section];
  if (lines.length !== expected.length) {
    throw new Error(`${id} ${section}: ${lines.length} rows, expected ${expected.length}`);
  }
  lines.forEach((line, rowIndex) => {
    const [row, ...values] = line.trim().split(/\s+/);
    if (row !== expected[rowIndex]) throw new Error(`${id} ${section}: row ${rowIndex} is "${row}", expected "${expected[rowIndex]}"`);
    if (values.length !== CHART_DEALERS.length) throw new Error(`${id} ${section} row ${row}: ${values.length} cells, expected ${CHART_DEALERS.length}`);
    values.forEach((value, column) => {
      if (!isChartCode(value)) throw new Error(`${id} ${section} row ${row}: unreadable code "${value}"`);
      cells.set(`${section}:${row}v${CHART_DEALERS[column]}`, value);
    });
  });
  return cells;
}

export const STRATEGY_TABLES: Record<string, Map<string, ChartCode>> = Object.fromEntries(
  Object.entries(TABLES).map(([key, sections]) => [
    key,
    new Map([
      ...parseGrid(key, "pairs", sections.pairs),
      ...parseGrid(key, "soft", sections.soft),
      ...parseGrid(key, "hard", sections.hard),
    ]),
  ]),
);

export const deckClass = (decks: number): DeckClass => (decks === 1 ? "1" : decks === 2 ? "2" : "4plus");
```

- [ ] **Step 2: Write the failing lookup and integrity tests**

Create `blackjack/lib/blackjack/strategyTables.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CHART_DEALERS } from "./bjaH17Chart";
import { STRATEGY_ROWS, STRATEGY_TABLES, deckClass } from "./strategyTables";
import { CHART_CODES, StrategySectionId } from "./strategyChart";

describe("strategy tables", () => {
  it("maps deck counts to their chart class", () => {
    expect(deckClass(1)).toBe("1");
    expect(deckClass(2)).toBe("2");
    for (const decks of [4, 6, 8]) expect(deckClass(decks)).toBe("4plus");
  });

  it("gives every grid a complete, well-formed cell for every row and dealer", () => {
    for (const [key, cells] of Object.entries(STRATEGY_TABLES)) {
      let counted = 0;
      for (const section of ["pairs", "soft", "hard"] as StrategySectionId[]) {
        for (const row of STRATEGY_ROWS[section]) {
          for (const dealer of CHART_DEALERS) {
            const code = cells.get(`${section}:${row}v${dealer}`);
            expect(code, `${key} ${section} ${row} v ${dealer}`).toBeDefined();
            expect(CHART_CODES).toContain(code!);
            counted += 1;
          }
        }
      }
      expect(cells.size, `${key} has stray cells`).toBe(counted);
      expect(counted).toBe(280);
    }
  });
});
```

- [ ] **Step 3: Add the lookup to `strategyChart.ts`**

Append to `blackjack/lib/blackjack/strategyChart.ts`:

```ts
import { CHART_DEALERS } from "./bjaH17Chart";
import { STRATEGY_TABLES, deckClass } from "./strategyTables";

/** Hard totals a restricted double rule still permits. Soft doubles are never permitted under a restriction. */
const doubleAllowed = (rules: StrategyChartRules, section: StrategySectionId, row: string): boolean => {
  if (rules.doubleRule === "any") return true;
  if (section !== "hard") return false;
  const permitted = rules.doubleRule === "9-11" ? ["9", "10", "11"] : ["10", "11"];
  return permitted.includes(row);
};

/** The printed code, before the composite codes are resolved against the table's permissions. */
export function chartCode(rules: StrategyChartRules, section: StrategySectionId, row: string, dealer: string): ChartCode {
  const key = `${deckClass(rules.decks)}/${rules.dealerHitsSoft17 ? "h17" : "s17"}`;
  const table = STRATEGY_TABLES[key];
  if (!table) throw new Error(`No strategy table for ${key}`);
  const code = table.get(`${section}:${row}v${dealer}`);
  if (!code) throw new Error(`No chart cell for ${section} ${row} vs ${dealer}`);
  return code;
}

export function chartCell(
  rules: StrategyChartRules,
  section: StrategySectionId,
  row: string,
  dealer: string,
  permissions: Partial<CodeOptions> = {},
): ResolvedCode & { code: ChartCode } {
  const code = chartCode(rules, section, row, dealer);
  const resolved = resolveCode(code, {
    canDouble: doubleAllowed(rules, section, row),
    canSplit: section === "pairs",
    doubleAfterSplit: rules.doubleAfterSplit,
    canSurrender: rules.surrender !== "none",
    ...permissions,
  });
  return { ...resolved, code };
}
```

Also re-export the dealer list for consumers: `export { CHART_DEALERS };`

- [ ] **Step 4: Write the parity pin**

This is the gate on the whole change. Add to `blackjack/lib/blackjack/strategyChart.test.ts`:

```ts
import { getBasicStrategyDecision } from "./basicStrategy";
import { chartCell } from "./strategyChart";
import { STRATEGY_ROWS } from "./strategyTables";
import { CHART_DEALERS } from "./bjaH17Chart";
import { Card, Rank } from "./types";

const card = (rank: string, suit: Card["suit"] = "spades"): Card => ({ rank: (rank === "T" ? "10" : rank) as Rank, suit });

function handFor(section: "pairs" | "soft" | "hard", row: string): Card[] {
  if (section === "pairs") { const [a, b] = row.split(","); return [card(a), card(b, "hearts")]; }
  if (section === "soft") { const [, b] = row.split(","); return [card("A"), card(b, "hearts")]; }
  const total = Number(row);
  const high = total >= 12 ? 10 : total - 2;
  return [card(String(high)), card(String(total - high), "hearts")];
}

/**
 * Cells where the table deliberately disagrees with the engine it replaces.
 * All five are DAS-conditional pair splits that the old function decided without
 * consulting `doubleAfterSplit`. The audited `bjaH17Chart.ts` transcription
 * prints `Y/N` — its notation for "split only with DAS" — in exactly these
 * cells, so the table is right and the old branch was wrong.
 */
const KNOWN_ENGINE_BUGS = new Set(["pairs:6,6v2", "pairs:3,3v2", "pairs:3,3v3", "pairs:2,2v2", "pairs:2,2v3"]);

describe("parity with the engine this replaces", () => {
  for (const dealerHitsSoft17 of [true, false]) {
    it(`reproduces 6-deck ${dealerHitsSoft17 ? "H17" : "S17"} basic strategy`, () => {
      const rules = { decks: 6, dealerHitsSoft17, doubleAfterSplit: true, surrender: "late" as const, doubleRule: "any" as const, europeanNoHoleCard: false };
      const legacy = { decks: 6, dealerHitsSoft17, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, doubleRule: "any" as const };
      const mismatches: string[] = [];
      for (const section of ["pairs", "soft", "hard"] as const) {
        for (const row of STRATEGY_ROWS[section]) {
          for (const dealer of CHART_DEALERS) {
            const key = `${section}:${row}v${dealer}`;
            if (KNOWN_ENGINE_BUGS.has(key)) continue;
            const ours = chartCell(rules, section, row, dealer).action;
            const theirs = getBasicStrategyDecision({ playerCards: handFor(section, row), dealerUpcard: card(dealer, "diamonds"), rules: legacy }).action;
            if (ours !== theirs) mismatches.push(`${key}: table=${ours} engine=${theirs}`);
          }
        }
      }
      expect(mismatches).toEqual(dealerHitsSoft17 ? [] : ["hard:16vA: table=R engine=H"]);
    });
  }
});
```

The single expected S17 mismatch is deliberate and is resolved in Task 3 — read that task's notes before changing this expectation.

- [ ] **Step 5: Write the `bjaH17Chart` oracle test**

Add to `blackjack/lib/blackjack/strategyTables.test.ts`:

```ts
import { BJA_H17_SECTIONS, cellKey } from "./bjaH17Chart";
import { chartCell } from "./strategyChart";

describe("agreement with the audited BJA H17 transcription", () => {
  const rules = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "late" as const, doubleRule: "any" as const, europeanNoHoleCard: false };
  const noDas = { ...rules, doubleAfterSplit: false };

  it("matches every non-index cell of the printed chart", () => {
    const mismatches: string[] = [];
    for (const section of BJA_H17_SECTIONS) {
      if (section.id === "surrender") continue; // handled by the Rh/Rs/Rp codes, not a separate grid
      for (const row of section.rows) {
        for (const dealer of CHART_DEALERS) {
          const token = section.cells.get(cellKey(section.id, row, dealer))!;
          if (token.kind === "index") continue; // an index cell's basic play is only knowable via deviationTransition — circular
          const ours = chartCell(rules, section.id === "pairs" ? "pairs" : section.id === "soft" ? "soft" : "hard", row, dealer);
          const label = `${section.id} ${row} v ${dealer}`;
          if (section.id === "pairs") {
            if (token.value === "Y" && ours.action !== "P") mismatches.push(`${label}: chart says split, table says ${ours.action}`);
            if (token.value === "Y/N" && ours.code !== "Ph") mismatches.push(`${label}: chart says DAS-only split, table code is ${ours.code}`);
            if (token.value === "N" && chartCell(noDas, "pairs", row, dealer).action === "P") mismatches.push(`${label}: chart says never split`);
          } else if (["H", "S", "D", "Ds"].includes(token.value)) {
            const expected = token.value === "Ds" ? "D" : token.value === "D" ? "D" : token.value;
            if (ours.action !== expected) mismatches.push(`${label}: chart says ${token.value}, table says ${ours.action}`);
          }
        }
      }
    }
    // 8,8 v A: the printed chart splits, this table surrenders. Correct for a
    // 4-8 deck H17 game that offers late surrender; the printed chart's own
    // surrender table simply has no pairs row to carry it.
    expect(mismatches).toEqual(["pairs 8,8 v A: chart says split, table says R"]);
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `cd blackjack && npx vitest run lib/blackjack/strategyChart.test.ts lib/blackjack/strategyTables.test.ts`
Expected: PASS. If the parity pin reports mismatches beyond the one listed, stop and adjudicate each before continuing — do not widen `KNOWN_ENGINE_BUGS` without recording why the table is right.

- [ ] **Step 7: Commit**

```bash
cd blackjack && git add lib/blackjack/strategyTables.ts lib/blackjack/strategyTables.test.ts lib/blackjack/strategyChart.ts lib/blackjack/strategyChart.test.ts
git commit -m "Add 4-8 deck strategy grids with parity and printed-chart pins"
```

---

### Task 3: Reimplement `getBasicStrategyDecision` on the tables

**Files:**
- Modify: `blackjack/lib/blackjack/basicStrategy.ts` (whole file)
- Modify: `blackjack/lib/blackjack/strategyChart.test.ts` (drop the S17 mismatch exception)
- Modify: `blackjack/lib/blackjack/deviationRanking.generated.json` — **only if the decision below says so**

**Interfaces:**
- Consumes: `chartCell`, `StrategyChartRules` from Task 2.
- Produces: `getBasicStrategyDecision` with an unchanged signature — `{ playerCards, dealerUpcard, rules, canSplit? } => { action, fallback?, explanation }`.

**Read this before starting.** The parity pin from Task 2 reports one real S17 difference: hard **16 v A** is `Rh` in the table (surrender) but `H` in the old engine, because `basicStrategy.ts:11` gates the 16-v-A surrender behind `dealerHitsSoft17`. Three independent sources say the table is right: the sourced S17 grid, the repo's own `S17_PRO_DEVIATIONS` (which carries `["16","A",0,"H","R","atOrAbove",undefined,true]` — an unconditional late-surrender play), and the measured artifact, where surrendering that cell is worth **+0.0245 units/100**.

Adopting it has a consequence. `deviationTransition` will now see basic strategy already surrendering, so `s17Pro-16vA-R` flips from live to **dormant** — but `deviationRanking.generated.json` still records `triggersPer100: 0.318` for it under `s17-ls`. `DeviationReferencePage` derives `dormant` from `triggersPer100 === 0`, and a test asserts the measured rate and `changesPlay` agree. That test will fail until the artifact is reconciled. Its H17 twins (`h17Pro-16v10-R`, `h17Pro-16vA-R`) already read `[0, 0, 0]` for exactly this reason, so the target state is unambiguous.

- [ ] **Step 1: Write the failing test for the new implementation**

Add to `blackjack/lib/blackjack/strategyChart.test.ts`:

```ts
describe("getBasicStrategyDecision on the tables", () => {
  const rules = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, doubleRule: "any" as const };
  const decide = (cards: Card[], up: string, over: Partial<typeof rules> = {}, canSplit?: boolean) =>
    getBasicStrategyDecision({ playerCards: cards, dealerUpcard: card(up, "diamonds"), rules: { ...rules, ...over }, canSplit });

  it("falls through from a pair to its total when splitting is not offered", () => {
    expect(decide([card("8"), card("8", "hearts")], "5").action).toBe("P");
    expect(decide([card("8"), card("8", "hearts")], "5", {}, false).action).toBe("S"); // hard 16 v 5
  });

  it("honours DAS on the conditional pair splits", () => {
    expect(decide([card("2"), card("2", "hearts")], "3").action).toBe("P");
    expect(decide([card("2"), card("2", "hearts")], "3", { doubleAfterSplit: false }).action).toBe("H");
  });

  it("offers double and surrender only on a two-card hand", () => {
    expect(decide([card("6"), card("5", "hearts")], "6").action).toBe("D");
    expect(decide([card("4"), card("4", "hearts"), card("3")], "6").action).toBe("H"); // hard 11, three cards
    expect(decide([card("10"), card("6", "hearts")], "10").action).toBe("R");
    expect(decide([card("10"), card("3", "hearts"), card("3")], "10").action).toBe("H");
  });

  it("surrenders 16 v A under S17 as well as H17", () => {
    expect(decide([card("10"), card("6", "hearts")], "A", { dealerHitsSoft17: false }).action).toBe("R");
  });

  it("still reports a fallback for a double", () => {
    expect(decide([card("A"), card("7", "hearts")], "4")).toMatchObject({ action: "D", fallback: "S" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd blackjack && npx vitest run lib/blackjack/strategyChart.test.ts -t "getBasicStrategyDecision on the tables"`
Expected: FAIL on the DAS pair case and the S17 16-v-A case.

- [ ] **Step 3: Rewrite `basicStrategy.ts`**

Replace the whole file:

```ts
import { calculateHandValue, isPair, isSoft, rankValue } from "./hand";
import { chartCell, StrategyChartRules, StrategySectionId } from "./strategyChart";
import { Action, BlackjackRules, Card } from "./types";

export interface Decision { action: Action; fallback?: Action; explanation: string }

const NAMES: Record<Action, string> = { H: "Hit", S: "Stand", D: "Double", P: "Split", R: "Surrender" };

/** `BlackjackRules` predates the chart's wider rule set; ENHC and early surrender are chart-page-only. */
const toChartRules = (rules: BlackjackRules): StrategyChartRules => ({
  decks: rules.decks,
  dealerHitsSoft17: rules.dealerHitsSoft17,
  doubleAfterSplit: rules.doubleAfterSplit,
  surrender: rules.lateSurrender ? "late" : "none",
  doubleRule: rules.doubleRule ?? "any",
  europeanNoHoleCard: false,
});

/** The grid coordinate a hand sits at: its pair row, its soft row, or its hard total. */
function locate(cards: Card[], splitPermitted: boolean): { section: StrategySectionId; row: string } {
  const total = calculateHandValue(cards);
  if (splitPermitted && isPair(cards)) {
    const value = rankValue(cards[0]);
    return { section: "pairs", row: value === 11 ? "A,A" : value === 10 ? "T,T" : `${value},${value}` };
  }
  if (isSoft(cards) && total >= 13 && total <= 20) return { section: "soft", row: `A,${total - 11}` };
  return { section: "hard", row: String(Math.min(17, Math.max(8, total))) };
}

export function getBasicStrategyDecision({ playerCards, dealerUpcard, rules, canSplit: splitPermitted = true }: {
  playerCards: Card[]; dealerUpcard: Card; rules: BlackjackRules; canSplit?: boolean;
}): Decision {
  const total = calculateHandValue(playerCards);
  const soft = isSoft(playerCards);
  const dealer = rankValue(dealerUpcard) === 11 ? "A" : rankValue(dealerUpcard) === 10 ? "10" : String(rankValue(dealerUpcard));
  const twoCards = playerCards.length === 2;

  // Rows outside the printed grid are unconditional and need no lookup.
  if (!soft && total >= 18) return { action: "S", explanation: explain(total, playerCards, dealerUpcard, rules, "S") };
  if (soft && total >= 21) return { action: "S", explanation: explain(total, playerCards, dealerUpcard, rules, "S") };

  const { section, row } = locate(playerCards, splitPermitted && twoCards);
  const { action, fallback } = chartCell(toChartRules(rules), section, row, dealer, {
    canDouble: twoCards && (rules.doubleRule ?? "any") === "any" ? true : twoCards,
    canSurrender: rules.lateSurrender && twoCards,
    canSplit: section === "pairs",
  });
  return { action, fallback, explanation: explain(total, playerCards, dealerUpcard, rules, action, fallback) };
}

function explain(total: number, cards: Card[], up: Card, rules: BlackjackRules, action: Action, fallback?: Action): string {
  const kind = isPair(cards) ? "pair" : isSoft(cards) ? "soft hand" : "hard hand";
  const instruction = fallback ? `${NAMES[action]} if allowed, otherwise ${NAMES[fallback]}` : NAMES[action];
  return `${total} (${kind}) vs dealer ${up.rank} is ${instruction} under ${rules.decks}-deck ${rules.dealerHitsSoft17 ? "H17" : "S17"} basic strategy.`;
}
```

Note the `canDouble` expression above is deliberately written so the double restriction stays owned by `chartCell` (which knows the row) while the two-card guard stays here. If it reads awkwardly, simplify it to `canDouble: twoCards` — `chartCell` already applies `doubleRule` via `doubleAllowed`.

- [ ] **Step 4: Remove the parity exception and run everything**

In `strategyChart.test.ts`, change the parity expectation to `expect(mismatches).toEqual([])` for **both** rulesets, and add `"hard:16vA"` to a second documented exception set (or simply drop the S17 special-case, since after this task the two implementations agree everywhere except the five `KNOWN_ENGINE_BUGS` cells — the pin is now comparing the new implementation against itself for those, so replace the legacy comparison with a snapshot of the five bug cells instead).

Run: `cd blackjack && npm test`
Expected: all suites pass **except** possibly `deviations.test.ts` / `deviationRanking.test.ts` on the `s17Pro-16vA-R` dormancy assertion. If that fails, go to Step 5. If it passes, skip to Step 6.

- [ ] **Step 5: Reconcile the deviation ranking artifact**

**Decided: Option A.** The user chose the targeted patch on 2026-09-01. Do not run
the full regeneration; do not ask again.

*Option A (targeted, minutes).* In `lib/blackjack/deviationRanking.generated.json`, set the `s17-ls` entry for `s17Pro-16vA-R` to `evPer100: 0, standardError: 0, triggersPer100: 0`, matching how `h17Pro-16v10-R` and `h17Pro-16vA-R` already read. Add a comment in `scripts/rankDeviations.ts` recording that the row is dormant by construction once basic strategy surrenders 16 v A under S17. Regenerate the derived `deviationRanking.ts` with the script's writer if it is generated, or hand-edit both consistently.

*Option B (full, hours) — NOT CHOSEN, recorded for context.* Re-run `npx tsx scripts/rankDeviations.ts 250000000 1000` to reproduce the committed artifact's precision under the corrected basic strategy. Rejected because the row is dormant by construction once basic strategy surrenders the cell, and Option B's only additional value is the second-order shoe effects that `DEVIATION_RANKING_METADATA.limit` already discloses as unmodelled.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
cd blackjack && npm run lint && npx tsc --noEmit && npm test
git add -A && git commit -m "Reimplement basic strategy on the chart tables

Fixes five DAS-conditional pair splits the old branch decided without
consulting doubleAfterSplit, and the S17 16 v A surrender."
```

---

### Task 4: Chart grid component, page, and routing

**Files:**
- Create: `blackjack/components/ChartGrid.tsx`
- Create: `blackjack/components/StrategyChartPage.tsx`
- Modify: `blackjack/components/DynamicPage.tsx` (remove `StrategyReference`, wire the new page)
- Modify: `blackjack/lib/routes.ts` (the `split("/")` fix)

**Interfaces:**
- Consumes: `chartCell`, `CHART_DEALERS`, `StrategyChartRules` (Task 2); `STRATEGY_ROWS` (Task 2); `Panel`, `Select`, `Switch`, `Tabs` from `@/components/ui`; `storage` from `@/lib/statistics/storage`.
- Produces: `ChartGrid` (default export from `ChartGrid.tsx`), `StrategyChartPage` (default export).

- [ ] **Step 1: Fix the route segment bug**

In `blackjack/lib/routes.ts`, change the last entry of `ROUTES`:

```ts
  ...Object.keys(LEGACY_REDIRECTS).map((route) => route.split("/")),
```

Add `"reference/deviations": "/reference/basic-strategy"` to `LEGACY_REDIRECTS` **in Task 5**, not here — this task only makes multi-segment keys safe.

Run: `cd blackjack && npx tsc --noEmit` — expected: clean.

- [ ] **Step 2: Build `ChartGrid.tsx`**

One renderer, used by both tabs. It mirrors the H17 drill's grid markup (`components/H17ChartDrill.tsx`) — sticky row header, `border-separate border-spacing-1`, 44px cells, horizontal snap rail:

```tsx
"use client";
import { ReactNode } from "react";
import { CHART_DEALERS } from "@/lib/blackjack/bjaH17Chart";
import { StrategySectionId } from "@/lib/blackjack/strategyChart";
import { STRATEGY_ROWS } from "@/lib/blackjack/strategyTables";

export interface ChartGridProps {
  section: StrategySectionId;
  label: string;
  renderCell: (row: string, dealer: string) => ReactNode;
}

export default function ChartGrid({ section, label, renderCell }: ChartGridProps) {
  return (
    <div className="relative">
      <div className="-mx-1 snap-x snap-mandatory overflow-x-auto scroll-pl-11 px-1" data-testid={`chart-rail-${section}`}>
        <table className="w-full min-w-[35.5rem] table-fixed border-separate border-spacing-1 text-center text-sm">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-12 bg-[var(--paper-raised)] px-1.5 text-left text-xs font-semibold uppercase tracking-[.14em] text-[var(--ink-muted)]">Hand</th>
              {CHART_DEALERS.map((dealer) => <th key={dealer} className="px-1 pb-1 text-xs font-semibold text-[var(--ink-muted)]">{dealer}</th>)}
            </tr>
          </thead>
          <tbody>
            {STRATEGY_ROWS[section].map((row) => (
              <tr key={row}>
                <th scope="row" className="sticky left-0 z-20 w-12 bg-[var(--paper-raised)] px-1.5 text-left font-medium text-[var(--ink)]">{row}</th>
                {CHART_DEALERS.map((dealer) => <td key={dealer} className="snap-start scroll-ml-12">{renderCell(row, dealer)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build `StrategyChartPage.tsx` with the strategy tab only**

Rules panel defaulting from `storage.settings()`, held in local state (never written back). Action colours: give each of `H S D P R` a distinct tone, and render the fallback as a subscript where one exists (`Ds` shows `D` with a small `s`). Include a legend naming every code. Deviation markers are added in Task 5. Wire `Tabs` with two items now, rendering a placeholder for the deviations tab so the tab bar is real from the start.

- [ ] **Step 4: Swap the route**

In `blackjack/components/DynamicPage.tsx`: delete the `StrategyReference` function and its `Image` import if now unused, add `const StrategyChartPage = dynamicPage(() => import("@/components/StrategyChartPage"));`, and change the page map entry to `"reference/basic-strategy": <StrategyChartPage />`.

- [ ] **Step 5: Verify in the app**

Run: `cd blackjack && npm run dev`, open `/reference/basic-strategy`. Check: all three sections render; toggling H17/S17 changes 11 v A and A,7 v 2; toggling DAS changes 2,2 v 3; toggling surrender changes 16 v 9; the grid scrolls horizontally on a narrow viewport without the page scrolling.

- [ ] **Step 6: Lint and commit**

```bash
cd blackjack && npm run lint && npx tsc --noEmit && npm test
git add -A && git commit -m "Add the interactive basic strategy chart page"
```

---

### Task 5: Deviation tab

**Files:**
- Create: `blackjack/lib/blackjack/deviationChart.ts`
- Create: `blackjack/lib/blackjack/deviationChart.test.ts`
- Modify: `blackjack/components/StrategyChartPage.tsx`
- Modify: `blackjack/lib/routes.ts` (add the redirect)
- Delete: `blackjack/components/DeviationReferencePage.tsx`

**Interfaces:**
- Consumes: `deviationTrainingRows`, `DeviationTrainingRow` from `./deviations`; `DEVIATION_RANKING` from `./deviationRanking`; `STRATEGY_ROWS` (Task 2).
- Produces: `deviationGridCells(rules) => Map<string, DeviationCell>` where the key is `` `${section}:${row}v${dealer}` `` and `DeviationCell` is `{ row: DeviationTrainingRow; index: number; atOrBelow: boolean }`; plus `INSURANCE_ROW`.

- [ ] **Step 1: Write the failing mapping test**

```ts
import { describe, expect, it } from "vitest";
import { deviationGridCells } from "./deviationChart";
import { STRATEGY_ROWS } from "./strategyTables";
import { CHART_DEALERS } from "./bjaH17Chart";

const valid = new Set(
  (["pairs", "soft", "hard"] as const).flatMap((s) => STRATEGY_ROWS[s].flatMap((r) => CHART_DEALERS.map((d) => `${s}:${r}v${d}`))),
);

describe("deviationGridCells", () => {
  for (const dealerHitsSoft17 of [true, false]) {
    for (const lateSurrender of [true, false]) {
      it(`maps every ${dealerHitsSoft17 ? "H17" : "S17"}${lateSurrender ? " LS" : ""} row onto a real grid cell`, () => {
        const cells = deviationGridCells({ dealerHitsSoft17, lateSurrender });
        expect(cells.size).toBeGreaterThan(0);
        for (const key of cells.keys()) expect(valid.has(key), `${key} is not a grid cell`).toBe(true);
      });
    }
  }

  it("translates the catalog's hand labels", () => {
    const cells = deviationGridCells({ dealerHitsSoft17: true, lateSurrender: true });
    expect(cells.has("pairs:T,Tv4")).toBe(true);   // catalog "10,10"
    expect(cells.has("soft:A,9v4")).toBe(true);     // catalog "Soft 20"
    expect(cells.has("hard:16v9")).toBe(true);
  });

  it("excludes insurance, which has no cell", () => {
    for (const key of deviationGridCells({ dealerHitsSoft17: true, lateSurrender: true }).keys()) {
      expect(key).not.toContain("Insurance");
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd blackjack && npx vitest run lib/blackjack/deviationChart.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mapping**

```ts
import { DeviationRules, DeviationTrainingRow, deviationTrainingRows } from "./deviations";
import { StrategySectionId } from "./strategyChart";

export const INSURANCE_ROW = "Insurance";

export interface DeviationCell { row: DeviationTrainingRow; index: number; atOrBelow: boolean }

/** Catalog hand labels are not chart row labels: "10,10" is the "T,T" row and "Soft 20" is "A,9". */
function coordinate(hand: string): { section: StrategySectionId; row: string } | null {
  if (hand === INSURANCE_ROW) return null;
  const soft = /^Soft (\d{1,2})$/.exec(hand);
  if (soft) return { section: "soft", row: `A,${Number(soft[1]) - 11}` };
  const pair = /^(A|\d{1,2}),(A|\d{1,2})$/.exec(hand);
  if (pair) return { section: "pairs", row: pair[1] === "10" ? "T,T" : hand };
  return { section: "hard", row: hand };
}

export function deviationGridCells(rules: DeviationRules, decks = 6): Map<string, DeviationCell> {
  const cells = new Map<string, DeviationCell>();
  for (const entry of deviationTrainingRows(rules, decks)) {
    const at = coordinate(entry.row.hand);
    if (!at) continue;
    cells.set(`${at.section}:${at.row}v${entry.row.dealer}`, { row: entry, index: entry.row.index, atOrBelow: entry.transition.atOrBelow });
  }
  return cells;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd blackjack && npx vitest run lib/blackjack/deviationChart.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the tab and the strategy-tab markers**

In `StrategyChartPage.tsx`: build the cell map once per rules change with `useMemo`. On the **deviation tab**, a mapped cell shows the departure action and its signed index (`S 0+` / `H −1−`); unmapped cells are muted. On the **strategy tab**, a mapped cell gets a small corner marker with the index in its `title`. Above the deviation grid, render the insurance callout (`Insurance: take at TC +3 or above`). When `decks !== 6`, render a line stating the indices shown are the 4–8 deck sets.

Carry across from `DeviationReferencePage.tsx` before deleting it: the EV impact and fires-per-100 into each cell's tooltip via `DEVIATION_RANKING`, and the `DEVIATION_RANKING_METADATA` methodology paragraphs verbatim below the grid.

- [ ] **Step 6: Retire the old page**

Delete `blackjack/components/DeviationReferencePage.tsx`. In `DynamicPage.tsx`, remove its `dynamicPage` import and its `"reference/deviations"` map entry. In `lib/routes.ts`, add to `LEGACY_REDIRECTS`:

```ts
  "reference/deviations": "/reference/basic-strategy",
```

and remove `["reference", "deviations"]` from the explicit `ROUTES` list, since the redirect keys now contribute it.

- [ ] **Step 7: Verify and commit**

Run: `cd blackjack && npm run lint && npx tsc --noEmit && npm test && npm run build`
Then check `/reference/deviations` redirects and both tabs render.

```bash
git add -A && git commit -m "Add the deviation chart tab and retire the deviation reference page"
```

---

### Task 6: Single- and double-deck grids

**Files:**
- Modify: `blackjack/lib/blackjack/strategyTables.ts`
- Modify: `blackjack/lib/blackjack/strategyTables.test.ts`

- [ ] **Step 1: Add the four grids**

Add these keys to `TABLES` and remove the `as Record<...>` cast, so the type is complete by construction.

```ts
  "2/h17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S   S
      8,8    P   P   P   P   P   P   P   P   P  Rp
      7,7    P   P   P   P   P   P  Ph   H   H   H
      6,6    P   P   P   P   P  Ph   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H   H  Ph  Ph   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P   H   H   H   H
      2,2   Ph  Ph   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S  Ds   S   S   S   S   S
      A,7    S  Ds  Ds  Ds  Ds   S   S   H   H   H
      A,6    H   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   H   D   D   H   H   H   H   H
      A,2    H   H   H   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S  Rs
      16     S   S   S   S   S   H   H   H  Rh  Rh
      15     S   S   S   S   S   H   H   H  Rh  Rh
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   D
      10     D   D   D   D   D   D   D   D   H   H
      9      D   D   D   D   D   H   H   H   H   H
      8      H   H   H   H   H   H   H   H   H   H
    `,
  },
  "2/s17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S   S
      8,8    P   P   P   P   P   P   P   P   P   P
      7,7    P   P   P   P   P   P  Ph   H   H   H
      6,6    P   P   P   P   P  Ph   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H   H  Ph  Ph   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P   H   H   H   H
      2,2   Ph  Ph   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S   S   S   S   S   S   S
      A,7    S  Ds  Ds  Ds  Ds   S   S   H   H   H
      A,6    H   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   H   D   D   H   H   H   H   H
      A,2    H   H   H   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S   S
      16     S   S   S   S   S   H   H   H  Rh  Rh
      15     S   S   S   S   S   H   H   H  Rh   H
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   H
      10     D   D   D   D   D   D   D   D   H   H
      9      D   D   D   D   D   H   H   H   H   H
      8      H   H   H   H   H   H   H   H   H   H
    `,
  },
  "1/h17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S  Ps
      8,8    P   P   P   P   P   P   P   P   P   P
      7,7    P   P   P   P   P   P  Ph   H  Rs  Rh
      6,6    P   P   P   P   P  Ph   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H  Ph  Pd  Pd   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P  Ph   H   H   H
      2,2   Ph   P   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S  Ds   S   S   S   S   S
      A,7    S  Ds  Ds  Ds  Ds   S   S   H   H   H
      A,6    D   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   D   D   D   H   H   H   H   H
      A,2    H   H   D   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S  Rs
      16     S   S   S   S   S   H   H   H  Rh  Rh
      15     S   S   S   S   S   H   H   H   H   H
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   D
      10     D   D   D   D   D   D   D   D   H   H
      9      D   D   D   D   D   H   H   H   H   H
      8      H   H   H   D   D   H   H   H   H   H
    `,
  },
  "1/s17": {
    pairs: `
      A,A    P   P   P   P   P   P   P   P   P   P
      T,T    S   S   S   S   S   S   S   S   S   S
      9,9    P   P   P   P   P   S   P   P   S   S
      8,8    P   P   P   P   P   P   P   P   P   P
      7,7    P   P   P   P   P   P  Ph   H  Rs   H
      6,6    P   P   P   P   P  Ph   H   H   H   H
      5,5    D   D   D   D   D   D   D   D   H   H
      4,4    H   H  Ph  Pd  Pd   H   H   H   H   H
      3,3   Ph  Ph   P   P   P   P  Ph   H   H   H
      2,2   Ph   P   P   P   P   P   H   H   H   H
    `,
    soft: `
      A,9    S   S   S   S   S   S   S   S   S   S
      A,8    S   S   S   S  Ds   S   S   S   S   S
      A,7    S  Ds  Ds  Ds  Ds   S   S   H   H   S
      A,6    D   D   D   D   D   H   H   H   H   H
      A,5    H   H   D   D   D   H   H   H   H   H
      A,4    H   H   D   D   D   H   H   H   H   H
      A,3    H   H   D   D   D   H   H   H   H   H
      A,2    H   H   D   D   D   H   H   H   H   H
    `,
    hard: `
      17     S   S   S   S   S   S   S   S   S   S
      16     S   S   S   S   S   H   H   H  Rh  Rh
      15     S   S   S   S   S   H   H   H   H   H
      14     S   S   S   S   S   H   H   H   H   H
      13     S   S   S   S   S   H   H   H   H   H
      12     H   H   S   S   S   H   H   H   H   H
      11     D   D   D   D   D   D   D   D   D   D
      10     D   D   D   D   D   D   D   D   H   H
      9      D   D   D   D   D   H   H   H   H   H
      8      H   H   H   D   D   H   H   H   H   H
    `,
  },
```

- [ ] **Step 2: Add the deck-class difference test**

This makes the 1D/2D data reviewable rather than merely present — it asserts *exactly* which cells differ from the 4+ chart, so an accidental edit is loud:

```ts
import { chartCode } from "./strategyChart";

describe("deck-class differences", () => {
  const base = { dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "late" as const, doubleRule: "any" as const, europeanNoHoleCard: false };
  const differences = (decks: number) => {
    const out: string[] = [];
    for (const section of ["pairs", "soft", "hard"] as const) {
      for (const row of STRATEGY_ROWS[section]) {
        for (const dealer of CHART_DEALERS) {
          const few = chartCode({ ...base, decks }, section, row, dealer);
          const many = chartCode({ ...base, decks: 6 }, section, row, dealer);
          if (few !== many) out.push(`${section}:${row}v${dealer} ${many}->${few}`);
        }
      }
    }
    return out;
  };

  it("lists the double-deck H17 departures from the 4-8 deck chart", () => {
    expect(differences(2)).toEqual([
      "pairs:7,7v8 H->Ph",
      "pairs:6,6v2 Ph->P",
      "pairs:6,6v7 H->Ph",
      "soft:A,7v2 Ds->S",
      "hard:17vA S->Rs",
      "hard:16v9 Rh->H",
      "hard:9v2 H->D",
    ]);
  });

  it("lists the single-deck H17 departures from the 4-8 deck chart", () => {
    expect(differences(1).length).toBeGreaterThan(differences(2).length);
  });
});
```

If the first expectation fails, the actual list Vitest prints **is** the correct list provided every entry is defensible — read each one, confirm it against the grids above, then paste it in. Do not paste it in blind.

- [ ] **Step 3: Enable the deck selector**

In `StrategyChartPage.tsx`, offer 1, 2, 4, 6, 8 in the deck `Select`.

- [ ] **Step 4: Run and commit**

```bash
cd blackjack && npm test && npm run lint && npx tsc --noEmit
git add -A && git commit -m "Add single- and double-deck strategy grids"
```

---

### Task 7: Double restrictions and the ENHC adjustment

**Files:**
- Modify: `blackjack/lib/blackjack/strategyChart.ts`
- Modify: `blackjack/lib/blackjack/strategyChart.test.ts`
- Modify: `blackjack/components/StrategyChartPage.tsx`

ENHC is a rule, not a table. Against a dealer 10 or Ace only: a doubling cell demotes as if doubling were unavailable, and a splitting cell resolves instead on the corresponding hard or soft **total** row with both doubling and splitting unavailable. The one exception is `A,A` v 10, which still splits.

- [ ] **Step 1: Write the failing test**

```ts
describe("ENHC", () => {
  const enhc = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "none" as const, doubleRule: "any" as const, europeanNoHoleCard: true };
  const peek = { ...enhc, europeanNoHoleCard: false };

  it("does not double into a ten or an ace", () => {
    expect(chartCell(peek, "hard", "11", "10").action).toBe("D");
    expect(chartCell(enhc, "hard", "11", "10").action).toBe("H");
    expect(chartCell(enhc, "hard", "11", "A").action).toBe("H");
  });

  it("still doubles against everything else", () => {
    expect(chartCell(enhc, "hard", "11", "6").action).toBe("D");
  });

  it("does not split eights into a ten or an ace", () => {
    expect(chartCell(enhc, "pairs", "8,8", "10").action).toBe("H");
    expect(chartCell(enhc, "pairs", "8,8", "A").action).toBe("H");
  });

  it("still splits aces against a ten", () => {
    expect(chartCell(enhc, "pairs", "A,A", "10").action).toBe("P");
    expect(chartCell(enhc, "pairs", "A,A", "A").action).not.toBe("P");
  });

  it("leaves cells against small upcards alone", () => {
    expect(chartCell(enhc, "pairs", "8,8", "6").action).toBe("P");
  });
});

describe("double restrictions", () => {
  const base = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "none" as const, europeanNoHoleCard: false };

  it("keeps hard 10 and 11 under every restriction", () => {
    for (const doubleRule of ["any", "9-11", "10-11"] as const) {
      expect(chartCell({ ...base, doubleRule }, "hard", "11", "5").action).toBe("D");
    }
  });

  it("drops hard 9 under 10-11 only", () => {
    expect(chartCell({ ...base, doubleRule: "9-11" }, "hard", "9", "5").action).toBe("D");
    expect(chartCell({ ...base, doubleRule: "10-11" }, "hard", "9", "5").action).toBe("H");
  });

  it("drops every soft double, standing where the code says so", () => {
    expect(chartCell({ ...base, doubleRule: "9-11" }, "soft", "A,7", "4").action).toBe("S");
    expect(chartCell({ ...base, doubleRule: "9-11" }, "soft", "A,4", "5").action).toBe("H");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd blackjack && npx vitest run lib/blackjack/strategyChart.test.ts -t ENHC`
Expected: FAIL — ENHC currently ignored.

- [ ] **Step 3: Implement**

In `chartCell`, after computing the resolved cell, apply the adjustment:

```ts
const isTenOrAce = dealer === "10" || dealer === "A";
if (rules.europeanNoHoleCard && isTenOrAce && !(section === "pairs" && row === "A,A" && dealer === "10")) {
  if (resolved.action === "D") {
    return { ...resolveCode(code, { ...options, canDouble: false }), code };
  }
  if (resolved.action === "P") {
    // Replay on the hand's own total row, where neither doubling nor splitting is available.
    const total = TOTAL_ROW_FOR_PAIR[row];
    return { ...chartCell(rules, total.section, total.row, dealer, { canDouble: false, canSplit: false }), code };
  }
}
```

Add the lookup beside it — `A,A` is excluded because it is handled by the exception above:

```ts
const TOTAL_ROW_FOR_PAIR: Record<string, { section: StrategySectionId; row: string }> = {
  "T,T": { section: "hard", row: "17" }, "9,9": { section: "hard", row: "17" }, "8,8": { section: "hard", row: "16" },
  "7,7": { section: "hard", row: "14" }, "6,6": { section: "hard", row: "12" }, "5,5": { section: "hard", row: "10" },
  "4,4": { section: "hard", row: "8" }, "3,3": { section: "hard", row: "8" }, "2,2": { section: "hard", row: "8" },
  "A,A": { section: "soft", row: "A,A" },
};
```

Note `T,T` and `9,9` map to `17`, the grid's top hard row, because hard 18+ is unconditional stand and has no row — the chart's footnote covers it.

- [ ] **Step 4: Run, add the controls, commit**

Add `doubleRule` and ENHC controls to the rules panel. Then:

```bash
cd blackjack && npm test && npm run lint && npx tsc --noEmit
git add -A && git commit -m "Add double restrictions and the ENHC adjustment to the chart"
```

---

### Task 8: Early surrender (cuttable)

**Files:**
- Modify: `blackjack/lib/blackjack/strategyTables.ts`, `strategyChart.ts`, `strategyChart.test.ts`, `StrategyChartPage.tsx`

Almost no live game offers early surrender. Cut this task entirely if the rest is wanted sooner — nothing else depends on it.

- [ ] **Step 1: Write the failing test**

```ts
describe("early surrender", () => {
  const early = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "early" as const, doubleRule: "any" as const, europeanNoHoleCard: false };
  const late = { ...early, surrender: "late" as const };

  it("surrenders the extra cells against an ace", () => {
    for (const row of ["12", "13", "14", "17"]) expect(chartCell(early, "hard", row, "A").action).toBe("R");
    expect(chartCell(late, "hard", "13", "A").action).toBe("S");
  });

  it("surrenders eights against a ten and an ace", () => {
    expect(chartCell(early, "pairs", "8,8", "10").action).toBe("R");
    expect(chartCell(early, "pairs", "8,8", "A").action).toBe("R");
  });

  it("leaves the late-surrender cells unchanged", () => {
    expect(chartCell(early, "hard", "16", "9").action).toBe("R");
    expect(chartCell(early, "hard", "16", "10").action).toBe("R");
  });
});
```

- [ ] **Step 2: Add the override layer**

In `strategyTables.ts`:

```ts
/**
 * Early surrender is decided before the dealer checks for blackjack, so more
 * hands are worth giving up. Hard 5, 6 and 7 versus an ace also surrender, but
 * they sit outside the rendered rows and are carried as a footnote instead.
 */
export const EARLY_SURRENDER_CELLS: readonly string[] = [
  "pairs:8,8v10", "pairs:8,8vA",
  "hard:12vA", "hard:13vA", "hard:14vA", "hard:15vA", "hard:16vA", "hard:17vA",
  "hard:14v10", "hard:15v10", "hard:16v10",
  "hard:16v9",
];
```

In `chartCode`, before returning: when `rules.surrender === "early"` and the key is in that set, return `Rh` (or `Rs` where the underlying code stands — check the base code and pick `Rs` if it is `S`, otherwise `Rh`).

- [ ] **Step 3: Run and commit**

```bash
cd blackjack && npm test && npm run lint && npx tsc --noEmit
git add -A && git commit -m "Add early surrender to the strategy chart"
```

---

## Self-review notes

- **Spec coverage.** Rule-driven cells → Tasks 2, 6, 7, 8. Shared grid renderer → Task 4. `basicStrategy` reimplementation behind its existing signature → Task 3. Deviation mapping → Task 5. Parity gate → Task 2 Step 4 and Task 3. `bjaH17Chart` oracle → Task 2 Step 5. Rules-from-Settings → Task 4 Step 3. Routing fix → Task 4 Step 1. Retirement of the deviation page and what it costs → Task 5 Step 5/6.
- **Known open decision.** Task 3 Step 5 needs a user answer (targeted artifact patch vs full regeneration). It is the only step in the plan that cannot be executed without one.
- **Deferred to implementation.** Task 4 Step 3 and Task 5 Step 5 describe component markup in prose rather than complete JSX, because component code here is not unit-tested and the visual design is better settled in the browser. Every step that has a test has that test written out in full.
