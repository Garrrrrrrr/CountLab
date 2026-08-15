-- CountLab per-account data schema. Run once in the Supabase SQL editor.
-- Every table is owner-only via Row Level Security: a user can only see and
-- write their own rows, matched on user_id = auth.uid().

create table if not exists settings (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists drill_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  drill text not null,
  questions int not null,
  correct int not null,
  accuracy int not null,
  average_response_time int not null,
  best_streak int not null,
  date timestamptz not null,
  mistakes jsonb,
  categories jsonb,
  metrics jsonb,
  tags text[],
  created_at timestamptz not null default now()
);

create table if not exists drill_progress (
  user_id uuid not null references auth.users on delete cascade,
  drill text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, drill)
);

create table if not exists journal_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  date date not null,
  location text,
  hours numeric not null,
  hands_per_hour numeric not null,
  player_hands numeric not null,
  betting_unit numeric not null,
  rules jsonb not null,
  ramp jsonb not null,
  net_result numeric not null,
  expenses numeric not null,
  notes text
);

create table if not exists journal_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  date date not null,
  type text not null check (type in ('deposit', 'withdrawal')),
  amount numeric not null,
  note text
);

create index if not exists drill_sessions_user_id_idx on drill_sessions (user_id);
create index if not exists drill_progress_user_id_idx on drill_progress (user_id);
create index if not exists journal_sessions_user_id_idx on journal_sessions (user_id);
create index if not exists journal_transactions_user_id_idx on journal_transactions (user_id);

alter table settings enable row level security;
alter table drill_sessions enable row level security;
alter table drill_progress enable row level security;
alter table journal_sessions enable row level security;
alter table journal_transactions enable row level security;

drop policy if exists "settings owner select" on settings;
create policy "settings owner select" on settings for select using (auth.uid() = user_id);
drop policy if exists "settings owner insert" on settings;
create policy "settings owner insert" on settings for insert with check (auth.uid() = user_id);
drop policy if exists "settings owner update" on settings;
create policy "settings owner update" on settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "settings owner delete" on settings;
create policy "settings owner delete" on settings for delete using (auth.uid() = user_id);

drop policy if exists "drill_sessions owner select" on drill_sessions;
create policy "drill_sessions owner select" on drill_sessions for select using (auth.uid() = user_id);
drop policy if exists "drill_sessions owner insert" on drill_sessions;
create policy "drill_sessions owner insert" on drill_sessions for insert with check (auth.uid() = user_id);
drop policy if exists "drill_sessions owner update" on drill_sessions;
create policy "drill_sessions owner update" on drill_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "drill_sessions owner delete" on drill_sessions;
create policy "drill_sessions owner delete" on drill_sessions for delete using (auth.uid() = user_id);

drop policy if exists "drill_progress owner select" on drill_progress;
create policy "drill_progress owner select" on drill_progress for select using (auth.uid() = user_id);
drop policy if exists "drill_progress owner insert" on drill_progress;
create policy "drill_progress owner insert" on drill_progress for insert with check (auth.uid() = user_id);
drop policy if exists "drill_progress owner update" on drill_progress;
create policy "drill_progress owner update" on drill_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "drill_progress owner delete" on drill_progress;
create policy "drill_progress owner delete" on drill_progress for delete using (auth.uid() = user_id);

drop policy if exists "journal_sessions owner select" on journal_sessions;
create policy "journal_sessions owner select" on journal_sessions for select using (auth.uid() = user_id);
drop policy if exists "journal_sessions owner insert" on journal_sessions;
create policy "journal_sessions owner insert" on journal_sessions for insert with check (auth.uid() = user_id);
drop policy if exists "journal_sessions owner update" on journal_sessions;
create policy "journal_sessions owner update" on journal_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "journal_sessions owner delete" on journal_sessions;
create policy "journal_sessions owner delete" on journal_sessions for delete using (auth.uid() = user_id);

drop policy if exists "journal_transactions owner select" on journal_transactions;
create policy "journal_transactions owner select" on journal_transactions for select using (auth.uid() = user_id);
drop policy if exists "journal_transactions owner insert" on journal_transactions;
create policy "journal_transactions owner insert" on journal_transactions for insert with check (auth.uid() = user_id);
drop policy if exists "journal_transactions owner update" on journal_transactions;
create policy "journal_transactions owner update" on journal_transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "journal_transactions owner delete" on journal_transactions;
create policy "journal_transactions owner delete" on journal_transactions for delete using (auth.uid() = user_id);

