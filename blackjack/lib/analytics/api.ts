import { analytics } from "./client";

type Service = "supabase" | "worker" | "other";

interface ApiResult {
  error?: { message?: string; code?: string; status?: number } | null;
  status?: number;
}

const category = (result: ApiResult): "auth" | "rate_limit" | "network" | "server" | "validation" | "other" => {
  const status = result.status ?? result.error?.status ?? 0;
  const message = `${result.error?.code ?? ""} ${result.error?.message ?? ""}`.toLowerCase();
  if (status === 401 || status === 403 || /auth|jwt|permission/.test(message)) return "auth";
  if (status === 429 || /rate.limit|too many/.test(message)) return "rate_limit";
  if (status >= 500) return "server";
  if (status >= 400 && status < 500) return "validation";
  if (/network|fetch|timeout|offline/.test(message)) return "network";
  return "other";
};

/** Measures a product request without recording URLs, payloads, or error text. */
export async function observeApiRequest<T extends ApiResult>(
  service: Service,
  operation: string,
  request: PromiseLike<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await request;
    const duration_ms = Math.max(0, Math.round(performance.now() - started));
    if (result.error) {
      analytics.track("api_request_failed", { service, operation, duration_ms, error_category: category(result) });
    } else {
      analytics.track("api_request_completed", { service, operation, duration_ms, status: result.status ?? 200 });
    }
    return result;
  } catch (error) {
    const duration_ms = Math.max(0, Math.round(performance.now() - started));
    analytics.track("api_request_failed", {
      service,
      operation,
      duration_ms,
      error_category: category({ error: error instanceof Error ? { message: error.message } : {} }),
    });
    throw error;
  }
}
