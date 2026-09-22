-- Public game directory. Apply after schema.sql's admin_users/is_admin definition.
-- Also included at the end of schema.sql for fresh installations.
begin;

create table if not exists public.directory_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('cbjn_pdf','manual','website','other')),
  label text not null check (char_length(label) between 1 and 300),
  issue_month date,
  file_sha256 text check (file_sha256 ~ '^[a-f0-9]{64}$'),
  source_url text,
  publication_clearance text not null default 'private' check (publication_clearance in ('private','public')),
  clearance_note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (file_sha256)
);

create table if not exists public.directory_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 250),
  aliases text[] not null default '{}',
  operator text,
  country text not null check (char_length(trim(country)) between 2 and 100),
  subdivision text,
  city text not null check (char_length(trim(city)) between 1 and 150),
  address text,
  website text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  coordinate_quality text not null default 'unknown' check (coordinate_quality in ('unknown','approximate','verified')),
  coordinate_source text,
  operating_status text not null default 'unknown' check (operating_status in ('open','closed','temporarily_closed','unknown')),
  game_availability text not null default 'unknown' check (game_availability in ('reported','none_reported','not_listed','unknown')),
  publication_status text not null default 'draft' check (publication_status in ('draft','published')),
  source_id uuid references public.directory_sources(id) on delete restrict,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz,
  check ((latitude is null) = (longitude is null)),
  check (latitude between -90 and 90),
  check (longitude between -180 and 180),
  check (coordinate_quality <> 'verified' or latitude is not null),
  check (char_length(coalesce(address,'')) <= 500),
  check (char_length(coalesce(website,'')) <= 500)
);

create table if not exists public.directory_games (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.directory_locations(id) on delete cascade,
  game_type text not null check (game_type in ('blackjack','spanish_21','other')),
  table_count integer check (table_count >= 0),
  decks numeric(4,1) check (decks > 0 and decks <= 16),
  decks_cut numeric(5,2) check (decks_cut >= 0 and decks is not null and decks_cut <= decks),
  min_bet numeric(12,2) check (min_bet >= 0),
  max_bet numeric(12,2) check (max_bet >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  payout text check (payout in ('3:2','6:5','1:1','other','unknown')),
  soft_17 text check (soft_17 in ('H17','S17','unknown')),
  double_rules text,
  double_after_split boolean,
  max_split_hands integer check (max_split_hands between 2 and 12),
  resplit_aces boolean,
  surrender text check (surrender in ('late','early','early_except_ace','mixed','none','unknown')),
  dealer_procedure text check (dealer_procedure in ('hole_card_peek','no_hole_card','no_peek','unknown')),
  dealer_blackjack_wager_treatment text check (dealer_blackjack_wager_treatment in ('all_bets_lost','original_bets_only','unknown')),
  mid_shoe_entry text check (mid_shoe_entry in ('allowed','restricted','not_allowed','unknown')),
  dealing_method text,
  shuffle_method text,
  reported_house_edge_pct numeric(7,3) check (reported_house_edge_pct between -100 and 100),
  availability text not null default 'reported' check (availability in ('reported','unavailable','unknown')),
  publication_status text not null default 'draft' check (publication_status in ('draft','published')),
  reported_month date,
  verified_at timestamptz,
  source_id uuid references public.directory_sources(id) on delete restrict,
  extra_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(extra_rules) = 'object' and pg_column_size(extra_rules) < 12000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz,
  check (max_bet is null or min_bet is null or max_bet >= min_bet),
  check (char_length(coalesce(double_rules,'')) <= 300),
  check (char_length(coalesce(dealing_method,'')) <= 150),
  check (char_length(coalesce(shuffle_method,'')) <= 150)
);

create table if not exists public.directory_notes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.directory_locations(id) on delete cascade,
  game_id uuid references public.directory_games(id) on delete cascade,
  category text not null default 'general',
  body text not null check (char_length(trim(body)) between 1 and 5000),
  audience text not null default 'admin' check (audience in ('admin','public')),
  reported_month date,
  source_id uuid references public.directory_sources(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

create table if not exists public.directory_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.directory_sources(id) on delete restrict,
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  parser_version text not null,
  status text not null default 'staged' check (status in ('staged','reviewing','ready','applying','applied','cancelled')),
  summary jsonb not null default '{}'::jsonb check (pg_column_size(summary) < 50000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (file_sha256, parser_version)
);

create table if not exists public.directory_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.directory_import_batches(id) on delete cascade,
  source_row_key text not null,
  page_number integer check (page_number > 0),
  region text,
  raw_location text,
  raw_game jsonb not null default '{}'::jsonb,
  normalized_location jsonb not null default '{}'::jsonb,
  normalized_game jsonb not null default '{}'::jsonb,
  validation_issues jsonb not null default '[]'::jsonb,
  decision text not null default 'pending' check (decision in ('pending','approve','reject','applied','conflict')),
  decision_reason text,
  matched_location_id uuid references public.directory_locations(id) on delete set null,
  matched_location_version integer,
  matched_game_id uuid references public.directory_games(id) on delete set null,
  matched_game_version integer,
  applied_location_id uuid references public.directory_locations(id) on delete set null,
  applied_game_id uuid references public.directory_games(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, source_row_key),
  check (pg_column_size(raw_game) < 20000 and pg_column_size(normalized_location) < 20000
    and pg_column_size(normalized_game) < 20000 and pg_column_size(validation_issues) < 20000)
);

create table if not exists public.directory_observations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.directory_sources(id) on delete restrict,
  import_row_id uuid references public.directory_import_rows(id) on delete set null,
  location_id uuid not null references public.directory_locations(id) on delete cascade,
  game_id uuid references public.directory_games(id) on delete cascade,
  report_date date,
  report_precision text not null default 'month' check (report_precision in ('day','month','unknown')),
  verified_at timestamptz,
  source_page integer check (source_page > 0),
  source_row_key text,
  original_values jsonb not null default '{}'::jsonb,
  inferred_defaults jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (source_id, source_row_key),
  check (pg_column_size(original_values) < 30000 and pg_column_size(inferred_defaults) < 15000)
);

