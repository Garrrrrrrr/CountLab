import { analytics } from "./client";
import { ANALYTICS_CONFIG } from "./config";
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
  if (navigation) {
    report("TTFB", Math.max(0, navigation.responseStart));
    analytics.track("performance_metric", {
      metric: "dom_interactive",
      value_ms: Math.round(Math.max(0, navigation.domInteractive)),
      route: analytics.route,
    });
    const pageLoad = navigation.loadEventEnd || navigation.domComplete;
    if (pageLoad) analytics.track("performance_metric", {
      metric: "page_load",
      value_ms: Math.round(Math.max(0, pageLoad)),
      route: analytics.route,
    });
  }

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

  // Extended telemetry is configurable because long-task/resource data can be
  // high volume on large sites. Core Web Vitals above are never sampled.
  const sampleExtended = Math.random() < ANALYTICS_CONFIG.performanceSampleRate;
  let longestTask = 0;
  let extendedFinalized = false;
  if (sampleExtended) {
    observe("longtask", (entries) => {
      for (const entry of entries) longestTask = Math.max(longestTask, entry.duration);
    });
  }

  // Values are only final once the page is being hidden.
  const finalize = () => {
    if (lcp) report("LCP", lcp);
    if (cls >= 0) report("CLS", cls);
    if (inp) report("INP", inp);
    if (sampleExtended && !extendedFinalized && longestTask) {
      analytics.track("performance_metric", {
        metric: "long_task",
        value_ms: Math.round(longestTask),
        route: analytics.route,
      });
      longestTask = 0;
    }
    if (sampleExtended && !extendedFinalized) {
      const slowest = new Map<string, number>();
      for (const entry of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
        const type = entry.initiatorType || "other";
        if (!["script", "css", "img", "font"].includes(type)) continue;
        slowest.set(type, Math.max(slowest.get(type) ?? 0, entry.duration));
      }
      for (const [resourceType, value] of slowest) analytics.track("performance_metric", {
        metric: "resource_load",
        value_ms: Math.round(value),
        route: analytics.route,
        resource_type: resourceType,
      });
      extendedFinalized = true;
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") finalize();
  });
  window.addEventListener("pagehide", finalize);
}
