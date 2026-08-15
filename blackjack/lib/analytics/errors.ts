import { analytics } from "./client";
import { normalizeErrorMessage, normalizeStack } from "./redact";

let started = false;
/** Identical errors inside this window are folded into one event. */
const DEDUPE_WINDOW_MS = 10_000;
const recent = new Map<string, number>();

function report(errorType: string, message: string, stack: string | undefined, source: string): void {
  const normalized = normalizeErrorMessage(message || "unknown error");
  const key = `${errorType}:${normalized}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  recent.set(key, now);
  if (recent.size > 50) recent.clear();

  analytics.track("client_error", {
    error_type: errorType,
    message_normalized: normalized,
    stack_head: normalizeStack(stack),
    route: analytics.route,
    source,
  });
}

/**
 * Captures uncaught errors and rejections. Messages are normalised (numbers,
 * URLs and quoted strings replaced) so the same fault groups into one row and
 * so nothing user-entered can ride along in an error string.
 */
export function startErrorCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("error", (event) => {
    // Resource load failures surface as error events with an element target.
    if (event.target && event.target !== window) {
      const element = event.target as HTMLElement;
      if (element.tagName) {
        report("resource_error", `failed to load ${element.tagName.toLowerCase()}`, undefined, "resource");
        return;
      }
    }
    report(event.error?.name ?? "Error", event.message ?? String(event.error), event.error?.stack, "window.onerror");
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { name?: string; message?: string; stack?: string } | string | undefined;
    if (typeof reason === "string") {
      report("UnhandledRejection", reason, undefined, "unhandledrejection");
      return;
    }
    report(reason?.name ?? "UnhandledRejection", reason?.message ?? "unhandled promise rejection", reason?.stack, "unhandledrejection");
  });
}

/** Lets feature code report a handled failure it wants visibility on. */
export function reportHandledError(errorType: string, error: unknown, source: string): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  report(errorType, message, stack, source);
}
