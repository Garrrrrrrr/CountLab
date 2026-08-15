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

create policy "settings owner select" on settings for select using (auth.uid() = user_id);
create policy "settings owner insert" on settings for insert with check (auth.uid() = user_id);
create policy "settings owner update" on settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings owner delete" on settings for delete using (auth.uid() = user_id);

create policy "drill_sessions owner select" on drill_sessions for select using (auth.uid() = user_id);
create policy "drill_sessions owner insert" on drill_sessions for insert with check (auth.uid() = user_id);
create policy "drill_sessions owner update" on drill_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "drill_sessions owner delete" on drill_sessions for delete using (auth.uid() = user_id);

create policy "drill_progress owner select" on drill_progress for select using (auth.uid() = user_id);
create policy "drill_progress owner insert" on drill_progress for insert with check (auth.uid() = user_id);
create policy "drill_progress owner update" on drill_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "drill_progress owner delete" on drill_progress for delete using (auth.uid() = user_id);

create policy "journal_sessions owner select" on journal_sessions for select using (auth.uid() = user_id);
create policy "journal_sessions owner insert" on journal_sessions for insert with check (auth.uid() = user_id);
create policy "journal_sessions owner update" on journal_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "journal_sessions owner delete" on journal_sessions for delete using (auth.uid() = user_id);

create policy "journal_transactions owner select" on journal_transactions for select using (auth.uid() = user_id);
create policy "journal_transactions owner insert" on journal_transactions for insert with check (auth.uid() = user_id);
create policy "journal_transactions owner update" on journal_transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "journal_transactions owner delete" on journal_transactions for delete using (auth.uid() = user_id);
