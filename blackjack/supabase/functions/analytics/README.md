# Analytics Edge Function

Deploy with `supabase functions deploy analytics`. `supabase/config.toml`
disables gateway verification because the function validates bearer tokens
itself and intentionally supports anonymous requests. It accepts event batches,
session rollups, verified identity links, and analytics deletion requests.
Set these secrets before deployment:

- `ANALYTICS_HASH_SALT`: random server-only value used to hash transient IPs
  for rate limiting. Raw IPs are never stored.
- `ANALYTICS_ALLOWED_ORIGINS`: comma-separated production/staging origins.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase. Apply
`supabase/schema.sql` before deploying because the function calls service-only
ingestion, identity-link, deletion, and rejection-monitoring RPCs.

Malformed/rejected request counts are stored by low-cardinality reason only;
their payloads and request identifiers are never retained. The function allows
at most 50 events/128 KB per request and delegates authoritative per-hash rate
limits, schema validation, sanitization, and deduplication to Postgres.