-- Rate limiting -------------------------------------------------------------
-- CountLab is a static export with no server, so the anon key + a signed-in
-- user's JWT can call this project's PostgREST API directly (e.g. from curl),
-- bypassing any limit enforced only in the browser. These triggers make the
-- limit authoritative in Postgres, which every write path (app or otherwise)
-- has to go through.

create table if not exists rate_limit_events (
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup_idx on rate_limit_events (user_id, action, created_at);

-- No policies are defined for this table, so ordinary users have zero
-- direct access to it (RLS defaults to deny); only the security-definer
-- function below, running as its owner, can read or write it.
alter table rate_limit_events enable row level security;

create or replace function enforce_rate_limit(p_action text, p_max_count int, p_window interval)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  if auth.uid() is null then
    raise exception 'Rate limiting requires an authenticated user';
  end if;

  delete from rate_limit_events
   where user_id = auth.uid() and action = p_action and created_at < now() - p_window;

  select count(*) into recent_count
    from rate_limit_events
   where user_id = auth.uid() and action = p_action and created_at >= now() - p_window;

  if recent_count >= p_max_count then
    raise exception 'Rate limit exceeded: % allows at most % writes per %', p_action, p_max_count, p_window
      using errcode = 'P0001';
  end if;

  insert into rate_limit_events (user_id, action) values (auth.uid(), p_action);
end;
$$;

create or replace function rl_settings() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform enforce_rate_limit('settings_write', 30, interval '1 minute');
  return new;
end;
$$;

create or replace function rl_drill_sessions() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform enforce_rate_limit('drill_sessions_write', 60, interval '1 minute');
  return new;
end;
$$;

create or replace function rl_drill_progress() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform enforce_rate_limit('drill_progress_write', 200, interval '1 minute');
  return new;
end;
$$;

create or replace function rl_journal_sessions() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform enforce_rate_limit('journal_sessions_write', 30, interval '1 minute');
  return new;
end;
$$;

create or replace function rl_journal_transactions() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform enforce_rate_limit('journal_transactions_write', 30, interval '1 minute');
  return new;
end;
$$;

-- insert-only: Postgres always fires BEFORE INSERT to propose a row even
-- when `upsert()` ends up routing it through ON CONFLICT DO UPDATE, so this
-- alone still catches every upsert call exactly once. Also listening on
-- UPDATE would fire a second time for that same call (both triggers run:
-- one for the insert attempt, one for the conflict-triggered update),
-- silently halving these limits versus what's documented above.
drop trigger if exists settings_rate_limit on settings;
create trigger settings_rate_limit before insert on settings
  for each row execute function rl_settings();

drop trigger if exists drill_sessions_rate_limit on drill_sessions;
create trigger drill_sessions_rate_limit before insert on drill_sessions
  for each row execute function rl_drill_sessions();

drop trigger if exists drill_progress_rate_limit on drill_progress;
create trigger drill_progress_rate_limit before insert on drill_progress
  for each row execute function rl_drill_progress();

drop trigger if exists journal_sessions_rate_limit on journal_sessions;
create trigger journal_sessions_rate_limit before insert on journal_sessions
  for each row execute function rl_journal_sessions();

drop trigger if exists journal_transactions_rate_limit on journal_transactions;
create trigger journal_transactions_rate_limit before insert on journal_transactions
  for each row execute function rl_journal_transactions();

-- Row size caps ---------------------------------------------------------
-- RLS stops a user from writing another user's rows, but not from writing
-- an unbounded number of large rows of their own. Cap the free-form jsonb/text
-- columns so a scripted client can't balloon storage well past what the UI
-- would ever send.

alter table settings drop constraint if exists settings_size_limit;
alter table settings add constraint settings_size_limit check (pg_column_size(data) < 20000);

alter table drill_sessions drop constraint if exists drill_sessions_size_limit;
alter table drill_sessions add constraint drill_sessions_size_limit check (
  pg_column_size(mistakes) < 50000 and pg_column_size(categories) < 20000 and pg_column_size(metrics) < 20000
);

alter table drill_progress drop constraint if exists drill_progress_size_limit;
alter table drill_progress add constraint drill_progress_size_limit check (pg_column_size(state) < 50000);

alter table journal_sessions drop constraint if exists journal_sessions_size_limit;
alter table journal_sessions add constraint journal_sessions_size_limit check (
  pg_column_size(rules) < 5000 and pg_column_size(ramp) < 20000 and char_length(coalesce(notes, '')) < 5000 and char_length(coalesce(location, '')) < 200
);

alter table journal_transactions drop constraint if exists journal_transactions_size_limit;
alter table journal_transactions add constraint journal_transactions_size_limit check (char_length(coalesce(note, '')) < 5000);

-- Analytics ---------------------------------------------------------------
-- Records user actions (page views, drills completed, journal entries, auth
-- events, settings changes, every hand/click via autocapture, etc.) so they
-- can be reviewed in the /admin dashboard. Every client — signed in or
-- browsing as a guest — can insert its own events; nobody can read them back
-- except admins (see below).

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  anon_id text not null,
  session_id text not null,
  event text not null,
  path text,
  properties jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on analytics_events (created_at desc);
create index if not exists analytics_events_event_idx on analytics_events (event);
create index if not exists analytics_events_user_id_idx on analytics_events (user_id);

alter table analytics_events enable row level security;

drop policy if exists "analytics_events insert own" on analytics_events;
create policy "analytics_events insert own" on analytics_events for insert
  with check (user_id is null or auth.uid() = user_id);

alter table analytics_events drop constraint if exists analytics_events_size_limit;
alter table analytics_events add constraint analytics_events_size_limit check (
  pg_column_size(properties) < 5000 and char_length(event) < 100 and char_length(coalesce(path, '')) < 300
);

create or replace function rl_analytics_events() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Guests (no auth.uid()) aren't rate limited here since enforce_rate_limit
  -- requires an authenticated user; only signed-in writers are capped.
  if auth.uid() is not null then
    -- Generous: this table now records every hand played, every drill
    -- question answered, and every UI click (autocapture), not just coarse
    -- milestones, so legitimate fast use can generate many events per minute.
    perform enforce_rate_limit('analytics_events_write', 1200, interval '1 minute');
  end if;
  return new;
end;
$$;

drop trigger if exists analytics_events_rate_limit on analytics_events;
create trigger analytics_events_rate_limit before insert on analytics_events
  for each row execute function rl_analytics_events();

-- Admins --------------------------------------------------------------------
-- A short allowlist of users who can read analytics_events via the /admin
-- dashboard. Grant access by inserting a row here (re-run after the account
-- exists, e.g. right after your first sign-up):
--   insert into admin_users (user_id) select id from auth.users where email = 'you@example.com';

create table if not exists admin_users (
  user_id uuid primary key references auth.users on delete cascade
);

alter table admin_users enable row level security;

create or replace function is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

drop policy if exists "admin_users self select" on admin_users;
create policy "admin_users self select" on admin_users for select using (auth.uid() = user_id);

drop policy if exists "analytics_events admin select" on analytics_events;
create policy "analytics_events admin select" on analytics_events for select using (is_admin());

insert into admin_users (user_id)
select id from auth.users where email = 'g.tse8888@gmail.com'
on conflict do nothing;

-- Admin directory: who did what, when ---------------------------------------
-- These run as security definer (bypassing RLS, and able to read auth.users
-- for an email label) but check is_admin() internally, so only admins get
-- real rows back; anyone else gets an empty set.

create or replace function admin_visitor_summary()
returns table (
  visitor_id text,
  user_id uuid,
  email text,
  event_count bigint,
  first_seen timestamptz,
  last_seen timestamptz
)
language sql security definer set search_path = public stable as $$
  select
    coalesce(ae.user_id::text, ae.anon_id) as visitor_id,
    ae.user_id,
    u.email,
    count(*) as event_count,
    min(ae.created_at) as first_seen,
    max(ae.created_at) as last_seen
  from analytics_events ae
  left join auth.users u on u.id = ae.user_id
  where is_admin()
  group by coalesce(ae.user_id::text, ae.anon_id), ae.user_id, u.email
  order by max(ae.created_at) desc
  limit 500;
$$;

create or replace function admin_visitor_events(target_user_id uuid, target_anon_id text)
returns setof analytics_events
language sql security definer set search_path = public stable as $$
  select ae.*
  from analytics_events ae
  where is_admin()
    and (
      (target_user_id is not null and ae.user_id = target_user_id)
      or (target_user_id is null and ae.user_id is null and ae.anon_id = target_anon_id)
    )
  order by ae.created_at desc
  limit 1000;
$$;

grant execute on function is_admin() to authenticated;
grant execute on function admin_visitor_summary() to authenticated;
grant execute on function admin_visitor_events(uuid, text) to authenticated;
