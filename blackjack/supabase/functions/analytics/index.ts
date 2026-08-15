import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HASH_SALT = Deno.env.get("ANALYTICS_HASH_SALT") ?? "";
const configuredOrigins = (Deno.env.get("ANALYTICS_ALLOWED_ORIGINS") ?? "https://countlab.ca,https://www.countlab.ca,http://localhost:3000")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

const BOT = /(bot|crawler|spider|crawl|slurp|headless|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|monitoring|scraper|curl|wget|python-requests)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 128_000;
const MAX_BATCH = 50;

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && configuredOrigins.includes(origin) ? origin : configuredOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(status: number, body: Record<string, unknown>, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

async function rateKey(request: Request): Promise<string> {
  const bytes = new TextEncoder().encode(`${HASH_SALT}:${clientIp(request)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function coarseGeo(request: Request): { country?: string; region?: string } {
  const country = request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country") ?? request.headers.get("x-country-code") ?? undefined;
  const region = request.headers.get("x-vercel-ip-country-region") ?? request.headers.get("cf-region-code") ?? undefined;
  return {
    country: country && /^[A-Z]{2}$/i.test(country) ? country.toUpperCase() : undefined,
    region: region?.replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 50) || undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validEvent(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (typeof value.event_id !== "string" || !UUID.test(value.event_id)) return false;
  if (typeof value.event !== "string" || value.event.length > 80) return false;
  if (typeof value.anon_id !== "string" || value.anon_id.length < 8 || value.anon_id.length > 80) return false;
  if (typeof value.session_id !== "string" || value.session_id.length < 8 || value.session_id.length > 80) return false;
  if (typeof value.occurred_at !== "string" || !Number.isFinite(Date.parse(value.occurred_at))) return false;
  if (typeof value.path !== "string" || value.path.length > 240) return false;
  if (!['development', 'staging', 'production'].includes(String(value.environment))) return false;
  if (typeof value.is_bot !== "boolean") return false;
  if (!isRecord(value.properties) || !isRecord(value.context)) return false;
  return JSON.stringify(value.properties).length <= 7_000 && JSON.stringify(value.context).length <= 7_000;
}

function validSession(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const stringKeys = ["session_id", "anon_id", "started_at", "last_activity_at", "first_path", "last_path"];
  const numberKeys = ["duration_ms", "engaged_ms", "page_views", "events", "meaningful_events"];
  if (stringKeys.some((key) => typeof value[key] !== "string")) return false;
  for (const key of numberKeys) {
    const item = value[key];
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0) return false;
  }
  if (String(value.session_id).length < 8 || String(value.session_id).length > 100) return false;
  if (String(value.anon_id).length < 8 || String(value.anon_id).length > 100) return false;
  if (!Number.isFinite(Date.parse(String(value.started_at))) || !Number.isFinite(Date.parse(String(value.last_activity_at)))) return false;
  if (typeof value.is_first_session !== "boolean" || typeof value.bounced !== "boolean" || typeof value.is_bot !== "boolean") return false;
  return ['development', 'staging', 'production'].includes(String(value.environment));
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || HASH_SALT.length < 32 || !configuredOrigins.length) {
    return response(503, { error: "service_not_configured" }, origin);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" }, origin);
  if (origin && !configuredOrigins.includes(origin)) return response(403, { error: "origin_not_allowed" }, origin);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return response(413, { error: "payload_too_large" }, origin);

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return response(413, { error: "payload_too_large" }, origin);
    body = JSON.parse(text);
  } catch {
    return response(400, { error: "invalid_json" }, origin);
  }
  if (!isRecord(body)) return response(400, { error: "invalid_payload" }, origin);

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  let actor: string | null = null;
  if (token && token !== request.headers.get("apikey")) {
    const { data } = await service.auth.getUser(token);
    actor = data.user?.id ?? null;
    if (!actor) return response(401, { error: "invalid_authentication" }, origin);
  }

  const key = await rateKey(request);
  const geo = coarseGeo(request);
  const serverBot = BOT.test(request.headers.get("user-agent") ?? "");
  const recordRejection = async (reason: string, count = 1) => {
    const { error } = await service.rpc("analytics_record_rejection", { p_reason: reason, p_event_count: count });
    if (error) console.error("analytics_record_rejection failed", { code: error.code });
  };

  if (Array.isArray(body.events)) {
    if (!body.events.length || body.events.length > MAX_BATCH || !body.events.every(validEvent)) {
      await recordRejection("invalid_event_batch", body.events.length);
      return response(400, { error: "invalid_event_batch" }, origin);
    }
    const { data, error } = await service.rpc("analytics_ingest_batch", {
      p_events: body.events,
      p_actor: actor,
      p_rate_key: key,
      p_country: geo.country ?? null,
      p_region: geo.region ?? null,
      p_server_bot: serverBot,
    });
    if (error) {
      await recordRejection(error.code === "P0001" ? "rate_limited" : "ingestion_rejected", body.events.length);
      console.error("analytics_ingest_batch failed", { code: error.code });
      return response(error.code === "P0001" ? 429 : 400, { error: error.code === "P0001" ? "rate_limited" : "ingestion_rejected" }, origin);
    }
    return response(202, { accepted: data ?? body.events.length }, origin);
  }

  if (isRecord(body.session)) {
    if (!validSession(body.session)) {
      await recordRejection("invalid_session");
      return response(400, { error: "invalid_session" }, origin);
    }
    const { error } = await service.rpc("analytics_ingest_session", {
      p_session: body.session,
      p_actor: actor,
      p_rate_key: key,
      p_country: geo.country ?? null,
      p_region: geo.region ?? null,
      p_server_bot: serverBot,
    });
    if (error) {
      await recordRejection(error.code === "P0001" ? "rate_limited" : "session_rejected");
      console.error("analytics_ingest_session failed", { code: error.code });
      return response(error.code === "P0001" ? 429 : 400, { error: error.code === "P0001" ? "rate_limited" : "session_rejected" }, origin);
    }
    return response(202, { accepted: 1 }, origin);
  }

  if (isRecord(body.identity)) {
    if (!actor || typeof body.identity.anon_id !== "string" || body.identity.anon_id.length < 8 || body.identity.anon_id.length > 100) {
      if (actor) await recordRejection("invalid_identity");
      return response(actor ? 400 : 401, { error: actor ? "invalid_identity" : "authentication_required" }, origin);
    }
    const { error } = await service.rpc("analytics_link_identity", {
      p_anon_id: body.identity.anon_id,
      p_actor: actor,
      p_rate_key: key,
    });
    if (error) {
      await recordRejection(error.code === "P0001" ? "rate_limited" : "identity_rejected");
      console.error("analytics_link_identity failed", { code: error.code });
      return response(error.code === "P0001" ? 429 : 400, { error: error.code === "P0001" ? "rate_limited" : "identity_rejected" }, origin);
    }
    return response(202, { accepted: 1 }, origin);
  }

  if (isRecord(body.deletion)) {
    if (typeof body.deletion.anon_id !== "string" || body.deletion.anon_id.length < 8 || body.deletion.anon_id.length > 100) {
      await recordRejection("invalid_deletion");
      return response(400, { error: "invalid_deletion" }, origin);
    }
    const { error } = await service.rpc("analytics_delete_identity", {
      p_anon_id: body.deletion.anon_id,
      p_actor: actor,
      p_rate_key: key,
    });
    if (error) {
      await recordRejection(error.code === "P0001" ? "rate_limited" : "deletion_rejected");
      console.error("analytics_delete_identity failed", { code: error.code });
      return response(error.code === "P0001" ? 429 : 400, { error: error.code === "P0001" ? "rate_limited" : "deletion_rejected" }, origin);
    }
    return response(200, { deleted: true }, origin);
  }

  await recordRejection("invalid_payload");
  return response(400, { error: "invalid_payload" }, origin);
});
