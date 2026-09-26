/**
 * Typed answers in the counting drills: a signed whole number (a running or
 * true count) or a decimal (decks left). Input is normalised first, so a
 * typographic minus (−3), a decimal comma (2,5) and stray spaces grade the
 * same as their ASCII forms, and nothing unparseable reaches grading.
 */
export type AnswerKind = "signed-int" | "decimal";

const MINUS_SIGNS = /[−‒–—﹣－]/g;

export function normalizeAnswer(raw: string) {
  return raw.replace(MINUS_SIGNS, "-").replace(/,/g, ".").replace(/\s+/g, "");
}

export const ANSWER_HINT: Record<AnswerKind, string> = {
  "signed-int": "Enter a whole number, like −2 or 3.",
  decimal: "Enter decks as a number, like 2.5.",
};

const PATTERN: Record<AnswerKind, RegExp> = {
  "signed-int": /^[+-]?\d+$/,
  decimal: /^(\d+\.?\d*|\.\d+)$/,
};

/** The parsed value, or the message to show when the text is not a valid answer. */
export function parseAnswer(raw: string, kind: AnswerKind): { ok: true; value: number; text: string } | { ok: false; error: string } {
  const text = normalizeAnswer(raw);
  if (!PATTERN[kind].test(text)) return { ok: false, error: ANSWER_HINT[kind] };
  const value = Number(text);
  // "-0" and "+0" are zero; keep the stored text canonical too.
  return Number.isFinite(value) ? { ok: true, value: value === 0 ? 0 : value, text: kind === "signed-int" ? String(value === 0 ? 0 : value) : text } : { ok: false, error: ANSWER_HINT[kind] };
}

/** One key of the on-screen keypad applied to the current text. */
export function applyKey(value: string, key: string, kind: AnswerKind) {
  if (key === "back") return value.slice(0, -1);
  if (key === "sign") {
    if (kind !== "signed-int") return value;
    const text = normalizeAnswer(value);
    return text.startsWith("-") ? text.slice(1) : `-${text.replace(/^\+/, "")}`;
  }
  if (key === ".") {
    if (kind !== "decimal" || normalizeAnswer(value).includes(".")) return value;
    return value === "" ? "0." : `${value}.`;
  }
  if (!/^\d$/.test(key)) return value;
  // Six characters is more than any count or deck estimate needs.
  return value.length >= 6 ? value : `${value}${key}`;
}

/** A signed count for display, with a typographic minus: "+3", "0", "−2". */
export const displaySigned = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `\u2212${Math.abs(value)}` : "0");
