import { ANALYTICS_CONFIG, STORAGE_KEYS } from "./config";
import { CRITICAL_EVENTS, type AnalyticsEventPayload } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let queue: AnalyticsEventPayload[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let accessToken: string | undefined;
let failures = 0;
let hydrated = false;

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    if (queue.length) localStorage.setItem(STORAGE_KEYS.pendingEvents, JSON.stringify(queue));
    else localStorage.removeItem(STORAGE_KEYS.pendingEvents);
  } catch {
    // Storage can be unavailable in private browsing; in-memory delivery remains.
  }
}

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.pendingEvents) || "[]") as unknown;
    if (!Array.isArray(value)) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    queue = value.filter((event): event is AnalyticsEventPayload =>
      Boolean(event) && typeof event === "object" && typeof (event as AnalyticsEventPayload).event_id === "string"
        && Date.parse((event as AnalyticsEventPayload).occurred_at) >= cutoff,
    ).slice(-ANALYTICS_CONFIG.maxQueueSize);
    persist();
  } catch {
    try { localStorage.removeItem(STORAGE_KEYS.pendingEvents); } catch { /* best effort */ }
  }
}

/** Kept in sync by the auth listener so an unload flush needs no async lookup. */
export function setAccessToken(token: string | undefined): void {
  accessToken = token;
}

function ingestionHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
  };
}

function schedule(delayMs: number = ANALYTICS_CONFIG.flushIntervalMs): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flush();
  }, delayMs);
}

function trimQueue(): void {
  while (queue.length > ANALYTICS_CONFIG.maxQueueSize) {
    const expendable = queue.findIndex((event) => !CRITICAL_EVENTS.has(event.event));
    // Prefer dropping an old passive event during a prolonged outage. If every
    // queued event is critical, the oldest still has to go to preserve the
    // explicit storage/memory bound.
    queue.splice(expendable >= 0 ? expendable : 0, 1);
  }
}

/**
 * Normal-path send. `ignoreDuplicates` on the `event_id` unique index makes
 * ingestion idempotent, so a retry after a timeout can never double-count.
 */
async function send(batch: AnalyticsEventPayload[]): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/analytics`, {
      method: "POST",
      headers: ingestionHeaders(),
      body: JSON.stringify({ events: batch }),
    });
    if (response.ok) return true;
    // Analytics must never surface as a user-visible failure.
    if (process.env.NODE_ENV !== "production") console.warn("[analytics] flush failed", response.status);
    return false;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.warn("[analytics] flush failed", error);
    return false;
  }
}

/**
 * Unload-path send. `fetch(..., { keepalive: true })` survives the page going
 * away; `sendBeacon` can't be used because PostgREST needs auth headers.
 */
function sendKeepalive(batch: AnalyticsEventPayload[]): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    void fetch(`${SUPABASE_URL}/functions/v1/analytics`, {
      method: "POST",
      keepalive: true,
      headers: ingestionHeaders(),
      body: JSON.stringify({ events: batch }),
    }).catch(() => undefined);
  } catch {
    // Nothing useful to do while the page is being torn down.
  }
}

export function enqueue(payload: AnalyticsEventPayload): void {
  hydrate();
  queue.push(payload);
  trimQueue();
  persist();
  if (CRITICAL_EVENTS.has(payload.event) || queue.length >= ANALYTICS_CONFIG.batchSize) {
    void flush();
    return;
  }
  schedule();
}

export async function flush(): Promise<void> {
  hydrate();
  if (inFlight || queue.length === 0) return;
  inFlight = true;
  const batch = queue;
  queue = [];
  persist();
  const ok = await send(batch);
  inFlight = false;
  if (ok) {
    failures = 0;
    if (queue.length) schedule();
    return;
  }
  failures += 1;
  // Put the batch back in front so ordering stays roughly chronological. It
  // remains durable even after the fast retry budget is exhausted; idempotent
  // event IDs make a later resend safe.
  queue = [...batch, ...queue];
  trimQueue();
  persist();
  schedule(failures <= ANALYTICS_CONFIG.maxRetries
    ? ANALYTICS_CONFIG.flushIntervalMs
    : Math.max(ANALYTICS_CONFIG.flushIntervalMs, 60_000));
}

/** Synchronous best-effort drain, for `pagehide` / `visibilitychange: hidden`. */
export function flushSync(): void {
  hydrate();
  if (queue.length === 0) return;
  // Keep the durable copy until a normal request confirms delivery. The
  // keepalive request and any later retry may both arrive, so the event_id
  // unique constraint is the source of truth for exactly-once storage.
  sendKeepalive(queue);
}

export const pendingCount = (): number => { hydrate(); return queue.length; };

/** Used when consent is withdrawn; nothing queued may be sent later. */
export function clearPendingQueue(): void {
  queue = [];
  persist();
}

/** Sends the latest session rollup through the same trusted ingestion tier. */
export function sendSessionRollup(session: Record<string, unknown>, keepalive = false): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    void fetch(`${SUPABASE_URL}/functions/v1/analytics`, {
      method: "POST",
      keepalive,
      headers: ingestionHeaders(),
      body: JSON.stringify({ session }),
    }).catch(() => undefined);
  } catch {
    // Analytics remains best-effort and never interrupts product behavior.
  }
}

/** Links this browser's anonymous history to the verified bearer identity. */
export async function linkIdentity(anonId: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !accessToken) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/analytics`, {
      method: "POST",
      headers: ingestionHeaders(),
      body: JSON.stringify({ identity: { anon_id: anonId } }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Requests deletion through the trusted tier; bearer identity is resolved there. */
export async function deleteAnalyticsIdentity(anonId: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/analytics`, {
      method: "POST",
      headers: ingestionHeaders(),
      body: JSON.stringify({ deletion: { anon_id: anonId } }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function resetQueueForTests(): void {
  queue = [];
  failures = 0;
  inFlight = false;
  hydrated = false;
  persist();
  if (timer) clearTimeout(timer);
  timer = undefined;
}
