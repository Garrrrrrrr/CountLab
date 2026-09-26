/**
 * Display formatting for the Session Journal. Signs are always written out
 * (+$120, −$450) with a true minus sign, so a result never reads by colour
 * alone and a loss cannot be mistaken for a hyphenated figure.
 */
import { isJournalDate } from "./journal";

const MINUS = "−";
const formatters = new Map<string, Intl.NumberFormat>();
const formatter = (key: string, options: Intl.NumberFormatOptions) => {
  let cached = formatters.get(key);
  if (!cached) formatters.set(key, (cached = new Intl.NumberFormat("en-US", options)));
  return cached;
};
const withMinus = (text: string) => text.replace(/^-/, MINUS);

/** Whole dollars by default; a negative amount keeps its (true) minus sign. */
export function money(value: number, digits = 0) {
  if (!Number.isFinite(value)) return "—";
  return withMinus(formatter(`money-${digits}`, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value));
}

/** A result or expectation: +$120, −$450, or $0. */
export function signedMoney(value: number, digits = 0) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return money(0, digits);
  return `${rounded > 0 ? "+" : MINUS}${money(Math.abs(rounded), digits)}`;
}

/** Chart axis ticks: $11K, −$5K, $0. */
export function compactMoney(value: number) {
  if (!Number.isFinite(value)) return "";
  return withMinus(formatter("compact", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value));
}

export const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;

export const plural = (count: number, word: string, many = `${word}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? word : many}`;

/** 4 h, 4.5 h, 1,234 h. */
export const hoursLabel = (value: number) => `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} h`;

const noon = (iso: string) => new Date(`${iso}T12:00:00`);

/** Sep 26, or Sep 26, 2025 outside the current year. Legacy non-calendar dates read "Invalid date". */
export function shortDate(iso: string, now = new Date()) {
  if (!isJournalDate(iso)) return "Invalid date";
  const date = noon(iso);
  return new Intl.DateTimeFormat("en-US", date.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/** Sep 26, 2026. */
export function longDate(iso: string) {
  if (!isJournalDate(iso)) return "an invalid date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(noon(iso));
}

/** Every spelling of a date a reader might search for: 2026-09-08, Sep 8, Sep 8, 2026, September 8. */
export function dateSearchText(iso: string) {
  if (!isJournalDate(iso)) return iso;
  const date = noon(iso);
  const long = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
  return `${iso} ${longDate(iso)} ${long}`;
}

/** A true count as written on a chart: −3, 0, +2. */
export const trueCountLabel = (trueCount: number) => trueCount > 0 ? `+${trueCount}` : trueCount < 0 ? `${MINUS}${Math.abs(trueCount)}` : "0";