create table if not exists public.directory_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  happened_at timestamptz not null default now(),
  action text not null,
  entity text not null,
  entity_id uuid,
  reason text,
  before_value jsonb,
  after_value jsonb
);

create index if not exists directory_locations_search_idx on public.directory_locations
  using gin (to_tsvector('simple', name || ' ' || city || ' ' || coalesce(subdivision,'') || ' ' || country));
create index if not exists directory_locations_visible_idx on public.directory_locations (publication_status, deleted_at, name);
create index if not exists directory_locations_geography_idx on public.directory_locations (latitude, longitude)
  where latitude is not null and deleted_at is null;
create index if not exists directory_games_location_idx on public.directory_games (location_id);
create index if not exists directory_games_filter_idx on public.directory_games
  (publication_status, deleted_at, game_type, decks, soft_17, currency, min_bet);
create index if not exists directory_games_report_idx on public.directory_games (reported_month desc);
create index if not exists directory_notes_location_idx on public.directory_notes (location_id, audience);
create index if not exists directory_import_rows_batch_idx on public.directory_import_rows (batch_id, decision);
create index if not exists directory_observations_location_idx on public.directory_observations (location_id, game_id);
create index if not exists directory_audit_entity_idx on public.directory_audit_log (entity, entity_id, happened_at desc);

-- Administrative data stays private. The public tables expose only published,
-- undeleted rows; game and note visibility also depends on the parent location.
alter table public.directory_sources enable row level security;
alter table public.directory_locations enable row level security;
alter table public.directory_games enable row level security;
alter table public.directory_notes enable row level security;
alter table public.directory_import_batches enable row level security;
alter table public.directory_import_rows enable row level security;
alter table public.directory_observations enable row level security;
alter table public.directory_audit_log enable row level security;

-- Anonymous policies call is_admin() and must be able to evaluate it as false.
grant execute on function public.is_admin() to anon;

drop policy if exists "directory sources admin" on public.directory_sources;
create policy "directory sources admin" on public.directory_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "directory locations read" on public.directory_locations;
create policy "directory locations read" on public.directory_locations for select to anon, authenticated
  using (public.is_admin() or (publication_status = 'published' and deleted_at is null));
drop policy if exists "directory locations admin insert" on public.directory_locations;
create policy "directory locations admin insert" on public.directory_locations for insert to authenticated
  with check (public.is_admin());
drop policy if exists "directory locations admin update" on public.directory_locations;
create policy "directory locations admin update" on public.directory_locations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "directory games read" on public.directory_games;
create policy "directory games read" on public.directory_games for select to anon, authenticated
  using (public.is_admin() or (publication_status = 'published' and deleted_at is null
    and exists (select 1 from public.directory_locations l where l.id = location_id
      and l.publication_status = 'published' and l.deleted_at is null)));
drop policy if exists "directory games admin insert" on public.directory_games;
create policy "directory games admin insert" on public.directory_games for insert to authenticated
  with check (public.is_admin());
drop policy if exists "directory games admin update" on public.directory_games;
create policy "directory games admin update" on public.directory_games for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "directory notes read" on public.directory_notes;
create policy "directory notes read" on public.directory_notes for select to anon, authenticated
  using (public.is_admin() or (audience = 'public' and exists (
    select 1 from public.directory_locations l where l.id = location_id
      and l.publication_status = 'published' and l.deleted_at is null)
    and (game_id is null or exists (select 1 from public.directory_games g where g.id = game_id
      and g.location_id = location_id and g.publication_status = 'published' and g.deleted_at is null))));
drop policy if exists "directory notes admin insert" on public.directory_notes;
create policy "directory notes admin insert" on public.directory_notes for insert to authenticated with check (public.is_admin());
drop policy if exists "directory notes admin update" on public.directory_notes;
create policy "directory notes admin update" on public.directory_notes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "directory notes admin delete" on public.directory_notes;
create policy "directory notes admin delete" on public.directory_notes for delete to authenticated using (public.is_admin());
drop policy if exists "directory batches admin" on public.directory_import_batches;
create policy "directory batches admin" on public.directory_import_batches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "directory rows admin" on public.directory_import_rows;
create policy "directory rows admin" on public.directory_import_rows for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "directory observations admin" on public.directory_observations;
create policy "directory observations admin" on public.directory_observations for select to authenticated
  using (public.is_admin());
