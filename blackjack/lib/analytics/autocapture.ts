import { track } from "./track";

const MAX_LABEL_LENGTH = 80;
const RAGE_CLICK_WINDOW_MS = 800;
const RAGE_CLICK_RADIUS_PX = 30;
const RAGE_CLICK_THRESHOLD = 3;
const SCROLL_DEPTH_THRESHOLDS = [25, 50, 75, 100];

const CLICKABLE_SELECTOR = [
  "a",
  "button",
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  "select",
  "summary",
  "[data-track]",
].join(", ");

let initialized = false;
let seenScrollDepths = new Set<number>();
const recentClicks: { x: number; y: number; time: number }[] = [];

function elementLabel(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim().slice(0, MAX_LABEL_LENGTH);
  if (el instanceof HTMLInputElement) return (el.value || el.type || "input").slice(0, MAX_LABEL_LENGTH);
  const text = el.textContent?.replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, MAX_LABEL_LENGTH);
  const title = el.getAttribute("title");
  return (title || el.tagName.toLowerCase()).slice(0, MAX_LABEL_LENGTH);
}

function handleClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const el = target?.closest<HTMLElement>(CLICKABLE_SELECTOR);
  if (!el || (el as { disabled?: boolean }).disabled) return;

  const tag = el.tagName.toLowerCase();
  const label = elementLabel(el);
  const trackName = el.dataset.track;

  if (tag === "a") {
    const anchor = el as HTMLAnchorElement;
    let outbound = false;
    let hostname: string | undefined;
    try {
      const url = new URL(anchor.href, window.location.href);
      outbound = url.origin !== window.location.origin;
      hostname = outbound ? url.hostname : undefined;
    } catch {
      // Not a resolvable URL (e.g. a bare `#` anchor); leave outbound false.
    }
    track("ui_click", { tag, label, trackName, outbound, hostname });
    if (outbound) track("outbound_link_click", { hostname, label });
  } else {
    track("ui_click", { tag, label, trackName });
  }

  const now = Date.now();
  while (recentClicks.length && now - recentClicks[0].time > RAGE_CLICK_WINDOW_MS) recentClicks.shift();
  recentClicks.push({ x: event.clientX, y: event.clientY, time: now });
  const cluster = recentClicks.filter((c) => Math.hypot(c.x - event.clientX, c.y - event.clientY) < RAGE_CLICK_RADIUS_PX);
  if (cluster.length === RAGE_CLICK_THRESHOLD) track("rage_click", { tag, label });
}

function handleScroll() {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - doc.clientHeight;
  if (scrollable <= 0) return;
  const percent = Math.round((window.scrollY / scrollable) * 100);
  for (const threshold of SCROLL_DEPTH_THRESHOLDS) {
    if (percent >= threshold && !seenScrollDepths.has(threshold)) {
      seenScrollDepths.add(threshold);
      track("scroll_depth", { depth: threshold });
    }
  }
}

/** Call once, on mount, to start capturing clicks and scroll depth app-wide. */
export function initAutocapture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  document.addEventListener("click", handleClick, { capture: true });
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

/** Call on every route change so scroll-depth milestones are re-armed for the new page. */
export function resetScrollDepth(): void {
  seenScrollDepths = new Set();
}
