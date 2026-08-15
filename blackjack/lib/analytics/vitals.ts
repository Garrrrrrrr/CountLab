import { analytics } from "./client";
import type { WebVitalMetric } from "./types";

/** Google's published good/needs-improvement boundaries. */
const THRESHOLDS: Record<WebVitalMetric, [good: number, poor: number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1800],
  FCP: [1800, 3000],
};

const rate = (metric: WebVitalMetric, value: number): "good" | "needs_improvement" | "poor" => {
  const [good, poor] = THRESHOLDS[metric];
  if (value <= good) return "good";
  return value <= poor ? "needs_improvement" : "poor";
};

let started = false;
const reported = new Set<WebVitalMetric>();

function report(metric: WebVitalMetric, value: number): void {
  if (reported.has(metric)) return;
  reported.add(metric);
  analytics.track("web_vital", {
    metric,
    value: metric === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value),
    rating: rate(metric, value),
    route: analytics.route,
  });
}

const observe = (type: string, callback: (entries: PerformanceEntryList) => void, extra: PerformanceObserverInit = {}) => {
  try {
    const observer = new PerformanceObserver((list) => callback(list.getEntries()));
    observer.observe({ type, buffered: true, ...extra });
    return observer;
  } catch {
    // Unsupported entry type in this browser; that metric is simply skipped.
    return undefined;
  }
};

/**
 * Core Web Vitals from native PerformanceObserver rather than a dependency.
 * LCP, FCP and TTFB are exact; CLS is the standard session-window maximum;
 * INP is approximated as the worst interaction latency, which tracks the real
 * metric closely enough to compare routes and devices.
 */
export function startVitals(): void {
  if (started || typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
  started = true;

  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation) report("TTFB", Math.max(0, navigation.responseStart));

  observe("paint", (entries) => {
    for (const entry of entries) {
      if (entry.name === "first-contentful-paint") report("FCP", entry.startTime);
    }
  });

  let lcp = 0;
  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1];
    if (last) lcp = last.startTime;
  });

  // CLS: the largest burst of shifts separated by <1s gaps / <5s total.
  let cls = 0;
  let windowValue = 0;
  let windowStart = 0;
  let windowPrevious = 0;
  observe("layout-shift", (entries) => {
    for (const entry of entries as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
      if (entry.hadRecentInput) continue;
      if (windowValue && entry.startTime - windowPrevious < 1000 && entry.startTime - windowStart < 5000) {
        windowValue += entry.value;
      } else {
        windowValue = entry.value;
        windowStart = entry.startTime;
      }
      windowPrevious = entry.startTime;
      cls = Math.max(cls, windowValue);
    }
  });

  let inp = 0;
  observe(
    "event",
    (entries) => {
      for (const entry of entries as Array<PerformanceEntry & { duration: number; interactionId?: number }>) {
        if (entry.interactionId) inp = Math.max(inp, entry.duration);
      }
    },
    { durationThreshold: 40 } as PerformanceObserverInit,
  );

  // Values are only final once the page is being hidden.
  const finalize = () => {
    if (lcp) report("LCP", lcp);
    if (cls >= 0) report("CLS", cls);
    if (inp) report("INP", inp);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") finalize();
  });
  window.addEventListener("pagehide", finalize);
}
