# H17 Chart Drill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A drill at `/training/h17-chart` where the user reproduces the whole Blackjack Apprenticeship H17 deviation chart by typing one keystroke per cell, tabbing through all 320 cells.

**Architecture:** Two pure, unit-tested modules under `lib/blackjack/` — the chart data and the keystroke grammar/grading — plus one React component that renders four `<table>`s of `<input>` cells and routes every keystroke through the grammar reducer. The component owns focus and buffers; it owns no chart knowledge.

**Tech Stack:** Next.js 15 (App Router, static export), React 19, TypeScript, Tailwind 3, Vitest 3. All commands run from `blackjack/`.

**Spec:** `docs/superpowers/specs/2026-08-22-h17-chart-drill-design.md`

## Global Constraints

- All paths in this plan are relative to `blackjack/` unless they start with `docs/` or are `THIRD_PARTY_NOTICES.md`, which live at the repo root.
- Commands: `npm test` (Vitest), `npm run lint` (must pass with `--max-warnings=0`), `npm run build`.
- The repo has **no component tests and no testing-library dependency**. Do not add one. Only `lib/**` modules get automated tests; component behaviour is verified by running the dev server.
- The app is a **static export**. Everything is client-side; no server code, no data fetching.
- Existing code style: double quotes, no semicolon-free style (semicolons are used), 2-space indent, `@/` import alias for the `blackjack/` root.
- The drill **ignores** the user's `Settings` (decks, H17/S17, DAS, surrender). It is a fixed printed chart.
- Never modify `lib/blackjack/h17Pro.ts`, `s17Pro.ts`, `deviations.ts`, `deviationRanking*`, or `components/Drills.tsx`. This feature is additive.
- `blackjack/components/DynamicPage.tsx` has **pre-existing uncommitted changes** in the working tree (a rewrite of `StrategyReference`). Do not revert, restage, or commit those hunks. Stage only your own hunks with `git add -p` if needed.
- Work happens on branch `h17-chart-drill`, which already exists and holds the spec commit.

---

### Task 1: Chart data module

**Files:**
- Create: `lib/blackjack/bjaH17Chart.ts`
- Test: `lib/blackjack/bjaH17Chart.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ChartActionValue = "Y" | "N" | "Y/N" | "H" | "S" | "D" | "Ds" | "SUR"`
  - `type ChartToken = { kind: "action"; value: ChartActionValue } | { kind: "index"; value: number; when: "atOrAbove" | "atOrBelow" }`
  - `type ChartSectionId = "pairs" | "soft" | "hard" | "surrender"`
  - `interface ChartSection { id: ChartSectionId; label: string; rows: readonly string[]; cells: ReadonlyMap<string, ChartToken> }`
  - `const CHART_DEALERS: readonly string[]`
  - `const BJA_H17_SECTIONS: readonly ChartSection[]`
  - `function cellKey(section: ChartSectionId, row: string, dealer: string): string`
  - `function chartToken(section: ChartSection, row: string, dealer: string): ChartToken`
  - `function formatToken(token: ChartToken): string`

- [ ] **Step 1: Write the failing test**

Create `lib/blackjack/bjaH17Chart.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BJA_H17_SECTIONS,
  CHART_DEALERS,
  ChartSection,
  cellKey,
  formatToken,
} from "./bjaH17Chart";

const section = (id: string): ChartSection => {
  const found = BJA_H17_SECTIONS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no section ${id}`);
  return found;
};
const cell = (id: string, row: string, dealer: string) =>
  formatToken(section(id).cells.get(cellKey(section(id).id, row, dealer))!);

