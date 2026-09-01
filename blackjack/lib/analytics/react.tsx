"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { resetScrollDepth, startAutocapture } from "./autocapture";
import { analytics } from "./client";
import { FEATURES, featureCategory } from "./config";
import { startErrorCapture } from "./errors";
import { startVitals } from "./vitals";
import type { CalculatorId, DrillId, EventPropertyMap, FeatureId, GameId } from "./types";
import { abandonActivePractice } from "./track";
import { startContentTracking } from "./content";
import { isOptedOut } from "./identity";

/**
 * Single mount point for the whole analytics system. Everything else in the
 * app talks to `analytics.*` or the hooks below — no component ever touches
 * Supabase or the event queue directly.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const previousPath = useRef<string | undefined>(undefined);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const update = () => setEnabled(!isOptedOut());
    update();
    addEventListener("countlab:analytics-consent", update);
    return () => removeEventListener("countlab:analytics-consent", update);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    analytics.init();
    startAutocapture();
    startErrorCapture();
    startVitals();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    analytics.page(pathname);
    resetScrollDepth();
    const route = pathname.replace(/\/$/, "") || "/";
    const matched = Object.entries(FEATURES).find(([, definition]) => definition.route === route);
    const prior = previousPath.current
      ? Object.entries(FEATURES).find(([, definition]) => definition.route === previousPath.current)
      : undefined;
    if (prior?.[1].category === "reference" && matched && matched[1].category !== "reference") {
      analytics.track("content_feature_launched", {
        content: prior[0],
        feature: matched[0] as FeatureId,
      });
    }
    previousPath.current = route;
    let stopContent: (() => void) | undefined;
    if (matched) {
      const [feature, definition] = matched;
      analytics.track("feature_opened", { feature: feature as FeatureId, category: definition.category });
      if (["game_bankroll_lab", "session_simulator", "session_journal"].includes(feature)) {
        analytics.track("calculator_opened", { calculator: feature as CalculatorId });
      }
      if (definition.category === "reference") stopContent = startContentTracking(feature);
    }
    return () => {
      stopContent?.();
      abandonActivePractice();
    };
  }, [enabled, pathname]);

  return <>{children}</>;
}

type Omitted<E extends keyof EventPropertyMap, K extends string> = Omit<EventPropertyMap[E], K>;

/**
 * Feature lifecycle in one line. Fires `feature_opened` on mount and, if the
 * feature is never marked complete, `feature_abandoned` on unmount — which is
 * what makes drop-off measurable without every component remembering to.
 */
export function useFeature(feature: FeatureId) {
  const openedAt = useRef(0);
  const settled = useRef(false);
  const stage = useRef<string | undefined>(undefined);

  useEffect(() => {
    const category = featureCategory(feature);
    openedAt.current = Date.now();
    settled.current = false;
    analytics.track("feature_opened", { feature, category });
    return () => {
      if (settled.current) return;
      analytics.track("feature_abandoned", {
        feature,
        category,
        duration_ms: Date.now() - openedAt.current,
        stage: stage.current,
      });
    };
  }, [feature]);

  const complete = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    analytics.track("feature_completed", {
      feature,
      category: featureCategory(feature),
      duration_ms: Date.now() - openedAt.current,
    });
  }, [feature]);

  /** Records how far the user got, so abandonment says *where* they left. */
  const setStage = useCallback((value: string) => {
    stage.current = value;
  }, []);

  return { complete, setStage };
}

/**
 * Drill lifecycle: start → answers → complete, with automatic
 * `practice_abandoned` if the component unmounts mid-drill.
 */