drop policy if exists "directory observations admin insert" on public.directory_observations;
create policy "directory observations admin insert" on public.directory_observations for insert to authenticated
  with check (public.is_admin());
drop policy if exists "directory audit admin read" on public.directory_audit_log;
create policy "directory audit admin read" on public.directory_audit_log for select to authenticated
  using (public.is_admin());

revoke all on public.directory_sources, public.directory_locations, public.directory_games,
  public.directory_notes, public.directory_import_batches, public.directory_import_rows,
  public.directory_observations, public.directory_audit_log from anon, authenticated;
grant select on public.directory_locations, public.directory_games, public.directory_notes to anon, authenticated;
grant insert, update on public.directory_locations, public.directory_games to authenticated;
grant insert, update, delete on public.directory_notes to authenticated;
grant select, insert, update, delete on public.directory_sources, public.directory_import_batches,
  public.directory_import_rows to authenticated;
grant select, insert on public.directory_observations to authenticated;
grant select on public.directory_audit_log to authenticated;

create or replace function public.directory_guard_import_batch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('ready','applying','applied') then
      raise exception 'Reviewed import batches cannot be deleted' using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.status in ('applying','applied')
      and current_setting('app.directory_import_apply',true) is distinct from 'true' then
      raise exception 'An applying or applied batch is immutable' using errcode = '23514';
    end if;
    if new.status in ('applying','applied')
      and current_setting('app.directory_import_apply',true) is distinct from 'true' then
      raise exception 'Only the import function may advance a batch' using errcode = '23514';
    end if;
    if old.status = 'ready' and (new.source_id is distinct from old.source_id
      or new.file_sha256 is distinct from old.file_sha256
      or new.parser_version is distinct from old.parser_version) then
      raise exception 'A ready batch cannot change its source identity' using errcode = '23514';
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists directory_import_batches_guard on public.directory_import_batches;
create trigger directory_import_batches_guard before update or delete on public.directory_import_batches
  for each row execute function public.directory_guard_import_batch();

create or replace function public.directory_guard_import_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if tg_op = 'UPDATE' and new.batch_id is distinct from old.batch_id then
    raise exception 'Import rows cannot move between batches' using errcode = '23514';
  end if;
  select status into v_status from public.directory_import_batches
    where id = case when tg_op = 'INSERT' then new.batch_id else old.batch_id end;
  if v_status in ('ready','applying','applied','cancelled')
    and current_setting('app.directory_import_apply',true) is distinct from 'true' then
    raise exception 'Reviewed import rows are immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists directory_import_rows_guard on public.directory_import_rows;
create trigger directory_import_rows_guard before insert or update or delete on public.directory_import_rows
  for each row execute function public.directory_guard_import_row();

create or replace function public.directory_guard_source() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.publication_clearance = 'public' and new.publication_clearance = 'private'
      and (exists (select 1 from public.directory_locations
        where source_id = old.id and publication_status = 'published' and deleted_at is null)
      or exists (select 1 from public.directory_games
        where source_id = old.id and publication_status = 'published' and deleted_at is null)
      or exists (select 1 from public.directory_notes
        where source_id = old.id and audience = 'public')) then
      raise exception 'Unpublish dependent records before revoking source clearance' using errcode = '23514';
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists directory_sources_guard on public.directory_sources;
create trigger directory_sources_guard before update on public.directory_sources
  for each row execute function public.directory_guard_source();

-- Protect provenance and server-owned columns on every direct client write.
create or replace function public.directory_guard_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_source_clearance text;
begin
  if not public.is_admin() and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Directory writes require admin access' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  else
    if new.version <> old.version then
      raise exception 'A newer directory revision exists. Refresh before retrying.' using errcode = '40001';
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    if new.source_id is distinct from old.source_id then
      raise exception 'Directory provenance cannot be changed' using errcode = '23514';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  if new.publication_status = 'published' and new.source_id is not null then
    select publication_clearance into v_source_clearance from public.directory_sources where id = new.source_id;
    if v_source_clearance <> 'public' then
      raise exception 'Source lacks public publication clearance' using errcode = '23514';
    end if;
  end if;
  if tg_table_name = 'directory_locations' then
    if new.publication_status = 'published' and new.published_at is null then new.published_at := now(); end if;
  elsif tg_table_name = 'directory_games' then
    if tg_op = 'UPDATE' and new.location_id <> old.location_id then
      raise exception 'Move games by creating a new game at the target location' using errcode = '23514';
    end if;
    if new.publication_status = 'published' and new.source_id is null then
      -- Manual games are allowed; an imported game must retain source_id.
      null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists directory_locations_guard on public.directory_locations;
create trigger directory_locations_guard before insert or update on public.directory_locations
  for each row execute function public.directory_guard_write();
drop trigger if exists directory_games_guard on public.directory_games;
create trigger directory_games_guard before insert or update on public.directory_games
  for each row execute function public.directory_guard_write();

