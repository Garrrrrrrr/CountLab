import { supabase } from "../supabase/client";
import { getCurrentUser } from "../supabase/currentUser";

const ANON_ID_KEY = "countlab:anon-id";
const SESSION_ID_KEY = "countlab:analytics-session-id";

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** A stable per-device id so guest activity can be told apart without an account. */
function anonId(): string {
  let value = localStorage.getItem(ANON_ID_KEY);
  if (!value) {
    value = makeId();
    localStorage.setItem(ANON_ID_KEY, value);
  }
  return value;
}

/** A per-tab id (cleared when the tab closes) so events can be grouped into visits. */
function sessionId(): string {
  let value = sessionStorage.getItem(SESSION_ID_KEY);
  if (!value) {
    value = makeId();
    sessionStorage.setItem(SESSION_ID_KEY, value);
  }
  return value;
}

/** Records a user action to Supabase for later review in /admin. Fire-and-forget. */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const user = getCurrentUser();
  supabase
    .from("analytics_events")
    .insert({
      user_id: user?.id ?? null,
      anon_id: anonId(),
      session_id: sessionId(),
      event,
      path: window.location.pathname,
      properties: properties ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[countlab] failed to record analytics event", error);
    });
}
