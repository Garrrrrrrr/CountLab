import { supabase } from "../supabase/client";
import { ANALYTICS_CONFIG } from "./config";
import { CRITICAL_EVENTS, type AnalyticsEventPayload } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let queue: AnalyticsEventPayload[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let accessToken: string | undefined;
let failures = 0;

/** Kept in sync by the auth listener so an unload flush needs no async lookup. */
export function setAccessToken(token: string | undefined): void {
  accessToken = token;
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flush();
  }, ANALYTICS_CONFIG.flushIntervalMs);
}

/**
 * Normal-path send. `ignoreDuplicates` on the `event_id` unique index makes
 * ingestion idempotent, so a retry after a timeout can never double-count.
 */
async function send(batch: AnalyticsEventPayload[]): Promise<boolean> {
  const { error } = await supabase
    .from("analytics_events")
    .upsert(batch, { onConflict: "event_id", ignoreDuplicates: true });
  if (error) {
    // Analytics must never surface as a user-visible failure.
    if (process.env.NODE_ENV !== "production") console.warn("[analytics] flush failed", error.message);
    return false;
  }
  return true;
}

/**
 * Unload-path send. `fetch(..., { keepalive: true })` survives the page going
 * away; `sendBeacon` can't be used because PostgREST needs auth headers.
 */
function sendKeepalive(batch: AnalyticsEventPayload[]): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    }).catch(() => undefined);
  } catch {
    // Nothing useful to do while the page is being torn down.
  }
}

export function enqueue(payload: AnalyticsEventPayload): void {
  queue.push(payload);
  // Drop the oldest low-value events rather than growing without bound if the
  // network is down; critical events are flushed immediately anyway.
  if (queue.length > ANALYTICS_CONFIG.maxQueueSize) {
    queue = queue.slice(queue.length - ANALYTICS_CONFIG.maxQueueSize);
  }
  if (CRITICAL_EVENTS.has(payload.event) || queue.length >= ANALYTICS_CONFIG.batchSize) {
    void flush();
    return;
  }
  schedule();
}

export async function flush(): Promise<void> {
  if (inFlight || queue.length === 0) return;
  inFlight = true;
  const batch = queue;
  queue = [];
  const ok = await send(batch);
  inFlight = false;
  if (ok) {
    failures = 0;
    return;
  }
  failures += 1;
  if (failures <= ANALYTICS_CONFIG.maxRetries) {
    // Put the batch back in front so ordering stays roughly chronological.
    queue = [...batch, ...queue].slice(-ANALYTICS_CONFIG.maxQueueSize);
    schedule();
  }
}

/** Synchronous best-effort drain, for `pagehide` / `visibilitychange: hidden`. */
export function flushSync(): void {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  sendKeepalive(batch);
}

export const pendingCount = (): number => queue.length;

export function resetQueueForTests(): void {
  queue = [];
  failures = 0;
  inFlight = false;
  if (timer) clearTimeout(timer);
  timer = undefined;
}
