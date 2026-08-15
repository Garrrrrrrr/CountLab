# CountLab analytics

Product analytics for CountLab: what is collected, how it flows, how to query
it, and what deliberately is not collected.

## 1. The constraint that shapes everything

CountLab is a **static export on GitHub Pages**. There is no Node server, no
API route, no middleware. `next.config.ts` sets `output: "export"`, so
`POST /api/analytics/events` is not implementable in this repo.

Supabase is therefore both the database *and* the server tier. The design
consequence: **every rule that must not be bypassable lives in Postgres**, not
in the browser. The client is treated as hostile input.

| Responsibility usually held by an ingestion server | Where it lives here |
| --- | --- |
| Resolve authenticated identity (never trust client `user_id`) | `before insert` trigger overwrites `user_id` with `auth.uid()` |
| Internal-traffic flagging | Trigger sets `is_internal := is_admin()` |
| Schema validation / size caps | `check` constraints + trigger |
| Secret scrubbing | `analytics_redact()` strips forbidden keys server-side |
| Timestamp normalisation | Trigger clamps client clock skew to a sane window |
| Deduplication | `unique (event_id)` + `on conflict do nothing` |
| Rate limiting | Existing `enforce_rate_limit()` trigger |
| Batching / retry | Client `queue.ts` (batch, `keepalive` flush) |
| Bot filtering | Client heuristics set `is_bot`; rows are **flagged, not dropped** |

**Upgrade path (not built):** a Supabase Edge Function at
`supabase/functions/analytics/` would add real User-Agent bot detection and
IP-derived geography. It is deliberately deferred — it adds a deploy step and
a cold-start on every event for benefits the DB layer mostly already covers.
Geography is instead derived from the browser timezone, which needs no IP at
all and is strictly more private.

## 2. Specification triage

The brief covers 93 areas. Applied to this app:

### Implemented now

Identity & aliasing · sessions with real engagement time · page views ·
navigation paths · semantic click tracking · product events · training/drill
analytics · blackjack-domain analytics · calculator analytics with input
bucketing · feature adoption · funnels · activation · retention cohorts ·
DAU/WAU/MAU · engagement · scroll milestones · error tracking · Core Web
Vitals · device · acquisition & UTM · first/last-touch attribution ·
conversions · signup/login analytics · UI friction (rage + dead clicks) ·
release metadata · event schema & naming · standard properties · dedup ·
validation · typed client API · batching · storage schema · derived views ·
admin dashboard · time filters · segmentation · bot & internal filtering ·
privacy controls · data deletion · admin authorisation · CSV export ·
data-quality monitoring · distribution metrics (p50/p75/p90/p95/p99) ·
progress/mastery analytics.

### Implemented as scaffolding (schema + client API ready, no UI yet)

Experiments (`experiment_exposure`, sticky variant assignment) · feature flags
(`feature_flag_exposure`) · churn/resurrection states · power-user scoring ·
alerting (metrics shaped so thresholds are trivial to add later).

### Deliberately not implemented

| Area | Why |
| --- | --- |
| API analytics (§21) | No owned API. Supabase PostgREST latency is not ours to instrument meaningfully. |
| Session replay (§33) | Disproportionate privacy cost and payload weight for a training tool. Rage/dead clicks give the same debugging signal. |
| Heatmaps (§34) | Rage-click coordinates already answer the only question a heatmap would here. |
| IP-derived geography (§26) | Requires a server hop. Timezone-derived region is coarser but needs no IP. |
| Onboarding funnel (§30) | There is no onboarding flow to instrument. |
| Subscription/payment (§27) | No payments exist. |
| Sampling (§63) | Volume is nowhere near needing it; sampling now would only add bias. |

## 3. Event schema

Every event is one row in `analytics_events`.

```ts
{
  event_id:   string;    // uuid v4, client-generated -> idempotency key
  event:      EventName; // snake_case, from a closed union
  occurred_at: string;   // client clock, clamped server-side
  created_at:  string;   // server clock (authoritative for ordering)

  user_id:    string | null;  // overwritten server-side from auth.uid()
  anon_id:    string;         // persistent per-device uuid
  session_id: string;         // per-session uuid, 30-min inactivity timeout

  path:        string;        // normalised route, never a full URL
  environment: "development" | "staging" | "production";
  app_version: string;        // "1.0.0+<short sha>"

  context:    { device, browser, os, viewport, locale, region, utm, ... };
  properties: Record<string, unknown>;   // event-specific dimensions

  is_bot:      boolean;
  is_internal: boolean;       // set server-side from admin_users membership
}
```

