import { STORAGE_KEYS } from "./config";
import { clampString, normalizeRoute, safeQuery } from "./redact";
import type { AcquisitionChannel, DeviceType, EventContext } from "./types";
import { isStandalone, readPwaEnv } from "../pwa/standalone";

const SEARCH_ENGINES = /(google|bing|duckduckgo|yahoo|ecosia|brave|yandex|baidu|startpage|qwant)\./i;
const SOCIAL = /(facebook|instagram|twitter|x\.com|t\.co|linkedin|reddit|youtube|tiktok|pinterest|discord|threads)\./i;
const EMAIL_HOSTS = /(mail\.google|outlook|mail\.yahoo|proton\.me)\./i;

const BOT_UA = /(bot|crawler|spider|crawl|slurp|headless|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitoring|preview|scraper|curl|wget|python-requests|axios\/)/i;

/** Coarse timezone → country, used instead of IP geolocation (see docs/analytics.md §1). */
const TIMEZONE_COUNTRY: Record<string, string> = {
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA", "America/Halifax": "CA", "America/St_Johns": "CA",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "America/Phoenix": "US", "America/Anchorage": "US", "Pacific/Honolulu": "US",
  "America/Mexico_City": "MX", "America/Sao_Paulo": "BR", "America/Bogota": "CO", "America/Buenos_Aires": "AR", "America/Argentina/Buenos_Aires": "AR", "America/Santiago": "CL", "America/Lima": "PE",
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE", "Europe/Zurich": "CH", "Europe/Vienna": "AT", "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Lisbon": "PT", "Europe/Athens": "GR", "Europe/Bucharest": "RO", "Europe/Budapest": "HU", "Europe/Kyiv": "UA", "Europe/Moscow": "RU",
  "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK", "Asia/Taipei": "TW", "Asia/Singapore": "SG", "Asia/Bangkok": "TH",
  "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Karachi": "PK", "Asia/Dubai": "AE", "Asia/Jerusalem": "IL", "Asia/Riyadh": "SA",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU", "Australia/Perth": "AU", "Pacific/Auckland": "NZ",
  "Africa/Johannesburg": "ZA", "Africa/Lagos": "NG", "Africa/Cairo": "EG", "Africa/Nairobi": "KE",
};

export function detectDeviceType(): DeviceType {
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

export function detectBrowser(): { browser: string; browser_version: string } {
  const ua = navigator.userAgent;
  const match =
    /(Edg|EdgiOS)\/([\d.]+)/.exec(ua) ??
    /(OPR|Opera)\/([\d.]+)/.exec(ua) ??
    /(Firefox|FxiOS)\/([\d.]+)/.exec(ua) ??
    /(CriOS)\/([\d.]+)/.exec(ua) ??
    /(Chrome)\/([\d.]+)/.exec(ua) ??
    /Version\/([\d.]+).*(Safari)/.exec(ua);
  if (!match) return { browser: "other", browser_version: "" };
  // The Safari pattern captures version first, so normalise the pair order.
  const [a, b] = [match[1], match[2]];
  const isSafariShape = /^[\d.]+$/.test(a);
  const rawName = isSafariShape ? b : a;
  const version = isSafariShape ? a : b;
  const names: Record<string, string> = { Edg: "Edge", EdgiOS: "Edge", OPR: "Opera", FxiOS: "Firefox", CriOS: "Chrome" };
  return { browser: names[rawName] ?? rawName, browser_version: (version ?? "").split(".")[0] };
}

export function detectOs(): string {
  const ua = navigator.userAgent;
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "other";
}

/** Buckets so viewport is a segment, not a fingerprint. */
export function viewportBucket(width: number): string {
  if (width < 480) return "<480";
  if (width < 768) return "480-768";
  if (width < 1024) return "768-1024";
  if (width < 1440) return "1024-1440";
  if (width < 1920) return "1440-1920";
  return "1920+";
}

/**
 * Best-effort automation detection. Flags rather than blocks: bot rows are
 * stored with `is_bot` so they can be inspected but stay out of every metric.
 */
export function detectBot(): boolean {
  if (typeof navigator === "undefined") return true;
  if (navigator.webdriver) return true;
  if (BOT_UA.test(navigator.userAgent)) return true;
  // Real browsers report at least one language and a non-zero screen.
  if (!navigator.languages || navigator.languages.length === 0) return true;
  if (typeof screen !== "undefined" && screen.width === 0) return true;
  return false;
}

export function classifyChannel(referrer: string, utm: Record<string, string>): AcquisitionChannel {
  const medium = (utm.utm_medium ?? "").toLowerCase();
  if (medium) {
    if (/cpc|ppc|paid|sem/.test(medium)) return "paid_search";
    if (/email|newsletter/.test(medium)) return "email";
    if (/social/.test(medium)) return "social";
    if (/referral/.test(medium)) return "referral";
    return "campaign";
  }
  if (utm.utm_source || utm.utm_campaign) return "campaign";
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    return "unknown";
  }
  if (typeof window !== "undefined" && host === window.location.hostname) return "internal";
  if (SEARCH_ENGINES.test(`${host}.`)) return "organic_search";
  if (SOCIAL.test(`${host}.`)) return "social";
  if (EMAIL_HOSTS.test(`${host}.`)) return "email";
  return "referral";
}

