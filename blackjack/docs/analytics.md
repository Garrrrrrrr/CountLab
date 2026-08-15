# CountLab analytics

This document is the operating contract for CountLab's first-party product
analytics: architecture, event ownership, definitions, privacy controls,
database objects, deployment, and the event catalog.

## Architecture

CountLab is a static Next.js export, so it cannot host a Next API route. Its
trusted server boundary is a Supabase Edge Function:

```text
typed browser client
  -> durable privacy-scrubbed batch queue
  -> supabase/functions/analytics
  -> service-role-only ingestion RPCs
  -> analytics_events + analytics_sessions + analytics_aliases
  -> analytics schema views
  -> admin-only aggregate RPCs
  -> /admin dashboard and safe CSV/JSON exports
```

The Edge Function verifies bearer tokens itself, overwrites client identity
with the verified account UUID, filters server-detected bots, adds coarse
hosting-region data when available, rate-limits by a short-lived one-way IP
hash, enforces 128 KB/50-event request limits, and never stores raw IPs. Direct
browser inserts into the raw analytics and alias tables are revoked.

Low-priority events flush every five seconds or at 20 events. Critical auth,
conversion, completion, API-failure, and error events flush immediately. A
bounded queue survives reload/offline interruptions in local storage for at
most 24 hours. Every event has a UUID idempotency key; retries use `on conflict
do nothing`.

## Scope decisions

### Implement now

- Anonymous IDs, verified authenticated IDs, anonymous-to-account aliases,
  sessions, foreground engagement, bounce/engaged-session measures, and
  self-service analytics deletion.
- SPA page views, navigation mechanisms, semantic clicks, route transitions,
  scroll milestones, content reading, reference search/filter/sort usage, and
  derived friction signals.
- Explicit feature, drill, question, casino-hand, calculator, simulation,
  settings, history, result, form, auth, and conversion events.
- Drill accuracy/speed/scenario/streak/improvement/mastery, adoption/repeat use,
  arbitrary ordered funnels, activation, lifecycle, return behavior, journeys,
  DAU/WAU/MAU, retention cohorts, time series, and the north-star metric.
- First/last-touch attribution, referrer domain, allow-listed UTM fields,
  non-invasive device context, coarse country/region, release metadata,
  frontend errors, asset failures, API/worker latency, Core Web Vitals, route
  timing, load timing, long tasks, and resource-type timing.
- Closed TypeScript event types, client and database sanitization, property
  type/cardinality validation, bot/internal/test filtering, deduplication,
  rejection monitoring, configurable retention, alert rules/webhook delivery,
  admin authorization, segmentation, comparison periods, realtime polling,
  pseudonymous visitor summaries, and CSV/JSON export.
- Stable experiment assignment and feature-flag exposure primitives, plus
  exposure/conversion/error guardrails in the dashboard.

### Implement later

- Materialized hourly/daily aggregates if raw-event query volume eventually
  warrants them. Current views keep definitions easy to change at modest scale.
- A management UI for defining experiments and flags. Assignment and analysis
  exist, but CountLab currently has no live experiments to administer.
- Statistical anomaly detection beyond the configurable threshold alerts.
- Server-authoritative simulation completion if simulation compute moves from a
  browser worker to a server. Today the worker is necessarily client-owned.

### Not applicable or deliberately omitted

- Payments, subscriptions, purchases, and onboarding: those product flows do
  not exist.
- Remove-a-card/missing-card analytics: that drill was removed from the product.
- Precise city/GPS collection: it is unnecessary for product decisions.
- Session replay, keystroke capture, and custom heatmaps: their privacy/payload
  cost is not justified. Aggregate rage/dead/repeated-click and scroll signals
  cover the useful debugging questions.
- Search-result selection: the deviation reference is a live filtered table,
  not a discrete search-results workflow.

## Canonical event envelope

```ts
interface AnalyticsEventPayload {
  event_id: string;
  event: EventName;
  occurred_at: string;
  user_id: string | null; // ignored and replaced by the ingestion tier
  anon_id: string;
  session_id: string;
  path: string;           // normalized route, no arbitrary query string
  environment: "development" | "staging" | "production";
  app_version: string;    // semantic version + short commit SHA
  context: EventContext;  // device/acquisition/release context
  properties: Properties; // event-specific, flat, bounded values only
  is_bot: boolean;
}
```

Common context is attached centrally. Product components call only
`analytics.track`, `analytics.page`, a reusable analytics hook, or the legacy
compatibility adapter in `track.ts`; components never write analytics tables.
Event and property names are snake_case. Dimensions belong in properties, not
new event-name variants.

## Metric definitions

- **Visitor:** verified user UUID when available; otherwise `anon:<random UUID>`.
  Aliases make pre-login activity resolve to the same verified user later.
- **Session:** 30 minutes of inactivity starts a new session. Start/end, landing
  and exit routes, counters, duration, and foreground engagement are stored.
- **Engaged session:** at least 10 seconds of foreground engagement and not a
  one-page short session. A bounce is one page with under 10 seconds engaged.
