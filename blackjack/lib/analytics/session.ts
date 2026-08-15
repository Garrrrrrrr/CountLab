import { ANALYTICS_CONFIG, STORAGE_KEYS } from "./config";
import { newEventId } from "./identity";
import { normalizeRoute } from "./redact";

export interface SessionState {
  id: string;
  started_at: number;
  last_activity_at: number;
  /** Foreground time only — a backgrounded tab does not accumulate. */
  engaged_ms: number;
  page_views: number;
  events: number;
  meaningful_events: number;
  first_path: string;
  last_path: string;
  is_first_session: boolean;
}

export interface EndedSession extends SessionState {
  reason: "timeout" | "page_hide" | "sign_out";
  duration_ms: number;
  bounced: boolean;
}

const SESSION_COUNT_KEY = `${STORAGE_KEYS.session}:count`;

let state: SessionState | undefined;
let engagementStartedAt = 0;

const now = () => Date.now();

function read(): SessionState | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SessionState;
    return { ...parsed, meaningful_events: Number(parsed.meaningful_events) || 0 };
  } catch {
    return undefined;
  }
}

function write(next: SessionState | undefined): void {
  try {
    if (next) localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEYS.session);
  } catch {
    // Storage may be unavailable; the in-memory copy still works for this tab.
  }
}

function priorSessionCount(): number {
  try {
    return Number(localStorage.getItem(SESSION_COUNT_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function bumpSessionCount(): number {
  const next = priorSessionCount() + 1;
  try {
    localStorage.setItem(SESSION_COUNT_KEY, String(next));
  } catch {
    // Best effort only.
  }
  return next;
}

const isEngaged = (): boolean =>
  typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();

/** Folds elapsed foreground time into the session and restarts the stopwatch. */
function settleEngagement(target: SessionState): void {
  if (!engagementStartedAt) return;
  target.engaged_ms += Math.max(0, now() - engagementStartedAt);
  engagementStartedAt = isEngaged() ? now() : 0;
}

function finish(session: SessionState, reason: EndedSession["reason"]): EndedSession {
  settleEngagement(session);
  const duration = Math.max(0, session.last_activity_at - session.started_at);
  return {
    ...session,
    reason,
    duration_ms: duration,
    bounced: session.page_views <= 1 && session.engaged_ms < ANALYTICS_CONFIG.engagedSessionMs,
  };
}

function start(path: string): SessionState {
  const count = bumpSessionCount();
  const fresh: SessionState = {
    id: newEventId(),
    started_at: now(),
    last_activity_at: now(),
    engaged_ms: 0,
    page_views: 0,
    events: 0,
    meaningful_events: 0,
    first_path: path,
    last_path: path,
    is_first_session: count === 1,
  };
  engagementStartedAt = isEngaged() ? now() : 0;
  write(fresh);
  return fresh;
}

export interface EnsureResult {
  session: SessionState;
  /** Present when this call opened a session — the caller emits `session_started`. */
  started?: SessionState;
  /** Present when a stale session was closed — the caller emits `session_ended`. */
  ended?: EndedSession;
}

/**
 * Returns the live session, rotating it when the inactivity window has passed.
 * Session state is shared across tabs via localStorage so two open tabs are one
 * session, which is what "session" means to anyone reading the dashboard.
 */
export function ensureSession(path: string): EnsureResult {
  const currentPath = normalizeRoute(path);
  const existing = state ?? read();

  if (existing && now() - existing.last_activity_at <= ANALYTICS_CONFIG.sessionTimeoutMs) {
    state = existing;
    settleEngagement(state);
    state.last_activity_at = now();
    state.last_path = currentPath;
    write(state);
    return { session: state };
  }

  const ended = existing ? finish(existing, "timeout") : undefined;
  state = start(currentPath);
  return { session: state, started: state, ended };
}

export function recordPageView(path: string): void {
  if (!state) return;
  state.page_views += 1;
  state.last_path = normalizeRoute(path);
  write(state);
}

export function recordEvent(meaningful = true): void {
  if (!state) return;
  state.events += 1;
  if (meaningful) state.meaningful_events = (state.meaningful_events || 0) + 1;
  write(state);
}

/** Called on visibility/focus transitions so engaged time tracks real attention. */
export function syncEngagement(): void {
  if (!state) return;
  if (isEngaged()) {
    if (!engagementStartedAt) engagementStartedAt = now();
    return;
  }
  settleEngagement(state);
  engagementStartedAt = 0;
  write(state);
}

export function endSession(reason: EndedSession["reason"]): EndedSession | undefined {
  const current = state ?? read();
  if (!current) return undefined;
  current.last_activity_at = now();
  const ended = finish(current, reason);
  state = undefined;
  engagementStartedAt = 0;
  write(undefined);
  return ended;
}

/**
 * Produces a provisional end snapshot without discarding the persisted
 * session. Page unloads and BFCache transitions use this so a reload/return
 * inside the inactivity window keeps the same session id.
 */
export function snapshotSession(reason: EndedSession["reason"]): EndedSession | undefined {
  const current = state ?? read();
  if (!current) return undefined;
  current.last_activity_at = now();
  const snapshot = finish(current, reason);
  state = current;
  write(current);
  return snapshot;
}

export const currentSession = (): SessionState | undefined => state;

/** Drops local session identity after an analytics deletion request. */
export function clearSessionData(): void {
  state = undefined;
  engagementStartedAt = 0;
  write(undefined);
  try { localStorage.removeItem(SESSION_COUNT_KEY); } catch { /* best effort */ }
}

/** Test seam: drops in-memory state without touching persisted counters. */
export function resetSessionStateForTests(): void {
  state = undefined;
  engagementStartedAt = 0;
}
