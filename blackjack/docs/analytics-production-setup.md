# CountLab analytics production setup

This runbook takes CountLab analytics from repository code to a working
production deployment. Complete the sections in order. Never paste real secret
values into this file, source control, screenshots, issues, or chat.

## What this setup deploys

- The CountLab static website through GitHub Pages.
- The `analytics` Supabase Edge Function for event/session ingestion, identity
  linking, and analytics deletion.
- The `analytics-alerts` Supabase Edge Function for scheduled alert evaluation
  and optional webhook delivery.
- The analytics database tables, validation functions, clean views, retention
  models, dashboard RPCs, and admin authorization in `supabase/schema.sql`.
- Two scheduled jobs: alert evaluation and data-retention cleanup.

## Information to collect first

Use this as a private worksheet. Do not fill secrets into the committed copy.

| Item | Where to find or create it | Sensitive? |
| --- | --- | --- |
| Supabase project reference | Supabase project → Settings → General → Project Settings → Reference ID | No |
| Supabase project URL | Supabase project → Settings → API Keys, or `https://PROJECT_REF.supabase.co` | No |
| Supabase publishable key | Supabase project → Settings → API Keys → Publishable key | No; browser key |
| Supabase personal access token | Supabase account → Access Tokens | **Yes** |
| Analytics hash salt | Generate a new random value of at least 32 characters | **Yes** |
| Analytics Cron secret | Generate a different random value of at least 32 characters | **Yes** |
| Production origins | Normally `https://countlab.ca,https://www.countlab.ca` | No |
| Admin user UUID | Supabase project → Authentication → Users | Treat as internal |
| Alert webhook URL | Slack/Discord or another HTTPS webhook; optional | **Yes** |

The project reference also appears in the Supabase dashboard URL:

```text
https://supabase.com/dashboard/project/PROJECT_REF
```

Supabase documents the Reference ID under Settings → General and the public
key under Settings → API Keys. The public key is intended for browser use; it
is not the service-role/secret key.

## 1. Apply the database schema

1. Open the CountLab project in the Supabase dashboard.
2. Open **SQL Editor** in the left sidebar.
3. Select **New query**.
4. Open `blackjack/supabase/schema.sql` from this repository.
5. Copy the entire file into the SQL Editor.
6. Select **Run**.

The schema is idempotent: it uses `create or replace`, `create table if not
exists`, and matching drops where necessary. It is safe to rerun the complete
file after a failed attempt or when CountLab ships a schema update.

Do not continue until the SQL Editor reports success. Then run this verification
query:

```sql
select
  to_regclass('public.analytics_events') as events,
  to_regclass('public.analytics_sessions') as sessions,
  to_regclass('public.analytics_aliases') as aliases,
  to_regclass('public.analytics_alert_rules') as alert_rules;
```

All four returned values should be non-null.

## 2. Create the Supabase personal access token

This token lets GitHub Actions deploy Edge Functions through the Supabase
management API. It is not used by website visitors and is not the website's
publishable key.

1. Open <https://supabase.com/dashboard/account/tokens>.
2. Select **Generate new token**.
3. Name it `CountLab GitHub Actions`.
4. Choose the longest permitted expiration (one year is acceptable).
5. Generate the token and copy it immediately.
6. Store it in a password manager until it has been added to GitHub.

When this token expires, already-deployed functions keep running. Only future
deployments fail. Create a calendar reminder two to four weeks before expiry.

## 3. Configure Supabase Edge Function secrets

In the Supabase project, open **Edge Functions → Secrets**. Depending on the
current dashboard layout, Secrets may also appear under the project settings
for Edge Functions.

Add these values:

| Name | Required value |
| --- | --- |
| `ANALYTICS_HASH_SALT` | A new random secret, at least 32 characters |
| `ANALYTICS_ALLOWED_ORIGINS` | `https://countlab.ca,https://www.countlab.ca` |
| `ANALYTICS_CRON_SECRET` | A second random secret, at least 32 characters |
| `ANALYTICS_ALERT_WEBHOOK_URL` | Optional HTTPS webhook URL |

