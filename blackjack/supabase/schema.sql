-- CountLab per-account data schema. Apply in the Supabase SQL editor; the
-- statements are idempotent so this file can also upgrade an installation.
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

create table if not exists journal_bankrolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  name text not null,
  starting_amount numeric,
  archived boolean not null default false
);

create table if not exists journal_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  bankroll_id uuid references journal_bankrolls (id) on delete set null,
  created_at timestamptz not null default now(),
  date date not null,
  location text,
  hours numeric not null,
  hands_per_hour numeric not null,
  player_hands numeric not null,
  hands_by_true_count jsonb,
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
  bankroll_id uuid references journal_bankrolls (id) on delete set null,
  created_at timestamptz not null default now(),
  date date not null,
  type text not null check (type in ('deposit', 'withdrawal')),
  amount numeric not null,
  note text
);

create index if not exists drill_sessions_user_id_idx on drill_sessions (user_id);
create index if not exists drill_progress_user_id_idx on drill_progress (user_id);
create index if not exists journal_bankrolls_user_id_idx on journal_bankrolls (user_id);
create index if not exists journal_sessions_user_id_idx on journal_sessions (user_id);
create index if not exists journal_transactions_user_id_idx on journal_transactions (user_id);

alter table settings enable row level security;
alter table drill_sessions enable row level security;
alter table drill_progress enable row level security;
alter table journal_bankrolls enable row level security;
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

drop policy if exists "journal_bankrolls owner select" on journal_bankrolls;
create policy "journal_bankrolls owner select" on journal_bankrolls for select using (auth.uid() = user_id);
drop policy if exists "journal_bankrolls owner insert" on journal_bankrolls;
create policy "journal_bankrolls owner insert" on journal_bankrolls for insert with check (auth.uid() = user_id);
drop policy if exists "journal_bankrolls owner update" on journal_bankrolls;
create policy "journal_bankrolls owner update" on journal_bankrolls for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "journal_bankrolls owner delete" on journal_bankrolls;
create policy "journal_bankrolls owner delete" on journal_bankrolls for delete using (auth.uid() = user_id);

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

create or replace function rl_journal_bankrolls() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform enforce_rate_limit('journal_bankrolls_write', 30, interval '1 minute');
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

drop trigger if exists journal_bankrolls_rate_limit on journal_bankrolls;
create trigger journal_bankrolls_rate_limit before insert on journal_bankrolls
  for each row execute function rl_journal_bankrolls();

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

alter table journal_bankrolls drop constraint if exists journal_bankrolls_size_limit;
alter table journal_bankrolls add constraint journal_bankrolls_size_limit check (char_length(name) < 200);

alter table journal_sessions add column if not exists hands_by_true_count jsonb;

-- The first journal schema shipped before multi-bankroll support. `create table
-- if not exists` intentionally does not change an existing table, so explicitly
-- add these fields for projects created with that earlier schema.
alter table journal_sessions add column if not exists bankroll_id uuid;
alter table journal_transactions add column if not exists bankroll_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'journal_sessions_bankroll_id_fkey'
      and conrelid = 'public.journal_sessions'::regclass
  ) then
    alter table journal_sessions
      add constraint journal_sessions_bankroll_id_fkey
      foreign key (bankroll_id) references journal_bankrolls (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'journal_transactions_bankroll_id_fkey'
      and conrelid = 'public.journal_transactions'::regclass
  ) then
    alter table journal_transactions
      add constraint journal_transactions_bankroll_id_fkey
      foreign key (bankroll_id) references journal_bankrolls (id) on delete set null;
  end if;
end $$;

alter table journal_sessions drop constraint if exists journal_sessions_size_limit;
alter table journal_sessions add constraint journal_sessions_size_limit check (
  pg_column_size(rules) < 5000 and pg_column_size(ramp) < 20000 and pg_column_size(hands_by_true_count) < 20000 and char_length(coalesce(notes, '')) < 5000 and char_length(coalesce(location, '')) < 200
);

alter table journal_transactions drop constraint if exists journal_transactions_size_limit;
alter table journal_transactions add constraint journal_transactions_size_limit check (char_length(coalesce(note, '')) < 5000);

-- Analytics ---------------------------------------------------------------
-- Base event storage. The compatibility definitions below are subsequently
-- tightened by the comprehensive upgrade: browser insert grants are revoked
-- and all writes pass through the trusted Edge ingestion RPCs.

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

-- Developer/test accounts can be excluded without granting them dashboard access.
create table if not exists analytics_internal_users (
  user_id uuid primary key references auth.users on delete cascade,
  reason text not null default 'internal',
  created_at timestamptz not null default now(),
  check (char_length(reason) between 1 and 100)
);
alter table analytics_internal_users enable row level security;
drop policy if exists "analytics internal users admin select" on analytics_internal_users;
create policy "analytics internal users admin select" on analytics_internal_users for select using (is_admin());

