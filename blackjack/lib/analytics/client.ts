import { supabase } from "../supabase/client";
import { APP_VERSION, ANALYTICS_CONFIG, STORAGE_KEYS, detectEnvironment } from "./config";
import { buildContext, detectBot } from "./context";
import { clearAnonId, getAnonId, getUserId, isOptedOut, newEventId, onUserChange, setOptedOut } from "./identity";
import { clearPendingQueue, deleteAnalyticsIdentity, enqueue, flush, flushSync, linkIdentity, sendSessionRollup, setAccessToken } from "./queue";
import { normalizeRoute, redactProperties } from "./redact";
import {
  currentSession,
  clearSessionData,
  endSession,
  ensureSession,
  recordEvent,
  recordPageView,
  syncEngagement,
  snapshotSession,
  type EndedSession,
  type SessionState,
} from "./session";
import type {
  AnalyticsEventPayload,
  EventName,
  NavigationType,
  Properties,
  TrackArgs,
} from "./types";
import { PASSIVE_EVENTS } from "./types";

const environment = detectEnvironment();

let initialized = false;
let isBot = false;
let currentRoute = "/";
let previousRoute: string | undefined;
let navigationHint: NavigationType | undefined;
let navigationStartedAt = 0;
let firstView = true;
let aliasedUserId: string | undefined;

const enabled = (): boolean => typeof window !== "undefined" && !isOptedOut();

function viewCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.pageViews) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function bumpViewCount(route: string): number {
  const counts = viewCounts();
  const next = (counts[route] ?? 0) + 1;
  counts[route] = next;
  try {
    localStorage.setItem(STORAGE_KEYS.pageViews, JSON.stringify(counts));
  } catch {
    // Best effort only.
  }
  return next;
}

function buildPayload(event: EventName, properties: Properties | undefined, session: SessionState): AnalyticsEventPayload {
  return {
    event_id: newEventId(),
    event,
    occurred_at: new Date().toISOString(),
    // Overwritten server-side from auth.uid(); sent so guest rows stay null.
    user_id: getUserId(),
    anon_id: getAnonId(),
    session_id: session.id,
    path: currentRoute,
    environment,
    app_version: APP_VERSION,
    context: buildContext(),
    properties: redactProperties(properties),
    is_bot: isBot,
  };
}

/** Mirrors the session rollup into `analytics_sessions` for session-grain queries. */
function upsertSession(session: SessionState, ended?: EndedSession, keepalive = false): void {
  if (!enabled()) return;
  const context = buildContext();
  const payload = {
    session_id: session.id,
    anon_id: getAnonId(),
    user_id: getUserId(),
    started_at: new Date(session.started_at).toISOString(),
    last_activity_at: new Date(session.last_activity_at).toISOString(),
    ended_at: ended ? new Date(session.last_activity_at).toISOString() : null,
    duration_ms: ended?.duration_ms ?? Math.max(0, session.last_activity_at - session.started_at),
    engaged_ms: session.engaged_ms,
    page_views: session.page_views,
    events: session.events,
    meaningful_events: session.meaningful_events || 0,
    first_path: session.first_path,
    last_path: session.last_path,
    is_first_session: session.is_first_session,
    bounced: ended?.bounced ?? false,
    channel: context.channel ?? null,
    referrer_domain: context.referrer_domain ?? null,
    utm_source: context.utm_source ?? null,
    utm_medium: context.utm_medium ?? null,
    utm_campaign: context.utm_campaign ?? null,
    device_type: context.device_type ?? null,
    browser: context.browser ?? null,
    os: context.os ?? null,
    country: context.country ?? null,
    region: context.region ?? null,
    environment,
    app_version: APP_VERSION,
    is_bot: isBot,
  };
  sendSessionRollup(payload, keepalive);
}

/** Opens or rotates the session, emitting the lifecycle events that go with it. */
function withSession(): SessionState | undefined {
  if (!enabled()) return undefined;
  const { session, started, ended } = ensureSession(currentRoute);
  if (ended) {
    emitSessionEnded(ended);
  }
  if (started) {
    const context = buildContext();
    emit("session_started", {
      is_first_session: started.is_first_session,
      channel: context.channel ?? "unknown",
      landing_path: started.first_path,
      referrer_domain: context.referrer_domain,
      authenticated: Boolean(getUserId()),
    }, started);
    upsertSession(started);
  }
  return session;
}

/** Low-level emit that skips session rotation (used for the lifecycle events themselves). */
function emit(event: EventName, properties: Properties | undefined, session: SessionState): void {
  enqueue(buildPayload(event, properties, session));
}

function emitSessionEnded(ended: EndedSession): void {
  emit("session_ended", {
    duration_ms: ended.duration_ms,
    engaged_ms: ended.engaged_ms,
    page_views: ended.page_views,
    events: ended.events,
    meaningful_events: ended.meaningful_events || 0,
    bounced: ended.bounced,
    exit_path: ended.last_path,
    reason: ended.reason,
  }, ended);
  upsertSession(ended, ended);
}

function track<E extends EventName>(event: E, ...args: TrackArgs<E>): void {
  if (!enabled()) return;
  const session = withSession();
  if (!session) return;
  recordEvent(!PASSIVE_EVENTS.has(event));
  emit(event, args[0] as Properties | undefined, session);
}

interface PageOptions {
  title?: string;
  navigationType?: NavigationType;
}