`context` and `properties` are attached automatically by the client. Feature
code only ever supplies the event name and its own dimensions.

## 4. Naming rules

- `snake_case`, `<noun>_<past-tense-verb>`: `practice_started`,
  `question_answered`, `calculation_run`.
- Names describe **user intent**, never implementation (`start_button_clicked`
  is wrong; `practice_started` is right).
- **Dimensions go in properties, not in names.** One `question_answered` with
  `{ drill, correct }` — never `basic_strategy_correct_answer`.
- Property keys are `snake_case` too, so SQL never needs quoted identifiers.

## 5. Event catalog

`A` = autocaptured (no feature code), `S` = server-generated (authoritative).

| Event | Trigger | Key properties | Purpose |
| --- | --- | --- | --- |
| `session_started` | First event of a session | `is_first_session`, `channel`, `landing_path`, `referrer_domain` | Sessions, acquisition |
| `session_ended` | Inactivity timeout or page hide | `duration_ms`, `engaged_ms`, `page_views`, `events`, `bounced` | Engagement, bounce |
| `page_viewed` A | Route change | `route`, `previous_route`, `navigation_type`, `is_first_view`, `view_count` | Traffic, journeys |
| `navigated` A | Nav interaction | `from`, `to`, `mechanism` (sidebar/bottom-nav/link/back) | Path analysis |
| `element_clicked` A | Click on interactive element | `analytics_id`, `label`, `element`, `component` | Friction, unlabelled UI |
| `dead_click_detected` A | Click causing no DOM/route change | `analytics_id`, `label` | Broken affordances |
| `rage_click_detected` A | 3 clicks <30px apart within 800ms | `analytics_id`, `label`, `x_percent`, `y_percent` | Frustration |
| `scroll_depth_reached` A | 25/50/75/90/100% milestone | `depth` | Content consumption |
| `feature_opened` | Feature mounts | `feature`, `category` | Adoption, discovery |
| `feature_completed` | Feature reaches its goal | `feature`, `duration_ms` | Completion rate |
| `feature_abandoned` | Feature unmounts mid-flow | `feature`, `stage`, `duration_ms` | Drop-off |
| `practice_started` | Drill begins | `drill`, `mode`, `difficulty`, `question_target`, rules | Training funnel |
| `question_answered` | One drill answer | `drill`, `correct`, `category`, `scenario`, `response_time_ms`, `attempt`, `streak` | Accuracy, mastery |
| `practice_completed` | Drill finishes | `drill`, `questions`, `accuracy`, `best_streak`, `duration_ms` | Completion, progress |
| `practice_abandoned` | Drill left unfinished | `drill`, `questions_answered`, `progress_percent` | Where users quit |
| `hand_started` | Casino table hand dealt | `game`, `wager_bucket`, `true_count_bucket`, `spots` | Game usage |
| `hand_decision` | Player acts on a hand | `game`, `street`, `action`, `recommended_action`, `correct`, `true_count_bucket`, `deviation_available` | Blackjack skill |
| `hand_completed` | Hand settles | `game`, `outcome`, `net_bucket`, `duration_ms` | Game engagement |
| `calculator_opened` | Calculator mounts | `calculator` | Tool adoption |
| `calculation_run` | Calculation executed | `calculator`, `bankroll_bucket`, `unit_bucket`, `decks`, `spread` | Tool usage |
| `preset_selected` | Preset/ramp chosen | `calculator`, `preset` | Defaults vs custom |
| `simulation_started` | Monte Carlo launched | `mode`, `rounds`, `paths` | Compute usage |
| `simulation_completed` | Simulation returns | `mode`, `duration_ms`, `hourly_ev_bucket`, `risk_of_ruin_bucket` | Value delivered |
| `settings_changed` | Settings saved | `changed_keys`, `decks`, `rules_preset` | Configuration |
| `result_saved` | Template/run saved | `kind` | Retention driver |
| `data_exported` / `data_imported` / `data_cleared` | Backup actions | `scope`, `records` | Portability use |
| `search_performed` | Reference search | `result_count`, `zero_results`, `query_length` | Content gaps |
| `filter_applied` / `tab_changed` | UI refinement | `surface`, `value` | Navigation within tools |
| `signup_started` | Sign-up form submitted | `method` | Signup funnel |
| `signup_completed` S | Row lands in `auth.users` | `method` | **Authoritative** conversion |
| `signup_failed` | Sign-up rejected | `reason_category` (never the raw message) | Signup friction |
| `login_succeeded` / `login_failed` | Auth attempt | `method`, `reason_category` | Access issues |
| `logout` | Sign-out | — | Session end |
| `guest_mode_entered` | Guest chosen | — | Anonymous funnel |
| `client_error` A | `error` / `unhandledrejection` | `error_type`, `message_normalized`, `stack_head`, `route` | Stability |
| `web_vital` A | Vitals observer | `metric` (LCP/INP/CLS/TTFB/FCP), `value`, `rating` | Performance |
| `experiment_exposure` | Variant read | `experiment`, `variant` | A/B analysis |
| `feature_flag_exposure` | Flag read | `flag`, `variation` | Release debugging |

