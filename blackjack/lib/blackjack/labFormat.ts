/**
 * Number formatting for the Game & Bankroll Lab. Figures that cannot be
 * computed print as a dash, never as words inside a large number, and
 * negatives use a true minus sign.
 */

const MINUS = "−";
export const DASH = "—";

const currency = (digits: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "$1,234", "−$12.50", or "—". */
export function money(value: number, digits = 0) {
  if (!Number.isFinite(value)) return DASH;
  const text = currency(digits).format(Math.abs(value));
  return value < 0 && Number(text.replace(/[^0-9.]/g, "")) !== 0 ? `${MINUS}${text}` : text;
}

/** "+$2,655", "−$1,200", "$0". */
export function signedMoney(value: number, digits = 0) {
  const text = money(value, digits);
  return Number.isFinite(value) && value > 0 && text !== money(0, digits) ? `+${text}` : text;
}

/** "1.86%", "+0.849%", "−0.07%", or "—". */
export function percent(value: number, digits = 2, signed = false) {
  if (!Number.isFinite(value)) return DASH;
  const text = `${Math.abs(value * 100).toFixed(digits)}%`;
  const zero = Number(text.slice(0, -1)) === 0;
  if (value < 0 && !zero) return `${MINUS}${text}`;
  return signed && !zero ? `+${text}` : text;
}

/** A probability that may be vanishingly small: "<0.01%" rather than "0.00%". */
export function chance(value: number, digits = 2) {
  if (!Number.isFinite(value)) return DASH;
  if (value > 0 && value < 0.0001) return "<0.01%";
  return percent(value, digits);
}

/** A whole count with thousands separators, or "—". */
export function count(value: number) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : DASH;
}

/** A target risk as people say it: "5%", "2.5%", "13.5%". */
export const riskLabel = (value: number) => `${Number((value * 100).toFixed(2))}%`;

/** Penetration as a whole percentage of the shoe. */
export const dealtPercent = (decks: number, dealt: number) => Math.round((dealt / decks) * 100);
