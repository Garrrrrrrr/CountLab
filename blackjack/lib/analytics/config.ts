import type { Environment, FeatureCategory, FeatureId } from "./types";

/**
 * Static-export builds bake these in at build time. The deploy workflow
 * supplies the commit SHA; local `next dev` falls back to "dev".
 */
const RAW_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
const RAW_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA || "";
const RAW_PERFORMANCE_SAMPLE_RATE = Number(process.env.NEXT_PUBLIC_ANALYTICS_PERFORMANCE_SAMPLE_RATE ?? "1");
const REQUIRE_CONSENT = process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT === "true";

export const APP_VERSION = RAW_SHA ? `${RAW_VERSION}+${RAW_SHA.slice(0, 7)}` : RAW_VERSION;

/** Production is the real domain only, so preview and local traffic stay out of KPIs. */
export function detectEnvironment(): Environment {
  const override = process.env.NEXT_PUBLIC_ANALYTICS_ENV as Environment | undefined;
  if (override) return override;
  if (typeof window === "undefined") return "development";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return "development";
  if (host === "countlab.ca" || host === "www.countlab.ca") return "production";
  return "staging";
}

export const ANALYTICS_CONFIG = {
  /** A session ends after this much inactivity; the next event opens a new one. */
  sessionTimeoutMs: 30 * 60 * 1000,
  /** Sessions below this engaged time with a single page view count as bounces. */
  engagedSessionMs: 10 * 1000,
  /** Queue flushes when either threshold trips, whichever comes first. */
  batchSize: 20,
  flushIntervalMs: 5000,
  maxQueueSize: 200,
  maxRetries: 3,
  /** Clicks within this radius/window are a rage cluster. */
  rageClickRadiusPx: 30,
  rageClickWindowMs: 800,
  rageClickThreshold: 3,
  /** A click that changes neither the DOM nor the route within this window is dead. */
  deadClickWindowMs: 700,
  scrollDepths: [25, 50, 75, 90, 100] as const,
  maxStringLength: 120,
  maxProperties: 40,
  /** Configurable low-priority technical telemetry sampling; critical events are never sampled. */
  performanceSampleRate: Number.isFinite(RAW_PERFORMANCE_SAMPLE_RATE)
    ? Math.min(1, Math.max(0, RAW_PERFORMANCE_SAMPLE_RATE))
    : 1,
  /** Set at build time for jurisdictions/deployments that require prior opt-in. */
  requireConsent: REQUIRE_CONSENT,
} as const;

/** Lifecycle thresholds used by the retention/churn views and the dashboard. */
export const LIFECYCLE_THRESHOLDS = { activeDays: 7, slippingDays: 30 } as const;

export const STORAGE_KEYS = {
  anonId: "countlab:analytics:anon_id",
  session: "countlab:analytics:session",
  attribution: "countlab:analytics:attribution",
  pageViews: "countlab:analytics:page_views",
  optOut: "countlab:analytics:opt_out",
  consentSeen: "countlab:analytics:consent_seen",
  analyticsConsent: "countlab:analytics:consent",
  experiments: "countlab:analytics:experiments",
  contentVisits: "countlab:analytics:content_visits",
  pendingEvents: "countlab:analytics:pending_events",
} as const;

interface FeatureDefinition {
  category: FeatureCategory;
  label: string;
  route?: string;
}

/**
 * The feature registry backs adoption metrics and gives the dashboard human
 * labels without hard-coding strings in queries.
 */
export const FEATURES: Record<FeatureId, FeatureDefinition> = {
  running_count: { category: "training", label: "Running Count", route: "/training/running-count" },
  true_count: { category: "training", label: "True Count", route: "/training/true-count" },
  deck_estimation: { category: "training", label: "Deck Estimation", route: "/training/deck-estimation" },
  basic_strategy: { category: "training", label: "Basic Strategy", route: "/training/basic-strategy" },
  deviations: { category: "training", label: "Deviations", route: "/training/deviations" },
  h17_chart: { category: "training", label: "H17 Chart", route: "/training/h17-chart" },
  full_shoe: { category: "training", label: "Full Shoe", route: "/training/full-shoe" },
  counting_benchmark: { category: "training", label: "Counting Benchmark", route: "/training/benchmark" },
  practice_checklist: { category: "training", label: "Daily Checklist", route: "/training/checklist" },
  blackjack: { category: "game", label: "Blackjack table", route: "/training/full-shoe" },
  double_down_madness: { category: "game", label: "Double Down Madness", route: "/double-down-madness" },
  ultimate_texas_holdem: { category: "game", label: "Ultimate Texas Hold'em", route: "/ultimate-texas-holdem" },
  chase_the_flush: { category: "game", label: "Chase the Flush", route: "/chase-flush" },
  game_bankroll_lab: { category: "analysis", label: "Game & Bankroll Lab", route: "/cvcx" },
  advantage: { category: "analysis", label: "Advantage calculator" },
  bankroll_recommender: { category: "analysis", label: "Bankroll recommender" },
  session_simulator: { category: "analysis", label: "Session Simulator", route: "/simulation" },
  session_journal: { category: "analysis", label: "Session Journal", route: "/journal" },
  shoe_explorer: { category: "analysis", label: "Shoe Explorer" },
  hand_replayer: { category: "analysis", label: "Hand Replayer" },
  bet_spread_optimizer: { category: "analysis", label: "Bet spread optimizer" },
  statistics: { category: "account", label: "Statistics", route: "/statistics" },
  settings: { category: "account", label: "Settings", route: "/settings" },
  strategy_reference: { category: "reference", label: "Basic Strategy reference", route: "/reference/basic-strategy" },
  deviation_reference: { category: "reference", label: "Deviation reference", route: "/reference/deviations" },
  hilo_reference: { category: "reference", label: "Hi-Lo reference", route: "/reference" },
  admin_analytics: { category: "internal", label: "Admin analytics", route: "/admin" },
};

export const featureCategory = (feature: FeatureId): FeatureCategory => FEATURES[feature]?.category ?? "internal";