create or replace function is_analytics_internal(p_user_id uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select p_user_id is not null and (
    exists(select 1 from admin_users where user_id=p_user_id)
    or exists(select 1 from analytics_internal_users where user_id=p_user_id)
  );
$$;
revoke all on function is_analytics_internal(uuid) from public, anon, authenticated;

drop policy if exists "admin_users self select" on admin_users;
create policy "admin_users self select" on admin_users for select using (auth.uid() = user_id);

drop policy if exists "analytics_events admin select" on analytics_events;
create policy "analytics_events admin select" on analytics_events for select using (is_admin());

-- No admin is seeded by default. Grant access by running the statement below
-- with your own address, once that account has signed up at least once:
--   insert into admin_users (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;

-- Admin analytics RPCs are security-definer functions which check is_admin()
-- internally. Visitor output is pseudonymous and intentionally excludes email.

grant execute on function is_admin() to authenticated;

-- Comprehensive analytics upgrade -----------------------------------------
-- This section upgrades installations created by older versions of this file
-- in place. It is intentionally idempotent so the full schema remains safe to
-- re-run from the Supabase SQL editor.

alter table analytics_events add column if not exists event_id uuid;
alter table analytics_events add column if not exists occurred_at timestamptz;
alter table analytics_events add column if not exists environment text;
alter table analytics_events add column if not exists app_version text;
alter table analytics_events add column if not exists context jsonb;
alter table analytics_events add column if not exists is_bot boolean;
alter table analytics_events add column if not exists is_internal boolean;

update analytics_events set
  event_id = coalesce(event_id, id),
  occurred_at = coalesce(occurred_at, created_at),
  environment = coalesce(environment, 'production'),
  app_version = coalesce(app_version, 'legacy'),
  context = coalesce(context, '{}'::jsonb),
  properties = coalesce(properties, '{}'::jsonb),
  is_bot = coalesce(is_bot, false),
  is_internal = coalesce(is_internal, false)
where event_id is null or occurred_at is null or environment is null
   or app_version is null or context is null or properties is null
   or is_bot is null or is_internal is null;

alter table analytics_events alter column event_id set default gen_random_uuid();
alter table analytics_events alter column event_id set not null;
alter table analytics_events alter column occurred_at set default now();
alter table analytics_events alter column occurred_at set not null;
alter table analytics_events alter column environment set default 'production';
alter table analytics_events alter column environment set not null;
alter table analytics_events alter column app_version set default 'unknown';
alter table analytics_events alter column app_version set not null;
alter table analytics_events alter column context set default '{}'::jsonb;
alter table analytics_events alter column context set not null;
alter table analytics_events alter column properties set default '{}'::jsonb;
alter table analytics_events alter column properties set not null;
alter table analytics_events alter column is_bot set default false;
alter table analytics_events alter column is_bot set not null;
alter table analytics_events alter column is_internal set default false;
alter table analytics_events alter column is_internal set not null;

create unique index if not exists analytics_events_event_id_uidx on analytics_events (event_id);
create index if not exists analytics_events_occurred_at_idx on analytics_events (occurred_at desc);
create index if not exists analytics_events_anon_id_idx on analytics_events (anon_id);
create index if not exists analytics_events_session_id_idx on analytics_events (session_id);
create index if not exists analytics_events_clean_idx on analytics_events (occurred_at desc, event)
  where environment = 'production' and not is_bot and not is_internal;
create index if not exists analytics_events_properties_gin_idx on analytics_events using gin (properties jsonb_path_ops);

alter table analytics_events drop constraint if exists analytics_events_size_limit;
alter table analytics_events add constraint analytics_events_size_limit check (
  pg_column_size(properties) <= 8192
  and pg_column_size(context) <= 8192
  and char_length(event) <= 80
  and char_length(anon_id) between 8 and 100
  and char_length(session_id) between 8 and 100
  and char_length(coalesce(path, '')) <= 240
  and jsonb_typeof(properties) = 'object'
  and jsonb_typeof(context) = 'object'
);
alter table analytics_events drop constraint if exists analytics_events_environment_check;
alter table analytics_events add constraint analytics_events_environment_check
  check (environment in ('development', 'staging', 'production'));

create table if not exists analytics_aliases (
  anon_id text not null,
  user_id uuid not null references auth.users on delete cascade,
  first_linked_at timestamptz not null default now(),
  last_linked_at timestamptz not null default now(),
  primary key (anon_id, user_id),
  check (char_length(anon_id) between 8 and 100)
);
create index if not exists analytics_aliases_user_idx on analytics_aliases (user_id);
alter table analytics_aliases enable row level security;
drop policy if exists "analytics aliases insert own" on analytics_aliases;
create policy "analytics aliases insert own" on analytics_aliases for insert
  with check (auth.uid() = user_id);
drop policy if exists "analytics aliases update own" on analytics_aliases;
create policy "analytics aliases update own" on analytics_aliases for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "analytics aliases admin select" on analytics_aliases;
create policy "analytics aliases admin select" on analytics_aliases for select using (is_admin());

create table if not exists analytics_sessions (
  session_id text primary key,
  anon_id text not null,
  user_id uuid references auth.users on delete set null,
  started_at timestamptz not null,
  last_activity_at timestamptz not null,
  ended_at timestamptz,
  duration_ms bigint not null default 0,
  engaged_ms bigint not null default 0,
  page_views integer not null default 0,
  events integer not null default 0,
  meaningful_events integer not null default 0,
  first_path text not null default '/',
  last_path text not null default '/',
  is_first_session boolean not null default false,
  bounced boolean not null default false,
  authenticated boolean not null default false,
  channel text,
  referrer_domain text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_type text,
  browser text,
  os text,
  country text,
  region text,
  environment text not null default 'production',
  app_version text not null default 'unknown',
  is_bot boolean not null default false,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(session_id) between 8 and 100),
  check (char_length(anon_id) between 8 and 100),
  check (duration_ms >= 0 and engaged_ms >= 0 and page_views >= 0 and events >= 0 and meaningful_events >= 0),
  check (environment in ('development', 'staging', 'production'))
);
alter table analytics_sessions add column if not exists meaningful_events integer not null default 0;
alter table analytics_sessions drop constraint if exists analytics_sessions_meaningful_events_check;
alter table analytics_sessions add constraint analytics_sessions_meaningful_events_check check (meaningful_events >= 0);
create index if not exists analytics_sessions_started_idx on analytics_sessions (started_at desc);
create index if not exists analytics_sessions_user_idx on analytics_sessions (user_id);
create index if not exists analytics_sessions_anon_idx on analytics_sessions (anon_id);
create index if not exists analytics_sessions_clean_idx on analytics_sessions (started_at desc)
  where environment = 'production' and not is_bot and not is_internal;
alter table analytics_sessions enable row level security;
drop policy if exists "analytics sessions admin select" on analytics_sessions;
create policy "analytics sessions admin select" on analytics_sessions for select using (is_admin());

create or replace function analytics_redact(input jsonb) returns jsonb
language sql immutable parallel safe as $$
  select coalesce(jsonb_object_agg(key,
    case when jsonb_typeof(value) = 'string' then
      to_jsonb(left(regexp_replace(regexp_replace(value #>> '{}',
        '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', '<email>', 'gi'),
        '(\+?[0-9][0-9(). -]{7,}[0-9])', '<phone>', 'g'), 500))
    else value end
  ), '{}'::jsonb)
  from jsonb_each(coalesce(input, '{}'::jsonb))
  where key !~* '(pass(word|wd|phrase)?|secret|token|jwt|api[-_]?key|authorization|credential|cookie|cvv|ssn|credit[-_]?card|card[-_]?number|e[-_]?mail|phone[-_]?number)';
$$;

create or replace function analytics_values_safe(input jsonb) returns boolean
language sql immutable parallel safe as $$
  select (select count(*)<=40 from jsonb_each(coalesce(input,'{}'::jsonb)))
    and not exists(
      select 1 from jsonb_each(coalesce(input,'{}'::jsonb)) property
      where not (
        jsonb_typeof(property.value) in ('string','number','boolean','null')
        or (jsonb_typeof(property.value)='array' and jsonb_array_length(property.value)<=20 and not exists(
          select 1 from jsonb_array_elements(property.value) element where jsonb_typeof(element) not in ('string','number')
        ))
      )
    );
$$;

create or replace function analytics_ingest_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed constant text[] := array[
    'session_started','session_ended','page_viewed','navigated','element_clicked',
    'dead_click_detected','rage_click_detected','scroll_depth_reached',
    'feature_opened','feature_completed','feature_abandoned','feature_restarted','feature_reset',
    'practice_started','question_answered','practice_completed','practice_abandoned',
    'practice_restarted','question_presented','answer_skipped','difficulty_changed','practice_mode_changed',
    'hint_used','solution_viewed','hand_started','hand_decision','hand_completed',
    'calculator_opened','calculation_input_changed','calculation_run','calculation_repeated','preset_selected','simulation_started',
    'simulation_completed','simulation_cancelled','settings_changed','result_viewed',
    'result_saved','result_shared','result_expanded','result_copied','history_viewed','history_deleted',
    'data_exported','data_imported','data_cleared','search_performed','search_result_selected','search_abandoned',
    'filter_applied','sort_changed','tab_changed','content_opened','content_section_viewed','content_completed','content_feature_launched',
    'form_opened','form_started','form_validation_failed','form_submitted','form_succeeded','form_failed','form_abandoned',
    'signup_started','signup_completed','signup_failed',
    'login_succeeded','login_failed','logout','guest_mode_entered','auth_session_expired',
    'password_reset_started','password_reset_completed','password_reset_failed','consent_updated','conversion_completed','client_error',
    'web_vital','performance_metric','api_request_completed','api_request_failed','experiment_exposure',
    'feature_flag_exposure'
  ];
begin
  if not (new.event = any(allowed)) then
    raise exception 'unsupported analytics event' using errcode = '22023';
  end if;
  if not analytics_values_safe(new.properties) or not analytics_values_safe(new.context) then
    raise exception 'unsupported analytics property type' using errcode='22023';
  end if;
  if new.event = 'signup_completed' and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'server-owned analytics event' using errcode = '42501';
  end if;

  new.event_id := coalesce(new.event_id, gen_random_uuid());
  new.created_at := now();
  new.occurred_at := case
    when new.occurred_at is null or new.occurred_at < now() - interval '7 days'
      or new.occurred_at > now() + interval '10 minutes' then now()
    else new.occurred_at end;
  if new.event <> 'signup_completed' and coalesce(auth.role(), '') <> 'service_role' then new.user_id := auth.uid(); end if;
  new.is_internal := is_analytics_internal(coalesce(new.user_id, auth.uid()));
  new.properties := analytics_redact(new.properties);
  new.context := analytics_redact(new.context);
  new.path := left(regexp_replace(split_part(split_part(coalesce(new.path, '/'), '?', 1), '#', 1),
    '[0-9a-f]{8}-[0-9a-f-]{27,}', ':id', 'gi'), 240);

  if new.event in ('practice_started','question_answered','practice_completed')
     and not (new.properties ? 'drill') then
    raise exception 'missing drill property' using errcode = '22023';
  end if;
  if new.event = 'question_answered' and
     (coalesce(jsonb_typeof(new.properties->'correct'),'missing')<>'boolean'
      or coalesce(jsonb_typeof(new.properties->'response_time_ms'),'missing')<>'number'
      or coalesce(jsonb_typeof(new.properties->'attempt'),'missing')<>'number'
      or coalesce(jsonb_typeof(new.properties->'streak'),'missing')<>'number'
      or (new.properties->>'response_time_ms')::numeric<0) then
    raise exception 'missing answer properties' using errcode = '22023';
  end if;
  if new.event = 'practice_completed' and (
      coalesce(jsonb_typeof(new.properties->'questions'),'missing')<>'number' or coalesce(jsonb_typeof(new.properties->'correct'),'missing')<>'number'
      or coalesce(jsonb_typeof(new.properties->'accuracy'),'missing')<>'number' or coalesce(jsonb_typeof(new.properties->'duration_ms'),'missing')<>'number') then
    raise exception 'invalid practice completion' using errcode='22023';
  end if;
  if new.event = 'page_viewed' and (
      coalesce(jsonb_typeof(new.properties->'route'),'missing')<>'string' or coalesce(jsonb_typeof(new.properties->'view_count'),'missing')<>'number'
      or coalesce(jsonb_typeof(new.properties->'is_first_view'),'missing')<>'boolean') then
    raise exception 'missing route property' using errcode = '22023';
  end if;
  if new.event in ('web_vital','performance_metric') and coalesce(jsonb_typeof(new.properties->'value'),'missing')<>'number'
     and coalesce(jsonb_typeof(new.properties->'value_ms'),'missing')<>'number' then
    raise exception 'invalid performance value' using errcode='22023';
  end if;
  if new.event in ('api_request_completed','api_request_failed') and coalesce(jsonb_typeof(new.properties->'duration_ms'),'missing')<>'number' then
    raise exception 'invalid api duration' using errcode='22023';
  end if;
  if new.event='content_completed' and coalesce(jsonb_typeof(new.properties->'engaged_ms'),'missing')<>'number' then
    raise exception 'invalid content duration' using errcode='22023';
  end if;
  return new;
end;
$$;

drop trigger if exists analytics_events_ingest on analytics_events;
create trigger analytics_events_ingest before insert on analytics_events
  for each row execute function analytics_ingest_event();

drop policy if exists "analytics_events insert own" on analytics_events;
create policy "analytics_events insert own" on analytics_events for insert
  with check (user_id is null or user_id = auth.uid());
revoke insert on analytics_events from anon, authenticated;
revoke insert, update on analytics_aliases from anon, authenticated;

create or replace function analytics_upsert_session(p_session jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_session->>'session_id', '')) not between 8 and 100
     or char_length(coalesce(p_session->>'anon_id', '')) not between 8 and 100 then
    raise exception 'invalid analytics session' using errcode = '22023';
  end if;
  insert into analytics_sessions (
    session_id, anon_id, user_id, started_at, last_activity_at, ended_at,
    duration_ms, engaged_ms, page_views, events, meaningful_events, first_path, last_path,
    is_first_session, bounced, authenticated, channel, referrer_domain,
    utm_source, utm_medium, utm_campaign, device_type, browser, os, country,
    region, environment, app_version, is_bot, is_internal, updated_at
  ) values (
    p_session->>'session_id', p_session->>'anon_id', auth.uid(),
    (p_session->>'started_at')::timestamptz, (p_session->>'last_activity_at')::timestamptz,
    nullif(p_session->>'ended_at', '')::timestamptz,
    greatest(0, coalesce((p_session->>'duration_ms')::bigint, 0)),
    greatest(0, coalesce((p_session->>'engaged_ms')::bigint, 0)),
    greatest(0, coalesce((p_session->>'page_views')::integer, 0)),
    greatest(0, coalesce((p_session->>'events')::integer, 0)),
    greatest(0, coalesce((p_session->>'meaningful_events')::integer, 0)),
    left(coalesce(p_session->>'first_path', '/'), 240), left(coalesce(p_session->>'last_path', '/'), 240),
    coalesce((p_session->>'is_first_session')::boolean, false),
    coalesce((p_session->>'bounced')::boolean, false), auth.uid() is not null,
    left(p_session->>'channel', 80), left(p_session->>'referrer_domain', 120),
    left(p_session->>'utm_source', 100), left(p_session->>'utm_medium', 100),
    left(p_session->>'utm_campaign', 100), left(p_session->>'device_type', 30),
    left(p_session->>'browser', 50), left(p_session->>'os', 50),
    left(p_session->>'country', 10), left(p_session->>'region', 50),
    coalesce(p_session->>'environment', 'production'), left(coalesce(p_session->>'app_version', 'unknown'), 100),
    coalesce((p_session->>'is_bot')::boolean, false), is_admin(), now()
  )
  on conflict (session_id) do update set
    user_id = coalesce(auth.uid(), analytics_sessions.user_id),
    last_activity_at = greatest(analytics_sessions.last_activity_at, excluded.last_activity_at),
    -- A later foreground rollup reopens a provisional page-hide snapshot;
    -- timeout/sign-out snapshots remain final when no later activity arrives.
    ended_at = excluded.ended_at,
    duration_ms = greatest(analytics_sessions.duration_ms, excluded.duration_ms),
    engaged_ms = greatest(analytics_sessions.engaged_ms, excluded.engaged_ms),
    page_views = greatest(analytics_sessions.page_views, excluded.page_views),
    events = greatest(analytics_sessions.events, excluded.events),
    meaningful_events = greatest(analytics_sessions.meaningful_events, excluded.meaningful_events),
    last_path = excluded.last_path, bounced = excluded.bounced,
    authenticated = analytics_sessions.authenticated or auth.uid() is not null,
    is_internal = analytics_sessions.is_internal or excluded.is_internal,
    updated_at = now();
end;
$$;
revoke all on function analytics_upsert_session(jsonb) from public;
revoke execute on function analytics_upsert_session(jsonb) from anon, authenticated;

-- Trusted Edge Function ingestion -------------------------------------------
-- The Edge Function hashes the request IP with a rotating server secret and
-- passes only that irreversible key. Raw addresses never enter Postgres.
create table if not exists analytics_ingest_rate_limits (
  rate_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  event_count integer not null default 0,
  primary key (rate_key, window_start),
  check (char_length(rate_key) = 64),
  check (request_count >= 0 and event_count >= 0)
);
alter table analytics_ingest_rate_limits enable row level security;

-- Counts rejected requests without retaining their payload, IP, or identifiers.
create table if not exists analytics_ingest_rejections (
  id bigint generated always as identity primary key,
  observed_at timestamptz not null default now(),
  reason text not null,
  event_count integer not null default 1,
  check(reason ~ '^[a-z0-9_]{1,60}$'),
  check(event_count between 0 and 1000)
);
create index if not exists analytics_ingest_rejections_time_idx on analytics_ingest_rejections(observed_at desc);
alter table analytics_ingest_rejections enable row level security;
drop policy if exists "analytics ingest rejections admin select" on analytics_ingest_rejections;
create policy "analytics ingest rejections admin select" on analytics_ingest_rejections for select using(is_admin());
grant select on analytics_ingest_rejections to authenticated;

create or replace function analytics_enforce_ingest_rate(
  p_rate_key text, p_events integer, p_max_requests integer, p_max_events integer
) returns void
language plpgsql security definer set search_path = public as $$
declare usage analytics_ingest_rate_limits%rowtype;
begin
  if p_rate_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid rate key' using errcode = '22023';
  end if;
  delete from analytics_ingest_rate_limits where window_start < date_trunc('minute', now()) - interval '10 minutes';
  insert into analytics_ingest_rate_limits(rate_key, window_start, request_count, event_count)
  values (p_rate_key, date_trunc('minute', now()), 1, greatest(0, p_events))
  on conflict (rate_key, window_start) do update set
    request_count = analytics_ingest_rate_limits.request_count + 1,
    event_count = analytics_ingest_rate_limits.event_count + excluded.event_count
  returning * into usage;
  if usage.request_count > p_max_requests or usage.event_count > p_max_events then
    raise exception 'analytics rate limit exceeded' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function analytics_record_rejection(p_reason text,p_event_count integer default 1) returns void
language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  insert into analytics_ingest_rejections(reason,event_count)
  values(left(regexp_replace(lower(coalesce(p_reason,'unknown')),'[^a-z0-9_]+','_','g'),60),least(1000,greatest(0,p_event_count)));
end;
$$;
revoke all on function analytics_record_rejection(text,integer) from public,anon,authenticated;
grant execute on function analytics_record_rejection(text,integer) to service_role;

