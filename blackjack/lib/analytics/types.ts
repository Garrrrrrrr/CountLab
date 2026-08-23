/**
 * The analytics contract. Every event name and every property shape lives
 * here so features cannot invent ad-hoc names or misspell dimensions — see
 * `docs/analytics.md` for the catalog this mirrors.
 */

export type PropertyValue = string | number | boolean | null | undefined | string[] | number[];
export type Properties = Record<string, PropertyValue>;
/** Events that carry no dimensions of their own. */
export type NoProperties = Record<string, never>;

export type Environment = "development" | "staging" | "production";

export type DrillId =
  | "running_count"
  | "true_count"
  | "deck_estimation"
  | "basic_strategy"
  | "deviations"
  | "h17_chart"
  | "full_shoe";

export type GameId = "blackjack" | "ultimate_texas_holdem" | "chase_the_flush";

export type CalculatorId =
  | "game_bankroll_lab"
  | "advantage"
  | "bankroll_recommender"
  | "session_simulator"
  | "session_journal";

export type FeatureId =
  | DrillId
  | GameId
  | CalculatorId
  | "counting_benchmark"
  | "practice_checklist"
  | "statistics"
  | "settings"
  | "strategy_reference"
  | "deviation_reference"
  | "hilo_reference"
  | "shoe_explorer"
  | "hand_replayer"
  | "bet_spread_optimizer"
  | "admin_analytics";

export type FeatureCategory = "training" | "game" | "analysis" | "reference" | "account" | "internal";

/** How the user got to a route — used for journey and back-navigation analysis. */
export type NavigationType = "initial" | "link" | "sidebar" | "bottom_nav" | "back_forward" | "reload" | "deep_link";

export type AcquisitionChannel =
  | "direct"
  | "organic_search"
  | "paid_search"
  | "social"
  | "referral"
  | "email"
  | "campaign"
  | "internal"
  | "unknown";

export type DeviceType = "desktop" | "tablet" | "mobile";
export type DisplayMode = "browser" | "standalone";

export type WebVitalMetric = "LCP" | "INP" | "CLS" | "TTFB" | "FCP";

/**
 * Failure reasons are bucketed into categories rather than logged verbatim:
 * raw auth error strings can leak whether an account exists.
 */
export type AuthFailureReason = "invalid_credentials" | "rate_limited" | "unconfirmed" | "validation" | "network" | "other";

export interface EventPropertyMap {
  install_prompt: { outcome: "shown" | "accepted" | "dismissed"; surface: "native" | "ios_instructions" };
  // --- Session lifecycle -------------------------------------------------
  session_started: {
    is_first_session: boolean;
    channel: AcquisitionChannel;
    landing_path: string;
    referrer_domain?: string;
    authenticated: boolean;
  };
  session_ended: {
    duration_ms: number;
    engaged_ms: number;
    page_views: number;
    events: number;
    meaningful_events: number;
    bounced: boolean;
    exit_path: string;
    reason: "timeout" | "page_hide" | "sign_out";
  };

  // --- Navigation & autocapture -----------------------------------------
  page_viewed: {
    route: string;
    title?: string;
    previous_route?: string;
    navigation_type: NavigationType;
    is_first_view: boolean;
    view_count: number;
  };
  navigated: { from: string; to: string; mechanism: NavigationType };
  element_clicked: {
    analytics_id?: string;
    label: string;
    element: string;
    component?: string;
    href_route?: string;
    outbound_domain?: string;
  };
  dead_click_detected: { analytics_id?: string; label: string; element: string };
  rage_click_detected: {
    analytics_id?: string;
    label: string;
    element: string;
    x_percent: number;
    y_percent: number;
  };
  scroll_depth_reached: { depth: 25 | 50 | 75 | 90 | 100; route: string };

  // --- Generic product feature lifecycle ---------------------------------
  feature_opened: { feature: FeatureId; category: FeatureCategory };
  feature_completed: { feature: FeatureId; category: FeatureCategory; duration_ms: number };
  feature_abandoned: { feature: FeatureId; category: FeatureCategory; duration_ms: number; stage?: string };
  feature_restarted: { feature: FeatureId; category: FeatureCategory; stage?: string };
  feature_reset: { feature: FeatureId; category: FeatureCategory; stage?: string };