export const referrerDomain = (referrer: string): string | undefined => {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).hostname;
    if (typeof window !== "undefined" && host === window.location.hostname) return undefined;
    return clampString(host, 100);
  } catch {
    return undefined;
  }
};

interface Attribution {
  first_touch_channel: AcquisitionChannel;
  first_touch_source?: string;
  landing_path: string;
  utm?: Record<string, string>;
}

/**
 * First-touch attribution is written once and never overwritten, so a user who
 * arrives from a campaign and returns directly still credits the campaign.
 */
export function resolveAttribution(): Attribution {
  const utm = safeQuery(window.location.search);
  const referrer = document.referrer || "";
  const channel = classifyChannel(referrer, utm);
  const landing = normalizeRoute(window.location.pathname);

  let stored: Attribution | undefined;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.attribution);
    if (raw) stored = JSON.parse(raw) as Attribution;
  } catch {
    stored = undefined;
  }
  if (stored?.first_touch_channel) return stored;

  const attribution: Attribution = {
    first_touch_channel: channel,
    first_touch_source: utm.utm_source ?? referrerDomain(referrer),
    landing_path: landing,
    utm,
  };
  try {
    localStorage.setItem(STORAGE_KEYS.attribution, JSON.stringify(attribution));
  } catch {
    // Storage can be unavailable (private mode); attribution is best-effort.
  }
  return attribution;
}

let cached: EventContext | undefined;

/** Device/locale context is stable for the page lifetime, so it is computed once. */
export function buildContext(): EventContext {
  if (typeof window === "undefined") return {};
  if (cached) return { ...cached, viewport: viewportBucket(window.innerWidth) };

  const utm = safeQuery(window.location.search);
  const referrer = document.referrer || "";
  const attribution = resolveAttribution();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  const { browser, browser_version } = detectBrowser();

  cached = {
    device_type: detectDeviceType(),
    display_mode: isStandalone(readPwaEnv()) ? "standalone" : "browser",
    browser,
    browser_version,
    os: detectOs(),
    viewport: viewportBucket(window.innerWidth),
    screen: typeof screen !== "undefined" ? viewportBucket(screen.width) : undefined,
    touch: typeof navigator !== "undefined" && navigator.maxTouchPoints > 0,
    locale: navigator.language?.slice(0, 5),
    timezone,
    country: timezone ? TIMEZONE_COUNTRY[timezone] : undefined,
    region: timezone?.split("/")[0],
    referrer_domain: referrerDomain(referrer),
    channel: classifyChannel(referrer, utm),
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_term: utm.utm_term,
    utm_content: utm.utm_content,
    first_touch_channel: attribution.first_touch_channel,
    first_touch_source: attribution.first_touch_source,
    landing_path: attribution.landing_path,
  };
  return cached;
}