export function useDrillAnalytics(drill: DrillId) {
  const startedAt = useRef(0);
  const active = useRef(false);
  const answered = useRef(0);
  const target = useRef(0);

  const start = useCallback(
    (properties: Omitted<"practice_started", "drill"> = {}) => {
      startedAt.current = Date.now();
      active.current = true;
      answered.current = 0;
      target.current = properties.question_target ?? 0;
      analytics.track("practice_started", { drill, ...properties });
    },
    [drill],
  );

  const answer = useCallback(
    (properties: Omitted<"question_answered", "drill" | "attempt"> & { attempt?: number }) => {
      answered.current += 1;
      analytics.track("question_answered", {
        drill,
        attempt: properties.attempt ?? answered.current,
        ...properties,
      });
    },
    [drill],
  );

  const complete = useCallback(
    (properties: Omitted<"practice_completed", "drill" | "duration_ms"> & { duration_ms?: number }) => {
      if (!active.current) return;
      active.current = false;
      analytics.track("practice_completed", {
        drill,
        duration_ms: properties.duration_ms ?? Date.now() - startedAt.current,
        ...properties,
      });
    },
    [drill],
  );

  useEffect(
    () => () => {
      if (!active.current) return;
      active.current = false;
      analytics.track("practice_abandoned", {
        drill,
        questions_answered: answered.current,
        progress_percent: target.current ? Math.round((answered.current / target.current) * 100) : 0,
        duration_ms: Date.now() - startedAt.current,
      });
    },
    [drill],
  );

  return { start, answer, complete };
}

/** Fires `calculator_opened` on mount and wraps the run/preset events. */
export function useCalculatorAnalytics(calculator: CalculatorId) {
  useEffect(() => {
    analytics.track("calculator_opened", { calculator });
  }, [calculator]);

  const run = useCallback(
    (properties: Omitted<"calculation_run", "calculator"> = {}) => {
      analytics.track("calculation_run", { calculator, ...properties });
    },
    [calculator],
  );

  const preset = useCallback(
    (name: string) => {
      analytics.track("preset_selected", { calculator, preset: name });
    },
    [calculator],
  );

  return { run, preset };
}

/** Privacy-safe form lifecycle: field categories and error categories only. */
export function useFormAnalytics(form: string, active = true) {
  const startedAt = useRef(0);
  const settled = useRef(false);
  const lastStep = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    startedAt.current = 0;
    settled.current = false;
    lastStep.current = undefined;
    analytics.track("form_opened", { form });
    return () => {
      if (!startedAt.current || settled.current) return;
      analytics.track("form_abandoned", {
        form,
        duration_ms: Date.now() - startedAt.current,
        last_step: lastStep.current,
      });
    };
  }, [active, form]);

  const start = useCallback((step?: string) => {
    if (!active) return;
    if (settled.current) {
      settled.current = false;
      startedAt.current = 0;
      analytics.track("form_opened", { form });
    }
    lastStep.current = step;
    if (startedAt.current) return;
    startedAt.current = Date.now();
    analytics.track("form_started", { form });
  }, [active, form]);

  const submitted = useCallback(() => {
    start("submit");
    analytics.track("form_submitted", { form });
  }, [form, start]);

  const validationFailed = useCallback((fieldCategory: string, reasonCategory: string) => {
    start(fieldCategory);
    analytics.track("form_validation_failed", {
      form,
      field_category: fieldCategory,
      reason_category: reasonCategory,
    });
  }, [form, start]);

  const succeeded = useCallback(() => {
    if (!active) return;
    settled.current = true;
    analytics.track("form_succeeded", { form, duration_ms: startedAt.current ? Date.now() - startedAt.current : 0 });
  }, [active, form]);

  const failed = useCallback((reasonCategory: string) => {
    if (!active) return;
    analytics.track("form_failed", {
      form,
      duration_ms: startedAt.current ? Date.now() - startedAt.current : 0,
      reason_category: reasonCategory,
    });
  }, [active, form]);

  return { start, submitted, validationFailed, succeeded, failed };
}

/** Table-game wrappers. Not a hook, so it can be created outside a component. */
export const gameAnalytics = (game: GameId) => ({
  handStarted: (properties: Omitted<"hand_started", "game">) => analytics.track("hand_started", { game, ...properties }),
  handDecision: (properties: Omitted<"hand_decision", "game">) => analytics.track("hand_decision", { game, ...properties }),
  handCompleted: (properties: Omitted<"hand_completed", "game">) => analytics.track("hand_completed", { game, ...properties }),
});