  // --- Training ----------------------------------------------------------
  practice_started: {
    drill: DrillId;
    mode?: string;
    difficulty?: string;
    question_target?: number;
    decks?: number;
    penetration?: number;
    rules_preset?: string;
    dealer_rule?: "H17" | "S17";
    das?: boolean;
    rsa?: boolean;
    surrender?: string;
    counting_system?: string;
  };
  question_answered: {
    drill: DrillId;
    correct: boolean;
    category?: string;
    /** Stable scenario key, e.g. "16v10" or "rc_negative" — never free text. */
    scenario?: string;
    user_answer?: string;
    correct_answer?: string;
    response_time_ms: number;
    attempt: number;
    streak: number;
    true_count?: number;
    deviation_available?: boolean;
    rules_preset?: string;
  };
  practice_completed: {
    drill: DrillId;
    questions: number;
    correct: number;
    accuracy: number;
    best_streak: number;
    duration_ms: number;
    mode?: string;
    rules_preset?: string;
  };
  practice_abandoned: {
    drill: DrillId;
    questions_answered: number;
    progress_percent: number;
    duration_ms: number;
    rules_preset?: string;
  };
  practice_restarted: { drill: DrillId; questions_answered: number; duration_ms: number };
  question_presented: { drill: DrillId; category?: string; scenario?: string; attempt: number };
  answer_skipped: { drill: DrillId; category?: string; scenario?: string; attempt: number; elapsed_ms: number };
  difficulty_changed: { drill: DrillId; from?: string; to: string };
  practice_mode_changed: { drill: DrillId; from?: string; to: string };
  hint_used: { drill?: DrillId; feature?: FeatureId; kind: string };
  solution_viewed: { drill?: DrillId; feature?: FeatureId; kind: string };

  // --- Casino table play --------------------------------------------------
  hand_started: {
    game: GameId;
    wager_bucket: string;
    spots?: number;
    true_count?: number;
    bet_on_ramp?: boolean;
    decks?: number;
  };
  hand_decision: {
    game: GameId;
    street?: string;
    action: string;
    recommended_action: string;
    correct: boolean;
    true_count?: number;
    hand_total?: number;
    deviation_available?: boolean;
    solver_assisted?: boolean;
  };
  hand_completed: {
    game: GameId;
    outcome: string;
    net_bucket: string;
    /** True when the shoe/session ended with this hand. */
    ended_session?: boolean;
  };

  // --- Calculators & simulations ------------------------------------------
  calculator_opened: { calculator: CalculatorId };
  calculation_input_changed: { calculator: CalculatorId; input: string; value_bucket?: string };
  calculation_run: {
    calculator: CalculatorId;
    bankroll_bucket?: string;
    unit_bucket?: string;
    decks?: number;
    penetration?: number;
    spread?: string;
    hands_per_hour?: number;
  };
  calculation_repeated: { calculator: CalculatorId; run_number: number };
  result_expanded: { feature: FeatureId; section: string };
  result_copied: { feature: FeatureId; kind: string };
  preset_selected: { calculator: CalculatorId; preset: string };
  simulation_started: { mode: string; rounds?: number; paths?: number; hands?: number };
  simulation_completed: {
    mode: string;
    duration_ms: number;
    hourly_ev_bucket?: string;
    risk_of_ruin_bucket?: string;
    hands?: number;
  };
  simulation_cancelled: { mode: string; duration_ms: number };

  // --- Product actions -----------------------------------------------------
  settings_changed: { changed_keys: string[]; decks?: number; rules_preset?: string };
  result_viewed: { feature: FeatureId; kind: string };
  result_saved: { feature: FeatureId; kind: string };
  result_shared: { feature: FeatureId; method: string };
  history_viewed: { feature: FeatureId; kind: string };
  history_deleted: { feature: FeatureId; kind: string };
  data_exported: { scope: string; records?: number };
  data_imported: { scope: string; records?: number; ok: boolean };
  data_cleared: { scope: string };
  search_performed: { surface: string; result_count: number; zero_results: boolean; query_length: number };
  filter_applied: { surface: string; filter: string; value: string };
  tab_changed: { surface: string; tab: string };
  sort_changed: { surface: string; sort: string };

  // --- Educational/reference content ----------------------------------------
  content_opened: { content: string; visit_count: number };
  content_section_viewed: { content: string; section: string };
  content_completed: { content: string; engaged_ms: number; deepest_scroll: number };
  content_feature_launched: { content: string; feature: FeatureId };
  search_result_selected: { surface: string; result_position: number; result_kind: string };
  search_abandoned: { surface: string; result_count: number; query_length: number };