create or replace function analytics_link_identity(
  p_anon_id text,
  p_actor uuid,
  p_rate_key text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_actor is null or char_length(coalesce(p_anon_id, '')) not between 8 and 100 then
    raise exception 'invalid analytics identity' using errcode = '22023';
  end if;
  perform analytics_enforce_ingest_rate(p_rate_key, 1, 60, 120);
  insert into analytics_aliases(anon_id, user_id, first_linked_at, last_linked_at)
  values (p_anon_id, p_actor, now(), now())
  on conflict (anon_id, user_id) do update set last_linked_at = now();
end;
$$;
revoke all on function analytics_link_identity(text,uuid,text) from public, anon, authenticated;
grant execute on function analytics_link_identity(text,uuid,text) to service_role;

create or replace function analytics_delete_identity(
  p_anon_id text,
  p_actor uuid,
  p_rate_key text
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if char_length(coalesce(p_anon_id,'')) not between 8 and 100 then raise exception 'invalid analytics identity' using errcode='22023'; end if;
  perform analytics_enforce_ingest_rate(p_rate_key,1,20,20);
  if p_actor is null then
    delete from analytics_events where anon_id=p_anon_id and user_id is null;
    delete from analytics_sessions where anon_id=p_anon_id and user_id is null;
    delete from analytics_aliases where anon_id=p_anon_id;
  else
    delete from analytics_events where user_id=p_actor or anon_id=p_anon_id
      or anon_id in(select anon_id from analytics_aliases where user_id=p_actor);
    delete from analytics_sessions where user_id=p_actor or anon_id=p_anon_id
      or anon_id in(select anon_id from analytics_aliases where user_id=p_actor);
    delete from analytics_aliases where user_id=p_actor or anon_id=p_anon_id;
  end if;
end;
$$;
revoke all on function analytics_delete_identity(text,uuid,text) from public,anon,authenticated;
grant execute on function analytics_delete_identity(text,uuid,text) to service_role;

create or replace function analytics_ingest_batch(
  p_events jsonb,
  p_actor uuid,
  p_rate_key text,
  p_country text default null,
  p_region text default null,
  p_server_bot boolean default false
) returns integer
language plpgsql security definer set search_path = public as $$
declare item jsonb; inserted integer := 0; affected integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) not between 1 and 50 then
    raise exception 'invalid event batch' using errcode = '22023';
  end if;
  perform analytics_enforce_ingest_rate(p_rate_key, jsonb_array_length(p_events), 180, 1800);

  for item in select value from jsonb_array_elements(p_events)
  loop
    if coalesce(item->>'event', '') in ('signup_completed','account_deleted') then
      raise exception 'server-owned analytics event' using errcode = '42501';
    end if;
    if coalesce(item->>'event_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or char_length(coalesce(item->>'anon_id', '')) not between 8 and 100
       or char_length(coalesce(item->>'session_id', '')) not between 8 and 100
       or jsonb_typeof(coalesce(item->'properties', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(item->'context', '{}'::jsonb)) <> 'object' then
      raise exception 'malformed analytics event' using errcode = '22023';
    end if;

    insert into analytics_events(
      event_id, user_id, anon_id, session_id, event, path, properties,
      occurred_at, environment, app_version, context, is_bot, is_internal
    ) values (
      (item->>'event_id')::uuid, p_actor, item->>'anon_id', item->>'session_id', item->>'event',
      item->>'path', coalesce(item->'properties', '{}'::jsonb),
      coalesce(nullif(item->>'occurred_at', '')::timestamptz, now()),
      coalesce(item->>'environment', 'production'), left(coalesce(item->>'app_version', 'unknown'), 100),
      coalesce(item->'context', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'country', left(p_country, 10), 'region', left(p_region, 50)
      )),
      p_server_bot or coalesce((item->>'is_bot')::boolean, false), false
    ) on conflict (event_id) do nothing;
    get diagnostics affected = row_count;
    inserted := inserted + affected;
  end loop;
  return inserted;
end;
$$;
revoke all on function analytics_ingest_batch(jsonb,uuid,text,text,text,boolean) from public, anon, authenticated;
grant execute on function analytics_ingest_batch(jsonb,uuid,text,text,text,boolean) to service_role;

create or replace function analytics_ingest_session(
  p_session jsonb,
  p_actor uuid,
  p_rate_key text,
  p_country text default null,
  p_region text default null,
  p_server_bot boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if char_length(coalesce(p_session->>'session_id', '')) not between 8 and 100
     or char_length(coalesce(p_session->>'anon_id', '')) not between 8 and 100 then
    raise exception 'invalid analytics session' using errcode = '22023';
  end if;
  perform analytics_enforce_ingest_rate(p_rate_key, 1, 240, 2400);

  insert into analytics_sessions(
    session_id, anon_id, user_id, started_at, last_activity_at, ended_at,
    duration_ms, engaged_ms, page_views, events, meaningful_events, first_path, last_path,
    is_first_session, bounced, authenticated, channel, referrer_domain,
    utm_source, utm_medium, utm_campaign, device_type, browser, os, country,
    region, environment, app_version, is_bot, is_internal, updated_at
  ) values (
    p_session->>'session_id', p_session->>'anon_id', p_actor,
    (p_session->>'started_at')::timestamptz, (p_session->>'last_activity_at')::timestamptz,
    nullif(p_session->>'ended_at', '')::timestamptz,
    greatest(0, coalesce((p_session->>'duration_ms')::bigint, 0)),
    greatest(0, coalesce((p_session->>'engaged_ms')::bigint, 0)),
    greatest(0, coalesce((p_session->>'page_views')::integer, 0)),
    greatest(0, coalesce((p_session->>'events')::integer, 0)),
    greatest(0, coalesce((p_session->>'meaningful_events')::integer, 0)),
    left(coalesce(p_session->>'first_path', '/'), 240), left(coalesce(p_session->>'last_path', '/'), 240),
    coalesce((p_session->>'is_first_session')::boolean, false),
    coalesce((p_session->>'bounced')::boolean, false), p_actor is not null,
    left(p_session->>'channel', 80), left(p_session->>'referrer_domain', 120),
    left(p_session->>'utm_source', 100), left(p_session->>'utm_medium', 100), left(p_session->>'utm_campaign', 100),
    left(p_session->>'device_type', 30), left(p_session->>'browser', 50), left(p_session->>'os', 50),
    left(coalesce(p_country, p_session->>'country'), 10), left(coalesce(p_region, p_session->>'region'), 50),
    coalesce(p_session->>'environment', 'production'), left(coalesce(p_session->>'app_version', 'unknown'), 100),
    p_server_bot or coalesce((p_session->>'is_bot')::boolean, false),
    is_analytics_internal(p_actor), now()
  ) on conflict (session_id) do update set
    user_id = coalesce(excluded.user_id, analytics_sessions.user_id),
    last_activity_at = greatest(analytics_sessions.last_activity_at, excluded.last_activity_at),
    -- A later foreground rollup reopens a provisional page-hide snapshot;
    -- timeout/sign-out snapshots remain final when no later activity arrives.
    ended_at = excluded.ended_at,
    duration_ms = greatest(analytics_sessions.duration_ms, excluded.duration_ms),
    engaged_ms = greatest(analytics_sessions.engaged_ms, excluded.engaged_ms),
    page_views = greatest(analytics_sessions.page_views, excluded.page_views),
    events = greatest(analytics_sessions.events, excluded.events),
    meaningful_events = greatest(analytics_sessions.meaningful_events, excluded.meaningful_events),
    last_path = excluded.last_path, bounced = excluded.bounced,
    authenticated = analytics_sessions.authenticated or excluded.authenticated,
    country = coalesce(excluded.country, analytics_sessions.country),
    region = coalesce(excluded.region, analytics_sessions.region),
    is_bot = analytics_sessions.is_bot or excluded.is_bot,
    is_internal = analytics_sessions.is_internal or excluded.is_internal,
    updated_at = now()
  where analytics_sessions.anon_id = excluded.anon_id;
end;
$$;
revoke all on function analytics_ingest_session(jsonb,uuid,text,text,text,boolean) from public, anon, authenticated;
grant execute on function analytics_ingest_session(jsonb,uuid,text,text,text,boolean) to service_role;

-- Server-authoritative signup conversion. No email or auth metadata is copied.
create or replace function analytics_record_signup() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.analytics_events (
    user_id, anon_id, session_id, event, path, properties, context,
    environment, app_version, is_bot, is_internal
  ) values (
    new.id, 'account:' || new.id::text, 'signup:' || new.id::text,
    'signup_completed', '/', jsonb_build_object('method', coalesce(new.raw_app_meta_data->>'provider', 'password')),
    '{}'::jsonb, 'production', 'server', false, is_analytics_internal(new.id)
  ) on conflict (event_id) do nothing;
  return new;
end;
$$;
drop trigger if exists analytics_auth_signup on auth.users;
create trigger analytics_auth_signup after insert on auth.users
  for each row execute function analytics_record_signup();

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create or replace view analytics.events_clean as
select e.*,
  coalesce(e.user_id, linked.user_id) as resolved_user_id,
  coalesce(coalesce(e.user_id, linked.user_id)::text, 'anon:' || e.anon_id) as visitor_id
from public.analytics_events e
left join lateral (
  select a.user_id from public.analytics_aliases a
  where a.anon_id = e.anon_id order by a.last_linked_at desc limit 1
) linked on true
where e.environment = 'production' and not e.is_bot and not e.is_internal;

create or replace view analytics.sessions_clean as
select s.*,
  coalesce(s.user_id, linked.user_id) as resolved_user_id,
  coalesce(coalesce(s.user_id, linked.user_id)::text, 'anon:' || s.anon_id) as visitor_id
from public.analytics_sessions s
left join lateral (
  select a.user_id from public.analytics_aliases a
  where a.anon_id = s.anon_id order by a.last_linked_at desc limit 1
) linked on true
where s.environment = 'production' and not s.is_bot and not s.is_internal;

create or replace view analytics.daily_metrics as
with event_days as (
  select occurred_at::date as day, count(*) as events,
    count(distinct visitor_id) as visitors,
    count(*) filter (where event = 'page_viewed') as page_views,
    count(distinct visitor_id) filter (where event not in
      ('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected',
       'scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')) as active_users
  from analytics.events_clean group by 1
), session_days as (
  select started_at::date as day, count(*) as sessions,
    count(*) filter (where not bounced and engaged_ms >= 10000) as engaged_sessions,
    percentile_cont(.5) within group (order by duration_ms) as median_duration_ms,
    avg(engaged_ms) as avg_engaged_ms
  from analytics.sessions_clean group by 1
)
select e.day, e.visitors, e.active_users, e.events, e.page_views,
  coalesce(s.sessions, 0) as sessions, coalesce(s.engaged_sessions, 0) as engaged_sessions,
  coalesce(s.median_duration_ms, 0) as median_duration_ms,
  coalesce(s.avg_engaged_ms, 0) as avg_engaged_ms
from event_days e left join session_days s using (day);

create or replace view analytics.active_users as
select d.day::date as day,
  (select count(distinct visitor_id) from analytics.events_clean e
   where e.occurred_at::date = d.day::date and e.event not in
    ('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')) as dau,
  (select count(distinct visitor_id) from analytics.events_clean e
   where e.occurred_at::date between d.day::date - 6 and d.day::date and e.event not in
    ('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')) as wau,
  (select count(distinct visitor_id) from analytics.events_clean e
   where e.occurred_at::date between d.day::date - 29 and d.day::date and e.event not in
    ('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')) as mau
from generate_series(current_date - 399, current_date, interval '1 day') d(day);

create or replace view analytics.training_performance as
select properties->>'drill' as drill,
  count(*) filter (where event = 'question_answered') as attempts,
  round(100 * avg((properties->>'correct')::boolean::int)
    filter (where event = 'question_answered'), 1) as accuracy,
  percentile_cont(.5) within group (order by (properties->>'response_time_ms')::numeric)
    filter (where event = 'question_answered') as median_response_ms,
  percentile_cont(.9) within group (order by (properties->>'response_time_ms')::numeric)
    filter (where event = 'question_answered') as p90_response_ms,
  count(*) filter (where event = 'practice_started') as starts,
  count(*) filter (where event = 'practice_completed') as completions
from analytics.events_clean
where event in ('practice_started','question_answered','practice_completed')
group by properties->>'drill';

create or replace view analytics.scenario_difficulty as
select properties->>'drill' as drill, properties->>'scenario' as scenario,
  count(*) as attempts,
  count(*) filter (where not (properties->>'correct')::boolean) as misses,
  round(100 * avg((not (properties->>'correct')::boolean)::int), 1) as miss_rate,
  percentile_cont(.5) within group (order by (properties->>'response_time_ms')::numeric) as median_response_ms
from analytics.events_clean
where event = 'question_answered' and nullif(properties->>'scenario', '') is not null
group by properties->>'drill', properties->>'scenario';

create or replace view analytics.feature_usage as
select properties->>'feature' as feature,
  count(distinct visitor_id) as users, count(distinct session_id) as sessions,
  count(*) filter (where event = 'feature_opened') as opens,
  count(*) filter (where event = 'feature_completed') as completions,
  round(100.0 * count(*) filter (where event = 'feature_completed') /
    nullif(count(*) filter (where event = 'feature_opened'), 0), 1) as completion_rate
from analytics.events_clean
where event in ('feature_opened','feature_completed','feature_abandoned')
group by properties->>'feature';

create or replace view analytics.retention_cohorts as
with days as (
  select distinct visitor_id, occurred_at::date as active_day from analytics.events_clean
  where event not in ('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected',
    'scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')
), firsts as (
  select visitor_id, min(active_day) as cohort_day from days group by visitor_id
), cohort as (
  select date_trunc('week', f.cohort_day)::date as cohort_week, f.visitor_id, f.cohort_day,
    exists(select 1 from days d where d.visitor_id=f.visitor_id and d.active_day=f.cohort_day+1) as d1,
    exists(select 1 from days d where d.visitor_id=f.visitor_id and d.active_day=f.cohort_day+3) as d3,
    exists(select 1 from days d where d.visitor_id=f.visitor_id and d.active_day=f.cohort_day+7) as d7,
    exists(select 1 from days d where d.visitor_id=f.visitor_id and d.active_day=f.cohort_day+14) as d14,
    exists(select 1 from days d where d.visitor_id=f.visitor_id and d.active_day=f.cohort_day+30) as d30
  from firsts f
)
select cohort_week, count(*) as cohort_size,
  round(100*avg(d1::int) filter(where cohort_day <= current_date-1),1) as d1,
  round(100*avg(d3::int) filter(where cohort_day <= current_date-3),1) as d3,
  round(100*avg(d7::int) filter(where cohort_day <= current_date-7),1) as d7,
  round(100*avg(d14::int) filter(where cohort_day <= current_date-14),1) as d14,
  round(100*avg(d30::int) filter(where cohort_day <= current_date-30),1) as d30
from cohort group by cohort_week order by cohort_week desc;

-- One secured aggregate endpoint keeps raw event access out of dashboard code.
create or replace function admin_analytics_dashboard(
  p_start date default current_date - 29,
  p_end date default current_date,
  p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, analytics stable as $$
declare result jsonb;
begin
  if not is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_start > p_end or p_end - p_start > 400 then
    raise exception 'invalid analytics date range' using errcode = '22023';
  end if;

  with e as (
    select * from analytics.events_clean x
    where x.occurred_at >= p_start::timestamptz and x.occurred_at < (p_end + 1)::timestamptz
      and (not (p_filters ? 'device') or x.context->>'device_type' = p_filters->>'device')
      and (not (p_filters ? 'browser') or x.context->>'browser' = p_filters->>'browser')
      and (not (p_filters ? 'os') or x.context->>'os' = p_filters->>'os')
      and (not (p_filters ? 'country') or x.context->>'country' = p_filters->>'country')
      and (not (p_filters ? 'region') or x.context->>'region' = p_filters->>'region')
      and (not (p_filters ? 'channel') or x.context->>'channel' = p_filters->>'channel')
      and (not (p_filters ? 'campaign') or x.context->>'utm_campaign' = p_filters->>'campaign')
      and (not (p_filters ? 'app_version') or x.app_version = p_filters->>'app_version')
      and (not (p_filters ? 'auth') or (p_filters->>'auth' = 'authenticated') = (x.resolved_user_id is not null))
      and (not (p_filters ? 'feature') or exists(select 1 from analytics.feature_adoption_users f where f.visitor_id=x.visitor_id and f.feature=p_filters->>'feature'))
      and (not (p_filters ? 'drill') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'drill'=p_filters->>'drill'))
      and (not (p_filters ? 'rules_preset') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'rules_preset'=p_filters->>'rules_preset'))
      and (not (p_filters ? 'scenario') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'scenario'=p_filters->>'scenario'))
      and (not (p_filters ? 'lifecycle') or exists(select 1 from analytics.user_profiles p where p.visitor_id=x.visitor_id and p.lifecycle_state=p_filters->>'lifecycle'))
      and (not (p_filters ? 'visitor_type') or
        (p_filters->>'visitor_type'='new')=(select min(v.occurred_at)::date between p_start and p_end from analytics.events_clean v where v.visitor_id=x.visitor_id))
  ), s as (
    select * from analytics.sessions_clean x
    where x.started_at >= p_start::timestamptz and x.started_at < (p_end + 1)::timestamptz
      and (not (p_filters ? 'device') or x.device_type = p_filters->>'device')
      and (not (p_filters ? 'browser') or x.browser = p_filters->>'browser')
      and (not (p_filters ? 'os') or x.os = p_filters->>'os')
      and (not (p_filters ? 'country') or x.country = p_filters->>'country')
      and (not (p_filters ? 'region') or x.region = p_filters->>'region')
      and (not (p_filters ? 'channel') or x.channel = p_filters->>'channel')
      and (not (p_filters ? 'campaign') or x.utm_campaign = p_filters->>'campaign')
      and (not (p_filters ? 'app_version') or x.app_version = p_filters->>'app_version')
      and (not (p_filters ? 'auth') or (p_filters->>'auth' = 'authenticated') = (x.resolved_user_id is not null))
      and (not (p_filters ? 'feature') or exists(select 1 from analytics.feature_adoption_users f where f.visitor_id=x.visitor_id and f.feature=p_filters->>'feature'))
      and (not (p_filters ? 'drill') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'drill'=p_filters->>'drill'))
      and (not (p_filters ? 'rules_preset') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'rules_preset'=p_filters->>'rules_preset'))
      and (not (p_filters ? 'scenario') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'scenario'=p_filters->>'scenario'))
      and (not (p_filters ? 'lifecycle') or exists(select 1 from analytics.user_profiles p where p.visitor_id=x.visitor_id and p.lifecycle_state=p_filters->>'lifecycle'))
      and (not (p_filters ? 'visitor_type') or
        (p_filters->>'visitor_type'='new')=(select min(v.occurred_at)::date between p_start and p_end from analytics.events_clean v where v.visitor_id=x.visitor_id))
  ), visitor_first as (
    select visitor_id, min(occurred_at)::date first_day from analytics.events_clean group by visitor_id
  ), visitor_sessions as (
    select visitor_id, count(*) sessions from analytics.sessions_clean group by visitor_id
  )
  select jsonb_build_object(
    'overview', (select to_jsonb(o) from (
      select
        count(distinct visitor_id) as visitors,
        count(distinct visitor_id) filter (where resolved_user_id is not null) as authenticated_visitors,
        count(distinct visitor_id) filter (where event not in
          ('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')) as active_users,
        count(*) as events, count(*) filter (where event='page_viewed') as page_views,
        (select count(*) from s) as sessions,
        coalesce((select round(avg(engaged_ms)) from s),0) as avg_engaged_ms,
        coalesce((select round((percentile_cont(.5) within group (order by duration_ms))::numeric) from s),0) as median_session_ms,
        coalesce((select round(100.0*avg(bounced::int),1) from s),0) as bounce_rate,
        round(100.0 * count(distinct visitor_id) filter (where event='practice_completed') /
          nullif(count(distinct visitor_id),0),1) as activation_rate,
        (select count(distinct visitor_id) from analytics.sessions_clean live
          where live.last_activity_at>=now()-interval '5 minutes') as active_now,
        (select count(distinct visitor_id) from analytics.events_clean a where a.occurred_at >= current_date
          and a.event not in ('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')) as dau,
        (select count(distinct visitor_id) from analytics.events_clean a where a.occurred_at >= current_date-6
          and a.event not in ('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')) as wau,
        (select count(distinct visitor_id) from analytics.events_clean a where a.occurred_at >= current_date-29
          and a.event not in ('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')) as mau,
        count(distinct e.visitor_id) filter (where vf.first_day between p_start and p_end) as new_visitors,
        count(distinct e.visitor_id) filter (where vf.first_day < p_start) as returning_visitors
      from e left join visitor_first vf using(visitor_id)
    ) o),
    'daily', (select coalesce(jsonb_agg(to_jsonb(x) order by x."day"),'[]') from (
      select occurred_at::date as "day", count(distinct visitor_id) visitors,
        count(distinct visitor_id) filter (where event not in ('page_viewed','session_started','session_ended','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')) active_users,
        count(*) filter(where event='page_viewed') page_views, count(*) events,
        count(*) filter(where event='practice_completed') completed_practice
      from e group by 1 order by 1
    ) x),
    'funnel', (select jsonb_build_array(
      jsonb_build_object('stage','Visited','users',count(distinct visitor_id)),
      jsonb_build_object('stage','Opened trainer','users',count(distinct visitor_id) filter(where event='feature_opened' and properties->>'category'='training')),
      jsonb_build_object('stage','Started practice','users',count(distinct visitor_id) filter(where event='practice_started')),
      jsonb_build_object('stage','Answered','users',count(distinct visitor_id) filter(where event='question_answered')),
      jsonb_build_object('stage','Completed','users',count(distinct visitor_id) filter(where event='practice_completed'))
    ) from e),
    'training', (select coalesce(jsonb_agg(to_jsonb(x) order by x.attempts desc),'[]') from (
      select properties->>'drill' drill,
        count(*) filter(where event='question_answered') attempts,
        round(100*avg((properties->>'correct')::boolean::int) filter(where event='question_answered'),1) accuracy,
        round((percentile_cont(.5) within group(order by (properties->>'response_time_ms')::numeric)
          filter(where event='question_answered'))::numeric) median_response_ms,
        round((percentile_cont(.9) within group(order by (properties->>'response_time_ms')::numeric)
          filter(where event='question_answered'))::numeric) p90_response_ms,
        count(*) filter(where event='practice_started') starts,
        count(*) filter(where event='practice_completed') completions,
        round(100.0*count(*) filter(where event='practice_completed')/
          nullif(count(*) filter(where event='practice_started'),0),1) completion_rate,
        round(100*avg((properties->>'correct')::boolean::int) filter(where event='question_answered' and occurred_at >= p_start + ((p_end-p_start)/2)),1)
          - round(100*avg((properties->>'correct')::boolean::int) filter(where event='question_answered' and occurred_at < p_start + ((p_end-p_start)/2)),1) improvement_pp
      from e where event in('practice_started','question_answered','practice_completed')
        and (not(p_filters?'drill') or properties->>'drill'=p_filters->>'drill')
        and (not(p_filters?'rules_preset') or properties->>'rules_preset'=p_filters->>'rules_preset')
        and (not(p_filters?'scenario') or event<>'question_answered' or properties->>'scenario'=p_filters->>'scenario')
      group by properties->>'drill'
    ) x),
    'scenarios', (select coalesce(jsonb_agg(to_jsonb(x) order by x.miss_rate desc, x.attempts desc),'[]') from (
      select properties->>'drill' drill, properties->>'scenario' scenario, count(*) attempts,
        count(*) filter(where not (properties->>'correct')::boolean) misses,
        round(100*avg((not (properties->>'correct')::boolean)::int),1) miss_rate,
        round((percentile_cont(.5) within group(order by (properties->>'response_time_ms')::numeric))::numeric) median_response_ms
      from e where event='question_answered' and nullif(properties->>'scenario','') is not null
        and (not(p_filters?'drill') or properties->>'drill'=p_filters->>'drill')
        and (not(p_filters?'rules_preset') or properties->>'rules_preset'=p_filters->>'rules_preset')
        and (not(p_filters?'scenario') or properties->>'scenario'=p_filters->>'scenario')
      group by 1,2 order by 5 desc limit 30
    ) x),
    'features', (select coalesce(jsonb_agg(to_jsonb(x) order by x.users desc),'[]') from (
      select properties->>'feature' feature, count(distinct visitor_id) users,
        count(distinct session_id) sessions, count(*) filter(where event='feature_opened') opens,
        count(*) filter(where event='feature_completed') completions,
        round(100.0*count(*) filter(where event='feature_completed')/
          nullif(count(*) filter(where event='feature_opened'),0),1) completion_rate,
        round(count(*)::numeric/nullif(count(distinct visitor_id),0),1) uses_per_user
      from e where event in('feature_opened','feature_completed','feature_abandoned') group by 1
    ) x),
    'acquisition', (select coalesce(jsonb_agg(to_jsonb(x) order by x.visitors desc),'[]') from (
      select coalesce(channel,'unknown') channel, count(distinct visitor_id) visitors,
        count(*) sessions, count(distinct visitor_id) filter(where is_first_session) new_visitors,
        count(distinct visitor_id) filter(where vs.sessions > 1) returning_visitors
      from s left join visitor_sessions vs using(visitor_id) group by 1
    ) x),
    'pages', (select coalesce(jsonb_agg(to_jsonb(x) order by x.views desc),'[]') from (
      select properties->>'route' path, count(*) views, count(distinct visitor_id) visitors,
        count(distinct session_id) sessions
      from e where event='page_viewed' group by 1 limit 30
    ) x),
    'friction', (select coalesce(jsonb_agg(to_jsonb(x) order by x.occurrences desc),'[]') from (
      select path, coalesce(properties->>'analytics_id',properties->>'label','unknown') element,
        event kind, count(*) occurrences
      from e where event in('rage_click_detected','dead_click_detected') group by 1,2,3 limit 30
    ) x),
    'errors', (select coalesce(jsonb_agg(to_jsonb(x) order by x.occurrences desc),'[]') from (
      select properties->>'error_type' error_type, properties->>'message_normalized' message,
        path, count(*) occurrences, count(distinct visitor_id) affected_users,
        min(occurred_at) first_seen, max(occurred_at) last_seen
      from e where event='client_error' group by 1,2,3 limit 30
    ) x),
    'vitals', (select coalesce(jsonb_agg(to_jsonb(x) order by x.metric,x.path),'[]') from (
      select properties->>'metric' metric, path,
        round((percentile_cont(.5) within group(order by (properties->>'value')::numeric))::numeric,2) p50,
        round((percentile_cont(.75) within group(order by (properties->>'value')::numeric))::numeric,2) p75,
        round((percentile_cont(.95) within group(order by (properties->>'value')::numeric))::numeric,2) p95,
        count(*) samples
      from e where event='web_vital' group by 1,2
    ) x),
    'api', (select coalesce(jsonb_agg(to_jsonb(x) order by x.requests desc),'[]') from (
      select properties->>'service' service, properties->>'operation' operation, count(*) requests,
        round(100.0*count(*) filter(where event='api_request_failed')/count(*),1) error_rate,
        round((percentile_cont(.5) within group(order by (properties->>'duration_ms')::numeric))::numeric,1) p50_ms,
        round((percentile_cont(.95) within group(order by (properties->>'duration_ms')::numeric))::numeric,1) p95_ms,
        round((percentile_cont(.99) within group(order by (properties->>'duration_ms')::numeric))::numeric,1) p99_ms
      from e where event in('api_request_completed','api_request_failed') group by 1,2
    ) x),
    'quality', (select jsonb_build_object(
      'last_event_at', max(occurred_at),
      'events_24h', count(*) filter(where occurred_at >= now()-interval '24 hours'),
      'events_previous_24h', count(*) filter(where occurred_at >= now()-interval '48 hours' and occurred_at < now()-interval '24 hours'),
      'missing_required_properties', count(*) filter(where
        (event in('practice_started','question_answered','practice_completed') and not(properties ? 'drill'))
        or (event='question_answered' and (not(properties ? 'correct') or not(properties ? 'response_time_ms')))
        or (event='page_viewed' and not(properties ? 'route'))),
      'active_releases_7d', count(distinct app_version) filter(where occurred_at >= now()-interval '7 days'),
      'rejected_events_24h',(select coalesce(sum(event_count),0) from analytics_ingest_rejections where observed_at>=now()-interval '24 hours'),
      'rejections_by_reason',(select coalesce(jsonb_object_agg(reason,total),'{}'::jsonb) from (
        select reason,sum(event_count) total from analytics_ingest_rejections
        where observed_at>=now()-interval '24 hours' group by reason
      ) rejected)
    ) from analytics.events_clean),
    'retention', (select coalesce(jsonb_agg(to_jsonb(x) order by x.cohort_week desc),'[]') from (
      select * from analytics.retention_cohorts where cohort_week >= date_trunc('week',p_start)::date limit 16
    ) x),
    'segments', jsonb_build_object(
      'devices',(select coalesce(jsonb_agg(x),'[]') from (select distinct context->>'device_type' x from e where context ? 'device_type') q),
      'browsers',(select coalesce(jsonb_agg(x),'[]') from (select distinct context->>'browser' x from e where context ? 'browser') q),
      'os',(select coalesce(jsonb_agg(x),'[]') from (select distinct context->>'os' x from e where context ? 'os') q),
      'countries',(select coalesce(jsonb_agg(x),'[]') from (select distinct context->>'country' x from e where context ? 'country') q),
      'regions',(select coalesce(jsonb_agg(x),'[]') from (select distinct context->>'region' x from e where context ? 'region') q),
      'channels',(select coalesce(jsonb_agg(x),'[]') from (select distinct context->>'channel' x from e where context ? 'channel') q),
      'campaigns',(select coalesce(jsonb_agg(x),'[]') from (select distinct context->>'utm_campaign' x from e where context ? 'utm_campaign') q),
      'versions',(select coalesce(jsonb_agg(x),'[]') from (select distinct app_version x from e) q),
      'drills',(select coalesce(jsonb_agg(x),'[]') from (select distinct properties->>'drill' x from e where properties?'drill') q),
      'rules',(select coalesce(jsonb_agg(x),'[]') from (select distinct properties->>'rules_preset' x from e where properties?'rules_preset') q),
      'scenarios',(select coalesce(jsonb_agg(x),'[]') from (select distinct properties->>'scenario' x from e where properties?'scenario' order by 1 limit 250) q)
    ),
    'recent', (select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc),'[]') from (
      select event, path, occurred_at, left(visitor_id,20) visitor,
        properties - array['user_answer','correct_answer'] as properties
      from e where event not in('element_clicked','scroll_depth_reached','web_vital')
      order by occurred_at desc limit 50
    ) x)
  ) into result;
  return result;