function page(route: string, options: PageOptions = {}): void {
  if (!enabled()) return;
  const normalized = normalizeRoute(route);
  if (normalized === currentRoute && !firstView) return;

  previousRoute = firstView ? undefined : currentRoute;
  currentRoute = normalized;

  const session = withSession();
  if (!session) return;

  const viewCount = bumpViewCount(normalized);
  const navigationType = options.navigationType ?? navigationHint ?? (firstView ? "initial" : "link");
  navigationHint = undefined;

  recordPageView(normalized);
  recordEvent(false);
  emit("page_viewed", {
    route: normalized,
    title: options.title ?? (typeof document !== "undefined" ? document.title : undefined),
    previous_route: previousRoute,
    navigation_type: navigationType,
    is_first_view: viewCount === 1,
    view_count: viewCount,
  }, session);

  if (previousRoute) {
    recordEvent(false);
    emit("navigated", { from: previousRoute, to: normalized, mechanism: navigationType }, session);
  }
  if (navigationStartedAt && !firstView) {
    const elapsed = Math.max(0, performance.now() - navigationStartedAt);
    navigationStartedAt = 0;
    recordEvent(false);
    emit("performance_metric", {
      metric: "route_transition",
      value_ms: Math.round(elapsed),
      route: normalized,
    }, session);
  }
  firstView = false;
}

/**
 * Links this device's anonymous history to an account. Written once per
 * anon/user pair so pre-signup activity can be attributed after the fact.
 */
function identify(userId: string): void {
  if (!enabled() || aliasedUserId === userId) return;
  void linkIdentity(getAnonId()).then((linked) => {
    if (linked) aliasedUserId = userId;
  });
}

/** Ends the current session on sign-out. The device id is deliberately kept. */
function reset(): void {
  aliasedUserId = undefined;
  const ended = endSession("sign_out");
  if (ended) emitSessionEnded(ended);
  void flush();
}

function handleVisibility(): void {
  syncEngagement();
  if (document.visibilityState === "hidden") {
    const session = currentSession();
    if (session) upsertSession(session, undefined, true);
    flushSync();
  }
}

function init(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  isBot = detectBot();
  currentRoute = normalizeRoute(window.location.pathname);

  void supabase.auth.getSession().then(({ data }) => {
    setAccessToken(data.session?.access_token);
    if (data.session?.user) identify(data.session.user.id);
  });
  supabase.auth.onAuthStateChange((_event, authSession) => {
    setAccessToken(authSession?.access_token);
    if (authSession?.user) identify(authSession.user.id);
  });
  onUserChange((user) => {
    if (user) identify(user.id);
  });

  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("focus", syncEngagement);
  window.addEventListener("blur", syncEngagement);
  window.addEventListener("pagehide", () => {
    syncEngagement();
    const ended = snapshotSession("page_hide");
    if (ended) {
      emit("session_ended", {
        duration_ms: ended.duration_ms,
        engaged_ms: ended.engaged_ms,
        page_views: ended.page_views,
        events: ended.events,
        meaningful_events: ended.meaningful_events || 0,
        bounced: ended.bounced,
        exit_path: ended.last_path,
        reason: ended.reason,
      }, ended);
      upsertSession(ended, ended, true);
    }
    flushSync();
  });
  window.addEventListener("popstate", () => {
    navigationHint = "back_forward";
    navigationStartedAt = performance.now();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    firstView = true;
    page(window.location.pathname, { navigationType: "back_forward" });
  });

  // Rolls the session over when a tab sits idle past the timeout without any
  // interaction, so `session_ended` still lands instead of silently vanishing.
  setInterval(() => {
    const session = currentSession();
    if (!session) return;
    if (Date.now() - session.last_activity_at > ANALYTICS_CONFIG.sessionTimeoutMs) withSession();
  }, 60_000);
}

/** Lets autocapture tell the next page view how the user got there. */
function setNavigationHint(type: NavigationType): void {
  navigationHint = type;
  navigationStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
}

function setConsent(value: boolean, source: "settings" | "privacy_banner" | "api" = "api"): void {
  if (value) {
    const wasEnabled = enabled();
    setOptedOut(false);
    track("consent_updated", { analytics: true, source });
    if (!wasEnabled) page(currentRoute);
    return;
  }
  if (enabled()) track("consent_updated", { analytics: false, source });
  flushSync();
  setOptedOut(true);
  clearPendingQueue();
}

async function deleteHistory(): Promise<boolean> {
  const deleted = await deleteAnalyticsIdentity(getAnonId());
  if (!deleted) return false;
  aliasedUserId = undefined;
  clearPendingQueue();
  clearSessionData();
  clearAnonId();
  try {
    for (const key of [STORAGE_KEYS.attribution, STORAGE_KEYS.pageViews, STORAGE_KEYS.experiments, STORAGE_KEYS.contentVisits]) {
      localStorage.removeItem(key);
    }
  } catch {
    // Server deletion succeeded; local storage cleanup remains best effort.
  }
  return true;
}

export const analytics = {
  init,
  track,
  page,
  identify,
  reset,
  flush,
  setNavigationHint,
  setEnabled: (value: boolean) => setConsent(value, "api"),
  setConsent,
  deleteHistory,
  isEnabled: enabled,
  get route() {
    return currentRoute;
  },
  get environment() {
    return environment;
  },
};

export type Analytics = typeof analytics;