- **Active user:** a visitor with a meaningful product action. Page views,
  navigation/click telemetry, errors, and performance events do not create an
  active user.
- **DAU/WAU/MAU:** distinct active users in trailing 1/7/30-day windows.
- **Activation:** the first completed drill is the primary milestone; first
  calculation, settings save, and feature completion are also reported.
- **Retention:** exact D1/D3/D7/D14/D30 in the overview and exact/windowed
  segmented cohorts in the advanced dashboard.
- **Lifecycle:** recently active (0-7 days), slipping (8-30), or churned (31+).
  A 30+ day gap followed by activity marks a resurrection.
- **Mastery:** deterministic recent accuracy x evidence x recency, based on the
  latest 50 safe question-answer events per drill. It is not an ML model.
- **North star:** weekly returning users completing at least one training
  session. Supporting KPIs are completed sessions, D7 retention, activation,
  completion, and accuracy improvement.

## Event catalog

`C` = client-owned, `A` = automatic client instrumentation, `S` = authoritative
server event. Free-form form values, notes, locations, exact bankrolls, tokens,
credentials, and email addresses are never event properties.

| Events | Owner / trigger | Safe dimensions | Purpose |
| --- | --- | --- | --- |
| `session_started`, `session_ended` | A: session rotation, hide, sign-out | first/returning, landing/exit, duration, foreground time, page/event counts | session quality, bounce, frequency |
| `page_viewed`, `navigated` | A: initial view and SPA route change | normalized routes, prior route, semantic mechanism, visit count | traffic, entries/exits, paths |
| `element_clicked`, `dead_click_detected`, `rage_click_detected`, `scroll_depth_reached` | A: delegated document listeners | semantic ID/short label, component, route destination, milestone | navigation and aggregate friction |
| `feature_opened`, `feature_completed`, `feature_abandoned`, `feature_restarted`, `feature_reset` | C: reusable lifecycle helpers | feature, category, stage, duration | adoption, completion, abandonment |
| `practice_started`, `practice_restarted`, `practice_completed`, `practice_abandoned` | C: drill lifecycle | drill, mode/difficulty, safe rules, counts, accuracy, streak, duration | training funnel and progress |
| `question_presented`, `question_answered`, `answer_skipped` | C: each drill question | stable scenario/category, correctness, bounded safe answer, response time, attempt, streak, TC/deviation state | mistakes, scenario difficulty, speed, improvement |
| `difficulty_changed`, `practice_mode_changed`, `hint_used`, `solution_viewed` | C: explicit trainer controls | drill/feature and stable mode/kind | learning behavior |
| `hand_started`, `hand_decision`, `hand_completed` | C: blackjack/UTH/Chase the Flush engines | game, street/action/recommendation, correctness, bounded TC, wager/net buckets | game adoption and decision quality |
| `calculator_opened`, `calculation_input_changed`, `calculation_run`, `calculation_repeated`, `preset_selected` | C/A: calculator lifecycle | calculator, field name only, financial buckets, decks/penetration/spread | calculator funnel and repetition |
| `simulation_started`, `simulation_completed`, `simulation_cancelled` | C: worker lifecycle | mode, bounded counts, duration, EV/risk buckets | simulation reliability and value |
| `result_viewed`, `result_saved`, `result_expanded`, `result_copied`, `result_shared` | C/A: result action | feature, stable kind/section/method | result engagement |
| `history_viewed`, `history_deleted`, `data_exported`, `data_imported`, `data_cleared` | C: library actions | feature/scope/kind and record count | retention tools and portability |
| `settings_changed`, `tab_changed`, `filter_applied`, `sort_changed` | C: explicit control | changed key names or stable control values | feature configuration |
| `search_performed`, `search_abandoned`, `search_result_selected` | C: privacy-safe search lifecycle | surface, query length, result count/position/kind; never query text | content gaps and search success |
| `content_opened`, `content_section_viewed`, `content_completed`, `content_feature_launched` | A: reference route lifecycle | content/section keys, foreground reading time, depth, target feature | educational value |
| `form_opened`, `form_started`, `form_validation_failed`, `form_submitted`, `form_succeeded`, `form_failed`, `form_abandoned` | C: reusable form helper | form, field/error category, step, duration; never values | auth/journal form friction |
| `signup_started`, `signup_failed` | C: auth attempt | method and normalized failure category | signup funnel |
| `signup_completed` | S: `auth.users` insert trigger | provider method only | authoritative signup conversion |
| `login_succeeded`, `login_failed`, `logout`, `guest_mode_entered`, `auth_session_expired` | C: auth lifecycle | method and normalized category | access and anonymous conversion |
| `password_reset_started`, `password_reset_completed`, `password_reset_failed` | C: recovery lifecycle | method/category only | recovery reliability |
| `consent_updated`, `conversion_completed` | C: explicit choice/milestone | choice source; conversion key and authority flag | privacy audit and funnels |
| `client_error` | A/C: exceptions, rejections, route/resource/render failures | normalized type/message/stack head, route, source | stability by browser/release |
| `web_vital`, `performance_metric` | A: PerformanceObserver/navigation timing | metric, rating/value, route, resource type only | LCP/INP/CLS/TTFB/FCP and load/route/long-task health |
| `api_request_completed`, `api_request_failed` | C: named request/worker wrapper | service, normalized operation, duration, status/category | p50/p95/p99 and error rate |
| `experiment_exposure`, `feature_flag_exposure` | C: assignment/evaluation helper | experiment/variant or flag/variation | conversion and reliability guardrails |

