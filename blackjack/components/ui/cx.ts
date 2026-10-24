/** Joins class names, skipping falsy entries. */
export const cx = (...parts: Array<string | false | null | undefined | 0>) => parts.filter(Boolean).join(" ");
