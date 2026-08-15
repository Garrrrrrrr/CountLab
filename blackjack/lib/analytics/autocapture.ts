import { analytics } from "./client";
import { ANALYTICS_CONFIG } from "./config";
import { clampString, normalizeRoute } from "./redact";
import type { FeatureId, NavigationType } from "./types";

const INTERACTIVE = [
  "a",
  "button",
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  "select",
  "summary",
  "[data-analytics-id]",
].join(", ");

let started = false;
let lastMutationAt = 0;
let seenDepths = new Set<number>();
const recentClicks: Array<{ x: number; y: number; at: number }> = [];

/**
 * Prefers an explicit `data-analytics-id`. DOM-derived labels are a fallback
 * only: they drift whenever copy changes, so they must not become the
 * long-term identifier for anything that matters (see docs/analytics.md §6).
 */
function semanticId(element: HTMLElement): string | undefined {
  const own = element.dataset.analyticsId;
  if (own) return clampString(own, 60);
  const ancestor = element.closest<HTMLElement>("[data-analytics-id]");
  return ancestor?.dataset.analyticsId ? clampString(ancestor.dataset.analyticsId, 60) : undefined;
}

function visibleLabel(element: HTMLElement): string {
  const aria = element.getAttribute("aria-label")?.trim();
  if (aria) return clampString(aria, 60);
  if (element instanceof HTMLInputElement) return clampString(element.type || "input", 60);
  const text = element.textContent?.replace(/\s+/g, " ").trim();
  if (text) return clampString(text, 60);
  return clampString(element.getAttribute("title") || element.tagName.toLowerCase(), 60);
}

function navMechanism(element: HTMLElement): NavigationType | undefined {
  const surface = element.closest<HTMLElement>("[data-analytics-nav]")?.dataset.analyticsNav;
  if (surface === "sidebar") return "sidebar";
  if (surface === "bottom") return "bottom_nav";
  return undefined;
}

function linkTarget(element: HTMLElement): { href_route?: string; outbound_domain?: string } {
  if (!(element instanceof HTMLAnchorElement)) return {};
  try {
    const url = new URL(element.href, window.location.href);
    if (url.origin !== window.location.origin) return { outbound_domain: clampString(url.hostname, 100) };
    return { href_route: normalizeRoute(url.pathname) };
  } catch {
    return {};
  }
}

function detectRageClick(x: number, y: number, base: { analytics_id?: string; label: string; element: string }): void {
  const at = Date.now();
  while (recentClicks.length && at - recentClicks[0].at > ANALYTICS_CONFIG.rageClickWindowMs) recentClicks.shift();
  recentClicks.push({ x, y, at });
  const cluster = recentClicks.filter((click) => Math.hypot(click.x - x, click.y - y) < ANALYTICS_CONFIG.rageClickRadiusPx);
  if (cluster.length !== ANALYTICS_CONFIG.rageClickThreshold) return;
  analytics.track("rage_click_detected", {
    ...base,
    x_percent: Math.round((x / window.innerWidth) * 100),
    y_percent: Math.round((y / window.innerHeight) * 100),
  });
}

/**
 * A click that produced no DOM mutation and no navigation looked interactive
 * but did nothing — the clearest automatic signal of a broken affordance.
 */
function detectDeadClick(clickedAt: number, routeBefore: string, base: { analytics_id?: string; label: string; element: string }): void {
  window.setTimeout(() => {
    const mutated = lastMutationAt > clickedAt;
    const navigated = normalizeRoute(window.location.pathname) !== routeBefore;
    if (mutated || navigated) return;
    analytics.track("dead_click_detected", base);
  }, ANALYTICS_CONFIG.deadClickWindowMs);
}

function handleClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  const element = target?.closest<HTMLElement>(INTERACTIVE);
  if (!element) return;

  const base = {
    analytics_id: semanticId(element),
    label: visibleLabel(element),
    element: element.tagName.toLowerCase(),
  };
  const component = element.closest<HTMLElement>("[data-analytics-component]")?.dataset.analyticsComponent;
  const mechanism = navMechanism(element);
  if (mechanism) analytics.setNavigationHint(mechanism);

  const disabled = (element as HTMLButtonElement).disabled;
  if (!disabled) {
    analytics.track("element_clicked", { ...base, component, ...linkTarget(element) });
  }

  detectRageClick(event.clientX, event.clientY, base);
  if (!disabled) detectDeadClick(Date.now(), normalizeRoute(window.location.pathname), base);
}

function fieldName(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const explicit = element.dataset.analyticsField || element.name || element.id || element.getAttribute("aria-label");
  const label = explicit || element.closest("label")?.textContent || element.tagName.toLowerCase();
  return clampString(label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), 60);
}

/** Records only which calculator control changed—never its entered value. */
function handleChange(event: Event): void {
  const element = event.target;
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return;
  const calculators: Record<string, "game_bankroll_lab" | "session_simulator" | "session_journal"> = {
    "/cvcx": "game_bankroll_lab",
    "/simulation": "session_simulator",
    "/journal": "session_journal",
  };
  const calculator = calculators[analytics.route];
  if (!calculator) return;
  analytics.track("calculation_input_changed", { calculator, input: fieldName(element) });
}

/** Tracks result disclosure without recording the content inside the panel. */
function handleToggle(event: Event): void {
  const element = event.target;
  if (!(element instanceof HTMLDetailsElement) || !element.open) return;
  const features: Record<string, FeatureId> = {
    "/cvcx": "game_bankroll_lab",
    "/simulation": "session_simulator",
    "/journal": "session_journal",
    "/ultimate-texas-holdem": "ultimate_texas_holdem",
    "/chase-flush": "chase_the_flush",
    "/training/full-shoe": "blackjack",
  };
  const feature = features[analytics.route];
  if (!feature) return;
  const summary = element.querySelector<HTMLElement>("summary");
  const section = element.dataset.analyticsSection || summary?.dataset.analyticsId || summary?.textContent || "result_details";
  analytics.track("result_expanded", {
    feature,
    section: clampString(section.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), 80),
  });
}

function handleScroll(): void {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - doc.clientHeight;
  if (scrollable <= 0) return;
  const percent = Math.round((window.scrollY / scrollable) * 100);
  for (const depth of ANALYTICS_CONFIG.scrollDepths) {
    if (percent >= depth && !seenDepths.has(depth)) {
      seenDepths.add(depth);
      analytics.track("scroll_depth_reached", { depth, route: analytics.route });
    }
  }
}

/** Installs the document-level listeners. Safe to call more than once. */
export function startAutocapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  document.addEventListener("click", handleClick, { capture: true });
  document.addEventListener("change", handleChange, { capture: true });
  document.addEventListener("toggle", handleToggle, { capture: true });

  new MutationObserver(() => {
    lastMutationAt = Date.now();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });

  let ticking = false;
  document.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        handleScroll();
      });
    },
    { passive: true },
  );
}

/** Re-arms scroll milestones for a new route. */
export function resetScrollDepth(): void {
  seenDepths = new Set();
}