end;
$$;
revoke all on function admin_analytics_dashboard(date,date,jsonb) from public;
grant execute on function admin_analytics_dashboard(date,date,jsonb) to authenticated;

create or replace function admin_analytics_realtime() returns jsonb
language sql security definer set search_path=public,analytics stable as $$
  select case when is_admin() then jsonb_build_object(
    'active_now',(select count(distinct visitor_id) from analytics.sessions_clean where last_activity_at>=now()-interval '5 minutes'),
    'recent',(select coalesce(jsonb_agg(to_jsonb(recent) order by occurred_at desc),'[]') from (
      select event,path,occurred_at,left(visitor_id,20) visitor,
        properties-array['user_answer','correct_answer'] properties
      from analytics.events_clean
      where occurred_at>=now()-interval '1 hour'
        and event not in('element_clicked','scroll_depth_reached','web_vital','performance_metric','api_request_completed')
      order by occurred_at desc limit 25
    ) recent)
  ) end;
$$;
revoke all on function admin_analytics_realtime() from public;
grant execute on function admin_analytics_realtime() to authenticated;

-- Admin-only visitor directory. Includes the auth account email (when the visitor is signed
-- in) alongside the pseudonymous visitor_id, so admins aren't stuck reading raw UUIDs.
-- Guarded by is_admin() and never exposed to non-admin roles or client analytics payloads;
-- individual timelines (admin_visitor_events below) still omit answer text.
drop function if exists admin_visitor_events(uuid, text);
drop function if exists admin_visitor_summary();
create function admin_visitor_summary()
returns table (visitor_id text, user_id uuid, email text, event_count bigint, session_count bigint,
  active_days bigint, first_seen timestamptz, last_seen timestamptz)
