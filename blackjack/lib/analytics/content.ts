import { analytics } from "./client";
import { STORAGE_KEYS } from "./config";
import { clampString } from "./redact";

function visitCount(content: string): number {
  try {
    const counts = JSON.parse(localStorage.getItem(STORAGE_KEYS.contentVisits) || "{}") as Record<string, number>;
    const next = (counts[content] ?? 0) + 1;
    counts[content] = next;
    localStorage.setItem(STORAGE_KEYS.contentVisits, JSON.stringify(counts));
    return next;
  } catch {
    return 1;
  }
}

function sectionKey(element: HTMLElement, index: number): string {
  const explicit = element.dataset.analyticsSection || element.id;
  if (explicit) return clampString(explicit, 80);
  const label = element.textContent?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return clampString(label || `section_${index + 1}`, 80);
}

/** Route-level educational analytics with foreground-only reading time. */
export function startContentTracking(content: string): () => void {
  analytics.track("content_opened", { content, visit_count: visitCount(content) });
  const startedAt = Date.now();
  let activeSince = document.visibilityState === "visible" && document.hasFocus() ? Date.now() : 0;
  let engagedMs = 0;
  let deepestScroll = 0;
  let completed = false;

  const settle = () => {
    if (activeSince) engagedMs += Math.max(0, Date.now() - activeSince);
    activeSince = document.visibilityState === "visible" && document.hasFocus() ? Date.now() : 0;
  };
  const updateScroll = () => {
    const documentHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    deepestScroll = documentHeight <= 0 ? 100 : Math.max(deepestScroll, Math.round((window.scrollY / documentHeight) * 100));
  };
  const maybeComplete = () => {
    settle();
    updateScroll();
    if (completed || deepestScroll < 90 || engagedMs < 10_000) return;
    completed = true;
    analytics.track("content_completed", { content, engaged_ms: engagedMs, deepest_scroll: Math.min(100, deepestScroll) });
  };

  const headings: HTMLElement[] = [];
  const seen = new Set<string>();
  const observed = new Set<HTMLElement>();
  const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target as HTMLElement;
      const key = sectionKey(element, headings.indexOf(element));
      if (seen.has(key)) continue;
      seen.add(key);
      analytics.track("content_section_viewed", { content, section: key });
    }
  }, { threshold: 0.5 });
  const observeHeadings = () => {
    for (const heading of document.querySelectorAll<HTMLElement>("main [data-analytics-section], main h2, main h3")) {
      if (observed.has(heading)) continue;
      observed.add(heading);
      headings.push(heading);
      observer?.observe(heading);
    }
  };
  observeHeadings();
  const mutationObserver = new MutationObserver(observeHeadings);
  const main = document.querySelector("main");
  if (main) mutationObserver.observe(main, { childList: true, subtree: true });

  const visibility = () => { settle(); maybeComplete(); };
  const focus = () => { settle(); };
  const blur = () => { settle(); maybeComplete(); };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("focus", focus);
  window.addEventListener("blur", blur);
  window.addEventListener("scroll", updateScroll, { passive: true });

  return () => {
    maybeComplete();
    if (!completed && Date.now() - startedAt >= 10_000) {
      // Not a completion, but the section and scroll events still preserve the
      // reading depth without inventing a misleading success event.
    }
    observer?.disconnect();
    mutationObserver.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("focus", focus);
    window.removeEventListener("blur", blur);
    window.removeEventListener("scroll", updateScroll);
  };
}