Origins must be exact and must not have trailing slashes. Add a preview domain
only if preview traffic should be allowed to reach the ingestion function.
Preview and staging events remain excluded from production KPIs by their
environment value.

To generate a cryptographically random secret in PowerShell, run this twice and
use a different output for the hash salt and Cron secret:

```powershell
$randomBytes = New-Object byte[] 32
$randomSource = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$randomSource.GetBytes($randomBytes)
[Convert]::ToBase64String($randomBytes)
$randomSource.Dispose()
```

Supabase automatically provides hosted functions with `SUPABASE_URL` and the
server-only project credentials they require. Never add a service-role or
secret key to `NEXT_PUBLIC_*`, GitHub variables, or frontend code.

If no webhook is configured, alert rules are still evaluated and shown on the
admin dashboard; only external notification delivery is disabled.

## 4. Configure GitHub Actions

Open the GitHub repository, then navigate to:

```text
Settings → Secrets and variables → Actions
```

### Repository secret

Under **Secrets**, create:

| Name | Value |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | The Supabase personal access token from step 2 |

GitHub encrypts Actions secrets and injects them only into workflows that
explicitly request them. Never create this value as a plain variable.

### Repository variables

Under **Variables**, create:

| Name | Value |
| --- | --- |
| `SUPABASE_PROJECT_ID` | The Supabase Reference ID |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://PROJECT_REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The publishable key (or legacy anon key) |
| `NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT` | Recommended default: `true` |
| `NEXT_PUBLIC_ANALYTICS_PERFORMANCE_SAMPLE_RATE` | Start with `1` |

Although the environment variable retains the older `ANON_KEY` name, a current
Supabase publishable key is appropriate. These two `NEXT_PUBLIC_SUPABASE_*`
values are browser-visible by design. Database RLS and the trusted ingestion
tier provide security.

The deployment workflow references a GitHub environment named `production`.
GitHub can create it when the job first runs, or you can create it in advance:

```text
Settings → Environments → New environment → production
```

If you configure required reviewers on that environment, every Edge Function
deployment will wait for approval.

## 5. Commit, push, and deploy

The workflow files must exist on GitHub before they can run. Commit all intended
changes and push `main`.

Two GitHub Actions workflows should run:

- **Deploy CountLab to Pages** builds and deploys the website.
- **Deploy analytics Edge Functions** deploys `analytics` and
  `analytics-alerts`.

Monitor them under the repository's **Actions** tab. Both should be green. The
Edge workflow can also be started manually using **Run workflow**.

After a successful function deployment, Supabase should show both functions at:

```text
Supabase project → Edge Functions
```

Their production URLs are:

```text
https://PROJECT_REF.supabase.co/functions/v1/analytics
https://PROJECT_REF.supabase.co/functions/v1/analytics-alerts
```

Do not edit production function code in the Supabase browser editor. The
repository and deployment workflow are the source of truth.

## 6. Grant analytics dashboard access

The administrator must have a real CountLab/Supabase Auth account before it can
be added to the allowlist.

1. Sign up or sign in to the production CountLab website.
2. In Supabase, open **Authentication → Users**.
3. Locate the intended administrator and copy its user UUID.
4. Run this in the Supabase SQL Editor, replacing the placeholder:

```sql
insert into public.admin_users (user_id)
values ('YOUR-USER-UUID')
on conflict do nothing;
```

Verify it without selecting any email address:

```sql
select user_id from public.admin_users;
```

Sign out and back in, or reload the website. The **Analytics** navigation entry
and `/admin` route should now be available. Admin accounts are automatically
excluded from clean production KPIs.

To exclude a developer or test account without granting dashboard access:

```sql
insert into public.analytics_internal_users (user_id, reason)
values ('USER-UUID', 'developer')
on conflict (user_id) do update set reason = excluded.reason;
```

## 7. Enable and configure Supabase Cron

Open **Integrations → Cron** in Supabase. If prompted, enable Cron. Supabase
Cron uses `pg_cron`; HTTP jobs also use `pg_net`.

### Retention cleanup job

Create a SQL Cron job with:

| Setting | Value |
| --- | --- |
| Name | `countlab-analytics-retention` |
| Schedule | `15 3 * * *` (daily at 03:15 UTC) |
| SQL | `select public.analytics_purge();` |

The default retention policy keeps:

- Raw events and sessions for 400 days.
- Frontend errors for 180 days.
- Payload-free ingestion rejection counts for 90 days.

The current policy can be inspected with:

```sql
select * from public.analytics_retention_settings;
```

### Alert evaluation job

Create an HTTP Cron job with:

| Setting | Value |
| --- | --- |
| Name | `countlab-analytics-alerts` |
| Schedule | `*/5 * * * *` |
| Method | `POST` |
| URL | `https://PROJECT_REF.supabase.co/functions/v1/analytics-alerts` |
| Body | `{}` |

Required headers:

```text
Content-Type: application/json
apikey: YOUR_SUPABASE_PUBLISHABLE_KEY
x-cron-secret: YOUR_ANALYTICS_CRON_SECRET
```

For production, store the publishable key and Cron secret in **Supabase Vault**
and reference them from the Cron job rather than embedding them in a saved SQL
string. Supabase's scheduled-function documentation provides the supported
`vault`, `cron.schedule`, and `net.http_post` pattern.

Triggered alerts are rate-limited to one external delivery per metric per hour.
The job can be scheduled even when no webhook URL is configured.

## 8. Verify production ingestion

### Browser test

1. Open the deployed website in a normal, non-admin browser session.
2. Allow analytics in the privacy banner if prior consent is enabled.
3. Visit several routes.
4. Start and complete a drill.
5. Run a calculator or simulation.
6. Wait at least five seconds for the batch queue to flush.
7. Sign in to test anonymous-to-authenticated identity linking.

In browser developer tools, a successful request to this endpoint should return
HTTP `202`:

```text
/functions/v1/analytics
```

### Database verification

Run these read-only queries in the Supabase SQL Editor:

```sql
select event, count(*) as events
from public.analytics_events
group by event
order by events desc;

select count(*) as sessions from public.analytics_sessions;

select count(*) as identity_links from public.analytics_aliases;

select day, visitors, active_users, sessions, page_views
from analytics.daily_metrics
order by day desc
limit 14;
```

The alias count remains zero until an anonymous browser subsequently signs in.

### Function logs

In Supabase, open:

```text
Edge Functions → analytics → Invocations
Edge Functions → analytics → Logs
```

Invocations show request status and duration. Logs show deployment/runtime
errors without exposing analytics payloads.

### Dashboard test

Sign in with the allowlisted administrator and open `/admin`. Verify:

- Overview cards and date comparisons load.
- Realtime updates after new activity.
- Training attempts and scenario accuracy appear after a completed drill.
- Funnel, retention, acquisition, performance, and error sections render.
- CSV and JSON exports download aggregate data.

### Cron test

Run each job once from Supabase Cron if the dashboard provides **Run now**.
Confirm successful runs in Cron history and confirm an `analytics-alerts`
invocation appears in Edge Function logs.

## 9. Troubleshooting