**Ownership (§71).** `signup_completed` is server-only — the client emits
`signup_started` / `signup_failed` but never `signup_completed`, so the
conversion count cannot be inflated or lost by a client. Everything else is
client-owned.

## 6. Database objects

Created by `supabase/schema.sql` (idempotent — safe to re-run).

**`public.analytics_events`** — raw event stream. Indexed on `created_at desc`,
`event`, `user_id`, `anon_id`, `session_id`, and a partial index excluding
bot/internal traffic (the shape almost every dashboard query uses).

**`public.analytics_sessions`** — one row per session, upserted by the client
via `analytics_upsert_session()`. Holds duration, engaged time, counters,
landing/exit path, channel, UTM, device, first-session flag.

**`public.analytics_aliases`** — `anon_id → user_id`. Written on login so
pre-signup anonymous activity can be attributed to the account afterwards.

**`analytics` schema (views, not exposed to PostgREST):**

| View | Grain | Answers |
| --- | --- | --- |
| `events_clean` | event | Base view: bots, internal traffic and non-production filtered out. Everything else builds on it. |
| `visitor_profiles` | visitor | First/last seen, sessions, active days, events, returning, lifecycle state |
| `daily_metrics` | day | Visitors, new vs returning, sessions, page views, events, engaged sessions, avg duration |
| `active_users` | day | DAU / WAU / MAU / stickiness |
| `feature_usage` | feature | Users, sessions, opens, completions, completion rate, repeat rate |
| `training_performance` | drill | Attempts, accuracy, median + p90 response time, completion rate |
| `scenario_difficulty` | drill × scenario | Miss rate — *which blackjack spots are hardest* |
| `retention_cohorts` | cohort week | Size, D1, D3, D7, D14, D30 |
| `acquisition` | channel/source | Visitors, signups, activated, retained |
| `page_stats` | route | Views, unique visitors, entries, exits, bounce rate |
| `navigation_paths` | route pair | Path frequency for journey analysis |
| `friction` | route × element | Rage + dead clicks |
| `error_stats` | error | Occurrences, users affected, browsers, first/last seen |
| `vitals_stats` | metric × route | p50/p75/p90/p95 |
| `data_quality` | day | Unknown event names, validation rejects, volume deltas |

Views live in a non-exposed schema; the dashboard reaches them only through
`security definer` functions in `public` that begin with an `is_admin()` guard,
matching the existing `admin_visitor_summary()` pattern.

## 7. Client architecture

```
lib/analytics/
  types.ts       closed EventName union + per-event property types
  config.ts      environment, thresholds, feature + drill registries
  redact.ts      forbidden-key stripping, numeric bucketing, normalisation
  context.ts     device/browser/os/viewport/locale/region, UTM, attribution
  identity.ts    anonymous id, user id, alias, reset
  session.ts     session lifecycle + real engagement timing
  queue.ts       batching, retry, keepalive flush, dedup ids
  client.ts      analytics.track / page / identify / reset
  autocapture.ts clicks, dead clicks, rage clicks, scroll, navigation
  errors.ts      window error + unhandledrejection
  vitals.ts      LCP, INP, CLS, TTFB, FCP (native PerformanceObserver)
  react.tsx      <AnalyticsProvider>, useFeature, useDrillAnalytics, useCalculator
```