language sql security definer set search_path = public, analytics stable as $$
  select e.visitor_id, max(e.resolved_user_id::text)::uuid, max(u.email),
    count(*), count(distinct e.session_id),
    count(distinct e.occurred_at::date), min(e.occurred_at), max(e.occurred_at)
  from analytics.events_clean e
  left join auth.users u on u.id = e.resolved_user_id
  where is_admin()
  group by e.visitor_id order by max(e.occurred_at) desc limit 500;
$$;
create function admin_visitor_events(target_user_id uuid, target_anon_id text)
returns table (id uuid, event text, path text, properties jsonb, occurred_at timestamptz)
language sql security definer set search_path = public, analytics stable as $$
  select e.id, e.event, e.path,
    e.properties - array['user_answer','correct_answer'], e.occurred_at
  from analytics.events_clean e
  where is_admin() and (
    (target_user_id is not null and e.resolved_user_id=target_user_id)
    or (target_user_id is null and e.visitor_id=target_anon_id)
  ) order by e.occurred_at desc limit 500;
$$;
revoke all on function admin_visitor_summary() from public;
revoke all on function admin_visitor_events(uuid,text) from public;
grant execute on function admin_visitor_summary() to authenticated;
grant execute on function admin_visitor_events(uuid,text) to authenticated;

create or replace function analytics_delete_my_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  delete from analytics_events where user_id=auth.uid()
    or anon_id in(select anon_id from analytics_aliases where user_id=auth.uid());
  delete from analytics_sessions where user_id=auth.uid()
    or anon_id in(select anon_id from analytics_aliases where user_id=auth.uid());
  delete from analytics_aliases where user_id=auth.uid();
end;
$$;
revoke all on function analytics_delete_my_data() from public;
grant execute on function analytics_delete_my_data() to authenticated;

create table if not exists analytics_retention_settings (
  singleton boolean primary key default true check(singleton),
  raw_event_days integer not null default 400 check(raw_event_days between 30 and 3650),
  error_event_days integer not null default 180 check(error_event_days between 7 and 3650),
  session_days integer not null default 400 check(session_days between 30 and 3650),
  orphan_alias_days integer not null default 400 check(orphan_alias_days between 30 and 3650),
  rejection_days integer not null default 90 check(rejection_days between 7 and 3650),
  updated_at timestamptz not null default now()
);
insert into analytics_retention_settings(singleton) values(true) on conflict(singleton) do nothing;
alter table analytics_retention_settings enable row level security;
drop policy if exists "analytics retention settings admin" on analytics_retention_settings;
create policy "analytics retention settings admin" on analytics_retention_settings for all using(is_admin()) with check(is_admin());
grant select,update on analytics_retention_settings to authenticated;

create or replace function analytics_purge() returns jsonb
language plpgsql security definer set search_path = public as $$
declare events_deleted bigint; sessions_deleted bigint; aliases_deleted bigint;
  retention analytics_retention_settings%rowtype;
begin
  if not is_admin()
     and coalesce(auth.role(),'') <> 'service_role'
     and session_user not in ('postgres','supabase_admin') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  select * into strict retention from analytics_retention_settings where singleton;
  delete from analytics_events where
    (event='client_error' and created_at < now()-make_interval(days=>retention.error_event_days))
    or (event<>'client_error' and created_at < now()-make_interval(days=>retention.raw_event_days));
  get diagnostics events_deleted = row_count;
  delete from analytics_sessions where started_at < now()-make_interval(days=>retention.session_days);
  get diagnostics sessions_deleted = row_count;
  delete from analytics_aliases a where a.last_linked_at < now()-make_interval(days=>retention.orphan_alias_days)
    and not exists(select 1 from analytics_events e where e.anon_id=a.anon_id)
    and not exists(select 1 from analytics_sessions s where s.anon_id=a.anon_id);
  get diagnostics aliases_deleted = row_count;
  delete from analytics_ingest_rate_limits where window_start < now()-interval '1 day';
  delete from analytics_ingest_rejections where observed_at < now()-make_interval(days=>retention.rejection_days);
  return jsonb_build_object(
    'events_deleted',events_deleted,'sessions_deleted',sessions_deleted,'aliases_deleted',aliases_deleted,
    'policy',to_jsonb(retention)-'singleton'
  );