  // --- Forms -----------------------------------------------------------------
  form_opened: { form: string };
  form_started: { form: string };
  form_validation_failed: { form: string; field_category: string; reason_category: string };
  form_submitted: { form: string };
  form_succeeded: { form: string; duration_ms: number };
  form_failed: { form: string; duration_ms: number; reason_category: string };
  form_abandoned: { form: string; duration_ms: number; last_step?: string };

  // --- Identity -------------------------------------------------------------
  signup_started: { method: "password" | "google" };
  /** Server-generated only; the client must never emit this. */
  signup_completed: { method: string };
  signup_failed: { method: "password" | "google"; reason_category: AuthFailureReason };
  login_succeeded: { method: "password" | "google" };
  login_failed: { method: "password" | "google"; reason_category: AuthFailureReason; locked_out: boolean };
  logout: NoProperties;
  guest_mode_entered: NoProperties;
  auth_session_expired: { reason: "expired" | "refresh_failed" | "unknown" };
  password_reset_started: { method: "email" };
  password_reset_completed: { method: "email" };
  password_reset_failed: { method: "email"; reason_category: AuthFailureReason };
  consent_updated: { analytics: boolean; source: "settings" | "privacy_banner" | "api" };
  conversion_completed: { conversion: string; authoritative: boolean };

  // --- Technical --------------------------------------------------------------
  client_error: {
    error_type: string;
    message_normalized: string;
    stack_head?: string;
    route: string;
    source?: string;
  };
  web_vital: { metric: WebVitalMetric; value: number; rating: "good" | "needs_improvement" | "poor"; route: string };
  performance_metric: {
    metric: "route_transition" | "dom_interactive" | "page_load" | "long_task" | "resource_load";
    value_ms: number;
    route: string;
    resource_type?: string;
  };
  api_request_completed: {
    service: "supabase" | "worker" | "other";
    operation: string;
    duration_ms: number;
    status: number;
  };
  api_request_failed: {
    service: "supabase" | "worker" | "other";
    operation: string;
    duration_ms: number;
    error_category: "auth" | "rate_limit" | "network" | "server" | "validation" | "other";
  };

  // --- Experimentation ---------------------------------------------------------
  experiment_exposure: { experiment: string; variant: string };
  feature_flag_exposure: { flag: string; variation: string };
}

export type EventName = keyof EventPropertyMap;

/** Args tuple that makes the properties argument optional only for no-property events. */
export type TrackArgs<E extends EventName> = EventPropertyMap[E] extends NoProperties
  ? [properties?: EventPropertyMap[E]]
  : [properties: EventPropertyMap[E]];

export interface EventContext {
  device_type?: DeviceType;
  display_mode?: DisplayMode;
  browser?: string;
  browser_version?: string;
  os?: string;
  viewport?: string;
  screen?: string;
  touch?: boolean;
  locale?: string;
  timezone?: string;
  country?: string;
  region?: string;
  referrer_domain?: string;
  channel?: AcquisitionChannel;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  first_touch_channel?: AcquisitionChannel;
  first_touch_source?: string;
  landing_path?: string;
}

/** The wire format written to `analytics_events`. */
export interface AnalyticsEventPayload {
  event_id: string;
  event: EventName;
  occurred_at: string;
  user_id: string | null;
  anon_id: string;
  session_id: string;
  path: string;
  environment: Environment;
  app_version: string;
  context: EventContext;
  properties: Properties;
  is_bot: boolean;
}

/** Events that must never sit in a batch waiting for a flush. */
export const CRITICAL_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  "signup_started",
  "signup_failed",
  "login_succeeded",
  "login_failed",
  "logout",
  "guest_mode_entered",
  "session_ended",
  "practice_completed",
  "simulation_completed",
  "client_error",
  "api_request_failed",
  "password_reset_completed",
  "conversion_completed",
]);

/** Passive telemetry never makes somebody an active user or a session engaged. */
export const PASSIVE_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  "session_started",
  "session_ended",
  "page_viewed",
  "navigated",
  "element_clicked",
  "dead_click_detected",
  "rage_click_detected",
  "scroll_depth_reached",
  "web_vital",
  "performance_metric",
  "api_request_completed",
  "api_request_failed",
  "client_error",
]);