| Symptom | Likely cause and action |
| --- | --- |
| GitHub function deployment reports unauthorized | `SUPABASE_ACCESS_TOKEN` is missing, expired, or belongs to an account without project access. Replace the GitHub secret. |
| Deployment cannot find the project | Confirm `SUPABASE_PROJECT_ID` exactly matches Settings → General → Reference ID. |
| Website build warns that Supabase values are missing | Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as GitHub repository variables, then rebuild Pages. |
| Ingestion returns `403 origin_not_allowed` | Correct `ANALYTICS_ALLOWED_ORIGINS`; use exact origins without trailing slashes. |
| Ingestion returns `503 service_not_configured` | Check Edge secrets and ensure `ANALYTICS_HASH_SALT` is at least 32 characters. |
| Ingestion returns `400 ingestion_rejected` | Reapply the current `supabase/schema.sql`, then inspect Edge and Postgres logs. |
| No browser request is sent | Analytics may be awaiting consent, disabled in Settings, or blocked by an extension. Accept consent and retest. |
| Events exist but the dashboard is empty | Ensure events are marked `production`, the account is an admin, and the selected dashboard period includes the events. Admin/test/bot traffic is intentionally excluded. |
| `/admin` says not authorized | Verify the signed-in Auth user UUID exists in `admin_users`, then sign out and back in. |
| Alert job returns `401` | Its `x-cron-secret` does not match `ANALYTICS_CRON_SECRET`. Update both the Edge secret and Vault/Cron value. |
| Alert job runs but no notification arrives | Check the HTTPS webhook secret, triggered alert state, one-hour suppression window, and function logs. |
| Retention job reports not authorized | Reapply the current schema so the database-owner Cron authorization is installed. |
| Data appears only after another visit | The durable queue retries offline/failed batches and keeps unload batches until delivery is confirmed. This is expected at-least-once behavior; event IDs prevent duplicates. |

## 10. Ongoing maintenance

### Before the Supabase access token expires

1. Generate a replacement at <https://supabase.com/dashboard/account/tokens>.
2. Replace the GitHub secret named `SUPABASE_ACCESS_TOKEN`.
3. Manually run **Deploy analytics Edge Functions**.
4. Confirm the workflow succeeds.
5. Revoke the old token if it has not already expired.

No function redeployment is required merely because a token expires; the token
only authorizes the deployment workflow.

### When rotating the Cron secret

Update both locations before testing:

1. Supabase Edge Function secret `ANALYTICS_CRON_SECRET`.
2. The matching value stored in Vault/used by the alert Cron job.

### After analytics code changes

1. Apply the latest `supabase/schema.sql` when it changed.
2. Commit and push `main`.
3. Confirm both GitHub workflows pass.
4. Check Edge Function logs and the admin data-quality section.

### Periodically

- Review Cron run history and Edge Function failures.
- Review analytics ingestion rejection reasons in `/admin`.
- Check data retention settings against current product/legal requirements.
- Remove stale entries from `admin_users` and `analytics_internal_users`.
- Confirm the public privacy page still describes the deployed configuration.
- Reassess the performance sample rate if event volume becomes material.

## Completion checklist

- [ ] The complete schema runs successfully.
- [ ] `SUPABASE_ACCESS_TOKEN` exists as a GitHub secret.
- [ ] `SUPABASE_PROJECT_ID` exists as a GitHub variable.
- [ ] Website Supabase/analytics variables exist in GitHub.
- [ ] All required Edge Function secrets exist in Supabase.
- [ ] Repository changes are committed and pushed to `main`.
- [ ] Both GitHub deployment workflows pass.
- [ ] Both Edge Functions appear in Supabase.
- [ ] The administrator UUID exists in `admin_users`.
- [ ] The retention Cron job succeeds.
- [ ] The alert Cron job reaches `analytics-alerts`.
- [ ] A browser analytics request returns HTTP 202.
- [ ] Events, sessions, and identity aliases reach Postgres.
- [ ] `/admin` loads production metrics.

## Official references

- [Supabase Edge Function production deployment](https://supabase.com/docs/guides/functions/deploy)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Edge Function logging](https://supabase.com/docs/guides/functions/logging)
- [Supabase CLI authentication](https://supabase.com/docs/reference/cli/getting-started)
- [GitHub Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets)