describe("BJA H17 chart", () => {
  it("has the printed dealer upcards", () => {
    expect(CHART_DEALERS).toEqual(["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"]);
  });

  it("has the printed row counts and a full grid for each", () => {
    expect(BJA_H17_SECTIONS.map((s) => [s.id, s.rows.length])).toEqual([
      ["pairs", 10],
      ["soft", 8],
      ["hard", 10],
      ["surrender", 4],
    ]);
    for (const chartSection of BJA_H17_SECTIONS) {
      expect(chartSection.cells.size).toBe(chartSection.rows.length * CHART_DEALERS.length);
    }
  });

  it("totals 320 cells", () => {
    const total = BJA_H17_SECTIONS.reduce((sum, chartSection) => sum + chartSection.cells.size, 0);
    expect(total).toBe(320);
  });

  it("carries exactly the 26 printed index cells", () => {
    const indices: string[] = [];
    for (const chartSection of BJA_H17_SECTIONS) {
      for (const row of chartSection.rows) {
        for (const dealer of CHART_DEALERS) {
          const token = chartSection.cells.get(cellKey(chartSection.id, row, dealer))!;
          if (token.kind === "index") indices.push(`${chartSection.id} ${row}v${dealer} ${formatToken(token)}`);
        }
      }
    }
    expect(indices).toEqual([
      "pairs T,Tv4 6+",
      "pairs T,Tv5 5+",
      "pairs T,Tv6 4+",
      "soft A,8v4 3+",
      "soft A,8v5 1+",
      "soft A,8v6 0-",
      "soft A,6v2 1+",
      "hard 16v9 4+",
      "hard 16v10 0+",
      "hard 16vA 3+",
      "hard 15v10 4+",
      "hard 15vA 5+",
      "hard 13v2 -1-",
      "hard 12v2 3+",
      "hard 12v3 2+",
      "hard 12v4 0-",
      "hard 10v10 4+",
      "hard 10vA 3+",
      "hard 9v2 1+",
      "hard 9v7 3+",
      "hard 8v6 2+",
      "surrender 16v8 4+",
      "surrender 16v9 -1-",
      "surrender 15v9 2+",
      "surrender 15v10 0-",
      "surrender 15vA -1+",
    ]);
  });

  it("matches the print on the cells most easily mis-transcribed", () => {
    // Surrender 15 v 10 and hard 15 v 10 disagree by design: the chart as
    // printed surrenders at TC <= 0, hits +1..+3, and stands at +4 and above.
    expect(cell("surrender", "15", "10")).toBe("0-");
    expect(cell("hard", "15", "10")).toBe("4+");
    expect(cell("surrender", "16", "9")).toBe("-1-");
    expect(cell("surrender", "17", "A")).toBe("SUR");
    expect(cell("surrender", "14", "10")).toBe("N");
    expect(cell("pairs", "9,9", "7")).toBe("N");
    expect(cell("pairs", "9,9", "8")).toBe("Y");
    expect(cell("pairs", "T,T", "4")).toBe("6+");
    expect(cell("pairs", "4,4", "5")).toBe("Y/N");
    expect(cell("soft", "A,7", "6")).toBe("Ds");
    expect(cell("soft", "A,7", "9")).toBe("H");
    expect(cell("hard", "8", "6")).toBe("2+");
    expect(cell("hard", "9", "7")).toBe("3+");
  });

  it("renders every section exactly as printed", () => {
    const rendered = BJA_H17_SECTIONS.map((chartSection) => {
      const lines = chartSection.rows.map((row) =>
        `${row} ${CHART_DEALERS.map((dealer) =>
          formatToken(chartSection.cells.get(cellKey(chartSection.id, row, dealer))!)).join(" ")}`);
      return `${chartSection.label}\n${lines.join("\n")}`;
    }).join("\n\n");

    expect(rendered).toBe(`Pair splitting
A,A Y Y Y Y Y Y Y Y Y Y
T,T N N 6+ 5+ 4+ N N N N N
9,9 Y Y Y Y Y N Y Y N N
8,8 Y Y Y Y Y Y Y Y Y Y
7,7 Y Y Y Y Y Y N N N N
6,6 Y/N Y Y Y Y N N N N N
5,5 N N N N N N N N N N
4,4 N N N Y/N Y/N N N N N N
3,3 Y/N Y/N Y Y Y Y N N N N
2,2 Y/N Y/N Y Y Y Y N N N N

Soft totals
A,9 S S S S S S S S S S
A,8 S S 3+ 1+ 0- S S S S S
A,7 Ds Ds Ds Ds Ds S S H H H
A,6 1+ D D D D H H H H H
A,5 H H D D D H H H H H
A,4 H H D D D H H H H H
A,3 H H H D D H H H H H
A,2 H H H D D H H H H H

Hard totals
17 S S S S S S S S S S
16 S S S S S H H 4+ 0+ 3+
15 S S S S S H H H 4+ 5+
14 S S S S S H H H H H
13 -1- S S S S H H H H H
12 3+ 2+ 0- S S H H H H H
11 D D D D D D D D D D
10 D D D D D D D D 4+ 3+
9 1+ D D D D 3+ H H H H
8 H H H H 2+ H H H H H

Late surrender
17 N N N N N N N N N SUR
16 N N N N N N 4+ -1- SUR SUR
15 N N N N N N N 2+ 0- -1+
14 N N N N N N N N N N`);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- bjaH17Chart`
Expected: FAIL — `Failed to resolve import "./bjaH17Chart"`.

- [ ] **Step 3: Write the implementation**

Create `lib/blackjack/bjaH17Chart.ts`:

```ts
/**
 * The Blackjack Apprenticeship H17 deviation chart (2018), from BJA_H17.pdf.
 *
 * Transcribed from the PDF's text layer rather than read by eye: every cell is
 * a positioned span, and the deviation cells are exactly the spans drawn in the
 * chart's red (#ef4850). The tables below are laid out to read like the printed
 * chart so a diff against the source stays legible.
 *
 * Blank cells in the late-surrender table are stored as "N". The drill has the
 * user type `n` in them, which keeps an empty cell meaning *unanswered* rather
 * than *answered no*.
 *
 * The chart's legend notes that `0-` and `0+` mean any negative / any positive
 * *running* count, where every other index is a true count. That is explanatory
 * only — the printed cell is what the drill asks for.
 */

export const CHART_DEALERS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"] as const;

export type ChartActionValue = "Y" | "N" | "Y/N" | "H" | "S" | "D" | "Ds" | "SUR";

export type ChartToken =
  | { kind: "action"; value: ChartActionValue }
  | { kind: "index"; value: number; when: "atOrAbove" | "atOrBelow" };

export type ChartSectionId = "pairs" | "soft" | "hard" | "surrender";

export interface ChartSection {
  id: ChartSectionId;
  label: string;
  /** Hand labels in printed order, top to bottom. */
  rows: readonly string[];
  /** Keyed by `cellKey`. */
  cells: ReadonlyMap<string, ChartToken>;
}

/** Identifies one cell across the whole chart, and doubles as the entry key. */
export const cellKey = (section: ChartSectionId, row: string, dealer: string) =>
  `${section}:${row}v${dealer}`;

export const formatToken = (token: ChartToken) =>
  token.kind === "action" ? token.value : `${token.value}${token.when === "atOrAbove" ? "+" : "-"}`;

const ACTION_VALUES: readonly string[] = ["Y", "N", "Y/N", "H", "S", "D", "Ds", "SUR"];

function parsePrintedCell(text: string): ChartToken {
  if (ACTION_VALUES.includes(text)) return { kind: "action", value: text as ChartActionValue };
  const index = /^(-?\d{1,2})([+-])$/.exec(text);
  if (!index) throw new Error(`Unreadable chart cell: "${text}"`);
  return {
    kind: "index",
    value: Number(index[1]),
    when: index[2] === "+" ? "atOrAbove" : "atOrBelow",
  };
}

function section(id: ChartSectionId, label: string, printed: string): ChartSection {
  const rows: string[] = [];
  const cells = new Map<string, ChartToken>();
  for (const line of printed.trim().split("\n")) {
    const [row, ...values] = line.trim().split(/\s+/);
    if (values.length !== CHART_DEALERS.length) {
      throw new Error(`${id} row ${row}: ${values.length} cells, expected ${CHART_DEALERS.length}`);
    }
    rows.push(row);
    values.forEach((value, column) => cells.set(cellKey(id, row, CHART_DEALERS[column]), parsePrintedCell(value)));
  }
  return { id, label, rows, cells };
}

export const BJA_H17_SECTIONS: readonly ChartSection[] = [
  section("pairs", "Pair splitting", `
    A,A  Y    Y    Y   Y    Y    Y  Y  Y  Y  Y
    T,T  N    N    6+  5+   4+   N  N  N  N  N
    9,9  Y    Y    Y   Y    Y    N  Y  Y  N  N
    8,8  Y    Y    Y   Y    Y    Y  Y  Y  Y  Y
    7,7  Y    Y    Y   Y    Y    Y  N  N  N  N
    6,6  Y/N  Y    Y   Y    Y    N  N  N  N  N
    5,5  N    N    N   N    N    N  N  N  N  N
    4,4  N    N    N   Y/N  Y/N  N  N  N  N  N
    3,3  Y/N  Y/N  Y   Y    Y    Y  N  N  N  N
    2,2  Y/N  Y/N  Y   Y    Y    Y  N  N  N  N
  `),
  section("soft", "Soft totals", `
    A,9  S   S   S   S   S   S  S  S  S  S
    A,8  S   S   3+  1+  0-  S  S  S  S  S
    A,7  Ds  Ds  Ds  Ds  Ds  S  S  H  H  H
    A,6  1+  D   D   D   D   H  H  H  H  H
    A,5  H   H   D   D   D   H  H  H  H  H
    A,4  H   H   D   D   D   H  H  H  H  H
    A,3  H   H   H   D   D   H  H  H  H  H
    A,2  H   H   H   D   D   H  H  H  H  H
  `),
  section("hard", "Hard totals", `
    17  S    S   S   S  S   S   S  S   S   S
    16  S    S   S   S  S   H   H  4+  0+  3+
    15  S    S   S   S  S   H   H  H   4+  5+
    14  S    S   S   S  S   H   H  H   H   H
    13  -1-  S   S   S  S   H   H  H   H   H
    12  3+   2+  0-  S  S   H   H  H   H   H
    11  D    D   D   D  D   D   D  D   D   D
    10  D    D   D   D  D   D   D  D   4+  3+
    9   1+   D   D   D  D   3+  H  H   H   H
    8   H    H   H   H  2+  H   H  H   H   H
  `),
  section("surrender", "Late surrender", `
    17  N  N  N  N  N  N  N   N    N    SUR
    16  N  N  N  N  N  N  4+  -1-  SUR  SUR
    15  N  N  N  N  N  N  N   2+   0-   -1+
    14  N  N  N  N  N  N  N   N    N    N
  `),
];

export function chartToken(chartSection: ChartSection, row: string, dealer: string): ChartToken {
  const token = chartSection.cells.get(cellKey(chartSection.id, row, dealer));
  if (!token) throw new Error(`No chart cell for ${chartSection.id} ${row} vs ${dealer}`);
  return token;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- bjaH17Chart`
Expected: PASS, 6 tests.

If the "renders every section exactly as printed" test fails, the diff shows the exact mis-transcribed cell — fix the literal table, never the expected string.

- [ ] **Step 5: Commit**

```bash
git add lib/blackjack/bjaH17Chart.ts lib/blackjack/bjaH17Chart.test.ts
git commit -m "Add the BJA H17 chart as data"
```

---

### Task 2: Keystroke grammar

**Files:**
- Create: `lib/blackjack/chartEntry.ts`
- Test: `lib/blackjack/chartEntry.test.ts`

**Interfaces:**
- Consumes: `ChartSectionId`, `ChartToken`, `formatToken`, `BJA_H17_SECTIONS`, `CHART_DEALERS`, `cellKey` from `./bjaH17Chart`.
- Produces:
  - `type Disposition = "pending" | "commit" | "ignore" | "back"`
  - `interface FeedResult { buffer: string; disposition: Disposition }`
  - `const SECTION_LETTERS: Record<ChartSectionId, readonly string[]>`
  - `function feedKey(section: ChartSectionId, buffer: string, key: string): FeedResult`
  - `function parseEntry(section: ChartSectionId, buffer: string): ChartToken | null`
  - `function displayBuffer(section: ChartSectionId, buffer: string): string`
  - `function tokensEqual(a: ChartToken | null, b: ChartToken | null): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/blackjack/chartEntry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BJA_H17_SECTIONS, CHART_DEALERS, cellKey, formatToken } from "./bjaH17Chart";
import { displayBuffer, feedKey, parseEntry, SECTION_LETTERS, tokensEqual } from "./chartEntry";

/** Types a whole string into one cell and returns the final buffer + disposition. */
const type = (section: Parameters<typeof feedKey>[0], keys: string) =>
  [...keys].reduce(
    (state, key) => feedKey(section, state.buffer, key),
    { buffer: "", disposition: "pending" } as ReturnType<typeof feedKey>,
  );

describe("feedKey", () => {
  it("commits a one-key answer and advances", () => {
    expect(feedKey("hard", "", "s")).toEqual({ buffer: "s", disposition: "commit" });
    expect(feedKey("hard", "", "h")).toEqual({ buffer: "h", disposition: "commit" });
    expect(feedKey("hard", "", "d")).toEqual({ buffer: "d", disposition: "commit" });
    expect(feedKey("surrender", "", "r")).toEqual({ buffer: "r", disposition: "commit" });
    expect(feedKey("surrender", "", "n")).toEqual({ buffer: "n", disposition: "commit" });
    expect(feedKey("pairs", "", "n")).toEqual({ buffer: "n", disposition: "commit" });
  });

  it("holds the two keys that can start a longer token", () => {
    expect(feedKey("pairs", "", "y")).toEqual({ buffer: "y", disposition: "pending" });
    expect(feedKey("pairs", "y", "n")).toEqual({ buffer: "yn", disposition: "commit" });
    expect(feedKey("soft", "", "d")).toEqual({ buffer: "d", disposition: "pending" });
    expect(feedKey("soft", "d", "s")).toEqual({ buffer: "ds", disposition: "commit" });
  });

  it("ignores keys outside the section's alphabet", () => {
    expect(feedKey("hard", "", "p")).toEqual({ buffer: "", disposition: "ignore" });
    expect(feedKey("hard", "", "y")).toEqual({ buffer: "", disposition: "ignore" });
    expect(feedKey("hard", "d", "s")).toEqual({ buffer: "d", disposition: "ignore" });
    expect(feedKey("surrender", "", "s")).toEqual({ buffer: "", disposition: "ignore" });
    expect(feedKey("pairs", "y", "y")).toEqual({ buffer: "y", disposition: "ignore" });
    expect(feedKey("soft", "", "r")).toEqual({ buffer: "", disposition: "ignore" });
  });

  it("is case-insensitive", () => {
    expect(feedKey("hard", "", "S")).toEqual({ buffer: "s", disposition: "commit" });
    expect(feedKey("pairs", "y", "N")).toEqual({ buffer: "yn", disposition: "commit" });
  });

  it("builds an index and commits on the sign", () => {
    expect(type("hard", "4+")).toEqual({ buffer: "4+", disposition: "commit" });
    expect(type("hard", "0-")).toEqual({ buffer: "0-", disposition: "commit" });
    expect(type("hard", "0+")).toEqual({ buffer: "0+", disposition: "commit" });
    expect(type("hard", "-1-")).toEqual({ buffer: "-1-", disposition: "commit" });
    expect(type("surrender", "-1+")).toEqual({ buffer: "-1+", disposition: "commit" });
    expect(type("pairs", "6+")).toEqual({ buffer: "6+", disposition: "commit" });
    expect(type("hard", "10+")).toEqual({ buffer: "10+", disposition: "commit" });
  });

  it("holds a partial index", () => {
    expect(feedKey("hard", "", "4")).toEqual({ buffer: "4", disposition: "pending" });
    expect(feedKey("hard", "", "-")).toEqual({ buffer: "-", disposition: "pending" });
    expect(feedKey("hard", "-", "1")).toEqual({ buffer: "-1", disposition: "pending" });
  });

  it("rejects index shapes the chart never prints", () => {
    expect(feedKey("hard", "", "+")).toEqual({ buffer: "", disposition: "ignore" });
    expect(feedKey("hard", "-", "+")).toEqual({ buffer: "-", disposition: "ignore" });
    expect(feedKey("hard", "10", "0")).toEqual({ buffer: "10", disposition: "ignore" });
    expect(feedKey("hard", "4", "s")).toEqual({ buffer: "4", disposition: "ignore" });
  });

  it("deletes backwards, then hands focus back", () => {
    expect(feedKey("hard", "4+", "Backspace")).toEqual({ buffer: "4", disposition: "pending" });
    expect(feedKey("hard", "4", "Backspace")).toEqual({ buffer: "", disposition: "pending" });
    expect(feedKey("hard", "", "Backspace")).toEqual({ buffer: "", disposition: "back" });
  });

  it("ignores non-character keys", () => {
    expect(feedKey("hard", "s", "Shift")).toEqual({ buffer: "s", disposition: "ignore" });
    expect(feedKey("hard", "s", "ArrowLeft")).toEqual({ buffer: "s", disposition: "ignore" });
  });
});

describe("parseEntry", () => {
  it("maps each section's letters to its printed token", () => {
    expect(parseEntry("pairs", "y")).toEqual({ kind: "action", value: "Y" });
    expect(parseEntry("pairs", "n")).toEqual({ kind: "action", value: "N" });
    expect(parseEntry("pairs", "yn")).toEqual({ kind: "action", value: "Y/N" });
    expect(parseEntry("soft", "ds")).toEqual({ kind: "action", value: "Ds" });
    expect(parseEntry("soft", "d")).toEqual({ kind: "action", value: "D" });
    expect(parseEntry("surrender", "r")).toEqual({ kind: "action", value: "SUR" });
  });

  it("refuses letters from another section", () => {
    expect(parseEntry("hard", "ds")).toBeNull();
    expect(parseEntry("hard", "y")).toBeNull();
    expect(parseEntry("surrender", "s")).toBeNull();
  });

  it("parses indexes in every section", () => {
    expect(parseEntry("hard", "-1-")).toEqual({ kind: "index", value: -1, when: "atOrBelow" });
    expect(parseEntry("surrender", "-1+")).toEqual({ kind: "index", value: -1, when: "atOrAbove" });
    expect(parseEntry("pairs", "6+")).toEqual({ kind: "index", value: 6, when: "atOrAbove" });
    expect(parseEntry("soft", "0-")).toEqual({ kind: "index", value: 0, when: "atOrBelow" });
  });

  it("returns null for an unfinished or nonsense buffer", () => {
    expect(parseEntry("hard", "")).toBeNull();
    expect(parseEntry("hard", "4")).toBeNull();
    expect(parseEntry("hard", "-")).toBeNull();
  });
});

describe("displayBuffer", () => {
  it("shows the printed form once the buffer parses", () => {
    expect(displayBuffer("pairs", "yn")).toBe("Y/N");
    expect(displayBuffer("soft", "ds")).toBe("Ds");
    expect(displayBuffer("surrender", "r")).toBe("SUR");
    expect(displayBuffer("hard", "-1-")).toBe("-1-");
  });

  it("echoes an unfinished buffer", () => {
    expect(displayBuffer("hard", "")).toBe("");
    expect(displayBuffer("hard", "4")).toBe("4");
    expect(displayBuffer("hard", "-")).toBe("-");
  });
});

describe("tokensEqual", () => {
  it("compares value and direction", () => {
    expect(tokensEqual({ kind: "index", value: 4, when: "atOrAbove" }, { kind: "index", value: 4, when: "atOrAbove" })).toBe(true);
    expect(tokensEqual({ kind: "index", value: 4, when: "atOrAbove" }, { kind: "index", value: 4, when: "atOrBelow" })).toBe(false);
    expect(tokensEqual({ kind: "action", value: "Y" }, { kind: "action", value: "Y/N" })).toBe(false);
    expect(tokensEqual(null, { kind: "action", value: "Y" })).toBe(false);
  });
});

describe("the grammar covers the chart", () => {
  it("can express every printed token in the section it appears in", () => {
    for (const chartSection of BJA_H17_SECTIONS) {
      const reachable = new Set<string>(
        SECTION_LETTERS[chartSection.id].map((buffer) => formatToken(parseEntry(chartSection.id, buffer)!)),
      );
      for (const row of chartSection.rows) {
        for (const dealer of CHART_DEALERS) {
          const token = chartSection.cells.get(cellKey(chartSection.id, row, dealer))!;
          const printed = formatToken(token);
          const typable = token.kind === "index"
            ? parseEntry(chartSection.id, printed) !== null
            : reachable.has(printed);
          expect(typable, `${chartSection.id} ${row} v ${dealer} prints "${printed}"`).toBe(true);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- chartEntry`
Expected: FAIL — `Failed to resolve import "./chartEntry"`.

- [ ] **Step 3: Write the implementation**

Create `lib/blackjack/chartEntry.ts`:

```ts
import { ChartSectionId, ChartToken, formatToken } from "./bjaH17Chart";

export type Disposition = "pending" | "commit" | "ignore" | "back";

export interface FeedResult {
  buffer: string;
  disposition: Disposition;
}

/**
 * The letter buffers each section accepts, lowercase. A buffer that another
 * entry extends — "y" before "yn", "d" before "ds" — holds instead of
 * committing, so the user can add the second key or resolve it with Tab.
 */
export const SECTION_LETTERS: Record<ChartSectionId, readonly string[]> = {
  pairs: ["y", "n", "yn"],
  soft: ["h", "s", "d", "ds"],
  hard: ["h", "s", "d"],
  surrender: ["r", "n"],
};

const LETTER_TOKENS: Record<string, ChartToken> = {
  y: { kind: "action", value: "Y" },
  n: { kind: "action", value: "N" },
  yn: { kind: "action", value: "Y/N" },
  h: { kind: "action", value: "H" },
  s: { kind: "action", value: "S" },
  d: { kind: "action", value: "D" },
  ds: { kind: "action", value: "Ds" },
  r: { kind: "action", value: "SUR" },
};

const INDEX_COMPLETE = /^-?\d{1,2}[+-]$/;
/** A legal prefix of an index: a lone minus, or one or two digits. */
const INDEX_PARTIAL = /^-$|^-?\d{1,2}$/;
const INDEX_TOKEN = /^(-?\d{1,2})([+-])$/;

/**
 * Folds one keypress into a cell's buffer. `commit` means the buffer is now an
 * unambiguous token and focus should advance; `pending` means it is a legal
 * prefix and focus stays; `ignore` means the key is not in this section's
 * alphabet and nothing changes; `back` means Backspace on an empty cell, so
 * focus should step to the previous cell.
 */
export function feedKey(section: ChartSectionId, buffer: string, key: string): FeedResult {
  if (key === "Backspace") {
    return buffer
      ? { buffer: buffer.slice(0, -1), disposition: "pending" }
      : { buffer: "", disposition: "back" };
  }
  if (key.length !== 1) return { buffer, disposition: "ignore" };
  const next = buffer + key.toLowerCase();
  const letters = SECTION_LETTERS[section];
  if (letters.includes(next)) {
    const extendable = letters.some((token) => token.length > next.length && token.startsWith(next));
    return { buffer: next, disposition: extendable ? "pending" : "commit" };
  }
  if (INDEX_COMPLETE.test(next)) return { buffer: next, disposition: "commit" };
  if (INDEX_PARTIAL.test(next)) return { buffer: next, disposition: "pending" };
  return { buffer, disposition: "ignore" };
}

/** The token a buffer means, or null while it is unfinished or illegal. */
export function parseEntry(section: ChartSectionId, buffer: string): ChartToken | null {
  const value = buffer.toLowerCase();
  if (SECTION_LETTERS[section].includes(value)) return LETTER_TOKENS[value];
  const index = INDEX_TOKEN.exec(value);
  if (!index) return null;
  return {
    kind: "index",
    value: Number(index[1]),
    when: index[2] === "+" ? "atOrAbove" : "atOrBelow",
  };
}

/** What the cell shows: the printed form once it parses, the raw keys until then. */
export function displayBuffer(section: ChartSectionId, buffer: string): string {
  const token = parseEntry(section, buffer);
  return token ? formatToken(token) : buffer.toUpperCase();
}

export function tokensEqual(a: ChartToken | null, b: ChartToken | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "action" && b.kind === "action") return a.value === b.value;
  return a.kind === "index" && b.kind === "index" && a.value === b.value && a.when === b.when;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- chartEntry`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/blackjack/chartEntry.ts lib/blackjack/chartEntry.test.ts
git commit -m "Add the chart-entry keystroke grammar"
```

---

### Task 3: Grading

**Files:**
- Modify: `lib/blackjack/chartEntry.ts` (append)
- Test: `lib/blackjack/chartEntry.test.ts` (append)

**Interfaces:**
- Consumes: `parseEntry`, `tokensEqual` from Task 2; `ChartSection`, `chartToken`, `cellKey`, `formatToken`, `CHART_DEALERS` from Task 1.
- Produces:
  - `interface CellGrade { key: string; section: ChartSectionId; sectionLabel: string; row: string; dealer: string; typed: string; expected: string; answered: boolean; correct: boolean }`
  - `interface ChartGrade { cells: CellGrade[]; total: number; answered: number; correct: number; wrong: number; skipped: number; bestStreak: number; bySection: Record<string, { correct: number; total: number }> }`
  - `function gradeChart(sections: readonly ChartSection[], entries: Record<string, string>): ChartGrade`
  - `function explainToken(section: ChartSectionId, token: ChartToken): string`

- [ ] **Step 1: Write the failing test**

Append to `lib/blackjack/chartEntry.test.ts`:

```ts
import { BJA_H17_SECTIONS as ALL_SECTIONS } from "./bjaH17Chart";
import { explainToken, gradeChart } from "./chartEntry";

const surrenderSection = ALL_SECTIONS.filter((s) => s.id === "surrender");

describe("gradeChart", () => {
  it("counts an empty run as all skipped", () => {
    const grade = gradeChart(surrenderSection, {});
    expect(grade.total).toBe(40);
    expect(grade.answered).toBe(0);
    expect(grade.correct).toBe(0);
    expect(grade.skipped).toBe(40);
    expect(grade.wrong).toBe(0);
    expect(grade.bestStreak).toBe(0);
  });

  it("marks a cell correct only when value and direction match", () => {
    const grade = gradeChart(surrenderSection, {
      "surrender:16v9": "-1-",
      "surrender:16v10": "r",
      "surrender:15v9": "2-",
      "surrender:14v2": "n",
    });
    const at = (key: string) => grade.cells.find((cell) => cell.key === key)!;
    expect(at("surrender:16v9").correct).toBe(true);
    expect(at("surrender:16v10").correct).toBe(true);
    expect(at("surrender:15v9").correct).toBe(false);
    expect(at("surrender:15v9").expected).toBe("2+");
    expect(at("surrender:15v9").typed).toBe("2-");
    expect(at("surrender:14v2").correct).toBe(true);
    expect(grade.correct).toBe(3);
    expect(grade.wrong).toBe(1);
    expect(grade.skipped).toBe(36);
  });

  it("treats an unfinished buffer as a wrong answer, not a skip", () => {
    const grade = gradeChart(surrenderSection, { "surrender:16v8": "4" });
    const cell = grade.cells.find((entry) => entry.key === "surrender:16v8")!;
    expect(cell.answered).toBe(true);
    expect(cell.correct).toBe(false);
    expect(cell.typed).toBe("4");
    expect(grade.skipped).toBe(39);
  });

  it("measures the longest correct run in chart order", () => {
    const entries: Record<string, string> = {};
    for (const dealer of ["2", "3", "4", "5", "6", "7", "8"]) entries[`surrender:17v${dealer}`] = "n";
    // Breaks the run at 17 v 9, then resumes.
    entries["surrender:17v9"] = "r";
    entries["surrender:17vA"] = "r";
    const grade = gradeChart(surrenderSection, entries);
    expect(grade.bestStreak).toBe(7);
  });

  it("reports accuracy per section label", () => {
    const grade = gradeChart(surrenderSection, { "surrender:14v2": "n" });
    expect(grade.bySection).toEqual({ "Late surrender": { correct: 1, total: 40 } });
  });
});

describe("explainToken", () => {
  it("reads N differently in the split and surrender tables", () => {
    expect(explainToken("pairs", { kind: "action", value: "N" })).toBe("Do not split the pair.");
    expect(explainToken("surrender", { kind: "action", value: "N" })).toBe("Do not surrender.");
  });

  it("spells out the conditional actions", () => {
    expect(explainToken("pairs", { kind: "action", value: "Y/N" }))
      .toBe("Split only if double after split is offered.");
    expect(explainToken("soft", { kind: "action", value: "Ds" }))
      .toBe("Double if allowed, otherwise stand.");
  });

  it("states an index with its direction", () => {
    expect(explainToken("hard", { kind: "index", value: 4, when: "atOrAbove" }))
      .toBe("The chart prints 4+: the deviation applies at true count +4 and above.");
    expect(explainToken("hard", { kind: "index", value: -1, when: "atOrBelow" }))
      .toBe("The chart prints -1-: the deviation applies at true count -1 and below.");
  });

  it("uses the chart's running-count wording for the zero indexes", () => {
    expect(explainToken("hard", { kind: "index", value: 0, when: "atOrBelow" }))
      .toBe("The chart prints 0-: the deviation applies at any negative running count.");
    expect(explainToken("hard", { kind: "index", value: 0, when: "atOrAbove" }))
      .toBe("The chart prints 0+: the deviation applies at any positive running count.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- chartEntry`
Expected: FAIL — `gradeChart is not exported` / `explainToken is not exported`.

- [ ] **Step 3: Write the implementation**

Append to `lib/blackjack/chartEntry.ts` (and extend the top import to
`import { CHART_DEALERS, ChartSection, ChartSectionId, ChartToken, cellKey, chartToken, formatToken } from "./bjaH17Chart";`):

```ts
export interface CellGrade {
  key: string;
  section: ChartSectionId;
  sectionLabel: string;
  row: string;
  dealer: string;
  /** Exactly what the user typed, uppercased for display; "" when untouched. */
  typed: string;
  /** The chart's printed token. */
  expected: string;
  answered: boolean;
  correct: boolean;
}

export interface ChartGrade {
  cells: CellGrade[];
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  skipped: number;
  /** Longest run of consecutive correct cells in printed chart order. */
  bestStreak: number;
  bySection: Record<string, { correct: number; total: number }>;
}

export function gradeChart(
  sections: readonly ChartSection[],
  entries: Record<string, string>,
): ChartGrade {
  const cells: CellGrade[] = [];
  const bySection: Record<string, { correct: number; total: number }> = {};
  let streak = 0;
  let bestStreak = 0;

  for (const section of sections) {
    bySection[section.label] ??= { correct: 0, total: 0 };
    for (const row of section.rows) {
      for (const dealer of CHART_DEALERS) {
        const key = cellKey(section.id, row, dealer);
        const buffer = entries[key] ?? "";
        const expected = chartToken(section, row, dealer);
        const correct = tokensEqual(parseEntry(section.id, buffer), expected);
        cells.push({
          key,
          section: section.id,
          sectionLabel: section.label,
          row,
          dealer,
          typed: displayBuffer(section.id, buffer),
          expected: formatToken(expected),
          answered: buffer.length > 0,
          correct,
        });
        bySection[section.label].total += 1;
        if (correct) {
          bySection[section.label].correct += 1;
          streak += 1;
          bestStreak = Math.max(bestStreak, streak);
        } else {
          streak = 0;
        }
      }
    }
  }

  const answered = cells.filter((cell) => cell.answered).length;
  const correct = cells.filter((cell) => cell.correct).length;
  return {
    cells,
    total: cells.length,
    answered,
    correct,
    wrong: answered - correct,
    skipped: cells.length - answered,
    bestStreak,
    bySection,
  };
}

const ACTION_MEANINGS: Record<ChartActionValue, string> = {
  Y: "Split the pair.",
  N: "Do not split the pair.",
  "Y/N": "Split only if double after split is offered.",
  H: "Hit.",
  S: "Stand.",
  D: "Double if allowed, otherwise hit.",
  Ds: "Double if allowed, otherwise stand.",
  SUR: "Surrender.",
};

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/** Plain-language reading of a printed cell, for the recorded mistake list. */
export function explainToken(section: ChartSectionId, token: ChartToken): string {
  if (token.kind === "action") {
    if (section === "surrender" && token.value === "N") return "Do not surrender.";
    return ACTION_MEANINGS[token.value];
  }
  const printed = formatToken(token);
  // The chart's own legend: 0+ and 0- are running-count conditions, unlike
  // every other index, which is a true count.
  if (token.value === 0) {
    const sign = token.when === "atOrAbove" ? "positive" : "negative";
    return `The chart prints ${printed}: the deviation applies at any ${sign} running count.`;
  }
  const direction = token.when === "atOrAbove" ? "and above" : "and below";
  return `The chart prints ${printed}: the deviation applies at true count ${signed(token.value)} ${direction}.`;
}
```

Note: `ChartActionValue` must be added to the file's import from `./bjaH17Chart`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- chartEntry`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/blackjack/chartEntry.ts lib/blackjack/chartEntry.test.ts
git commit -m "Grade a filled chart against the printed one"
```

---

### Task 4: The page, routed and rendering an empty chart

**Files:**
- Create: `components/H17ChartDrill.tsx`
- Modify: `lib/statistics/storage.ts` (the `DrillType` union, around line 7)
- Modify: `lib/routes.ts` (the `ROUTES` array)
- Modify: `components/DynamicPage.tsx` (dynamic import list around line 40, `pages` map around line 768)

**Interfaces:**
- Consumes: `BJA_H17_SECTIONS`, `CHART_DEALERS`, `ChartSection`, `ChartSectionId`, `cellKey` (Task 1); `Panel`, `Select` from `@/components/ui`.
- Produces: `export function H17ChartDrill()` — the default drill page component; a `"H17 Chart"` member of `DrillType`.

There is no automated test for this task; the deliverable is a page you can load.

- [ ] **Step 1: Add the drill type**

In `lib/statistics/storage.ts`, extend the union:

```ts
export type DrillType =
  | "Running Count"
  | "Basic Strategy"
  | "Deviations"
  | "True Count"
  | "Deck Estimation"
  | "Full Shoe"
  | "Counting Benchmark"
  | "H17 Chart"
  | "Chase the Flush";
```

- [ ] **Step 2: Register the route**

In `lib/routes.ts`, add to `ROUTES` immediately after `["training", "deviations"]`:

```ts
  ["training", "h17-chart"],
```

- [ ] **Step 3: Write the component**

Create `components/H17ChartDrill.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  BJA_H17_SECTIONS,
  CHART_DEALERS,
  ChartSection,
  ChartSectionId,
  cellKey,
} from "@/lib/blackjack/bjaH17Chart";
import { Panel, Select } from "@/components/ui";

type SectionChoice = "all" | ChartSectionId;

export function H17ChartDrill() {
  const [choice, setChoice] = useState<SectionChoice>("all");
  const sections = useMemo<readonly ChartSection[]>(
    () => (choice === "all" ? BJA_H17_SECTIONS : BJA_H17_SECTIONS.filter((section) => section.id === choice)),
    [choice],
  );
  const total = sections.reduce((sum, section) => sum + section.cells.size, 0);

  return (
    <>
      <div className="mb-5 sm:mb-7">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Chart recall</p>
        <h1 className="mt-2 text-3xl font-semibold">H17 Chart</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Fill in the whole H17 deviation chart from memory. One keystroke per cell; Tab or Enter
          moves on. Deviation cells want the index and its sign, like <code>4+</code> or <code>-1-</code>.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xs">
          <Select label="Section" value={choice} onChange={(event) => setChoice(event.target.value as SectionChoice)}>
            <option value="all">Whole chart</option>
            {BJA_H17_SECTIONS.map((section) => (
              <option key={section.id} value={section.id}>{section.label}</option>
            ))}
          </Select>
        </div>
        <p className="text-sm text-zinc-500">{total} cells</p>
      </div>

      <div className="space-y-5">
        {sections.map((section) => (
          <Panel key={section.id}>
            <h2 className="mb-4 text-lg font-semibold">{section.label}</h2>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[34rem] border-separate border-spacing-1 text-center text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[#0c100d] px-2 text-left text-xs font-semibold uppercase tracking-[.14em] text-zinc-500">
                      Hand
                    </th>
                    {CHART_DEALERS.map((dealer) => (
                      <th key={dealer} className="px-1 pb-1 text-xs font-semibold text-zinc-500">{dealer}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row}>
                      <th scope="row" className="sticky left-0 z-10 bg-[#0c100d] px-2 text-left font-medium text-zinc-300">
                        {row}
                      </th>
                      {CHART_DEALERS.map((dealer) => (
                        <td key={dealer}>
                          <div
                            data-cell={cellKey(section.id, row, dealer)}
                            className="flex h-9 w-full min-w-[2.4rem] items-center justify-center rounded-md border border-white/[.08] bg-black/25 font-mono text-zinc-100"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}
      </div>

      <p className="mt-5 text-xs leading-5 text-zinc-500">
        Chart source: Blackjack Apprenticeship, H17 Deviation Chart (2018). Insurance or even money:
        take at true count +3 or above.
      </p>
    </>
  );
}
```

`GhostButton` and `Button` arrive in Task 7 alongside the buttons that use them —
importing them now would fail `npm run lint` as unused.

- [ ] **Step 4: Wire the page into the router**

In `components/DynamicPage.tsx`, add a dynamic import directly below the `DeviationDrill` one (around line 47). `dynamicPage` takes a loader resolving to a `{ default }` shape, so a named export has to be rewrapped exactly like its neighbours:

```ts
const H17ChartDrill = dynamicPage(() => import("@/components/H17ChartDrill").then((m) => ({ default: m.H17ChartDrill })));
```

Then add to the `pages` map, right after `"training/deviations": <DeviationDrill />`:

```tsx
    "training/h17-chart": <H17ChartDrill />,
```

- [ ] **Step 5: Verify the page renders**

Run: `npm run dev`, then open `http://localhost:3000/training/h17-chart`.

Expected: four panels of empty cells, 10 columns each, correct row labels; the Section dropdown narrows to one panel; the hand-label column stays put while a panel scrolls sideways on a narrow window.

Then run `npm run lint` and confirm it is clean.

- [ ] **Step 6: Commit**

```bash
git add components/H17ChartDrill.tsx lib/statistics/storage.ts lib/routes.ts
git add -p components/DynamicPage.tsx   # stage ONLY your two hunks
git commit -m "Add the H17 chart drill page and route"
```

---

### Task 5: Keyboard entry and navigation

**Files:**
- Modify: `components/H17ChartDrill.tsx`

**Interfaces:**
- Consumes: `feedKey`, `displayBuffer`, `SECTION_LETTERS` (Task 2).
- Produces: a `cells` flat list and `entries` state that Tasks 6–8 read.

- [ ] **Step 1: Replace the placeholder cells with inputs and focus state**

In `components/H17ChartDrill.tsx`, extend the imports:

```tsx
import { KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { displayBuffer, feedKey } from "@/lib/blackjack/chartEntry";
```

Add a flat, ordered list of every cell in the active sections, plus a lookup from
grid position to flat index — arrow keys need to stay inside their own table
while Tab crosses section boundaries:

```tsx
interface CellRef {
  key: string;
  section: ChartSectionId;
  row: string;
  dealer: string;
  sectionIndex: number;
  rowIndex: number;
  columnIndex: number;
}

// inside the component, after `sections`:
const cells = useMemo<CellRef[]>(() => {
  const list: CellRef[] = [];
  sections.forEach((section, sectionIndex) => {
    section.rows.forEach((row, rowIndex) => {
      CHART_DEALERS.forEach((dealer, columnIndex) => {
        list.push({ key: cellKey(section.id, row, dealer), section: section.id, row, dealer, sectionIndex, rowIndex, columnIndex });
      });
    });
  });
  return list;
}, [sections]);

const positions = useMemo(() => {
  const map = new Map<string, number>();
  cells.forEach((cell, index) => map.set(`${cell.sectionIndex}:${cell.rowIndex}:${cell.columnIndex}`, index));
  return map;
}, [cells]);

const [entries, setEntries] = useState<Record<string, string>>({});
const [focus, setFocus] = useState(0);
const inputs = useRef<Array<HTMLInputElement | null>>([]);

useEffect(() => { setFocus(0); }, [choice]);
```

- [ ] **Step 2: Add the movement helpers**

```tsx
const focusAt = useCallback((index: number) => {
  const clamped = Math.max(0, Math.min(cells.length - 1, index));
  setFocus(clamped);
  inputs.current[clamped]?.focus();
  inputs.current[clamped]?.select();
}, [cells.length]);

const focusRelative = useCallback((index: number, rowDelta: number, columnDelta: number) => {
  const cell = cells[index];
  if (!cell) return;
  const section = sections[cell.sectionIndex];
  const rowIndex = Math.max(0, Math.min(section.rows.length - 1, cell.rowIndex + rowDelta));
  const columnIndex = Math.max(0, Math.min(CHART_DEALERS.length - 1, cell.columnIndex + columnDelta));
  const target = positions.get(`${cell.sectionIndex}:${rowIndex}:${columnIndex}`);
  if (target !== undefined) focusAt(target);
}, [cells, focusAt, positions, sections]);
```

- [ ] **Step 3: Add the key handler**

```tsx
const handleKey = useCallback((event: ReactKeyboardEvent<HTMLInputElement>, index: number) => {
  const cell = cells[index];
  if (event.key === "Tab") {
    event.preventDefault();
    focusAt(index + (event.shiftKey ? -1 : 1));
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    focusAt(index + 1);
    return;
  }
  const arrows: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };
  if (arrows[event.key]) {
    event.preventDefault();
    focusRelative(index, arrows[event.key][0], arrows[event.key][1]);
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const result = feedKey(cell.section, entries[cell.key] ?? "", event.key);
  if (result.disposition === "ignore") {
    // Swallow stray letters so the browser never types into the field itself.
    if (event.key.length === 1) event.preventDefault();
    return;
  }
  event.preventDefault();
  setEntries((current) => ({ ...current, [cell.key]: result.buffer }));
  if (result.disposition === "commit") focusAt(index + 1);
  if (result.disposition === "back") focusAt(index - 1);
}, [cells, entries, focusAt, focusRelative]);
```

- [ ] **Step 4: Render real inputs**

Replace the placeholder `<div data-cell=… />` with an input. The flat index has
to be recoverable inside the render, so look it up from `positions`:

```tsx
{CHART_DEALERS.map((dealer, columnIndex) => {
  const index = positions.get(`${sectionIndex}:${rowIndex}:${columnIndex}`)!;
  const cell = cells[index];
  return (
    <td key={dealer}>
      <input
        ref={(element) => { inputs.current[index] = element; }}
        value={displayBuffer(cell.section, entries[cell.key] ?? "")}
        onChange={() => undefined}
        onKeyDown={(event) => handleKey(event, index)}
        onFocus={() => setFocus(index)}
        aria-label={`${section.label} ${row} versus ${dealer}`}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={`h-9 w-full min-w-[2.4rem] rounded-md border bg-black/25 text-center font-mono text-zinc-100 outline-none ${
          focus === index ? "border-emerald-400/70 ring-1 ring-emerald-400/40" : "border-white/[.08]"
        }`}
      />
    </td>
  );
})}
```

This requires `section.rows.map((row, rowIndex) => …)` and
`sections.map((section, sectionIndex) => …)` — add both index parameters.

- [ ] **Step 5: Verify by hand**

Run `npm run dev` and open `/training/h17-chart`. Check each of these:

- Typing `s` in a hard-totals cell fills `S` and jumps one cell right.
- Typing `y` in a pair cell shows `Y` and stays; pressing `n` turns it into `Y/N` and advances; pressing Tab instead commits `Y` and advances.
- Typing `d` then `s` in a soft cell gives `Ds`; in a hard cell `d` commits `D` immediately and the following `s` lands in the *next* cell.
- Typing `4` then `+` gives `4+` and advances; `-`, `1`, `-` gives `-1-`.
- Typing `p` anywhere does nothing at all.
- Tab from the last cell of Pair splitting lands on `A,9 vs 2` in Soft totals.
- Arrow Down from the last row of a section stays in that section.
- Backspace clears a character, then a further Backspace moves to the previous cell.

Run `npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add components/H17ChartDrill.tsx
git commit -m "Type answers into the chart grid"
```

---

### Task 6: Mobile token pad

**Files:**
- Modify: `components/H17ChartDrill.tsx`

**Interfaces:**
- Consumes: `SECTION_LETTERS` (Task 2), `MobileActionDock` from `@/components/ui`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add a synthetic key path**

The dock's buttons need the same reducer the keyboard uses, so factor the
non-navigation half of `handleKey` into a function both call. Add above
`handleKey`:

```tsx
const pressKey = useCallback((index: number, key: string) => {
  const cell = cells[index];
  if (!cell) return;
  const result = feedKey(cell.section, entries[cell.key] ?? "", key);
  if (result.disposition === "ignore") return;
  setEntries((current) => ({ ...current, [cell.key]: result.buffer }));
  if (result.disposition === "commit") focusAt(index + 1);
  if (result.disposition === "back") focusAt(index - 1);
}, [cells, entries, focusAt]);
```

and replace the tail of `handleKey` (everything from `const result = feedKey(...)`) with:

```tsx
  if (feedKey(cell.section, entries[cell.key] ?? "", event.key).disposition === "ignore") {
    if (event.key.length === 1) event.preventDefault();
    return;
  }
  event.preventDefault();
  pressKey(index, event.key);
```

Add `pressKey` to `handleKey`'s dependency array.

- [ ] **Step 2: Render the dock**

Import `MobileActionDock` alongside the other `ui` imports and `SECTION_LETTERS`
from `@/lib/blackjack/chartEntry`. Add just before the closing `</>`:

```tsx
<MobileActionDock label="Chart entry keys">
  <div className="flex flex-wrap gap-1.5">
    {[...new Set(SECTION_LETTERS[cells[focus]?.section ?? "hard"].flatMap((token) => [...token]))].map((key) => (
      <GhostButton key={key} className="min-w-11 px-2 py-1.5 text-sm uppercase" onClick={() => pressKey(focus, key)}>
        {key}
      </GhostButton>
    ))}
    {["-", "0", "1", "2", "3", "4", "5", "6", "+"].map((key) => (
      <GhostButton key={key} className="min-w-11 px-2 py-1.5 text-sm" onClick={() => pressKey(focus, key)}>
        {key}
      </GhostButton>
    ))}
    <GhostButton className="px-2 py-1.5 text-sm" onClick={() => pressKey(focus, "Backspace")}>⌫</GhostButton>
    <GhostButton className="px-2 py-1.5 text-sm" onClick={() => focusAt(focus + 1)}>Next</GhostButton>
  </div>
</MobileActionDock>
```

The letter set is derived from the focused cell's section, so the pad shows
`y n` on pairs, `h s d` on soft and hard, `r n` on surrender.

- [ ] **Step 2b: Keep focus on the cell when a pad button is pressed**

A `<button>` steals focus, so add `onMouseDown={(event) => event.preventDefault()}`
to each `GhostButton` in the dock.

- [ ] **Step 3: Verify by hand**

Run `npm run dev`, open the page in a narrow window (or device emulation).
Expected: the dock is visible below `lg`, its letters change as you move between
sections, tapping a letter fills the focused cell and advances, and the focus
ring never disappears while tapping.

Run `npm run lint`.

- [ ] **Step 4: Commit**

```bash
git add components/H17ChartDrill.tsx
git commit -m "Add a mobile token pad for chart entry"
```

---

### Task 7: Feedback modes, submit, and results

**Files:**
- Modify: `components/H17ChartDrill.tsx`

**Interfaces:**
- Consumes: `gradeChart`, `parseEntry` (Tasks 2–3); `Button` from `@/components/ui`.
- Produces: `graded` state and a `grade` object Task 8 records.

- [ ] **Step 1: Add the feedback control and grading state**

```tsx
type Feedback = "live" | "end";

const [feedback, setFeedback] = useState<Feedback>("live");
const [graded, setGraded] = useState(false);
const grade = useMemo(() => gradeChart(sections, entries), [sections, entries]);
```

Add the `Select` next to the Section one:

```tsx
<div className="max-w-xs">
  <Select label="Feedback" value={feedback} onChange={(event) => setFeedback(event.target.value as Feedback)}>
    <option value="live">Check as I go</option>
    <option value="end">Grade at the end</option>
  </Select>
</div>
```

- [ ] **Step 2: Colour the cells**

Add a helper that decides a cell's tone. In live mode a cell colours as soon as
its buffer parses to a token, so a half-typed `4` stays neutral:

```tsx
const cellTone = useCallback((cell: CellRef, index: number) => {
  const buffer = entries[cell.key] ?? "";
  const settled = graded || (feedback === "live" && parseEntry(cell.section, buffer) !== null);
  if (!settled) return focus === index ? "border-emerald-400/70 ring-1 ring-emerald-400/40" : "border-white/[.08]";
  const result = grade.cells.find((entry) => entry.key === cell.key);
  return result?.correct
    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
    : "border-red-500/50 bg-red-500/15 text-red-200";
}, [entries, feedback, focus, grade, graded]);
```

Replace the input's `className` tail with `${cellTone(cell, index)}` and drop the
old inline focus/border ternary.

- [ ] **Step 3: Show the chart's answer under a wrong cell**

Inside the `<td>`, below the input:

```tsx
{(graded || feedback === "live") && (() => {
  const result = grade.cells.find((entry) => entry.key === cell.key);
  const settled = graded || parseEntry(cell.section, entries[cell.key] ?? "") !== null;
  if (!settled || !result || result.correct) return null;
  return <p className="mt-0.5 font-mono text-[.6rem] leading-none text-emerald-300/80">{result.expected}</p>;
})()}
```

- [ ] **Step 4: Add Submit and the results panel**

Above the section panels:

```tsx
<div className="mb-4 flex flex-wrap items-center gap-3">
  <Button onClick={() => setGraded(true)} disabled={graded}>Submit</Button>
  <GhostButton onClick={() => { setEntries({}); setGraded(false); focusAt(0); }}>Start over</GhostButton>
  {!graded && <span className="text-sm text-zinc-500">{grade.answered} / {grade.total} filled</span>}
</div>

{graded && (
  <Panel className="mb-5" >
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <b className="text-3xl">{grade.correct} / {grade.total}</b>
      <span className="text-zinc-400">{Math.round((grade.correct / grade.total) * 100)}% correct</span>
      <span className="text-zinc-500">{grade.wrong} wrong · {grade.skipped} skipped</span>
      <span className="text-zinc-500">Best run {grade.bestStreak}</span>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries(grade.bySection).map(([label, value]) => (
        <div key={label} className="rounded-xl bg-black/20 p-3">
          <p className="text-xs text-zinc-500">{label}</p>
          <b className="text-lg">{Math.round((value.correct / value.total) * 100)}%</b>
          <span className="ml-2 text-xs text-zinc-500">{value.correct}/{value.total}</span>
        </div>
      ))}
    </div>
    <p className="mt-4 text-xs text-zinc-500">
      Every wrong cell is marked in red with the chart&rsquo;s answer beneath it.
    </p>
  </Panel>
)}
```

- [ ] **Step 5: Verify by hand**

Run `npm run dev`. Check:

- In *Check as I go*, a correct `s` turns green immediately; a wrong one turns red and shows the chart token underneath. Typing `4` alone stays neutral until the `+`.
- In *Grade at the end*, nothing colours until Submit, then everything does.
- Submit with cells left blank: those count in `skipped`, not `wrong`.
- "Start over" clears every cell and returns focus to the first.

Run `npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add components/H17ChartDrill.tsx
git commit -m "Grade the chart with live and end-of-run feedback"
```

---

### Task 8: Session recording, resume, and analytics

**Files:**
- Modify: `components/H17ChartDrill.tsx`
- Modify: `lib/analytics/types.ts` (the `DrillId` union, around line 14)
- Modify: `lib/analytics/config.ts` (the `FEATURES` record, around line 78)
- Modify: `lib/analytics/track.ts` (the `DRILLS` map, around line 29)

**Interfaces:**
- Consumes: `makeSession`, `storage`, `Mistake` from `@/lib/statistics/storage`; `loadDrillProgress`, `useDrillProgress` from `@/lib/statistics/useDrillProgress`; `analytics` from `@/lib/analytics`; `explainToken`, `chartToken`.
- Produces: sessions of `DrillType` `"H17 Chart"` in local storage.

- [ ] **Step 1: Widen the analytics drill id**

In `lib/analytics/types.ts`:

```ts
export type DrillId =
  | "running_count"
  | "true_count"
  | "deck_estimation"
  | "basic_strategy"
  | "deviations"
  | "h17_chart"
  | "full_shoe";
```

`FeatureId` is `DrillId | …`, so `FEATURES` in `lib/analytics/config.ts` will now
fail to typecheck until you add, next to the other training entries:

```ts
  h17_chart: { category: "training", label: "H17 Chart", route: "/training/h17-chart" },
```

And in `lib/analytics/track.ts`, add to `DRILLS`:

```ts
  "H17 Chart": "h17_chart",
```

- [ ] **Step 2: Restore progress and auto-save**

In `components/H17ChartDrill.tsx`, add the imports and seed state from any saved
run, matching how `StrategyDrill` does it:

```tsx
import { loadDrillProgress, useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { Mistake, makeSession, storage } from "@/lib/statistics/storage";
import { analytics } from "@/lib/analytics";
import { chartToken } from "@/lib/blackjack/bjaH17Chart";
import { explainToken } from "@/lib/blackjack/chartEntry";

type H17Saved = {
  entries: Record<string, string>;
  choice: SectionChoice;
  feedback: Feedback;
  startedAt: number;
};

const [saved] = useState(() => loadDrillProgress<H17Saved>("H17 Chart"));
```

Seed the existing state hooks from it — `useState(saved?.entries ?? {})`,
`useState<SectionChoice>(saved?.choice ?? "all")`,
`useState<Feedback>(saved?.feedback ?? "live")` — and add the clock:

```tsx
const [startedAt, setStartedAt] = useState(() => saved?.startedAt ?? Date.now());

useDrillProgress("H17 Chart", !graded, {
  entries, choice, feedback, startedAt,
} satisfies H17Saved);
```

Persist the *start timestamp*, not an elapsed total. `useDrillProgress` keys its
debounced save off `JSON.stringify(state)`, so a value recomputed from
`Date.now()` on every render would re-arm the save timer on every keystroke.
A resumed run therefore counts the time the tab was closed, which only shifts a
cosmetic "seconds per cell" figure and is worth the simpler code.

- [ ] **Step 3: Record the finished run**

Replace the Submit handler with one that also writes the session:

```tsx
const submit = useCallback(() => {
  if (graded) return;
  const duration = Date.now() - startedAt;
  const mistakes: Mistake[] = grade.cells
    .filter((cell) => !cell.correct)
    .map((cell) => ({
      question: `${cell.sectionLabel} · ${cell.row} vs ${cell.dealer}`,
      userAnswer: cell.answered ? cell.typed : "(skipped)",
      correctAnswer: cell.expected,
      explanation: explainToken(cell.section, chartToken(
        BJA_H17_SECTIONS.find((section) => section.id === cell.section)!, cell.row, cell.dealer)),
    }));
  const session = makeSession(
    "H17 Chart", grade.total, grade.correct, duration, grade.bestStreak, mistakes, grade.bySection,
  );
  storage.addSession(session);
  storage.clearProgress("H17 Chart");
  analytics.track("practice_completed", {
    drill: "h17_chart",
    questions: grade.total,
    correct: grade.correct,
    accuracy: session.accuracy,
    best_streak: grade.bestStreak,
    duration_ms: duration,
    mode: choice,
  });
  setGraded(true);
}, [choice, grade, graded, startedAt]);
```

Point the Submit button at `submit`. Have "Start over" also reset the clock:
`setStartedAt(Date.now())`.

Check `practice_completed`'s property names in `lib/analytics/types.ts` before
writing this call — the compiler will reject a mismatch, and the names above are
copied from that file.

- [ ] **Step 4: Announce the start**

```tsx
useEffect(() => {
  analytics.track("practice_started", { drill: "h17_chart", mode: "all", question_target: 320 });
  // A restored run is still a new attempt in this browser session.
}, []);
```

- [ ] **Step 5: Verify by hand**

Run `npm run dev`. Check:

- Fill a few cells, reload the page: the entries come back.
- Submit, then open `/statistics`: an "H17 Chart" session appears with the right
  accuracy, and its mistakes read `Hard totals · 16 vs 9 — You: S · Correct: 4+`.
- Skipped cells show as `(skipped)`.
- Submit, then reload: the saved progress is gone and the grid is empty.

Run `npm test`, `npm run lint`, and `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add components/H17ChartDrill.tsx lib/analytics/types.ts lib/analytics/config.ts lib/analytics/track.ts
git commit -m "Record H17 chart runs in the session history"
```

---

### Task 9: Discoverability, attribution, and final verification

**Files:**
- Modify: `components/AppShell.tsx` (the Training nav group, around line 40)
- Modify: `components/DynamicPage.tsx` (`drillLinks`, around line 78)
- Modify: `THIRD_PARTY_NOTICES.md` (repo root)

There is no `/training` index page in this app — the sidebar and the dashboard's
"Recommended next" card are how drills are reached, so those are the two places
to register it.

- [ ] **Step 1: Add the nav item**

In `components/AppShell.tsx`, inside the Training group after the Deviations entry:

```ts
      ["H17 Chart", "/training/h17-chart", "fa-table-cells"],
```

- [ ] **Step 2: Add the drill link**

In `components/DynamicPage.tsx`, inside the `Dashboard` component, add to the
`drillLinks` map after the `Deviations` entry:

```ts
    "H17 Chart": "/training/h17-chart",
```

The map is `Record<string, string>`, so this is not required to compile — but
`practiced` is derived from its keys, which is what lets the dashboard offer the
H17 chart as "Recommended next" once the user has a weak session in it.

- [ ] **Step 3: Credit the source**

Append to `THIRD_PARTY_NOTICES.md`:

```markdown
## Blackjack Apprenticeship H17 deviation chart

`blackjack/lib/blackjack/bjaH17Chart.ts` encodes the playing decisions and count
indices printed on the H17 Deviation Chart published by Blackjack Apprenticeship
(© Blackjack Apprenticeship 2018, <https://www.blackjackapprenticeship.com>).
The indices and actions are facts about the game; the chart's own layout,
styling, and artwork are not reproduced.
```

- [ ] **Step 4: Full verification**

Run each and confirm the output before claiming the feature is done:

```bash
npm test
npm run lint
npm run build
```

Then `npm run dev` and walk the drill once end to end: reach it from the sidebar,
fill the surrender section with the picker set to Late surrender, submit, and
confirm the session lands in `/statistics`.

- [ ] **Step 5: Commit**

```bash
git add components/AppShell.tsx ../THIRD_PARTY_NOTICES.md
git add -p components/DynamicPage.tsx   # stage ONLY your hunks
git commit -m "Surface the H17 chart drill and credit its source"
```

---

## Notes for the executor

- If `npm run build` complains about `crypto.randomUUID` or any browser API at
  build time, the component is missing `"use client"` — it must stay at the top
  of `H17ChartDrill.tsx`.
- `git status` will show unrelated untracked files (`BJA_H17.pdf`,
  `bj_4d_h17.gif`, `blackjack/public/basic-strategy-h17.gif`) and unrelated
  modifications in `components/DynamicPage.tsx`. Leave all of them alone.
- The chart data is the one thing here that cannot be checked by reading the
  code — it can only be checked against `BJA_H17.pdf`. If any cell looks wrong
  during manual testing, verify against the PDF before changing it, and fix the
  literal table in `bjaH17Chart.ts` plus the snapshot in its test together.
