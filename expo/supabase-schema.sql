-- EAGOH Supabase schema
-- Run once in the Supabase SQL editor to enable profile + EAGOH persistence.

-- =====================================================================
-- PROFILES
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  subscription_tier text default 'free',
  edge_subscription int default 0,
  edge_purchased int default 0,
  selected_labs jsonb default '[]'::jsonb,
  selected_eagohs jsonb default '[]'::jsonb,
  preferences jsonb default '{}'::jsonb,
  last_rollover_at timestamptz,
  last_allocation int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists last_rollover_at timestamptz;
alter table public.profiles add column if not exists last_allocation int default 0;

alter table public.profiles enable row level security;

drop policy if exists "profiles_self_select" on public.profiles;
drop policy if exists "profiles_self_insert" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;

create policy "profiles_self_select"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_self_insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id);

-- =====================================================================
-- EAGOHS (core identity)
-- =====================================================================
create table if not exists public.eagohs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sport text not null,
  gender text,
  cybernetic_intensity text,
  pose text,
  lab text,
  dna jsonb default '[]'::jsonb,
  image_url text,
  image_thumb_url text,
  image_prompt text,
  image_generated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- additive migrations for existing rows
alter table public.eagohs add column if not exists image_thumb_url text;
alter table public.eagohs add column if not exists image_prompt text;
alter table public.eagohs add column if not exists image_generated_at timestamptz;

create index if not exists eagohs_user_id_idx on public.eagohs(user_id);

alter table public.eagohs enable row level security;

drop policy if exists "eagohs_self_select" on public.eagohs;
drop policy if exists "eagohs_self_insert" on public.eagohs;
drop policy if exists "eagohs_self_update" on public.eagohs;
drop policy if exists "eagohs_self_delete" on public.eagohs;

create policy "eagohs_self_select" on public.eagohs for select using (auth.uid() = user_id);
create policy "eagohs_self_insert" on public.eagohs for insert with check (auth.uid() = user_id);
create policy "eagohs_self_update" on public.eagohs for update using (auth.uid() = user_id);
create policy "eagohs_self_delete" on public.eagohs for delete using (auth.uid() = user_id);

-- =====================================================================
-- EAGOH CUSTOMIZATION (appearance map)
-- =====================================================================
create table if not exists public.eagoh_customization (
  eagoh_id uuid primary key references public.eagohs(id) on delete cascade,
  appearance jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.eagoh_customization enable row level security;

drop policy if exists "eagoh_customization_self_all" on public.eagoh_customization;

create policy "eagoh_customization_self_all" on public.eagoh_customization
  for all
  using (exists (select 1 from public.eagohs e where e.id = eagoh_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.eagohs e where e.id = eagoh_id and e.user_id = auth.uid()));

-- =====================================================================
-- EAGOH FANATIC TEAMS (many-to-many)
-- =====================================================================
create table if not exists public.eagoh_fanatic_teams (
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  team_id text not null,
  created_at timestamptz default now(),
  primary key (eagoh_id, team_id)
);

create index if not exists eagoh_fanatic_teams_eagoh_idx on public.eagoh_fanatic_teams(eagoh_id);

alter table public.eagoh_fanatic_teams enable row level security;

drop policy if exists "eagoh_fanatic_teams_self_all" on public.eagoh_fanatic_teams;

create policy "eagoh_fanatic_teams_self_all" on public.eagoh_fanatic_teams
  for all
  using (exists (select 1 from public.eagohs e where e.id = eagoh_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.eagohs e where e.id = eagoh_id and e.user_id = auth.uid()));

-- =====================================================================
-- EAGOH LABS (selected labs per EAGOH)
-- =====================================================================
create table if not exists public.eagoh_labs (
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  lab_id text not null,
  created_at timestamptz default now(),
  primary key (eagoh_id, lab_id)
);

create index if not exists eagoh_labs_eagoh_idx on public.eagoh_labs(eagoh_id);

alter table public.eagoh_labs enable row level security;

drop policy if exists "eagoh_labs_self_all" on public.eagoh_labs;

create policy "eagoh_labs_self_all" on public.eagoh_labs
  for all
  using (exists (select 1 from public.eagohs e where e.id = eagoh_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.eagohs e where e.id = eagoh_id and e.user_id = auth.uid()));

-- =====================================================================
-- EDGE TRANSACTIONS (wallet history)
-- =====================================================================
create table if not exists public.edge_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                  -- 'deduction' | 'addition' | 'rollover' | 'purchase'
  reason text not null,                -- 'quick_check' | 'observation' | 'marketplace' | 'customization' | 'subscription_allocation' | 'rollover' | 'purchase' | 'manual'
  amount int not null,                 -- positive integer; sign implied by kind
  bucket text not null,                -- 'subscription' | 'purchased' | 'mixed'
  from_subscription int default 0,
  from_purchased int default 0,
  balance_subscription_after int default 0,
  balance_purchased_after int default 0,
  note text,
  created_at timestamptz default now()
);

create index if not exists edge_transactions_user_idx on public.edge_transactions(user_id, created_at desc);

alter table public.edge_transactions enable row level security;

drop policy if exists "edge_transactions_self_select" on public.edge_transactions;
drop policy if exists "edge_transactions_self_insert" on public.edge_transactions;

create policy "edge_transactions_self_select" on public.edge_transactions
  for select using (auth.uid() = user_id);

create policy "edge_transactions_self_insert" on public.edge_transactions
  for insert with check (auth.uid() = user_id);

-- =====================================================================
-- EAGOH IMAGE GENERATIONS (history of forge renders)
-- =====================================================================
create table if not exists public.eagoh_image_generations (
  id uuid primary key default gen_random_uuid(),
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,                  -- 'initial' | 'full_reforge' | 'partial_reforge'
  prompt text not null,
  image_url text not null,
  thumb_url text,
  edge_cost int default 0,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists eagoh_image_generations_eagoh_idx on public.eagoh_image_generations(eagoh_id, created_at desc);
create index if not exists eagoh_image_generations_user_idx on public.eagoh_image_generations(user_id, created_at desc);

alter table public.eagoh_image_generations enable row level security;

drop policy if exists "eagoh_image_generations_self_select" on public.eagoh_image_generations;
drop policy if exists "eagoh_image_generations_self_insert" on public.eagoh_image_generations;

create policy "eagoh_image_generations_self_select" on public.eagoh_image_generations
  for select using (auth.uid() = user_id);

create policy "eagoh_image_generations_self_insert" on public.eagoh_image_generations
  for insert with check (auth.uid() = user_id);

-- =====================================================================
-- STORAGE BUCKET: eagoh-renders (public read, owner write)
-- Optional: rendered images are already CDN-hosted; the bucket is here
-- for projects that want to mirror copies into Supabase Storage.
-- =====================================================================
insert into storage.buckets (id, name, public)
  values ('eagoh-renders', 'eagoh-renders', true)
  on conflict (id) do nothing;