The closed property contract is in `lib/analytics/types.ts`; it is the detailed
source of truth for required properties.

## Storage and derived models

Public raw/control tables:

- `analytics_events`, `analytics_sessions`, `analytics_aliases`
- `analytics_ingest_rate_limits`, `analytics_ingest_rejections`
- `analytics_internal_users`, `analytics_retention_settings`
- `analytics_alert_rules`, `analytics_alert_deliveries`

The non-exposed `analytics` schema provides clean events/sessions and derived
daily activity, active users, feature usage, training/scenario performance,
retention, user profiles, per-user adoption, mastery, hour/day/week/month time
series, and the north-star series. All clean models exclude non-production,
bot, admin, and configured internal-account traffic.

Admin-only RPCs provide the filtered overview, arbitrary funnels, segmented
cohorts, advanced product intelligence, alerts, realtime activity, and a
purpose-limited visitor profile/timeline. `/admin` includes date presets and
custom ranges, previous-period comparison, auth/new-returning/device/browser/
OS/geography/acquisition/campaign/release/feature/lifecycle/drill/rules/scenario segments, and safe
CSV/JSON exports. Its 30-second realtime refresh calls only the lightweight
realtime RPC rather than recomputing the dashboard.

## Privacy, consent, deletion, and retention

- Anonymous identity is random and never derived from PII. Auth identity is the
  opaque verified Supabase UUID. Email is not an analytics identifier or field.
- URLs are reduced to normalized paths; only UTM/ref attribution keys are read.
- Numeric money/rate/risk inputs are bucketed when exact values are unnecessary.
- Strings are bounded and PII-shaped text/forbidden keys are scrubbed in the
  browser and database. Unsupported nested/object values are rejected.
- Geo is country/region only. Server headers override the timezone fallback.
  Raw IP is never stored; only a salted hash survives briefly for rate limiting.
- The first-visit banner and Settings toggle call the centralized consent gate.
  Set `NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT=true` where prior opt-in is needed;
  no event or analytics ID is created before approval in that mode.
- Settings offers self-service history deletion. The Edge tier deletes the
  current random device history and, for a verified bearer, all linked account
  analytics. It then clears/rotates local analytics identity and session state.
- `analytics_delete_my_data()` remains available to authenticated users.
- `analytics_retention_settings` defaults to 400 days for raw events/sessions,
  180 for errors, 90 for payload-free rejection counts, and cleanup of orphaned
  aliases. `analytics_purge()` enforces the current settings; schedule it.

Consent/legal requirements vary by deployment and jurisdiction. The mechanism
is configurable; deployment owners remain responsible for selecting the proper
mode and keeping the public policy accurate.

## Operations and deployment

1. Apply the complete idempotent `supabase/schema.sql` to the target project,
   then run `NOTIFY pgrst, 'reload schema';`.
2. Add admin UUIDs to `admin_users`. Add developer/test UUIDs that should not
   affect KPIs to `analytics_internal_users`.
3. Set Edge secrets: `ANALYTICS_HASH_SALT`, `ANALYTICS_ALLOWED_ORIGINS`,
   `ANALYTICS_CRON_SECRET`, and optionally `ANALYTICS_ALERT_WEBHOOK_URL`.
4. Deploy `analytics` and `analytics-alerts`. `supabase/config.toml` disables
   gateway JWT verification because the functions intentionally support guests
   and verify bearer tokens themselves.
5. Configure GitHub `SUPABASE_ACCESS_TOKEN` (secret) and
   `SUPABASE_PROJECT_ID` (variable) for the Edge deployment workflow.
6. Schedule the alert function with `x-cron-secret` (for example every five
   minutes) and schedule `analytics_purge()` under a trusted role (for example
   daily). Alert delivery is suppressed to once per metric per hour.
7. Set Pages build variables as needed:
   `NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT` and
   `NEXT_PUBLIC_ANALYTICS_PERFORMANCE_SAMPLE_RATE` (0-1). Development/staging
   events are retained for debugging but excluded from production KPIs.

The Edge deployment workflow follows Supabase's documented CLI-based GitHub
Actions pattern: <https://supabase.com/docs/guides/functions/examples/github-actions>.

Data-quality monitoring reports accepted volume, sudden silence/spikes/drops,
rejected event counts by low-cardinality reason, missing required properties,
client/API failures, release count, and last-event time. Rejection records never
contain rejected payloads, IPs, IDs, or free text.
