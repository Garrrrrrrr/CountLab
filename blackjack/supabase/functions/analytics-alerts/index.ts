import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("ANALYTICS_CRON_SECRET") ?? "";
const WEBHOOK_URL = Deno.env.get("ANALYTICS_ALERT_WEBHOOK_URL") ?? "";

interface Alert { metric: string; value: number | null; threshold: number; triggered: boolean }

function configuredWebhook(): string | null {
  if (!WEBHOOK_URL) return null;
  try {
    const url = new URL(WEBHOOK_URL);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !CRON_SECRET) {
    return Response.json({ error: "service_not_configured" }, { status: 503 });
  }
  if (!CRON_SECRET || request.headers.get("x-cron-secret") !== CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("admin_analytics_alerts");
  if (error) return Response.json({ error: "evaluation_failed" }, { status: 500 });
  const alerts = (data as Alert[]).filter((alert) => alert.triggered);
  if (!alerts.length) return Response.json({ evaluated: (data as Alert[]).length, delivered: 0 });

  const { data: prior } = await supabase.from("analytics_alert_deliveries").select("metric,last_sent_at").in("metric", alerts.map((alert) => alert.metric));
  const sent = new Map((prior ?? []).map((row) => [row.metric, new Date(row.last_sent_at).getTime()]));
  const due = alerts.filter((alert) => Date.now() - (sent.get(alert.metric) ?? 0) >= 60 * 60 * 1000);
  if (!due.length || !WEBHOOK_URL) return Response.json({ evaluated: (data as Alert[]).length, due: due.length, delivered: 0 });
  const webhook = configuredWebhook();
  if (!webhook) return Response.json({ error: "invalid_webhook_configuration" }, { status: 503 });

  const summary = due.map((alert) => `${alert.metric}: ${alert.value ?? "n/a"} (threshold ${alert.threshold})`).join("\n");
  let delivery: Response;
  try {
    delivery = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `CountLab analytics alerts\n${summary}`, content: `CountLab analytics alerts\n${summary}`, alerts: due }),
    });
  } catch {
    return Response.json({ error: "webhook_failed" }, { status: 502 });
  }
  if (!delivery.ok) return Response.json({ error: "webhook_failed", status: delivery.status }, { status: 502 });
  const { error: recordError } = await supabase.rpc("analytics_record_alert_deliveries", { p_alerts: due });
  if (recordError) return Response.json({ error: "delivery_record_failed" }, { status: 500 });
  return Response.json({ evaluated: (data as Alert[]).length, delivered: due.length });
});
