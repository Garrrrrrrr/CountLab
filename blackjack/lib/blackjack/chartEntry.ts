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