end;
$$;
revoke all on function analytics_purge() from public;
grant execute on function analytics_purge() to authenticated;

-- Advanced product intelligence --------------------------------------------
-- These remain derived from the canonical event stream, so thresholds and
-- definitions can evolve without rewriting raw history.

create or replace view analytics.user_profiles as
with event_rollup as (
  select visitor_id, max(resolved_user_id::text)::uuid as resolved_user_id,
    min(occurred_at) first_seen, max(occurred_at) last_seen,
    min(occurred_at) filter (where resolved_user_id is not null) first_authenticated_at,
    count(*) total_events, count(distinct occurred_at::date) active_days,
    count(*) filter (where event not in (
      'session_started','session_ended','page_viewed','navigated','element_clicked',
      'dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital',
      'performance_metric','api_request_completed','api_request_failed','client_error')) meaningful_events,
    (array_agg(context->>'first_touch_channel' order by occurred_at)
      filter (where nullif(context->>'first_touch_channel','') is not null))[1] acquisition_source,
    (array_agg(context->>'utm_source' order by occurred_at)
      filter (where nullif(context->>'utm_source','') is not null))[1] signup_source,
    (array_agg(coalesce(properties->>'feature',properties->>'drill') order by occurred_at)
      filter (where event in ('feature_opened','practice_started')))[1] first_feature,
    (array_agg(context->>'device_type' order by occurred_at)
      filter (where context ? 'device_type'))[1] first_device,
    (array_agg(context->>'country' order by occurred_at)
      filter (where context ? 'country'))[1] first_country,
    (array_agg(app_version order by occurred_at))[1] first_app_version
  from analytics.events_clean group by visitor_id
), session_gaps as (
  select visitor_id, started_at,
    extract(epoch from started_at - lag(started_at) over(partition by visitor_id order by started_at))/3600 gap_hours
  from analytics.sessions_clean
), session_rollup as (
  select visitor_id, count(*) sessions, avg(duration_ms) average_session_ms,
    (percentile_cont(.5) within group(order by duration_ms))::bigint as median_session_ms,
    avg(gap_hours) filter(where gap_hours is not null) average_gap_hours,
    bool_or(gap_hours >= 24*30 and started_at >= now()-interval '7 days') resurrected
  from analytics.sessions_clean left join session_gaps using(visitor_id,started_at)
  group by visitor_id
)
select e.visitor_id, e.resolved_user_id,
  u.created_at account_created_at, e.first_seen, e.last_seen, e.first_authenticated_at,
  coalesce(s.sessions,0) sessions, e.active_days, e.total_events, e.meaningful_events,
  coalesce(s.sessions,0) > 1 or e.active_days > 1 returning_user,
  case when e.resolved_user_id is null then 'anonymous'
       when a.user_id is not null then 'admin' else 'user' end user_role,
  case when e.resolved_user_id is null then 'anonymous' else 'active' end account_status,
  e.signup_source, e.acquisition_source, e.first_feature, e.first_device, e.first_country, e.first_app_version,
  s.average_session_ms, s.median_session_ms, s.average_gap_hours,
  case when e.last_seen >= now()-interval '7 days' then 'recently_active'
       when e.last_seen >= now()-interval '30 days' then 'slipping'
       else 'churned' end lifecycle_state,
  coalesce(s.resurrected,false) resurrected,
  -- appended, not inserted: CREATE OR REPLACE VIEW only allows adding columns at the end
  u.email
from event_rollup e
left join session_rollup s using(visitor_id)
left join auth.users u on u.id=e.resolved_user_id
left join admin_users a on a.user_id=e.resolved_user_id;

create or replace view analytics.feature_adoption_users as
with usage as (
  select visitor_id, coalesce(properties->>'feature',properties->>'drill',properties->>'calculator') feature,
    min(occurred_at) first_used_at, max(occurred_at) last_used_at,
    count(*) filter(where event in('feature_opened','practice_started','calculator_opened')) uses,
    count(distinct session_id) sessions,
    count(*) filter(where event in('feature_completed','practice_completed','calculation_run')) completions,
    count(*) filter(where event in('feature_abandoned','practice_abandoned')) abandonments
  from analytics.events_clean
  where event in('feature_opened','practice_started','calculator_opened','feature_completed',
    'practice_completed','calculation_run','feature_abandoned','practice_abandoned')
  group by 1,2
)
select u.*, p.resolved_user_id,
  extract(epoch from u.first_used_at-coalesce(p.account_created_at,p.first_seen))/3600 hours_to_first_use,
  u.uses > 1 repeat_user,
  exists(select 1 from analytics.events_clean e where e.visitor_id=u.visitor_id
    and coalesce(e.properties->>'feature',e.properties->>'drill',e.properties->>'calculator')=u.feature
    and e.occurred_at::date between u.first_used_at::date+7 and u.first_used_at::date+13) retained_week_1,
  exists(select 1 from analytics.events_clean e where e.visitor_id=u.visitor_id
    and coalesce(e.properties->>'feature',e.properties->>'drill',e.properties->>'calculator')=u.feature
    and e.occurred_at::date between u.first_used_at::date+28 and u.first_used_at::date+34) retained_month_1
from usage u join analytics.user_profiles p using(visitor_id)
where nullif(u.feature,'') is not null;

create or replace view analytics.training_mastery as
with ranked as (
  select visitor_id, properties->>'drill' drill, properties,
    occurred_at, row_number() over(partition by visitor_id,properties->>'drill' order by occurred_at desc) recent_rank
  from analytics.events_clean where event='question_answered'
), aggregate as (
  select visitor_id, drill, count(*) attempts,
    avg((properties->>'correct')::boolean::int) accuracy,
    (percentile_cont(.5) within group(order by (properties->>'response_time_ms')::numeric)) median_response_ms,
    max(occurred_at) last_practiced_at
  from ranked where recent_rank <= 50 group by 1,2
)
select *, round((100*accuracy*least(1,attempts/20.0)*
  case when last_practiced_at >= now()-interval '14 days' then 1
       when last_practiced_at >= now()-interval '30 days' then .85 else .65 end)::numeric,1) mastery_score,
  attempts >= 20 and accuracy >= .9 and last_practiced_at >= now()-interval '30 days' mastered
from aggregate;

create or replace view analytics.usage_time_series as
select 'hour'::text as grain, date_trunc('hour',occurred_at) as period,
  count(distinct visitor_id) active_users, count(distinct session_id) sessions,
  count(*) filter(where event='page_viewed') page_views,
  count(*) filter(where event not in('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error')) meaningful_actions
from analytics.events_clean group by 2
union all
select 'day', date_trunc('day',occurred_at), count(distinct visitor_id), count(distinct session_id),
  count(*) filter(where event='page_viewed'),
  count(*) filter(where event not in('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error'))
from analytics.events_clean group by 2
union all
select 'week', date_trunc('week',occurred_at), count(distinct visitor_id), count(distinct session_id),
  count(*) filter(where event='page_viewed'),
  count(*) filter(where event not in('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error'))
from analytics.events_clean group by 2
union all
select 'month', date_trunc('month',occurred_at), count(distinct visitor_id), count(distinct session_id),
  count(*) filter(where event='page_viewed'),
  count(*) filter(where event not in('session_started','session_ended','page_viewed','navigated','element_clicked','dead_click_detected','rage_click_detected','scroll_depth_reached','web_vital','performance_metric','api_request_completed','api_request_failed','client_error'))
from analytics.events_clean group by 2;

create or replace view analytics.north_star_weekly as
with firsts as (select visitor_id,min(occurred_at) first_seen from analytics.events_clean group by 1)
select date_trunc('week',e.occurred_at)::date as "week",
  count(distinct e.visitor_id) filter(where f.first_seen < date_trunc('week',e.occurred_at)) returning_users_completing_training,
  count(*) filter(where f.first_seen < date_trunc('week',e.occurred_at)) completed_training_sessions
from analytics.events_clean e join firsts f using(visitor_id)
where e.event='practice_completed' group by 1 order by 1 desc;

create or replace function admin_analytics_funnel(
  p_start date, p_end date, p_steps text[], p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,analytics stable as $$
declare result jsonb;
begin
  if not is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if coalesce(array_length(p_steps,1),0) not between 2 and 10 then
    raise exception 'funnels require 2-10 steps' using errcode='22023';
  end if;
  with recursive e as (
    select * from analytics.events_clean x where occurred_at>=p_start and occurred_at<p_end+1
      and (not(p_filters?'device') or context->>'device_type'=p_filters->>'device')
      and (not(p_filters?'browser') or context->>'browser'=p_filters->>'browser')
      and (not(p_filters?'os') or context->>'os'=p_filters->>'os')
      and (not(p_filters?'country') or context->>'country'=p_filters->>'country')
      and (not(p_filters?'region') or context->>'region'=p_filters->>'region')
      and (not(p_filters?'channel') or context->>'channel'=p_filters->>'channel')
      and (not(p_filters?'campaign') or context->>'utm_campaign'=p_filters->>'campaign')
      and (not(p_filters?'app_version') or app_version=p_filters->>'app_version')
      and (not(p_filters?'auth') or (p_filters->>'auth'='authenticated')=(resolved_user_id is not null))
      and (not(p_filters?'feature') or exists(select 1 from analytics.feature_adoption_users f where f.visitor_id=x.visitor_id and f.feature=p_filters->>'feature'))
      and (not(p_filters?'drill') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'drill'=p_filters->>'drill'))
      and (not(p_filters?'rules_preset') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'rules_preset'=p_filters->>'rules_preset'))
      and (not(p_filters?'scenario') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'scenario'=p_filters->>'scenario'))
      and (not(p_filters?'lifecycle') or exists(select 1 from analytics.user_profiles p where p.visitor_id=x.visitor_id and p.lifecycle_state=p_filters->>'lifecycle'))
      and (not(p_filters?'visitor_type') or (p_filters->>'visitor_type'='new')=
        (select min(v.occurred_at)::date between p_start and p_end from analytics.events_clean v where v.visitor_id=x.visitor_id))
  ), progress(visitor_id,step_index,reached_at,prior_at) as (
    select visitor_id,1,min(occurred_at),null::timestamptz from e where event=p_steps[1] group by visitor_id
    union all
    select p.visitor_id,p.step_index+1,n.reached_at,p.reached_at
    from progress p cross join lateral (
      select min(occurred_at) reached_at from e
      where visitor_id=p.visitor_id and event=p_steps[p.step_index+1] and occurred_at>=p.reached_at
    ) n where p.step_index<array_length(p_steps,1) and n.reached_at is not null
  ), aggregate as (
    select step_index,p_steps[step_index] event,count(*) users,
      (percentile_cont(.5) within group(order by extract(epoch from reached_at-prior_at)*1000)
        filter(where prior_at is not null))::bigint median_ms_from_prior
    from progress group by step_index
  ), staged as (
    select *,lag(users) over(order by step_index) prior_users from aggregate
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'step',step_index,'event',event,'users',users,
    'conversion_from_prior',round(100.0*users/nullif(prior_users,0),1),
    'median_ms_from_prior',median_ms_from_prior
  ) order by step_index),'[]') into result from staged;
  return result;
end;
$$;
revoke all on function admin_analytics_funnel(date,date,text[],jsonb) from public;
grant execute on function admin_analytics_funnel(date,date,text[],jsonb) to authenticated;

