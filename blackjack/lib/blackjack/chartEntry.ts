import {
  CHART_DEALERS,
  ChartActionValue,
  ChartSection,
  ChartSectionId,
  ChartToken,
  cellKey,
  chartToken,
  formatToken,
} from "./bjaH17Chart";

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

export interface LegendEntry {
  /** The keys to press, in order, uppercased for display. */
  keys: string[];
  /** What the cell reads once those keys are committed. */
  shows: string;
}

/**
 * The keys a section accepts, derived from the grammar itself so the on-screen
 * legend cannot drift from what `feedKey` actually does. Index entry is legal in
 * every section and is described separately, since it is a shape rather than a
 * fixed key.
 */
export function sectionLegend(section: ChartSectionId): LegendEntry[] {
  return SECTION_LETTERS[section].map((buffer) => ({
    keys: [...buffer].map((key) => key.toUpperCase()),
    shows: formatToken(parseEntry(section, buffer)!),
  }));
}
