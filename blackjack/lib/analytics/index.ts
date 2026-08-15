/**
 * Public surface of the analytics system. Import from `@/lib/analytics` only —
 * the internal modules are implementation detail and may change shape.
 */
export { analytics } from "./client";
export { AnalyticsProvider, useFeature, useDrillAnalytics, useCalculatorAnalytics, useFormAnalytics, gameAnalytics } from "./react";
export { reportHandledError } from "./errors";
export { observeApiRequest } from "./api";
export { experimentVariant, exposeFeatureFlag } from "./experiments";
export { startContentTracking } from "./content";
export { bucketMoney, bucketRate, bucketProbability, bucketTrueCount, normalizeRoute } from "./redact";
export { FEATURES, LIFECYCLE_THRESHOLDS, featureCategory } from "./config";
export type {
  AcquisitionChannel,
  CalculatorId,
  DrillId,
  EventName,
  EventPropertyMap,
  FeatureCategory,
  FeatureId,
  GameId,
  NavigationType,
  WebVitalMetric,
} from "./types";
