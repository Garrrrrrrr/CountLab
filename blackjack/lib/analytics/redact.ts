import { ANALYTICS_CONFIG } from "./config";
import type { Properties, PropertyValue } from "./types";

/**
 * Keys that must never reach the analytics table. Stripped here and again by
 * `analytics_redact()` in Postgres, so a bug on either side still can't leak.
 */
const FORBIDDEN_KEY = /(pass(word|wd|phrase)?|secret|token|jwt|api[-_]?key|authorization|credential|cookie|cvv|ssn|credit[-_]?card|card[-_]?number|e[-_]?mail|phone[-_]?number)/i;

/** Query keys worth keeping; everything else is dropped so URLs can't leak. */
const ALLOWED_QUERY_KEYS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref"]);

const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_VALUE = /(?:\+?\d[\d(). -]{7,}\d)/g;

/** Removes common PII shapes from otherwise approved, free-form strings. */
export const scrubPotentialPii = (value: string): string =>
  value.replace(EMAIL_VALUE, "<email>").replace(PHONE_VALUE, "<phone>");

export const clampString = (value: string, max: number = ANALYTICS_CONFIG.maxStringLength): string =>
  scrubPotentialPii(value).length <= max
    ? scrubPotentialPii(value)
    : `${scrubPotentialPii(value).slice(0, max - 1)}…`;

const short = (n: number): string => {
  if (n >= 1_000_000) return `${n / 1_000_000}m`;
  if (n >= 1000) return `${n / 1000}k`;
  return String(n);
};

const MONEY_EDGES = [0, 25, 100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000];

/**
 * Money is bucketed rather than stored exactly: "which bankroll range does
 * this user model?" is a product question, "$23,741" is personal detail.
 */
export function bucketMoney(value: number): string {
  if (!Number.isFinite(value)) return "unknown";
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  if (magnitude === 0) return "0";
  for (let index = 0; index < MONEY_EDGES.length - 1; index += 1) {
    if (magnitude < MONEY_EDGES[index + 1]) return `${sign}${short(MONEY_EDGES[index])}-${short(MONEY_EDGES[index + 1])}`;
  }
  return `${sign}${short(MONEY_EDGES[MONEY_EDGES.length - 1])}+`;
}

const RATE_EDGES = [-100, -50, -20, -5, 0, 5, 20, 50, 100];

/** Buckets an hourly EV / rate figure into a small set of comparable bands. */
export function bucketRate(value: number): string {
  if (!Number.isFinite(value)) return "unknown";
  if (value < RATE_EDGES[0]) return `<${RATE_EDGES[0]}`;
  for (let index = 0; index < RATE_EDGES.length - 1; index += 1) {
    if (value < RATE_EDGES[index + 1]) return `${RATE_EDGES[index]}..${RATE_EDGES[index + 1]}`;
  }
  return `${RATE_EDGES[RATE_EDGES.length - 1]}+`;
}

/** Buckets a 0–1 probability (risk of ruin, chance of profit) into deciles-ish bands. */
export function bucketProbability(value: number): string {
  if (!Number.isFinite(value)) return "unknown";
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  if (percent === 0) return "0%";
  if (percent < 1) return "<1%";
  if (percent < 5) return "1-5%";
  if (percent < 10) return "5-10%";
  if (percent < 25) return "10-25%";
  if (percent < 50) return "25-50%";
  return "50%+";
}

/** Clamps a true count into a bounded band so the property stays low-cardinality. */
export function bucketTrueCount(trueCount: number): number {
  if (!Number.isFinite(trueCount)) return 0;
  return Math.max(-6, Math.min(6, Math.trunc(trueCount)));
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_NUMBER = /\d{4,}/g;

/**
 * Reduces a path to a low-cardinality route: no origin, no query string, no
 * trailing slash, dynamic segments collapsed to `:id`.
 */
export function normalizeRoute(input: string): string {
  let path = input;
  if (path.includes("://")) {
    try {
      path = new URL(path).pathname;
    } catch {
      // Fall through and treat the raw string as a path.
    }
  }
  path = path.split(/[?#]/)[0];
  path = path.replace(/^\/blackjack(?=\/|$)/, "");
  path = path.replace(/\/+$/, "");
  path = path.replace(UUID, ":id").replace(LONG_NUMBER, ":n");
  return clampString(path || "/", 200);
}

/** Strips volatile detail so the same failure groups into one row. */
export function normalizeErrorMessage(message: string): string {
  return clampString(
    scrubPotentialPii(message)
      .replace(/https?:\/\/\S+/g, "<url>")
      .replace(UUID, "<id>")
      .replace(/\b\d+\b/g, "<n>")
      .replace(/['"`][^'"`]{0,80}['"`]/g, "<str>")
      .replace(/\s+/g, " ")
      .trim(),
    160,
  );
}

/** Keeps only the first frames, with absolute URLs reduced to file names. */
export function normalizeStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const head = stack
    .split("\n")
    .slice(1, 4)
    .map((line) => line.trim().replace(/https?:\/\/[^)\s]*\/([^/)\s]+)/g, "$1"))
    .join(" | ");
  return head ? clampString(head, 300) : undefined;
}

/** Drops every query parameter except the attribution keys we deliberately keep. */
export function safeQuery(search: string): Record<string, string> {
  const result: Record<string, string> = {};
  const params = new URLSearchParams(search);
  for (const [key, value] of params) {
    if (ALLOWED_QUERY_KEYS.has(key.toLowerCase())) result[key.toLowerCase()] = clampString(value, 80);
  }
  return result;
}

const sanitizeValue = (value: PropertyValue): PropertyValue => {
  if (typeof value === "string") return clampString(value);
  if (Array.isArray(value)) {
    return (value as PropertyValue[])
      .slice(0, 20)
      .map((item) => (typeof item === "string" ? clampString(item, 60) : item)) as string[] | number[];
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return value;
};

/**
 * Final gate before an event leaves the browser: forbidden keys removed,
 * strings clamped, non-finite numbers nulled, property count capped.
 */
export function redactProperties(properties: Properties | undefined): Properties {
  if (!properties) return {};
  const output: Properties = {};
  let count = 0;
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    if (FORBIDDEN_KEY.test(key)) continue;
    if (count >= ANALYTICS_CONFIG.maxProperties) break;
    output[key] = sanitizeValue(value);
    count += 1;
  }
  return output;
}

export const isForbiddenKey = (key: string): boolean => FORBIDDEN_KEY.test(key);