drop function if exists admin_analytics_cohorts(date,date,text);
create or replace function admin_analytics_cohorts(
  p_start date, p_end date, p_dimension text default 'acquisition', p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,analytics stable as $$
declare result jsonb;
begin
  if not is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_dimension not in ('acquisition','first_feature','device','country','app_version','auth_state','signup') then
    raise exception 'unsupported cohort dimension' using errcode='22023';
  end if;
  with profiles as (
    select *, case p_dimension
      when 'acquisition' then coalesce(acquisition_source,'unknown')
      when 'first_feature' then coalesce(first_feature,'unknown')
      when 'device' then coalesce(first_device,'unknown')
      when 'country' then coalesce(first_country,'unknown')
      when 'app_version' then coalesce(first_app_version,'unknown')
      when 'auth_state' then case when resolved_user_id is null then 'anonymous' else 'authenticated' end
      when 'signup' then case when account_created_at is null then 'no_account' else 'signed_up' end end segment,
      case when p_dimension='signup' and account_created_at is not null then account_created_at::date else first_seen::date end cohort_day
    from analytics.user_profiles p where
      (not(p_filters?'auth') or (p_filters->>'auth'='authenticated')=(p.resolved_user_id is not null))
      and (not(p_filters?'feature') or exists(select 1 from analytics.feature_adoption_users f where f.visitor_id=p.visitor_id and f.feature=p_filters->>'feature'))
      and (not(p_filters?'drill') or exists(select 1 from analytics.events_clean d where d.visitor_id=p.visitor_id and d.properties->>'drill'=p_filters->>'drill'))
      and (not(p_filters?'rules_preset') or exists(select 1 from analytics.events_clean d where d.visitor_id=p.visitor_id and d.properties->>'rules_preset'=p_filters->>'rules_preset'))
      and (not(p_filters?'scenario') or exists(select 1 from analytics.events_clean d where d.visitor_id=p.visitor_id and d.properties->>'scenario'=p_filters->>'scenario'))
      and (not(p_filters?'lifecycle') or p.lifecycle_state=p_filters->>'lifecycle')
      and (not(p_filters?'visitor_type') or (p_filters->>'visitor_type'='returning')=p.returning_user)
      and exists(select 1 from analytics.events_clean e where e.visitor_id=p.visitor_id
        and (not(p_filters?'device') or e.context->>'device_type'=p_filters->>'device')
        and (not(p_filters?'browser') or e.context->>'browser'=p_filters->>'browser')
        and (not(p_filters?'os') or e.context->>'os'=p_filters->>'os')
        and (not(p_filters?'country') or e.context->>'country'=p_filters->>'country')
        and (not(p_filters?'region') or e.context->>'region'=p_filters->>'region')
        and (not(p_filters?'channel') or e.context->>'channel'=p_filters->>'channel')
        and (not(p_filters?'campaign') or e.context->>'utm_campaign'=p_filters->>'campaign')
        and (not(p_filters?'app_version') or e.app_version=p_filters->>'app_version'))
  ), eligible as (
    select * from profiles where cohort_day between p_start and p_end
  ), retained as (
    select p.visitor_id,p.segment,p.cohort_day,
      exists(select 1 from analytics.events_clean e where e.visitor_id=p.visitor_id and e.occurred_at::date=p.cohort_day+1) d1,
      exists(select 1 from analytics.events_clean e where e.visitor_id=p.visitor_id and e.occurred_at::date=p.cohort_day+7) d7,
      exists(select 1 from analytics.events_clean e where e.visitor_id=p.visitor_id and e.occurred_at::date=p.cohort_day+30) d30,
      exists(select 1 from analytics.events_clean e where e.visitor_id=p.visitor_id and e.occurred_at::date between p.cohort_day+7 and p.cohort_day+13) week_1,
      exists(select 1 from analytics.events_clean e where e.visitor_id=p.visitor_id and e.occurred_at::date between p.cohort_day+30 and p.cohort_day+59) month_1
    from eligible p
  ), aggregate as (
    select date_trunc('week',cohort_day)::date as cohort_week,segment,count(*) cohort_size,
      round(100*avg(d1::int) filter(where cohort_day<=current_date-1),1) d1,
      round(100*avg(d7::int) filter(where cohort_day<=current_date-7),1) d7,
      round(100*avg(d30::int) filter(where cohort_day<=current_date-30),1) d30,
      round(100*avg(week_1::int) filter(where cohort_day<=current_date-13),1) week_1,
      round(100*avg(month_1::int) filter(where cohort_day<=current_date-59),1) month_1
    from retained group by 1,2
  )
  select coalesce(jsonb_agg(to_jsonb(aggregate) order by cohort_week desc,cohort_size desc),'[]') into result from aggregate;
  return result;
end;
$$;
revoke all on function admin_analytics_cohorts(date,date,text,jsonb) from public;
grant execute on function admin_analytics_cohorts(date,date,text,jsonb) to authenticated;

create table if not exists analytics_alert_rules (
  id uuid primary key default gen_random_uuid(),
  metric text unique not null,
  threshold numeric not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table analytics_alert_rules drop constraint if exists analytics_alert_rules_metric_check;
alter table analytics_alert_rules add constraint analytics_alert_rules_metric_check check(metric in(
  'analytics_silence_minutes','traffic_drop_percent','traffic_spike_percent','client_error_rate','api_p95_ms',
  'signup_conversion_drop_percent','ingest_rejection_count'
));
alter table analytics_alert_rules enable row level security;
drop policy if exists "analytics alert rules admin" on analytics_alert_rules;
create policy "analytics alert rules admin" on analytics_alert_rules for all using(is_admin()) with check(is_admin());
grant select,insert,update,delete on analytics_alert_rules to authenticated;
insert into analytics_alert_rules(metric,threshold) values
  ('analytics_silence_minutes',60),('traffic_drop_percent',50),('client_error_rate',5),
  ('traffic_spike_percent',200),('api_p95_ms',2000),('signup_conversion_drop_percent',40),('ingest_rejection_count',10)
on conflict(metric) do nothing;

create table if not exists analytics_alert_deliveries (
  metric text primary key references analytics_alert_rules(metric) on delete cascade,
  last_sent_at timestamptz not null,
  last_value numeric,
  delivery_count integer not null default 1
);
alter table analytics_alert_deliveries enable row level security;
drop policy if exists "analytics alert deliveries admin" on analytics_alert_deliveries;
create policy "analytics alert deliveries admin" on analytics_alert_deliveries for select using(is_admin());
grant select on analytics_alert_deliveries to authenticated;

create or replace function analytics_record_alert_deliveries(p_alerts jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if jsonb_typeof(p_alerts)<>'array' or jsonb_array_length(p_alerts)>20 then raise exception 'invalid alerts' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_alerts) loop
    insert into analytics_alert_deliveries(metric,last_sent_at,last_value,delivery_count)
    values(item->>'metric',now(),nullif(item->>'value','')::numeric,1)
    on conflict(metric) do update set last_sent_at=excluded.last_sent_at,last_value=excluded.last_value,
      delivery_count=analytics_alert_deliveries.delivery_count+1;
  end loop;
end;
$$;
revoke all on function analytics_record_alert_deliveries(jsonb) from public,anon,authenticated;
grant execute on function analytics_record_alert_deliveries(jsonb) to service_role;

create or replace function admin_analytics_alerts() returns jsonb
language plpgsql security definer set search_path=public,analytics stable as $$
declare result jsonb;
begin
  if not is_admin() and coalesce(auth.role(),'') <> 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  with metrics as (
    select 'analytics_silence_minutes' metric, extract(epoch from now()-coalesce(max(occurred_at),to_timestamp(0)))/60 value from analytics.events_clean
    union all select 'traffic_drop_percent', greatest(0,100*(1-
      count(distinct visitor_id) filter(where occurred_at>=now()-interval '24 hours')::numeric/
      nullif(count(distinct visitor_id) filter(where occurred_at>=now()-interval '48 hours' and occurred_at<now()-interval '24 hours'),0)))
      from analytics.events_clean
    union all select 'traffic_spike_percent', greatest(0,100*(
      count(distinct visitor_id) filter(where occurred_at>=now()-interval '24 hours')::numeric/
      nullif(count(distinct visitor_id) filter(where occurred_at>=now()-interval '48 hours' and occurred_at<now()-interval '24 hours'),0)-1))
      from analytics.events_clean
    union all select 'client_error_rate',100.0*count(*) filter(where event='client_error' and occurred_at>=now()-interval '1 hour')/
      nullif(count(*) filter(where occurred_at>=now()-interval '1 hour' and event not in('web_vital','performance_metric','element_clicked','scroll_depth_reached')),0)
      from analytics.events_clean
    union all select 'api_p95_ms',(percentile_cont(.95) within group(order by (properties->>'duration_ms')::numeric))
      from analytics.events_clean where event in('api_request_completed','api_request_failed') and occurred_at>=now()-interval '1 hour'
    union all select 'signup_conversion_drop_percent', greatest(0,100*(1-
      (count(*) filter(where event='signup_completed' and occurred_at>=now()-interval '24 hours')::numeric/
        nullif(count(*) filter(where event='signup_started' and occurred_at>=now()-interval '24 hours'),0))/
      nullif(count(*) filter(where event='signup_completed' and occurred_at>=now()-interval '48 hours' and occurred_at<now()-interval '24 hours')::numeric/
        nullif(count(*) filter(where event='signup_started' and occurred_at>=now()-interval '48 hours' and occurred_at<now()-interval '24 hours'),0),0)))
      from analytics.events_clean
    union all select 'ingest_rejection_count',coalesce(sum(event_count),0)::numeric
      from analytics_ingest_rejections where observed_at>=now()-interval '1 hour'
  )
  select coalesce(jsonb_agg(jsonb_build_object('metric',r.metric,'value',round(m.value::numeric,2),
    'threshold',r.threshold,'triggered',coalesce(m.value>r.threshold,false),
    'last_sent_at',d.last_sent_at,'delivery_count',coalesce(d.delivery_count,0)) order by r.metric),'[]')
  into result from analytics_alert_rules r left join metrics m using(metric)
    left join analytics_alert_deliveries d using(metric) where r.enabled;
  return result;
end;
$$;
revoke all on function admin_analytics_alerts() from public;
grant execute on function admin_analytics_alerts() to authenticated,service_role;

create or replace function admin_analytics_advanced(p_start date,p_end date,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,analytics stable as $$
declare result jsonb;
begin
  if not is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  with e as (
    select * from analytics.events_clean x where occurred_at>=p_start and occurred_at<p_end+1
      and (not(p_filters?'device') or context->>'device_type'=p_filters->>'device')
      and (not(p_filters?'browser') or context->>'browser'=p_filters->>'browser')
      and (not(p_filters?'os') or context->>'os'=p_filters->>'os')
      and (not(p_filters?'country') or context->>'country'=p_filters->>'country')
      and (not(p_filters?'region') or context->>'region'=p_filters->>'region')
      and (not(p_filters?'channel') or context->>'channel'=p_filters->>'channel')
      and (not(p_filters?'campaign') or context->>'utm_campaign'=p_filters->>'campaign')
      and (not(p_filters?'app_version') or app_version=p_filters->>'app_version')
      and (not(p_filters?'auth') or (p_filters->>'auth'='authenticated')=(resolved_user_id is not null))
      and (not(p_filters?'feature') or exists(select 1 from analytics.feature_adoption_users f where f.visitor_id=x.visitor_id and f.feature=p_filters->>'feature'))
      and (not(p_filters?'drill') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'drill'=p_filters->>'drill'))
      and (not(p_filters?'rules_preset') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'rules_preset'=p_filters->>'rules_preset'))
      and (not(p_filters?'scenario') or exists(select 1 from analytics.events_clean d where d.visitor_id=x.visitor_id and d.properties->>'scenario'=p_filters->>'scenario'))
      and (not(p_filters?'lifecycle') or exists(select 1 from analytics.user_profiles p where p.visitor_id=x.visitor_id and p.lifecycle_state=p_filters->>'lifecycle'))
      and (not(p_filters?'visitor_type') or (p_filters->>'visitor_type'='new')=
        (select min(v.occurred_at)::date between p_start and p_end from analytics.events_clean v where v.visitor_id=x.visitor_id))
  ), session_flags as (
    select session_id,visitor_id,
      bool_or(event='practice_started') practice_started,bool_or(event='question_answered') answered,
      bool_or(event='practice_completed') practice_completed,bool_or(event='calculator_opened') calculator_opened,
      bool_or(event='calculation_run') calculated,bool_or(event='signup_started') signup_started,
      bool_or(event='signup_completed') signup_completed
    from e group by 1,2
  ), ranked_paths as (
    select session_id,visitor_id,event,occurred_at,
      row_number() over(partition by session_id order by occurred_at) position
    from e where event not in('element_clicked','scroll_depth_reached','web_vital','performance_metric','api_request_completed')
  ), paths as (
    select session_id,string_agg(event,' -> ' order by occurred_at) path,
      bool_or(event='practice_completed') successful
    from ranked_paths where position<=8 group by session_id
  ), profiles as (
    select p.* from analytics.user_profiles p where exists(select 1 from e where e.visitor_id=p.visitor_id)
  ), adoption_profiles as (
    select f.* from analytics.feature_adoption_users f where exists(select 1 from e where e.visitor_id=f.visitor_id)
  ), mastery_profiles as (
    select m.* from analytics.training_mastery m where exists(select 1 from e where e.visitor_id=m.visitor_id)
  )
  select jsonb_build_object(
    'lifecycle',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
      select lifecycle_state,count(*) users,count(*) filter(where resurrected) resurrected
      from profiles group by 1 order by 2 desc) x),
    'identity',(select jsonb_build_object(
      'profiles',count(*),'authenticated',count(*) filter(where resolved_user_id is not null),
      'returning',count(*) filter(where returning_user),'resurrected',count(*) filter(where resurrected),
      'avg_active_days',round(avg(active_days),1),'avg_sessions',round(avg(sessions),1),
      'avg_meaningful_actions',round(avg(meaningful_events),1),'avg_gap_hours',round(avg(average_gap_hours)::numeric,1)
    ) from profiles),
    'activation',(select coalesce(jsonb_agg(to_jsonb(x) order by x.users desc),'[]') from (
      select event milestone,count(distinct visitor_id) users,
        round(avg(extract(epoch from occurred_at-p.first_seen)/60)::numeric,1) avg_minutes_to_milestone
      from e join analytics.user_profiles p using(visitor_id)
      where event in('practice_completed','calculation_run','settings_changed','feature_completed')
      group by event) x),
    'adoption',(select coalesce(jsonb_agg(to_jsonb(x) order by x.users desc),'[]') from (
      select feature,count(*) users,round(avg(hours_to_first_use)::numeric,1) avg_hours_to_first_use,
        round(100*avg(repeat_user::int),1) repeat_rate,round(100*avg(retained_week_1::int),1) week_1_retention,
        round(100*avg(retained_month_1::int),1) month_1_retention,
        round(avg(uses)::numeric,1) uses_per_user,round(100*avg((abandonments>0)::int),1) abandonment_rate
      from adoption_profiles group by feature) x),
    'mastery',(select coalesce(jsonb_agg(to_jsonb(x) order by x.avg_mastery desc),'[]') from (
      select drill,count(*) users,round(avg(100*accuracy)::numeric,1) recent_accuracy,
        round(avg(median_response_ms)::numeric) median_response_ms,round(avg(mastery_score),1) avg_mastery,
        round(100*avg(mastered::int),1) mastered_users
      from mastery_profiles where not(p_filters?'drill') or drill=p_filters->>'drill' group by drill) x),
    'power_users',(select jsonb_build_object('threshold',threshold,'users',count(*) filter(where meaningful_events>=threshold),
      'share',round(100.0*count(*) filter(where meaningful_events>=threshold)/nullif(count(*),0),1))
      from profiles cross join lateral(select percentile_cont(.9) within group(order by meaningful_events) threshold from profiles) q group by threshold),
    'journeys',(select coalesce(jsonb_agg(to_jsonb(x) order by x.sessions desc),'[]') from (
      select path,count(*) sessions,round(100*avg(successful::int),1) success_rate from paths group by path limit 20) x),
    'transitions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.transitions desc),'[]') from (
      select properties->>'from' from_path,properties->>'to' to_path,properties->>'mechanism' mechanism,count(*) transitions
      from e where event='navigated' group by 1,2,3 limit 30) x),
    'abandonment',(select jsonb_build_object(
      'practice_started_no_answer',count(*) filter(where practice_started and not answered),
      'practice_answered_no_completion',count(*) filter(where answered and not practice_completed),
      'calculator_opened_no_run',count(*) filter(where calculator_opened and not calculated),
      'signup_started_no_completion',count(*) filter(where signup_started and not signup_completed)
    ) from session_flags),
    'return_behavior',(select coalesce(jsonb_agg(to_jsonb(x) order by x.sessions desc),'[]') from (
      select r.event first_action,count(*) sessions from (
        select distinct on(e.session_id) e.session_id,e.event from e
        join analytics.sessions_clean s using(session_id) where not s.is_first_session
          and e.event not in('session_started','page_viewed','navigated','element_clicked','scroll_depth_reached','web_vital','performance_metric')
        order by e.session_id,e.occurred_at) r group by 1 limit 20) x),
    'friction_derived',(select coalesce(jsonb_agg(to_jsonb(x) order by x.occurrences desc),'[]') from (
      select kind,path,element,sum(occurrences) occurrences,count(*) affected_sessions from (
        select session_id,'repeated_back_navigation' kind,path,'browser_navigation' element,count(*) occurrences
        from e where event='navigated' and properties->>'mechanism'='back_forward'
        group by session_id,path having count(*)>=3
        union all
        select session_id,'repeated_action',path,coalesce(properties->>'analytics_id',properties->>'label','unknown'),count(*)
        from e where event='element_clicked'
        group by session_id,path,coalesce(properties->>'analytics_id',properties->>'label','unknown') having count(*)>=4
        union all
        select session_id,'repeated_validation_failure',path,coalesce(properties->>'form','unknown'),count(*)
        from e where event='form_validation_failed'
        group by session_id,path,coalesce(properties->>'form','unknown') having count(*)>=3
        union all
        select session_id,'rapid_page_bounce',(array_agg(path order by occurred_at))[1],'route_sequence',count(*)
        from e where event='page_viewed' group by session_id
        having count(*)>=3 and max(occurred_at)-min(occurred_at)<=interval '15 seconds'
      ) signals group by kind,path,element limit 40
    ) x),
    'pages_advanced',(select coalesce(jsonb_agg(to_jsonb(x) order by x.views desc),'[]') from (
      select e.properties->>'route' path,count(*) views,count(distinct e.visitor_id) visitors,
        count(distinct e.visitor_id) filter(where (e.properties->>'view_count')::int>1) repeat_visitors,
        count(*) filter(where e.properties->>'route'=s.first_path) entries,
        count(*) filter(where e.properties->>'route'=s.last_path) exits
      from e left join analytics.sessions_clean s using(session_id) where event='page_viewed' group by 1 order by 2 desc limit 50) x),
    'scenarios_advanced',(select coalesce(jsonb_agg(to_jsonb(x) order by x.correct_median_ms asc),'[]') from (
      select properties->>'drill' drill,properties->>'scenario' scenario,count(*) attempts,
        round((percentile_cont(.5) within group(order by (properties->>'response_time_ms')::numeric) filter(where (properties->>'correct')::boolean))::numeric) correct_median_ms,
        round((percentile_cont(.9) within group(order by (properties->>'response_time_ms')::numeric))::numeric) p90_ms,
        round(100*avg((properties->>'correct')::boolean::int),1) accuracy
      from e where event='question_answered' and properties?'scenario'
        and (not(p_filters?'drill') or properties->>'drill'=p_filters->>'drill')
        and (not(p_filters?'rules_preset') or properties->>'rules_preset'=p_filters->>'rules_preset')
        and (not(p_filters?'scenario') or properties->>'scenario'=p_filters->>'scenario')
      group by 1,2 having count(*)>=2 limit 50) x),
    'streaks',(select coalesce(jsonb_agg(to_jsonb(x) order by x.streak_bucket),'[]') from (
      select case when (properties->>'streak')::int>=10 then '10+' else properties->>'streak' end streak_bucket,count(*) answers
      from e where event='question_answered' and properties?'streak' group by 1) x),
    'content',(select coalesce(jsonb_agg(to_jsonb(x) order by x.opens desc),'[]') from (
      select properties->>'content' content,count(*) filter(where event='content_opened') opens,
        count(distinct visitor_id) users,count(*) filter(where event='content_completed') completions,
        round(100.0*count(*) filter(where event='content_completed')/nullif(count(*) filter(where event='content_opened'),0),1) completion_rate,
        count(*) filter(where event='content_feature_launched') feature_launches,
        round(avg((properties->>'engaged_ms')::numeric) filter(where event='content_completed')) avg_reading_ms
      from e where event in('content_opened','content_completed','content_feature_launched') group by 1) x),
    'calculators',(select coalesce(jsonb_agg(to_jsonb(x) order by x.opens desc),'[]') from (
      select coalesce(properties->>'calculator',properties->>'feature') calculator,
        count(*) filter(where event='calculator_opened') opens,count(*) filter(where event='calculation_input_changed') input_changes,
        count(*) filter(where event in('calculation_run','simulation_started')) runs,count(*) filter(where event='calculation_repeated') repeats,
        count(distinct visitor_id) users,count(distinct visitor_id) filter(where event='calculation_repeated') repeat_users
      from e where event in('calculator_opened','calculation_input_changed','calculation_run','simulation_started','calculation_repeated') group by 1) x),
    'experiments',(select coalesce(jsonb_agg(to_jsonb(x) order by x.experiment,x.variant),'[]') from (
      with exposure as (
        select visitor_id,properties->>'experiment' experiment,properties->>'variant' variant,min(occurred_at) exposed_at
        from e where event='experiment_exposure' group by 1,2,3
      ) select experiment,variant,count(*) users,
        count(*) filter(where exists(select 1 from e c where c.visitor_id=exposure.visitor_id and c.occurred_at>=exposure.exposed_at and c.event in('conversion_completed','practice_completed'))) conversions,
        round(100.0*count(*) filter(where exists(select 1 from e c where c.visitor_id=exposure.visitor_id and c.occurred_at>=exposure.exposed_at and c.event in('conversion_completed','practice_completed')))/nullif(count(*),0),1) conversion_rate,
        count(*) filter(where exists(select 1 from e c where c.visitor_id=exposure.visitor_id and c.occurred_at>=exposure.exposed_at and c.event='client_error')) users_with_errors
      from exposure group by 1,2) x),
    'feature_flags',(select coalesce(jsonb_agg(to_jsonb(x) order by x.flag,x.variation),'[]') from (
      select properties->>'flag' flag,properties->>'variation' variation,count(distinct visitor_id) users,
        count(distinct visitor_id) filter(where exists(select 1 from e c where c.visitor_id=e.visitor_id and c.event='client_error')) users_with_errors
      from e where event='feature_flag_exposure' group by 1,2) x),
    'peak_hours',(select coalesce(jsonb_agg(to_jsonb(x) order by x.active_users desc),'[]') from (
      select extract(isodow from occurred_at)::int as "weekday",extract(hour from occurred_at)::int as "hour",count(distinct visitor_id) active_users
      from e where event not in('web_vital','performance_metric','element_clicked','scroll_depth_reached') group by 1,2 limit 30) x),
    'time_series',(select coalesce(jsonb_agg(to_jsonb(x) order by period),'[]') from (
      select * from analytics.usage_time_series where grain in('week','month') and period>=p_start and period<p_end+1 order by period) x),
    'north_star',(select coalesce(jsonb_agg(to_jsonb(x) order by week),'[]') from (
      select * from analytics.north_star_weekly where week>=date_trunc('week',p_start)::date and week<=p_end) x)
  ) into result;
  return result;