Feature code never touches Supabase. It calls:

```ts
analytics.track("question_answered", { drill: "true_count", correct: true, response_time_ms: 1840 });
```

or, preferably, a hook that handles the open/complete/abandon lifecycle for it:

```ts
const drill = useDrillAnalytics("true_count", { mode, difficulty });
drill.start({ question_target: 10 });
drill.answer({ correct, category, response_time_ms });
drill.complete({ questions, accuracy, best_streak });
// unmount mid-drill -> practice_abandoned fires automatically
```

**Engagement time** is measured with `visibilitychange` + `focus`/`blur`, so a
tab left open in the background does not inflate it.

**Flush policy:** batch of 20, or every 5s, or immediately for critical events
(auth, completions, errors), or on `visibilitychange: hidden` /`pagehide` via
`fetch(..., { keepalive: true })`. Conversion events never wait for a batch.

## 8. Dashboard

`/admin`, admin-only, tabbed:

| Tab | Contents |
| --- | --- |
| Overview | DAU/WAU/MAU, stickiness, new vs returning, sessions, engagement, activation, D1/D7/D30, trend vs previous period |
| Audience | Retention cohort grid, lifecycle states, acquisition channels, UTM campaigns, geography, devices |
| Behavior | Page stats, entries/exits, navigation paths, feature adoption + completion, friction (rage/dead clicks) |
| Training | Drill attempts, accuracy over time, response-time distributions, completion rates, hardest scenarios, deviation miss rates |
| Technical | Errors by frequency and users affected, Web Vitals percentiles by route/device, release comparison, data quality |
| Realtime | Last 30 minutes: active visitors, live event feed, current pages |
| Visitors | Directory + per-visitor timeline (existing, retained) |

Global controls: time range (today / 7d / 30d / 90d / custom) with
previous-period comparison, and segment filters (auth state, new vs returning,
device, channel, app version).

## 9. Privacy and security

**Never collected:** passwords, tokens, session cookies, payment data, raw IP
addresses, precise geolocation, keystrokes, free-text form values, exact
bankroll figures (bucketed instead), full URLs (route only, query string
dropped except allow-listed UTM keys).

**Defence in depth:** `redact.ts` strips forbidden keys before send;
`analytics_redact()` strips them again in Postgres, so a bug or a hand-crafted
PostgREST call still cannot land a secret.

**Identity:** `anon_id` is a random uuid, never an email or anything derived
from one. `user_id` is Supabase's opaque uuid.

**Read access:** only `admin_users` members, enforced by RLS and by the
`is_admin()` guard inside every admin RPC. Ordinary signed-in users cannot read
even their own analytics rows back.

**Deletion:** `analytics_events.user_id` is `on delete set null`, so deleting an
account de-identifies its history rather than orphaning it. `analytics_purge()`
applies the retention policy: raw events 400 days, sessions 400 days, errors
180 days, aliases indefinite (they are just two opaque uuids).

**Consent:** all storage is first-party and strictly functional/analytical with
no cross-site tracking, no ad tech, and no data sharing. If CountLab ever adds
third-party analytics or advertising, a consent gate becomes necessary — the
client is structured so `analytics.setEnabled(false)` can gate every write from
one place.

## 10. Operations

**After pulling these changes, re-run `supabase/schema.sql` in the Supabase SQL
editor** (idempotent), then `NOTIFY pgrst, 'reload schema';` so PostgREST picks
up the new functions.

Build metadata comes from `NEXT_PUBLIC_APP_VERSION` and
`NEXT_PUBLIC_COMMIT_SHA`, injected by `.github/workflows/deploy.yml`. Local dev
builds report `development` and are excluded from every dashboard view.

**Data-quality checks** live in the Technical tab: unknown event names, sudden
volume deltas, and zero-event periods are the three failure modes that silently
break analytics.

## 11. North-star metric

**Weekly returning users who complete at least one training session.**

It requires all three things that make CountLab valuable at once — the user came
back (retention), they trained rather than browsed (intent), and they finished
(the product worked). Page views and raw event counts can all rise while this
number falls; that is exactly why it is the one to watch.

Supporting KPIs: activation rate (first completed drill), D7 retention, drill
completion rate, accuracy improvement between a user's first and most recent
session, and share of users using two or more features.
