-- Apply before releasing the client that records session details. Additive and rerunnable.
-- Optional per-session extras: rounds played, top bet, buy-in, cash-out and heat events.
-- Clients send the column only for sessions that have details, so older rows keep syncing.
begin;

alter table journal_sessions add column if not exists details jsonb;

alter table journal_sessions drop constraint if exists journal_sessions_size_limit;
alter table journal_sessions add constraint journal_sessions_size_limit check (
  pg_column_size(rules) < 5000 and pg_column_size(ramp) < 20000 and pg_column_size(hands_by_true_count) < 20000
  and pg_column_size(details) < 10000
  and char_length(coalesce(notes, '')) < 5000 and char_length(coalesce(location, '')) < 200
);

commit;