create or replace function public.directory_guard_note() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1; new.created_at := now(); new.updated_at := now(); new.created_by := auth.uid();
  else
    if new.version <> old.version then raise exception 'A newer directory revision exists' using errcode = '40001'; end if;
    new.id := old.id; new.created_at := old.created_at; new.created_by := old.created_by;
    if new.source_id is distinct from old.source_id then
      raise exception 'Directory provenance cannot be changed' using errcode = '23514';
    end if;
    new.version := old.version + 1; new.updated_at := now();
  end if;
  if new.game_id is not null and not exists (
    select 1 from public.directory_games where id = new.game_id and location_id = new.location_id) then
    raise exception 'Note game must belong to note location' using errcode = '23514';
  end if;
  if new.audience = 'public' and new.source_id is not null and not exists (
    select 1 from public.directory_sources where id = new.source_id and publication_clearance = 'public') then
    raise exception 'Source lacks public publication clearance' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists directory_notes_guard on public.directory_notes;
create trigger directory_notes_guard before insert or update on public.directory_notes
  for each row execute function public.directory_guard_note();

create or replace function public.directory_audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.directory_audit_log(actor_id, action, entity, entity_id, reason, before_value, after_value)
  values (auth.uid(), case when tg_op = 'DELETE'
      and current_setting('app.directory_purge', true) = 'true' then 'purge' else lower(tg_op) end,
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    nullif(current_setting('app.directory_change_reason', true), ''),
    case when tg_op = 'INSERT' or current_setting('app.directory_purge', true) = 'true'
      then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists directory_locations_audit on public.directory_locations;
create trigger directory_locations_audit after insert or update or delete on public.directory_locations
  for each row execute function public.directory_audit_change();
drop trigger if exists directory_games_audit on public.directory_games;
create trigger directory_games_audit after insert or update or delete on public.directory_games
  for each row execute function public.directory_audit_change();
drop trigger if exists directory_notes_audit on public.directory_notes;
create trigger directory_notes_audit after insert or update or delete on public.directory_notes
  for each row execute function public.directory_audit_change();

-- Soft deletion uses locked, version-checked transactions. Purge is separate
-- and leaves the audit snapshot while removing child rows through FKs.
create or replace function public.directory_set_location_deleted(
  p_id uuid, p_expected_version integer, p_deleted boolean, p_reason text default null)
returns public.directory_locations
language plpgsql security definer set search_path = '' as $$
declare v_row public.directory_locations;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v_row from public.directory_locations where id = p_id for update;
  if not found then raise exception 'Location not found' using errcode = 'P0002'; end if;
  if v_row.version <> p_expected_version then raise exception 'A newer directory revision exists' using errcode = '40001'; end if;
  perform set_config('app.directory_change_reason', coalesce(p_reason,''), true);
  update public.directory_locations set deleted_at = case when p_deleted then now() else null end
    where id = p_id returning * into v_row;
  return v_row;
end;
$$;
create or replace function public.directory_delete_location(p_id uuid, p_expected_version integer, p_reason text default null)
returns public.directory_locations language sql security definer set search_path = '' as $$
  select * from public.directory_set_location_deleted(p_id, p_expected_version, true, p_reason);
$$;
create or replace function public.directory_restore_location(p_id uuid, p_expected_version integer, p_reason text default null)
returns public.directory_locations language sql security definer set search_path = '' as $$
  select * from public.directory_set_location_deleted(p_id, p_expected_version, false, p_reason);
$$;
create or replace function public.directory_set_game_deleted(
  p_id uuid, p_expected_version integer, p_deleted boolean, p_reason text default null)
returns public.directory_games
language plpgsql security definer set search_path = '' as $$
declare v_row public.directory_games;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v_row from public.directory_games where id = p_id for update;
  if not found then raise exception 'Game not found' using errcode = 'P0002'; end if;
  if v_row.version <> p_expected_version then raise exception 'A newer directory revision exists' using errcode = '40001'; end if;
  perform set_config('app.directory_change_reason', coalesce(p_reason,''), true);
  update public.directory_games set deleted_at = case when p_deleted then now() else null end
    where id = p_id returning * into v_row;
  return v_row;
end;
$$;
create or replace function public.directory_delete_game(p_id uuid, p_expected_version integer, p_reason text default null)
returns public.directory_games language sql security definer set search_path = '' as $$
  select * from public.directory_set_game_deleted(p_id, p_expected_version, true, p_reason);
$$;
create or replace function public.directory_restore_game(p_id uuid, p_expected_version integer, p_reason text default null)
returns public.directory_games language sql security definer set search_path = '' as $$
  select * from public.directory_set_game_deleted(p_id, p_expected_version, false, p_reason);
$$;
create or replace function public.directory_purge_location(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.directory_locations where id = p_id and deleted_at is not null for update) then
    raise exception 'Location must be in Trash before permanent deletion' using errcode = '23514';
  end if;
  perform set_config('app.directory_change_reason', coalesce(p_reason,''), true);
  perform set_config('app.directory_purge', 'true', true);
  delete from public.directory_locations where id = p_id;
end;
$$;
create or replace function public.directory_purge_game(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.directory_games where id = p_id and deleted_at is not null for update) then
    raise exception 'Game must be in Trash before permanent deletion' using errcode = '23514';
  end if;
  perform set_config('app.directory_change_reason', coalesce(p_reason,''), true);
  perform set_config('app.directory_purge', 'true', true);
  delete from public.directory_games where id = p_id;
end;
$$;

-- Apply a reviewed batch in atomic, resumable chunks. Repeated calls cannot
-- create duplicate games: applied rows retain target IDs and row keys are unique.
-- Existing matched games are deliberately left alone. A new source observation
-- records the report; the reviewer can reconcile proposed changes separately.
create or replace function public.directory_apply_import_batch(
  p_batch_id uuid, p_reason text default null, p_max_rows integer default 150)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_batch public.directory_import_batches;
  v_row public.directory_import_rows;
  v_location_id uuid;
  v_game_id uuid;
  v_key text;
  v_note text;
  v_notes jsonb;
  v_inserted_locations integer := 0;
  v_inserted_games integer := 0;
  v_observations integer := 0;
  v_remaining integer;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_max_rows < 1 or p_max_rows > 250 then
    raise exception 'Import chunk must contain 1 to 250 rows' using errcode = '22023';
  end if;
  select * into v_batch from public.directory_import_batches where id = p_batch_id for update;
  if not found then raise exception 'Import batch not found' using errcode = 'P0002'; end if;
  if v_batch.status = 'applied' then
    return jsonb_build_object('locations',0,'games',0,'observations',0,'remaining',0,'already_applied',true);
  end if;
  if v_batch.status not in ('ready','applying') or v_batch.source_id is null then
    raise exception 'Import batch must be ready/applying and have a source' using errcode = '23514';
  end if;
  if not exists (select 1 from public.directory_sources
    where id = v_batch.source_id and file_sha256 = v_batch.file_sha256) then
    raise exception 'Import source hash does not match the batch' using errcode = '23514';
  end if;
  if exists (select 1 from public.directory_import_rows where batch_id = p_batch_id
    and decision not in ('approve','reject','applied')) then
    raise exception 'Every import row requires an approve or reject decision' using errcode = '23514';
  end if;
  if exists (select 1 from public.directory_observations o
    join public.directory_import_rows r on r.source_row_key = o.source_row_key
    where r.batch_id = p_batch_id and r.decision = 'approve' and o.source_id = v_batch.source_id) then
    raise exception 'This source already contains one of the approved rows' using errcode = '23505';
  end if;
  perform set_config('app.directory_import_apply','true',true);
  perform set_config('app.directory_change_reason', coalesce(p_reason,'CBJN import'), true);
  for v_row in select * from public.directory_import_rows
    where batch_id = p_batch_id and decision = 'approve'
    order by page_number nulls last, source_row_key limit p_max_rows for update
  loop
    v_key := nullif(v_row.normalized_location->>'source_location_key','');
    v_location_id := v_row.matched_location_id;
    if v_location_id is not null then
      if not exists (select 1 from public.directory_locations
        where id = v_location_id and deleted_at is null
          and (v_row.matched_location_version is null or version = v_row.matched_location_version) for update) then
        raise exception 'Matched location changed or was removed: %', v_location_id using errcode = '40001';
      end if;
    elsif v_key is not null then
      select applied_location_id into v_location_id from public.directory_import_rows
      where batch_id = p_batch_id and normalized_location->>'source_location_key' = v_key
        and applied_location_id is not null order by source_row_key limit 1;
    end if;
    if v_location_id is null then
      insert into public.directory_locations
        (name,aliases,operator,country,subdivision,city,address,website,latitude,longitude,
          coordinate_quality,coordinate_source,operating_status,game_availability,publication_status,source_id)
      values
        (v_row.normalized_location->>'name',
          coalesce(array(select jsonb_array_elements_text(v_row.normalized_location->'aliases')), '{}'),
          v_row.normalized_location->>'operator', v_row.normalized_location->>'country',
          v_row.normalized_location->>'subdivision', v_row.normalized_location->>'city',
          v_row.normalized_location->>'address', v_row.normalized_location->>'website',
          (v_row.normalized_location->>'latitude')::numeric,
          (v_row.normalized_location->>'longitude')::numeric,
          coalesce(v_row.normalized_location->>'coordinate_quality','unknown'),
          v_row.normalized_location->>'coordinate_source',
          coalesce(v_row.normalized_location->>'operating_status','unknown'),
          coalesce(v_row.normalized_location->>'game_availability','reported'),
          'draft',v_batch.source_id)
      returning id into v_location_id;
      v_inserted_locations := v_inserted_locations + 1;
    end if;
    v_notes := v_row.normalized_location->'source_notes';
    if jsonb_typeof(v_notes) = 'string' then v_notes := jsonb_build_array(v_notes); end if;
    if jsonb_typeof(v_notes) = 'array' then
      for v_note in select jsonb_array_elements_text(v_notes) loop
        if nullif(trim(v_note),'') is not null and not exists (
          select 1 from public.directory_notes where location_id = v_location_id
            and source_id = v_batch.source_id and category = 'source_commentary' and body = v_note) then
          insert into public.directory_notes(location_id,category,body,audience,source_id)
          values (v_location_id,'source_commentary',v_note,'admin',v_batch.source_id);
        end if;
      end loop;
    end if;
    v_game_id := v_row.matched_game_id;
    if v_game_id is not null then
      if not exists (select 1 from public.directory_games where id = v_game_id
        and location_id = v_location_id and deleted_at is null
        and (v_row.matched_game_version is null or version = v_row.matched_game_version) for update) then
        raise exception 'Matched game changed or was removed: %', v_game_id using errcode = '40001';
      end if;
    else
      insert into public.directory_games
        (location_id,game_type,table_count,decks,decks_cut,min_bet,max_bet,currency,payout,
         soft_17,double_rules,double_after_split,max_split_hands,resplit_aces,surrender,
         dealer_procedure,dealer_blackjack_wager_treatment,mid_shoe_entry,dealing_method,
         shuffle_method,reported_house_edge_pct,availability,publication_status,
         reported_month,verified_at,source_id,extra_rules)
      values
        (v_location_id,coalesce(v_row.normalized_game->>'game_type','blackjack'),
         (v_row.normalized_game->>'table_count')::integer,
         (v_row.normalized_game->>'decks')::numeric,
         (v_row.normalized_game->>'decks_cut')::numeric,
         (v_row.normalized_game->>'min_bet')::numeric,
         (v_row.normalized_game->>'max_bet')::numeric,
         v_row.normalized_game->>'currency', v_row.normalized_game->>'payout',
         v_row.normalized_game->>'soft_17',v_row.normalized_game->>'double_rules',
         (v_row.normalized_game->>'double_after_split')::boolean,
         (v_row.normalized_game->>'max_split_hands')::integer,
         (v_row.normalized_game->>'resplit_aces')::boolean,
         v_row.normalized_game->>'surrender',v_row.normalized_game->>'dealer_procedure',
         v_row.normalized_game->>'dealer_blackjack_wager_treatment',
         v_row.normalized_game->>'mid_shoe_entry',v_row.normalized_game->>'dealing_method',
         v_row.normalized_game->>'shuffle_method',
         (v_row.normalized_game->>'reported_house_edge_pct')::numeric,
         coalesce(v_row.normalized_game->>'availability','reported'),'draft',
         (v_row.normalized_game->>'reported_month')::date,
         (v_row.normalized_game->>'verified_at')::timestamptz,
         v_batch.source_id,coalesce(v_row.normalized_game->'extra_rules','{}'::jsonb))
      returning id into v_game_id;
      v_inserted_games := v_inserted_games + 1;
    end if;
    insert into public.directory_observations
      (source_id,import_row_id,location_id,game_id,report_date,report_precision,
       verified_at,source_page,source_row_key,original_values,inferred_defaults)
    values
      (v_batch.source_id,v_row.id,v_location_id,v_game_id,
       (v_row.normalized_game->>'reported_month')::date,
       case when v_row.normalized_game ? 'reported_month' then 'month' else 'unknown' end,
       (v_row.normalized_game->>'verified_at')::timestamptz,
       v_row.page_number,v_row.source_row_key,
       jsonb_build_object('location',v_row.raw_location,'game',v_row.raw_game,
         'normalized_location',v_row.normalized_location,'normalized_game',v_row.normalized_game),
       coalesce(v_row.normalized_game->'inferred_defaults','{}'::jsonb));
    v_observations := v_observations + 1;
    update public.directory_import_rows set decision = 'applied', applied_location_id = v_location_id,
      applied_game_id = v_game_id, updated_at = now() where id = v_row.id;
  end loop;
  select count(*) into v_remaining from public.directory_import_rows
    where batch_id = p_batch_id and decision = 'approve';
  update public.directory_import_batches set status = case when v_remaining = 0 then 'applied' else 'applying' end,
    applied_at = case when v_remaining = 0 then now() else null end,
    reviewed_by = auth.uid(), updated_at = now() where id = p_batch_id;
  return jsonb_build_object('locations',v_inserted_locations,'games',v_inserted_games,
    'observations',v_observations,'remaining',v_remaining,'already_applied',false);
end;
$$;

create or replace function public.directory_distance_km(
  p_latitude numeric, p_longitude numeric, p_other_latitude numeric, p_other_longitude numeric)
returns numeric language sql immutable strict set search_path = '' as $$
  select (6371 * acos(least(1.0, greatest(-1.0,
    sin(radians(p_latitude::double precision)) * sin(radians(p_other_latitude::double precision)) +
    cos(radians(p_latitude::double precision)) * cos(radians(p_other_latitude::double precision)) *
    cos(radians((p_longitude - p_other_longitude)::double precision))
  ))))::numeric;
$$;

-- One EXISTS clause keeps all rule filters on the same offering. The result
-- includes only lightweight location fields; details remain separate queries.
create or replace function public.directory_search(
  p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0,
  p_sort text default 'name')
returns jsonb language plpgsql security invoker set search_path = '' stable as $$
declare v_total integer; v_rows jsonb; v_q text;
begin
  if p_limit < 1 or p_limit > 100 or p_offset < 0 or p_offset > 100000
    or p_sort not in ('name','report_date','min_bet','distance') then
    raise exception 'Invalid directory pagination' using errcode = '22023';
  end if;
  if p_sort = 'distance' and
    (not (p_filters ? 'latitude' and p_filters ? 'longitude')
      or (p_filters->>'latitude')::numeric not between -90 and 90
      or (p_filters->>'longitude')::numeric not between -180 and 180) then
    raise exception 'Distance sort requires valid latitude and longitude' using errcode = '22023';
  end if;
  v_q := nullif(trim(p_filters->>'q'), '');
  with matches as (
    select l.id, l.name, l.aliases, l.operator, l.country, l.subdivision, l.city,
      l.address, l.website, l.latitude, l.longitude, l.coordinate_quality,
      l.operating_status, l.game_availability, l.updated_at,
      (select count(*) from public.directory_games gc where gc.location_id = l.id
        and gc.publication_status = 'published' and gc.deleted_at is null) as game_count,
      case when p_filters ? 'currency' then (select min(gm.min_bet) from public.directory_games gm where gm.location_id = l.id
        and gm.publication_status = 'published' and gm.deleted_at is null
        and gm.currency = p_filters->>'currency') end as earliest_min_bet,
      (select max(gr.reported_month) from public.directory_games gr where gr.location_id = l.id
        and gr.publication_status = 'published' and gr.deleted_at is null) as latest_reported_month,
      case when l.coordinate_quality = 'verified' and p_filters ? 'latitude' and p_filters ? 'longitude'
        then public.directory_distance_km(l.latitude,l.longitude,
          (p_filters->>'latitude')::numeric,(p_filters->>'longitude')::numeric) end as distance_km
    from public.directory_locations l
    where l.publication_status = 'published' and l.deleted_at is null
      and (v_q is null or l.name ilike '%' || v_q || '%' or l.city ilike '%' || v_q || '%'
        or coalesce(l.operator,'') ilike '%' || v_q || '%'
        or l.country ilike '%' || v_q || '%' or coalesce(l.subdivision,'') ilike '%' || v_q || '%'
        or exists (select 1 from unnest(l.aliases) a where a ilike '%' || v_q || '%'))
      and (not (p_filters ? 'north') or l.latitude <= (p_filters->>'north')::numeric)
      and (not (p_filters ? 'south') or l.latitude >= (p_filters->>'south')::numeric)
      and (not (p_filters ? 'east') or l.longitude <= (p_filters->>'east')::numeric)
      and (not (p_filters ? 'west') or l.longitude >= (p_filters->>'west')::numeric)
      and (not (p_filters ?| array['game_type','decks','min_bet_max','currency','soft_17','payout',
            'double_after_split','surrender','min_penetration','mid_shoe_entry','reported_since'])
        or exists (select 1 from public.directory_games g where g.location_id = l.id
          and g.publication_status = 'published' and g.deleted_at is null
          and (not (p_filters ? 'game_type') or g.game_type = p_filters->>'game_type')
          and (not (p_filters ? 'decks') or g.decks = (p_filters->>'decks')::numeric)
          and (not (p_filters ? 'min_bet_max') or g.min_bet <= (p_filters->>'min_bet_max')::numeric)
          and (not (p_filters ? 'currency') or g.currency = p_filters->>'currency')
          and (not (p_filters ? 'soft_17') or g.soft_17 = p_filters->>'soft_17')
          and (not (p_filters ? 'payout') or g.payout = p_filters->>'payout')
          and (not (p_filters ? 'double_after_split') or g.double_after_split = (p_filters->>'double_after_split')::boolean)
          and (not (p_filters ? 'surrender') or g.surrender = p_filters->>'surrender')
          and (not (p_filters ? 'min_penetration') or
            (g.decks is not null and g.decks_cut is not null
              and (g.decks - g.decks_cut) / g.decks >= (p_filters->>'min_penetration')::numeric))
          and (not (p_filters ? 'mid_shoe_entry') or g.mid_shoe_entry = p_filters->>'mid_shoe_entry')
          and (not (p_filters ? 'reported_since') or
            greatest(g.reported_month,g.verified_at::date) >= (p_filters->>'reported_since')::date)))
  )
  select count(*) into v_total from matches;
  with matches as (
    select l.id, l.name, l.aliases, l.operator, l.country, l.subdivision, l.city,
      l.address, l.website, l.latitude, l.longitude, l.coordinate_quality,
      l.operating_status, l.game_availability, l.updated_at,
      (select count(*) from public.directory_games gc where gc.location_id = l.id
        and gc.publication_status = 'published' and gc.deleted_at is null) as game_count,
      case when p_filters ? 'currency' then (select min(gm.min_bet) from public.directory_games gm where gm.location_id = l.id
        and gm.publication_status = 'published' and gm.deleted_at is null
        and gm.currency = p_filters->>'currency') end as earliest_min_bet,
      (select max(gr.reported_month) from public.directory_games gr where gr.location_id = l.id
        and gr.publication_status = 'published' and gr.deleted_at is null) as latest_reported_month,
      case when l.coordinate_quality = 'verified' and p_filters ? 'latitude' and p_filters ? 'longitude'
        then public.directory_distance_km(l.latitude,l.longitude,
          (p_filters->>'latitude')::numeric,(p_filters->>'longitude')::numeric) end as distance_km
    from public.directory_locations l
    where l.publication_status = 'published' and l.deleted_at is null
      and (v_q is null or l.name ilike '%' || v_q || '%' or l.city ilike '%' || v_q || '%'
        or coalesce(l.operator,'') ilike '%' || v_q || '%'
        or l.country ilike '%' || v_q || '%' or coalesce(l.subdivision,'') ilike '%' || v_q || '%'
        or exists (select 1 from unnest(l.aliases) a where a ilike '%' || v_q || '%'))
      and (not (p_filters ? 'north') or l.latitude <= (p_filters->>'north')::numeric)
      and (not (p_filters ? 'south') or l.latitude >= (p_filters->>'south')::numeric)
      and (not (p_filters ? 'east') or l.longitude <= (p_filters->>'east')::numeric)
      and (not (p_filters ? 'west') or l.longitude >= (p_filters->>'west')::numeric)
      and (not (p_filters ?| array['game_type','decks','min_bet_max','currency','soft_17','payout',
            'double_after_split','surrender','min_penetration','mid_shoe_entry','reported_since'])
        or exists (select 1 from public.directory_games g where g.location_id = l.id
          and g.publication_status = 'published' and g.deleted_at is null
          and (not (p_filters ? 'game_type') or g.game_type = p_filters->>'game_type')
          and (not (p_filters ? 'decks') or g.decks = (p_filters->>'decks')::numeric)
          and (not (p_filters ? 'min_bet_max') or g.min_bet <= (p_filters->>'min_bet_max')::numeric)
          and (not (p_filters ? 'currency') or g.currency = p_filters->>'currency')
          and (not (p_filters ? 'soft_17') or g.soft_17 = p_filters->>'soft_17')
          and (not (p_filters ? 'payout') or g.payout = p_filters->>'payout')
          and (not (p_filters ? 'double_after_split') or g.double_after_split = (p_filters->>'double_after_split')::boolean)
          and (not (p_filters ? 'surrender') or g.surrender = p_filters->>'surrender')
          and (not (p_filters ? 'min_penetration') or
            (g.decks is not null and g.decks_cut is not null
              and (g.decks - g.decks_cut) / g.decks >= (p_filters->>'min_penetration')::numeric))
          and (not (p_filters ? 'mid_shoe_entry') or g.mid_shoe_entry = p_filters->>'mid_shoe_entry')
          and (not (p_filters ? 'reported_since') or
            greatest(g.reported_month,g.verified_at::date) >= (p_filters->>'reported_since')::date)))
    order by
      case when p_sort = 'report_date' then
        (select max(gr.reported_month) from public.directory_games gr where gr.location_id = l.id
          and gr.publication_status = 'published' and gr.deleted_at is null) end desc nulls last,
      case when p_sort = 'min_bet' then
        (select min(gm.min_bet) from public.directory_games gm where gm.location_id = l.id
          and gm.publication_status = 'published' and gm.deleted_at is null
          and (not (p_filters ? 'currency') or gm.currency = p_filters->>'currency')) end asc nulls last,
      case when p_sort = 'distance' and l.coordinate_quality = 'verified' then
        public.directory_distance_km(l.latitude,l.longitude,
          (p_filters->>'latitude')::numeric,(p_filters->>'longitude')::numeric) end asc nulls last,
      l.name, l.id limit p_limit offset p_offset
  )
  select coalesce(jsonb_agg(to_jsonb(matches) order by
    case when p_sort = 'report_date' then latest_reported_month end desc nulls last,
    case when p_sort = 'min_bet' then earliest_min_bet end asc nulls last,
    case when p_sort = 'distance' then distance_km end asc nulls last,
    name,id), '[]'::jsonb) into v_rows from matches;
  return jsonb_build_object('total',v_total,'locations',v_rows);
end;
$$;

-- PostgreSQL gives new functions PUBLIC execution by default. Explicit grants
-- are required here so private helpers and write operations cannot be invoked
-- by anonymous API clients.
revoke all on function public.directory_guard_write() from public;
revoke all on function public.directory_guard_note() from public;
revoke all on function public.directory_guard_source() from public;
revoke all on function public.directory_guard_import_batch() from public;
revoke all on function public.directory_guard_import_row() from public;
revoke all on function public.directory_audit_change() from public;
revoke all on function public.directory_set_location_deleted(uuid,integer,boolean,text) from public;
revoke all on function public.directory_set_game_deleted(uuid,integer,boolean,text) from public;
revoke all on function public.directory_delete_location(uuid,integer,text) from public;
revoke all on function public.directory_restore_location(uuid,integer,text) from public;
revoke all on function public.directory_delete_game(uuid,integer,text) from public;
revoke all on function public.directory_restore_game(uuid,integer,text) from public;
revoke all on function public.directory_purge_location(uuid,text) from public;
revoke all on function public.directory_purge_game(uuid,text) from public;
revoke all on function public.directory_apply_import_batch(uuid,text,integer) from public;
revoke all on function public.directory_distance_km(numeric,numeric,numeric,numeric) from public;
grant execute on function public.directory_delete_location(uuid,integer,text) to authenticated;
grant execute on function public.directory_restore_location(uuid,integer,text) to authenticated;
grant execute on function public.directory_delete_game(uuid,integer,text) to authenticated;
grant execute on function public.directory_restore_game(uuid,integer,text) to authenticated;
grant execute on function public.directory_purge_location(uuid,text) to authenticated;
grant execute on function public.directory_purge_game(uuid,text) to authenticated;
grant execute on function public.directory_apply_import_batch(uuid,text,integer) to authenticated;
grant execute on function public.directory_distance_km(numeric,numeric,numeric,numeric) to anon,authenticated;
grant execute on function public.directory_search(jsonb,integer,integer,text) to anon,authenticated;

commit;
