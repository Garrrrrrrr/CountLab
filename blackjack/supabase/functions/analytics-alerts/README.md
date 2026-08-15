# Analytics alert delivery

Deploy `analytics-alerts`, set `ANALYTICS_CRON_SECRET` and
`ANALYTICS_ALERT_WEBHOOK_URL`, then invoke it from Supabase Cron with the
matching `x-cron-secret` header. Triggered alerts are rate-limited to one
delivery per metric per hour. The dashboard shows evaluations even when no
webhook is configured.
