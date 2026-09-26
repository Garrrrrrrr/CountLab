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
 * The single-key letters each section accepts, lowercase. Every one of these
 * commits immediately and advances focus — there is no held/ambiguous state.
 */
export const BASE_LETTERS: Record<ChartSectionId, readonly string[]> = {
  pairs: ["y", "n"],
  soft: ["h", "s", "d"],
  hard: ["h", "s", "d"],
  surrender: ["r", "n"],
};

/**
 * Two-part answers, entered as Shift+<trigger letter> in one keystroke rather
 * than by typing the trigger letter then the second letter — that sequential
 * shape used to make the trigger letter's own single-letter answer (`Y`, `D`)
 * hold and wait for a key that might never come. Keyed by section, then by
 * the lowercase trigger letter.
 */
export const SHIFT_COMPOUNDS: Partial<Record<ChartSectionId, Record<string, string>>> = {
  pairs: { y: "yn" },
  soft: { d: "ds" },
};

/** Every buffer a section's grammar can produce, letters only (no indices). */
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
 *
 * `shiftKey` only matters on an empty buffer: Shift plus a compound's trigger
 * letter (`Shift+Y` in pairs, `Shift+D` in soft) commits the two-part answer
 * directly, in one keystroke.
 */
export function feedKey(section: ChartSectionId, buffer: string, key: string, shiftKey = false): FeedResult {
  if (key === "Backspace") {
    return buffer
      ? { buffer: buffer.slice(0, -1), disposition: "pending" }
      : { buffer: "", disposition: "back" };
  }
  if (key.length !== 1) return { buffer, disposition: "ignore" };
  const lower = key.toLowerCase();
  if (buffer === "" && shiftKey) {
    const compound = SHIFT_COMPOUNDS[section]?.[lower];
    if (compound) return { buffer: compound, disposition: "commit" };
  }
  const next = buffer + lower;
  if (BASE_LETTERS[section].includes(next)) return { buffer: next, disposition: "commit" };
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
  /** The keys to press, uppercased for display: one letter, or ["Shift", letter]. */
  keys: string[];
  /** True when `keys` are pressed together (a chord); false for a single key. */
  combo: boolean;
  /** What the cell reads once the keys are committed. */
  shows: string;
  /** Plain-language reading of `shows`, for a newcomer who doesn't know the shorthand yet. */
  meaning: string;
}

const legendMeaning = (section: ChartSectionId, value: ChartActionValue): string => {
  if (value === "N" && section === "surrender") return "don't surrender";
  return ACTION_MEANINGS[value].replace(/\.$/, "").toLowerCase();
};

/**
 * The keys a section accepts, derived from the grammar itself so the on-screen
 * legend cannot drift from what `feedKey` actually does. Index entry is legal in
 * every section and is described separately, since it is a shape rather than a
 * fixed key.
 */
export function sectionLegend(section: ChartSectionId): LegendEntry[] {
  const base: LegendEntry[] = BASE_LETTERS[section].map((letter) => {
    const token = parseEntry(section, letter) as { kind: "action"; value: ChartActionValue };
    return {
      keys: [letter.toUpperCase()],
      combo: false,
      shows: formatToken(token),
      meaning: legendMeaning(section, token.value),
    };
  });
  const compounds = Object.entries(SHIFT_COMPOUNDS[section] ?? {}).map(([trigger, buffer]) => {
    const token = parseEntry(section, buffer) as { kind: "action"; value: ChartActionValue };
    return {
      keys: ["Shift", trigger.toUpperCase()],
      combo: true,
      shows: formatToken(token),
      meaning: legendMeaning(section, token.value),
    };
  });
  return [...base, ...compounds];
}

/**
 * Like `feedKey`, but typing over a finished answer replaces it. Without this
 * a cell holding `H` ignored `s` entirely, while the selected text suggested
 * it would be overwritten; a phone needed Backspace first. Partial entries
 * (a lone `4` or `-`) still continue as before.
 */
export function feedCell(section: ChartSectionId, buffer: string, key: string, shiftKey = false): FeedResult {
  if (key !== "Backspace" && key.length === 1 && parseEntry(section, buffer) !== null) {
    const fresh = feedKey(section, "", key, shiftKey);
    return fresh.disposition === "ignore" ? { buffer, disposition: "ignore" } : fresh;
  }
  return feedKey(section, buffer, key, shiftKey);
}

export interface KeypadKey {
  id: string;
  kind: "letter" | "digit" | "sign" | "delete" | "next" | "spacer";
  /** What the key shows: the token the cell will read (`Y/N`, `SUR`), a digit or a sign. */
  face: string;
  /** What `feedKey` receives, with `shift` for the two-part answers. */
  key: string;
  shift?: boolean;
  /** Accessible name when the face alone would be unclear (`Minus`, `Delete`, `Next cell`). */
  label?: string;
  /** A tiny caption under a letter key: `split`, `dbl/stand`. */
  meaning?: string;
}

const KEY_MEANING: Record<string, string> = {
  "pairs:Y": "split", "pairs:N": "no split", "pairs:Y/N": "if DAS",
  "soft:H": "hit", "soft:S": "stand", "soft:D": "double", "soft:Ds": "dbl/stand",
  "hard:H": "hit", "hard:S": "stand", "hard:D": "double",
  "surrender:SUR": "surrender", "surrender:N": "no",
};

/**
 * The touch keypad: six columns by three rows, the same positions for every
 * section so the digits never move. Row one holds the section's answers
 * (padded to four slots), Delete and Next; rows two and three are the minus
 * sign with 0 to 4, and the plus sign with 5 to 9, so every index the charts
 * print (including the early-surrender 7+ and 8+) can be entered.
 */
export function KEYPAD_ROWS(section: ChartSectionId): KeypadKey[][] {
  const letter = (face: string, key: string, shift = false): KeypadKey => ({ id: `letter-${face}`, kind: "letter", face, key, shift, meaning: KEY_MEANING[`${section}:${face}`] });
  const letters = [
    ...BASE_LETTERS[section].map((key) => letter(displayBuffer(section, key), key)),
    ...Object.entries(SHIFT_COMPOUNDS[section] ?? {}).map(([trigger, buffer]) => letter(displayBuffer(section, buffer), trigger, true)),
  ];
  const spacers = Array.from({ length: Math.max(0, 4 - letters.length) }, (_, index): KeypadKey => ({ id: `spacer-${index}`, kind: "spacer", face: "", key: "" }));
  const digit = (value: number): KeypadKey => ({ id: `digit-${value}`, kind: "digit", face: String(value), key: String(value) });
  return [
    [...letters, ...spacers, { id: "delete", kind: "delete", face: "⌫", key: "Backspace", label: "Delete" }, { id: "next", kind: "next", face: "Next", key: "", label: "Next cell" }],
    [{ id: "minus", kind: "sign", face: "−", key: "-", label: "Minus" }, ...[0, 1, 2, 3, 4].map(digit)],
    [{ id: "plus", kind: "sign", face: "+", key: "+", label: "Plus" }, ...[5, 6, 7, 8, 9].map(digit)],
  ];
}