end;
$$;
revoke all on function admin_analytics_advanced(date,date,jsonb) from public;
grant execute on function admin_analytics_advanced(date,date,jsonb) to authenticated;

create or replace function admin_visitor_profile(target_visitor_id text) returns jsonb
language sql security definer set search_path=public,analytics stable as $$
  select case when is_admin() then jsonb_build_object(
    'visitor_id',p.visitor_id,'email',p.email,'account_created_at',p.account_created_at,'first_seen',p.first_seen,
    'last_seen',p.last_seen,'first_authenticated_at',p.first_authenticated_at,'sessions',p.sessions,
    'active_days',p.active_days,'meaningful_events',p.meaningful_events,'returning_user',p.returning_user,
    'user_role',p.user_role,'account_status',p.account_status,'acquisition_source',p.acquisition_source,
    'signup_source',p.signup_source,'first_feature',p.first_feature,'lifecycle_state',p.lifecycle_state,
    'resurrected',p.resurrected,'average_gap_hours',p.average_gap_hours,
    'features',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from analytics.feature_adoption_users f where f.visitor_id=p.visitor_id),
    'mastery',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from analytics.training_mastery m where m.visitor_id=p.visitor_id)
  ) end from analytics.user_profiles p where p.visitor_id=target_visitor_id;
$$;
revoke all on function admin_visitor_profile(text) from public;
grant execute on function admin_visitor_profile(text) to authenticated;
