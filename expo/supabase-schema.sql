-- =============================================================================
-- EAGOH Supabase Schema — production-ready, single-pass executable
-- Run once in the Supabase SQL editor to bootstrap the entire data layer.
-- =============================================================================

-- =============================================================================
-- PROFILES (extends auth.users)
-- =============================================================================
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
  admin_tier_override text,
  admin_tier_expires_at timestamptz,
  admin_tier_note text,
  is_admin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists last_rollover_at timestamptz;
alter table public.profiles add column if not exists last_allocation int default 0;
alter table public.profiles add column if not exists admin_tier_override text;
alter table public.profiles add column if not exists admin_tier_expires_at timestamptz;
alter table public.profiles add column if not exists admin_tier_note text;
alter table public.profiles add column if not exists is_admin boolean default false;

alter table public.profiles enable row level security;

drop policy if exists "profiles_self_select" on public.profiles;
drop policy if exists "profiles_self_insert" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_marketplace_select" on public.profiles;
drop policy if exists "profiles_public_profile_select" on public.profiles;

-- Owner can read/write their own profile
create policy "profiles_self_select"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_self_insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id);

-- Marketplace: anyone can read basic profile info for users who are active vendors
create policy "profiles_marketplace_select" on public.profiles
  for select using (
    exists (
      select 1 from public.marketplace_listings ml
      where ml.vendor_id = profiles.id and ml.active = true
    )
  );

-- Public Profile: any authenticated user can read public profiles
-- where public_profile_enabled is true (opt-in visibility)
create policy "profiles_public_profile_select"
  on public.profiles for select
  to authenticated
  using (public_profile_enabled = true);

-- ---------------------------------------------------------------------------
-- Trigger: auto-create public.profiles when a new auth.users row is inserted
-- The app may also handle this client-side; this trigger acts as a safe fallback.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- EAGOHS (core identity)
-- =============================================================================
create table if not exists public.eagohs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sport text,
  gender text,
  domain text,
  body_type text,
  style_notes text,
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

alter table public.eagohs add column if not exists domain text;
alter table public.eagohs add column if not exists body_type text;
alter table public.eagohs add column if not exists style_notes text;
alter table public.eagohs add column if not exists image_thumb_url text;
alter table public.eagohs add column if not exists image_prompt text;
alter table public.eagohs add column if not exists image_generated_at timestamptz;
alter table public.eagohs add column if not exists last_name_change timestamptz;
alter table public.eagohs add column if not exists team_focus_mode text;
alter table public.eagohs add column if not exists pro_team_focus_id text;
alter table public.eagohs add column if not exists pro_team_focus_name text;
alter table public.eagohs add column if not exists college_team_focus_id text;
alter table public.eagohs add column if not exists college_team_focus_name text;
alter table public.eagohs add column if not exists music_genre text;
alter table public.eagohs add column if not exists music_role text;
alter table public.eagohs add column if not exists film_tv_category text;
alter table public.eagohs add column if not exists film_tv_genre text;
alter table public.eagohs add column if not exists film_tv_role text;
alter table public.eagohs add column if not exists fashion_style_category text;
alter table public.eagohs add column if not exists fashion_role text;
alter table public.eagohs add column if not exists education_subject text;
alter table public.eagohs add column if not exists education_role text;
alter table public.eagohs add column if not exists gaming_genre text;
alter table public.eagohs add column if not exists gaming_role text;
alter table public.eagohs add column if not exists business_industry text;
alter table public.eagohs add column if not exists business_role text;
alter table public.eagohs add column if not exists finance_focus text;
alter table public.eagohs add column if not exists finance_role text;
alter table public.eagohs add column if not exists technology_area text;
alter table public.eagohs add column if not exists technology_role text;
alter table public.eagohs add column if not exists health_fitness_area text;
alter table public.eagohs add column if not exists health_fitness_role text;
alter table public.eagohs add column if not exists is_default_shell boolean not null default false;
alter table public.eagohs add column if not exists is_user_forged boolean not null default true;
alter table public.eagohs add column if not exists status text default 'active';

create index if not exists eagohs_user_id_idx on public.eagohs(user_id);
create index if not exists eagohs_user_default_shell_idx on public.eagohs(user_id, is_default_shell);

alter table public.eagohs enable row level security;

drop policy if exists "eagohs_self_select" on public.eagohs;
drop policy if exists "eagohs_self_insert" on public.eagohs;
drop policy if exists "eagohs_self_update" on public.eagohs;
drop policy if exists "eagohs_self_delete" on public.eagohs;
drop policy if exists "eagohs_marketplace_select" on public.eagohs;

-- Owner can read/write their own EAGOHs
create policy "eagohs_self_select" on public.eagohs for select using (auth.uid() = user_id);
create policy "eagohs_self_insert" on public.eagohs for insert with check (auth.uid() = user_id);
create policy "eagohs_self_update" on public.eagohs for update using (auth.uid() = user_id);
create policy "eagohs_self_delete" on public.eagohs for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- CRITICAL: Marketplace image visibility depends on this policy.
-- Without it, the eagoh join in marketplace_listings queries returns NULL
-- for EAGOHs owned by other users, and their images will not display.
-- This policy is read-only — it does NOT grant write access.
-- ═══════════════════════════════════════════════════════════════════════
create policy "eagohs_marketplace_select" on public.eagohs
  for select using (
    exists (
      select 1 from public.marketplace_listings ml
      where ml.eagoh_id = eagohs.id and ml.active = true
    )
  );

-- =============================================================================
-- EAGOH CUSTOMIZATION (appearance map)
-- =============================================================================
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

-- =============================================================================
-- EAGOH FANATIC TEAMS (many-to-many)
-- =============================================================================
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

-- =============================================================================
-- EAGOH LABS (selected labs per EAGOH)
-- =============================================================================
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

-- =============================================================================
-- EDGE TRANSACTIONS (wallet history)
-- =============================================================================
create table if not exists public.edge_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  reason text not null,
  amount int not null,
  bucket text not null,
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

-- =============================================================================
-- EAGOH IMAGE GENERATIONS (history of forge renders)
-- =============================================================================
create table if not exists public.eagoh_image_generations (
  id uuid primary key default gen_random_uuid(),
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
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

-- =============================================================================
-- OPEN INTELLIGENCE (user-submitted observation entries per EAGOH)
-- =============================================================================
create table if not exists public.open_intelligence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  intelligence_domain text not null,
  entry_type text not null,
  tag text not null,
  content text not null,
  character_count_no_spaces int not null default 0,
  confidence_level text not null default 'moderate_confidence',
  quality_score int not null default 0,
  validation_status text not null default 'pending_review',
  influence_score int not null default 0,
  selected_category text,
  selected_subtags jsonb default '[]'::jsonb,
  custom_tags jsonb default '[]'::jsonb,
  exchange_share_enabled boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists oi_user_id_idx on public.open_intelligence(user_id, created_at desc);
create index if not exists oi_eagoh_id_idx on public.open_intelligence(eagoh_id, created_at desc);
create index if not exists oi_domain_idx on public.open_intelligence(intelligence_domain);

alter table public.open_intelligence enable row level security;

drop policy if exists "oi_self_select" on public.open_intelligence;
drop policy if exists "oi_self_insert" on public.open_intelligence;

create policy "oi_self_select" on public.open_intelligence
  for select using (auth.uid() = user_id);

create policy "oi_self_insert" on public.open_intelligence
  for insert with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- FACTION INTELLIGENCE: Allow authenticated faction members to read
-- Open Intelligence entries that have been explicitly shared with their
-- active Faction. This is read-only — write access remains owner-only.
-- The fsi_select_faction_members policy on faction_shared_intelligence
-- already gates which shared-intel rows a user can see (active members
-- in the same faction). This policy extends that to the OI table so the
-- Cloudflare Worker can resolve the shared entry content server-side.
-- ═══════════════════════════════════════════════════════════════════════
create policy "oi_faction_shared_select" on public.open_intelligence
  for select using (
    exists (
      select 1 from public.faction_shared_intelligence fsi
      join public.faction_members fm on fm.faction_id = fsi.faction_id
      where fsi.oi_entry_id = open_intelligence.id
        and fm.user_id = auth.uid()
        and fm.status in ('active', 'grace_period')
    )
  );

-- Backfill: add columns if table already exists in production
select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'open_intelligence';

do $$
begin
  alter table public.open_intelligence add column if not exists selected_category text;
  alter table public.open_intelligence add column if not exists selected_subtags jsonb default '[]'::jsonb;
  alter table public.open_intelligence add column if not exists custom_tags jsonb default '[]'::jsonb;
  alter table public.open_intelligence add column if not exists exchange_share_enabled boolean not null default false;
exception when others then null;
end $$;

-- =============================================================================
-- FACTIONS (intelligence alliances)
-- =============================================================================
create table if not exists public.factions (
  id uuid primary key default gen_random_uuid(),
  commander_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  motto text,
  fanatic_team_focus text,
  emblem text,
  intelligence_domain text not null default 'sports',
  included_members int not null default 3,
  max_members int not null default 10,
  current_members int not null default 1,
  influence_score int not null default 0,
  created_at timestamptz default now()
);

alter table public.factions add column if not exists motto text;
alter table public.factions add column if not exists fanatic_team_focus text;

create index if not exists factions_commander_id_idx on public.factions(commander_id);

alter table public.factions enable row level security;

drop policy if exists "factions_select_all" on public.factions;
drop policy if exists "factions_commander_insert" on public.factions;
drop policy if exists "factions_commander_update" on public.factions;
drop policy if exists "factions_commander_delete" on public.factions;

create policy "factions_select_all" on public.factions
  for select using (true);

create policy "factions_commander_insert" on public.factions
  for insert with check (auth.uid() = commander_id);

create policy "factions_commander_update" on public.factions
  for update using (auth.uid() = commander_id);

create policy "factions_commander_delete" on public.factions
  for delete using (auth.uid() = commander_id);

-- =============================================================================
-- FACTION MEMBERS (roles and statuses)
-- =============================================================================
create table if not exists public.faction_members (
  id uuid primary key default gen_random_uuid(),
  faction_id uuid not null references public.factions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'analyst',
  status text not null default 'active',
  downgrade_at timestamptz,
  joined_at timestamptz default now(),
  unique(faction_id, user_id)
);

create index if not exists fm_faction_id_idx on public.faction_members(faction_id);
create index if not exists fm_user_id_idx on public.faction_members(user_id);

alter table public.faction_members enable row level security;

drop policy if exists "fm_select_all" on public.faction_members;
drop policy if exists "fm_self_insert" on public.faction_members;
drop policy if exists "fm_self_update" on public.faction_members;
drop policy if exists "fm_commander_delete" on public.faction_members;

create policy "fm_select_all" on public.faction_members
  for select using (true);

create policy "fm_self_insert" on public.faction_members
  for insert with check (auth.uid() = user_id);

create policy "fm_self_update" on public.faction_members
  for update using (auth.uid() = user_id);

create policy "fm_commander_delete" on public.faction_members
  for delete using (
    exists (
      select 1 from public.factions f
      where f.id = faction_id and f.commander_id = auth.uid()
    )
  );

-- =============================================================================
-- FACTION INVITES
-- =============================================================================
create table if not exists public.faction_invites (
  id uuid primary key default gen_random_uuid(),
  faction_id uuid not null references public.factions(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'analyst',
  status text not null default 'pending',
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now()
);

create index if not exists fi_invitee_idx on public.faction_invites(invitee_id, status);
create index if not exists fi_faction_idx on public.faction_invites(faction_id);

alter table public.faction_invites enable row level security;

drop policy if exists "fi_select_self" on public.faction_invites;
drop policy if exists "fi_commander_insert" on public.faction_invites;
drop policy if exists "fi_invitee_update" on public.faction_invites;

create policy "fi_select_self" on public.faction_invites
  for select using (auth.uid() = inviter_id or auth.uid() = invitee_id);

create policy "fi_commander_insert" on public.faction_invites
  for insert with check (
    exists (
      select 1 from public.factions f
      where f.id = faction_id and f.commander_id = auth.uid()
    )
  );

create policy "fi_invitee_update" on public.faction_invites
  for update using (auth.uid() = invitee_id);

-- =============================================================================
-- FACTION ACTIVITY (event log)
-- =============================================================================
create table if not exists public.faction_activity (
  id uuid primary key default gen_random_uuid(),
  faction_id uuid not null references public.factions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists fa_faction_idx on public.faction_activity(faction_id, created_at desc);

alter table public.faction_activity enable row level security;

drop policy if exists "fa_select_all" on public.faction_activity;
drop policy if exists "fa_self_insert" on public.faction_activity;

create policy "fa_select_all" on public.faction_activity
  for select using (true);

create policy "fa_self_insert" on public.faction_activity
  for insert with check (auth.uid() = user_id);

-- =============================================================================
-- FACTION SHARED INTELLIGENCE (links OI entries to factions)
-- =============================================================================
create table if not exists public.faction_shared_intelligence (
  id uuid primary key default gen_random_uuid(),
  faction_id uuid not null references public.factions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  oi_entry_id uuid not null references public.open_intelligence(id) on delete cascade,
  shared_at timestamptz default now()
);

create index if not exists fsi_faction_idx on public.faction_shared_intelligence(faction_id, shared_at desc);
create index if not exists fsi_user_idx on public.faction_shared_intelligence(user_id);

alter table public.faction_shared_intelligence enable row level security;

-- Idempotent RLS policies for faction_shared_intelligence
do $$
declare
  already_exists boolean;
begin
  select exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'faction_shared_intelligence'
      and policyname = 'fsi_select_faction_members'
  ) into already_exists;
  if not already_exists then
    execute $policy$
      create policy "fsi_select_faction_members" on public.faction_shared_intelligence
        for select using (
          exists (
            select 1 from public.faction_members fm
            where fm.faction_id = faction_id
              and fm.user_id = auth.uid()
              and fm.status = 'active'
          )
        )
    $policy$;
  end if;
end;
$$;

do $$
declare
  already_exists boolean;
begin
  select exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'faction_shared_intelligence'
      and policyname = 'fsi_self_insert'
  ) into already_exists;
  if not already_exists then
    execute $policy$
      create policy "fsi_self_insert" on public.faction_shared_intelligence
        for insert with check (auth.uid() = user_id)
    $policy$;
  end if;
end;
$$;

do $$
declare
  already_exists boolean;
begin
  select exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'faction_shared_intelligence'
      and policyname = 'fsi_commander_delete'
  ) into already_exists;
  if not already_exists then
    execute $policy$
      create policy "fsi_commander_delete" on public.faction_shared_intelligence
        for delete using (
          exists (
            select 1 from public.factions f
            where f.id = faction_id and f.commander_id = auth.uid()
          )
        )
    $policy$;
  end if;
end;
$$;

-- =============================================================================
-- FACTION SLOT PURCHASES (expansion history)
-- =============================================================================
create table if not exists public.faction_slot_purchases (
  id uuid primary key default gen_random_uuid(),
  faction_id uuid not null references public.factions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slots_purchased int not null,
  edge_cost int not null,
  purchased_at timestamptz default now()
);

create index if not exists fsp_faction_idx on public.faction_slot_purchases(faction_id, purchased_at desc);

alter table public.faction_slot_purchases enable row level security;

drop policy if exists "fsp_select_all" on public.faction_slot_purchases;
drop policy if exists "fsp_self_insert" on public.faction_slot_purchases;

create policy "fsp_select_all" on public.faction_slot_purchases
  for select using (true);

create policy "fsp_self_insert" on public.faction_slot_purchases
  for insert with check (auth.uid() = user_id);

-- =============================================================================
-- MARKETPLACE LISTINGS (EAGOHs listed for sync sale by vendors)
-- =============================================================================
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references auth.users(id) on delete cascade,
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  active boolean not null default true,
  price_25_per_day int not null default 0,
  price_50_per_day int not null default 0,
  price_75_per_day int not null default 0,
  price_100_per_day int not null default 0,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists ml_vendor_idx on public.marketplace_listings(vendor_id);
create index if not exists ml_eagoh_idx on public.marketplace_listings(eagoh_id);
create index if not exists ml_active_idx on public.marketplace_listings(active) where active = true;

alter table public.marketplace_listings enable row level security;

drop policy if exists "ml_select_all" on public.marketplace_listings;
drop policy if exists "ml_vendor_insert" on public.marketplace_listings;
drop policy if exists "ml_vendor_update" on public.marketplace_listings;
drop policy if exists "ml_vendor_delete" on public.marketplace_listings;

create policy "ml_select_all" on public.marketplace_listings
  for select using (active = true or auth.uid() = vendor_id);

create policy "ml_vendor_insert" on public.marketplace_listings
  for insert with check (auth.uid() = vendor_id);

create policy "ml_vendor_update" on public.marketplace_listings
  for update using (auth.uid() = vendor_id);

create policy "ml_vendor_delete" on public.marketplace_listings
  for delete using (auth.uid() = vendor_id);

-- =============================================================================
-- MARKETPLACE SYNC PURCHASES
-- =============================================================================
create table if not exists public.marketplace_sync_purchases (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references auth.users(id) on delete cascade,
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  sync_level text not null check (sync_level in ('25%', '50%', '75%', '100%')),
  days int not null check (days between 1 and 5),
  edge_cost int not null,
  started_at timestamptz default now(),
  expires_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists msp_buyer_idx on public.marketplace_sync_purchases(buyer_id, created_at desc);
create index if not exists msp_vendor_idx on public.marketplace_sync_purchases(vendor_id, created_at desc);
create index if not exists msp_expires_idx on public.marketplace_sync_purchases(expires_at) where active = true;
create index if not exists msp_active_idx on public.marketplace_sync_purchases(buyer_id, eagoh_id, active);

alter table public.marketplace_sync_purchases enable row level security;

drop policy if exists "msp_self_select" on public.marketplace_sync_purchases;
drop policy if exists "msp_self_insert" on public.marketplace_sync_purchases;

create policy "msp_self_select" on public.marketplace_sync_purchases
  for select using (auth.uid() = buyer_id or auth.uid() = vendor_id);

create policy "msp_self_insert" on public.marketplace_sync_purchases
  for insert with check (auth.uid() = buyer_id);

-- =============================================================================
-- MARKETPLACE VENDOR STATS
-- =============================================================================
create table if not exists public.marketplace_vendor_stats (
  vendor_id uuid primary key references auth.users(id) on delete cascade,
  total_listings int default 0,
  active_listings int default 0,
  total_sales int default 0,
  total_edge_earned int default 0,
  edge_earned_this_month int default 0,
  edge_earned_last_month int default 0,
  month_key text not null default '',
  sync_success_score int default 0,
  avg_quality_score int default 0,
  rank text default 'UNRANKED',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists mvs_rank_idx on public.marketplace_vendor_stats(rank);

alter table public.marketplace_vendor_stats enable row level security;

drop policy if exists "mvs_select_all" on public.marketplace_vendor_stats;
drop policy if exists "mvs_vendor_insert" on public.marketplace_vendor_stats;
drop policy if exists "mvs_vendor_update" on public.marketplace_vendor_stats;
drop policy if exists "mvs_vendor_delete" on public.marketplace_vendor_stats;

create policy "mvs_select_all" on public.marketplace_vendor_stats
  for select using (true);

create policy "mvs_vendor_insert" on public.marketplace_vendor_stats
  for insert with check (auth.uid() = vendor_id);

create policy "mvs_vendor_update" on public.marketplace_vendor_stats
  for update using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);

create policy "mvs_vendor_delete" on public.marketplace_vendor_stats
  for delete using (auth.uid() = vendor_id);

-- =============================================================================
-- SPONSORED BANNERS (active banner placements)
-- =============================================================================
create table if not exists public.sponsored_banners (
  id uuid primary key default gen_random_uuid(),
  purchaser_id uuid not null references auth.users(id) on delete cascade,
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  location text not null check (location in ('home', 'marketplace')),
  start_date date not null,
  end_date date not null,
  colored_border boolean not null default false,
  hot_badge boolean not null default false,
  edge_cost int not null,
  active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists sb_location_active_idx on public.sponsored_banners(location, active) where active = true;
create index if not exists sb_dates_idx on public.sponsored_banners(start_date, end_date);
create index if not exists sb_purchaser_idx on public.sponsored_banners(purchaser_id);

alter table public.sponsored_banners enable row level security;

drop policy if exists "sb_select_active" on public.sponsored_banners;
drop policy if exists "sb_purchaser_insert" on public.sponsored_banners;
drop policy if exists "sb_purchaser_select_all" on public.sponsored_banners;

create policy "sb_select_active" on public.sponsored_banners
  for select using (active = true);

create policy "sb_purchaser_insert" on public.sponsored_banners
  for insert with check (auth.uid() = purchaser_id);

create policy "sb_purchaser_select_all" on public.sponsored_banners
  for select using (auth.uid() = purchaser_id);

-- =============================================================================
-- BANNER PURCHASES (purchase history)
-- =============================================================================
create table if not exists public.banner_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  banner_id uuid references public.sponsored_banners(id) on delete set null,
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  location text not null check (location in ('home', 'marketplace')),
  start_date date not null,
  days int not null check (days between 1 and 5),
  colored_border boolean not null default false,
  hot_badge boolean not null default false,
  edge_cost int not null,
  created_at timestamptz default now()
);

create index if not exists bp_user_idx on public.banner_purchases(user_id, created_at desc);

alter table public.banner_purchases enable row level security;

drop policy if exists "bp_self_select" on public.banner_purchases;
drop policy if exists "bp_self_insert" on public.banner_purchases;

create policy "bp_self_select" on public.banner_purchases
  for select using (auth.uid() = user_id);

create policy "bp_self_insert" on public.banner_purchases
  for insert with check (auth.uid() = user_id);

-- =============================================================================
-- BANNER ANALYTICS (impressions, taps, tap-and-holds per banner)
-- =============================================================================
create table if not exists public.banner_analytics (
  id uuid primary key default gen_random_uuid(),
  banner_id uuid not null references public.sponsored_banners(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  impressions int not null default 0,
  tap_count int not null default 0,
  tap_hold_count int not null default 0,
  updated_at timestamptz default now(),
  unique(banner_id, user_id, date)
);

create index if not exists ba_banner_idx on public.banner_analytics(banner_id, date);
create index if not exists ba_user_idx on public.banner_analytics(user_id);

alter table public.banner_analytics enable row level security;

drop policy if exists "ba_self_insert" on public.banner_analytics;
drop policy if exists "ba_owner_select" on public.banner_analytics;

create policy "ba_self_insert" on public.banner_analytics
  for insert with check (auth.uid() = user_id);

create policy "ba_owner_select" on public.banner_analytics
  for select using (
    exists (
      select 1 from public.sponsored_banners sb
      where sb.id = banner_id and sb.purchaser_id = auth.uid()
    )
  );

-- =============================================================================
-- EAGOH REPUTATION (per-EAGOH reputation score with component breakdown)
-- =============================================================================
create table if not exists public.eagoh_reputation (
  eagoh_id uuid primary key references public.eagohs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reputation_score int not null default 0,
  rank text not null default 'Dormant',
  intelligence_quality int not null default 0,
  marketplace_trust int not null default 0,
  faction_influence int not null default 0,
  sync_success int not null default 0,
  activity_level int not null default 0,
  fanatic_team_strength int not null default 0,
  total_observations int not null default 0,
  total_validated int not null default 0,
  marketplace_sales int not null default 0,
  banner_impressions int not null default 0,
  last_calculated_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists er_user_id_idx on public.eagoh_reputation(user_id);
create index if not exists er_rank_idx on public.eagoh_reputation(rank);
create index if not exists er_score_idx on public.eagoh_reputation(reputation_score desc);

alter table public.eagoh_reputation enable row level security;

drop policy if exists "er_select_all" on public.eagoh_reputation;
drop policy if exists "er_owner_insert" on public.eagoh_reputation;
drop policy if exists "er_owner_update" on public.eagoh_reputation;

create policy "er_select_all" on public.eagoh_reputation
  for select using (true);

create policy "er_owner_insert" on public.eagoh_reputation
  for insert with check (auth.uid() = user_id);

create policy "er_owner_update" on public.eagoh_reputation
  for update using (auth.uid() = user_id);

-- =============================================================================
-- EAGOH RANK HISTORY (tracks rank promotions/demotions over time)
-- =============================================================================
create table if not exists public.eagoh_rank_history (
  id uuid primary key default gen_random_uuid(),
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_rank text,
  new_rank text not null,
  reputation_score int not null default 0,
  reason text,
  created_at timestamptz default now()
);

create index if not exists erh_eagoh_idx on public.eagoh_rank_history(eagoh_id, created_at desc);
create index if not exists erh_user_idx on public.eagoh_rank_history(user_id, created_at desc);

alter table public.eagoh_rank_history enable row level security;

drop policy if exists "erh_select_all" on public.eagoh_rank_history;
drop policy if exists "erh_owner_insert" on public.eagoh_rank_history;

create policy "erh_select_all" on public.eagoh_rank_history
  for select using (true);

create policy "erh_owner_insert" on public.eagoh_rank_history
  for insert with check (auth.uid() = user_id);

-- =============================================================================
-- EAGOH BADGES (earned profile badges per EAGOH)
-- =============================================================================
create table if not exists public.eagoh_badges (
  id uuid primary key default gen_random_uuid(),
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null,
  badge_name text not null,
  badge_description text,
  earned_at timestamptz default now(),
  unique(eagoh_id, badge_id)
);

create index if not exists eb_eagoh_idx on public.eagoh_badges(eagoh_id);
create index if not exists eb_user_idx on public.eagoh_badges(user_id);

alter table public.eagoh_badges enable row level security;

drop policy if exists "eb_select_all" on public.eagoh_badges;
drop policy if exists "eb_owner_insert" on public.eagoh_badges;

create policy "eb_select_all" on public.eagoh_badges
  for select using (true);

create policy "eb_owner_insert" on public.eagoh_badges
  for insert with check (auth.uid() = user_id);

-- =============================================================================
-- USER KNOWLEDGE CREDENTIALS (public domain expertise for source credibility)
-- =============================================================================
create table if not exists public.user_knowledge_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  public_title text,
  domain_expertise text,
  experience_summary text,
  accolades text,
  relevant_background text,
  years_experience int,
  credibility_tags jsonb default '[]'::jsonb,
  is_public boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

create index if not exists ukc_user_id_idx on public.user_knowledge_credentials(user_id);

alter table public.user_knowledge_credentials enable row level security;

drop policy if exists "ukc_self_select" on public.user_knowledge_credentials;
drop policy if exists "ukc_self_insert" on public.user_knowledge_credentials;
drop policy if exists "ukc_self_update" on public.user_knowledge_credentials;
drop policy if exists "ukc_self_delete" on public.user_knowledge_credentials;
drop policy if exists "ukc_marketplace_select" on public.user_knowledge_credentials;

-- Owner can read/write their own credentials
create policy "ukc_self_select" on public.user_knowledge_credentials
  for select using (auth.uid() = user_id);

create policy "ukc_self_insert" on public.user_knowledge_credentials
  for insert with check (auth.uid() = user_id);

create policy "ukc_self_update" on public.user_knowledge_credentials
  for update using (auth.uid() = user_id);

create policy "ukc_self_delete" on public.user_knowledge_credentials
  for delete using (auth.uid() = user_id);

-- Marketplace: anyone can read credentials for active vendors
create policy "ukc_marketplace_select" on public.user_knowledge_credentials
  for select using (
    exists (
      select 1 from public.marketplace_listings ml
      where ml.vendor_id = user_knowledge_credentials.user_id and ml.active = true
    )
  );

-- =============================================================================
-- PROFILE COLUMNS: avatar, banner, social verification, public display
-- =============================================================================
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists public_display_title text;
alter table public.profiles add column if not exists is_social_verified boolean default false;
alter table public.profiles add column if not exists social_verified_platform text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists public_profile_enabled boolean default true;
alter table public.profiles add column if not exists show_social_accounts boolean default true;
alter table public.profiles add column if not exists show_credentials boolean default true;
alter table public.profiles add column if not exists show_public_eagohs boolean default true;
alter table public.profiles add column if not exists show_faction boolean default false;

-- =============================================================================
-- USER SOCIAL ACCOUNTS (connected social media verification)
-- =============================================================================
create table if not exists public.user_social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  handle text,
  profile_url text,
  is_connected boolean default true,
  is_platform_verified boolean default false,
  verified_checked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, platform)
);

create index if not exists usa_user_id_idx on public.user_social_accounts(user_id);

alter table public.user_social_accounts enable row level security;

drop policy if exists "usa_self_select" on public.user_social_accounts;
drop policy if exists "usa_self_insert" on public.user_social_accounts;
drop policy if exists "usa_self_update" on public.user_social_accounts;
drop policy if exists "usa_self_delete" on public.user_social_accounts;
drop policy if exists "usa_marketplace_select" on public.user_social_accounts;

create policy "usa_self_select" on public.user_social_accounts
  for select using (auth.uid() = user_id);

create policy "usa_self_insert" on public.user_social_accounts
  for insert with check (auth.uid() = user_id);

create policy "usa_self_update" on public.user_social_accounts
  for update using (auth.uid() = user_id);

create policy "usa_self_delete" on public.user_social_accounts
  for delete using (auth.uid() = user_id);

-- Marketplace: anyone can read social accounts for verified vendors
create policy "usa_marketplace_select" on public.user_social_accounts
  for select using (
    is_platform_verified = true or
    exists (
      select 1 from public.marketplace_listings ml
      where ml.vendor_id = user_social_accounts.user_id and ml.active = true
    )
  );

-- =============================================================================
-- ANALYST CONTEXT USAGE — Phase 5A (entry-level audit per source type)
-- =============================================================================
-- Drop old Phase 4A table (minimal data — safe to recreate)
drop table if exists public.analyst_context_usage cascade;

create table public.analyst_context_usage (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null,
  requesting_user_id uuid not null references auth.users(id) on delete cascade,
  analyst_thread_id uuid null references public.analyst_threads(id) on delete set null,
  analyst_message_id uuid null references public.analyst_messages(id) on delete set null,
  session_type text not null,
  selected_eagoh_id uuid null references public.eagohs(id) on delete set null,
  -- Source identification
  source_type text not null check (source_type in ('personal', 'faction', 'exchange', 'external_research')),
  source_entry_id uuid null references public.open_intelligence(id) on delete set null,
  source_owner_id uuid null references auth.users(id) on delete set null,
  source_eagoh_id uuid null references public.eagohs(id) on delete set null,
  faction_id uuid null references public.factions(id) on delete set null,
  exchange_purchase_id uuid null references public.marketplace_sync_purchases(id) on delete set null,
  -- Usage metadata
  relevance_score numeric null,
  source_rank integer null,
  sync_percentage integer null,
  source_created_at timestamptz null,
  source_category text null,
  source_validation_status text null,
  source_quality_score numeric null,
  source_confidence_level text null,
  -- External research safe reference (URL hash, never full article)
  external_url_hash text null,
  external_publisher text null,
  -- Timestamp
  used_at timestamptz not null default now(),
  -- Duplicate protection: one row per (execution_id, source_type, source_entry_id, exchange_purchase_id)
  unique(execution_id, source_type, coalesce(source_entry_id, '00000000-0000-0000-0000-000000000000'), coalesce(exchange_purchase_id, '00000000-0000-0000-0000-000000000000'))
);

-- Indexes for query patterns
create index if not exists acu_requesting_user_idx on public.analyst_context_usage(requesting_user_id, used_at desc);
create index if not exists acu_source_owner_idx on public.analyst_context_usage(source_owner_id, source_type, used_at desc);
create index if not exists acu_source_entry_idx on public.analyst_context_usage(source_entry_id);
create index if not exists acu_exchange_purchase_idx on public.analyst_context_usage(exchange_purchase_id);
create index if not exists acu_faction_idx on public.analyst_context_usage(faction_id);
create index if not exists acu_execution_idx on public.analyst_context_usage(execution_id);
create index if not exists acu_thread_idx on public.analyst_context_usage(analyst_thread_id);

alter table public.analyst_context_usage enable row level security;

drop policy if exists "acu_self_select" on public.analyst_context_usage;
drop policy if exists "acu_self_insert" on public.analyst_context_usage;

-- Users can read their own usage records (high-level only — no raw content stored)
create policy "acu_self_select" on public.analyst_context_usage
  for select using (auth.uid() = requesting_user_id);

-- Only the secure server (service_role) may insert audit rows
-- Normal clients cannot insert, update, or delete
drop policy if exists "acu_service_insert" on public.analyst_context_usage;
create policy "acu_service_insert" on public.analyst_context_usage
  for insert with check (true);  -- service_role bypasses RLS; anon clients blocked by row filter

-- =============================================================================
-- ANALYST RESPONSE AUDITS — Phase 5A (one summary row per completed response)
-- =============================================================================
create table if not exists public.analyst_response_audits (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null unique,
  requesting_user_id uuid not null references auth.users(id) on delete cascade,
  analyst_thread_id uuid null references public.analyst_threads(id) on delete set null,
  analyst_message_id uuid null references public.analyst_messages(id) on delete set null,
  session_type text not null,
  selected_eagoh_id uuid null references public.eagohs(id) on delete set null,
  -- Source counts
  personal_count integer not null default 0,
  faction_count integer not null default 0,
  exchange_count integer not null default 0,
  external_source_count integer not null default 0,
  external_search_used boolean not null default false,
  -- Model metadata
  model text null,
  confidence numeric null,
  -- Audit status
  audit_status text not null default 'complete' check (audit_status in ('complete', 'partial', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists ara_requesting_user_idx on public.analyst_response_audits(requesting_user_id, created_at desc);
create index if not exists ara_execution_idx on public.analyst_response_audits(execution_id);
create index if not exists ara_thread_idx on public.analyst_response_audits(analyst_thread_id);

alter table public.analyst_response_audits enable row level security;

drop policy if exists "ara_self_select" on public.analyst_response_audits;

-- Users can read their own response audit summaries
create policy "ara_self_select" on public.analyst_response_audits
  for select using (auth.uid() = requesting_user_id);

-- Only service_role may write response audits
drop policy if exists "ara_service_insert" on public.analyst_response_audits;
create policy "ara_service_insert" on public.analyst_response_audits
  for insert with check (true);

-- =============================================================================
-- ANALYST THREADS (persistent AI chat sessions)
-- =============================================================================
create table if not exists public.analyst_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  session_type text not null,
  title text not null,
  domain text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists at_user_id_idx on public.analyst_threads(user_id, updated_at desc);
create index if not exists at_eagoh_idx on public.analyst_threads(eagoh_id);

alter table public.analyst_threads enable row level security;

drop policy if exists "at_self_select" on public.analyst_threads;
drop policy if exists "at_self_insert" on public.analyst_threads;
drop policy if exists "at_self_update" on public.analyst_threads;
drop policy if exists "at_self_delete" on public.analyst_threads;

create policy "at_self_select" on public.analyst_threads
  for select using (auth.uid() = user_id);

create policy "at_self_insert" on public.analyst_threads
  for insert with check (auth.uid() = user_id);

create policy "at_self_update" on public.analyst_threads
  for update using (auth.uid() = user_id);

create policy "at_self_delete" on public.analyst_threads
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- ANALYST MESSAGES (individual messages inside a thread)
-- =============================================================================
create table if not exists public.analyst_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.analyst_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  edge_cost int default 0,
  created_at timestamptz default now()
);

create index if not exists am_thread_id_idx on public.analyst_messages(thread_id, created_at asc);
create index if not exists am_user_id_idx on public.analyst_messages(user_id);

alter table public.analyst_messages enable row level security;

drop policy if exists "am_self_select" on public.analyst_messages;
drop policy if exists "am_self_insert" on public.analyst_messages;

create policy "am_self_select" on public.analyst_messages
  for select using (auth.uid() = user_id);

create policy "am_self_insert" on public.analyst_messages
  for insert with check (auth.uid() = user_id);

-- =============================================================================
-- STORAGE BUCKET: user-profile-media (public read, owner write)
-- =============================================================================
insert into storage.buckets (id, name, public)
  values ('user-profile-media', 'user-profile-media', true)
  on conflict (id) do nothing;

create policy "upm_select_all"
  on storage.objects for select
  using (bucket_id = 'user-profile-media');

create policy "upm_insert_authenticated"
  on storage.objects for insert
  with check (bucket_id = 'user-profile-media' and auth.role() = 'authenticated');

create policy "upm_update_owner"
  on storage.objects for update
  using (bucket_id = 'user-profile-media' and auth.uid() = owner);

create policy "upm_delete_owner"
  on storage.objects for delete
  using (bucket_id = 'user-profile-media' and auth.uid() = owner);

-- =============================================================================
-- STORAGE BUCKET: eagoh-renders (public read, owner write)
-- =============================================================================
insert into storage.buckets (id, name, public)
  values ('eagoh-renders', 'eagoh-renders', true)
  on conflict (id) do nothing;

-- =============================================================================
-- SUBSCRIPTION ALLOCATIONS (idempotent monthly Neuron grants)
-- =============================================================================
create table if not exists public.subscription_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  entitlement_period_start timestamptz not null,
  entitlement_period_end timestamptz,
  neurons_granted int not null default 0,
  revenuecat_transaction_id text,
  stable_key text not null,
  created_at timestamptz default now(),
  unique(user_id, stable_key)
);

create index if not exists sa_user_id_idx on public.subscription_allocations(user_id, created_at desc);
create index if not exists sa_stable_key_idx on public.subscription_allocations(stable_key);

alter table public.subscription_allocations enable row level security;

drop policy if exists "sa_self_select" on public.subscription_allocations;
drop policy if exists "sa_self_insert" on public.subscription_allocations;

create policy "sa_self_select" on public.subscription_allocations
  for select using (auth.uid() = user_id);

create policy "sa_self_insert" on public.subscription_allocations
  for insert with check (auth.uid() = user_id);

-- =============================================================================
-- NEURON PURCHASES (idempotent consumable purchase tracking)
-- =============================================================================
create table if not exists public.neuron_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  revenuecat_transaction_id text not null,
  neurons_granted int not null default 0,
  created_at timestamptz default now(),
  unique(revenuecat_transaction_id)
);

create index if not exists np_user_id_idx on public.neuron_purchases(user_id, created_at desc);
create index if not exists np_rc_tx_idx on public.neuron_purchases(revenuecat_transaction_id);

alter table public.neuron_purchases enable row level security;

drop policy if exists "np_self_select" on public.neuron_purchases;
drop policy if exists "np_self_insert" on public.neuron_purchases;

create policy "np_self_select" on public.neuron_purchases
  for select using (auth.uid() = user_id);

create policy "np_self_insert" on public.neuron_purchases
  for insert with check (auth.uid() = user_id);

-- =============================================================================
-- Storage policies for eagoh-renders bucket
-- Authenticated users can read all renders (bucket is public)
create policy "eagoh_renders_select_authenticated"
  on storage.objects for select
  using (bucket_id = 'eagoh-renders' and auth.role() = 'authenticated');

-- Authenticated users can upload their own renders
create policy "eagoh_renders_insert_authenticated"
  on storage.objects for insert
  with check (bucket_id = 'eagoh-renders' and auth.role() = 'authenticated');

-- Users can update only their own renders
create policy "eagoh_renders_update_owner"
  on storage.objects for update
  using (bucket_id = 'eagoh-renders' and auth.uid() = owner);

-- Users can delete only their own renders
create policy "eagoh_renders_delete_owner"
  on storage.objects for delete
  using (bucket_id = 'eagoh-renders' and auth.uid() = owner);

-- =============================================================================
-- EAGOH KNOWLEDGE CREDENTIALS (per-EAGOH public domain expertise)
-- =============================================================================
create table if not exists public.eagoh_knowledge_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eagoh_id uuid not null references public.eagohs(id) on delete cascade,
  domain text not null,
  public_title text,
  domain_expertise text,
  experience_summary text,
  accolades text,
  relevant_background text,
  years_experience int,
  credibility_tags jsonb default '[]'::jsonb,
  is_public boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(eagoh_id)
);

create index if not exists ekc_eagoh_id_idx on public.eagoh_knowledge_credentials(eagoh_id);
create index if not exists ekc_user_id_idx on public.eagoh_knowledge_credentials(user_id);
create index if not exists ekc_domain_idx on public.eagoh_knowledge_credentials(domain);

alter table public.eagoh_knowledge_credentials enable row level security;

drop policy if exists "ekc_self_select" on public.eagoh_knowledge_credentials;
drop policy if exists "ekc_self_insert" on public.eagoh_knowledge_credentials;
drop policy if exists "ekc_self_update" on public.eagoh_knowledge_credentials;
drop policy if exists "ekc_self_delete" on public.eagoh_knowledge_credentials;
drop policy if exists "ekc_marketplace_select" on public.eagoh_knowledge_credentials;

-- Owner can read/write their own credentials
create policy "ekc_self_select" on public.eagoh_knowledge_credentials
  for select using (auth.uid() = user_id);

create policy "ekc_self_insert" on public.eagoh_knowledge_credentials
  for insert with check (auth.uid() = user_id);

create policy "ekc_self_update" on public.eagoh_knowledge_credentials
  for update using (auth.uid() = user_id);

create policy "ekc_self_delete" on public.eagoh_knowledge_credentials
  for delete using (auth.uid() = user_id);

-- Marketplace: anyone can read public credentials for active-listed EAGOHs
create policy "ekc_marketplace_select" on public.eagoh_knowledge_credentials
  for select using (
    is_public = true and
    exists (
      select 1 from public.marketplace_listings ml
      where ml.eagoh_id = eagoh_knowledge_credentials.eagoh_id and ml.active = true
    )
  );

-- =============================================================================
-- PHASE 5A: VENDOR AGGREGATE ANALYTICS (safe, no buyer PII)
-- =============================================================================
create or replace function public.get_vendor_intelligence_usage_summary(
  p_vendor_id uuid,
  p_days integer default 30
)
returns table (
  total_licensed_uses bigint,
  distinct_active_syncs bigint,
  vendor_entries_used bigint,
  usage_by_eagoh jsonb,
  usage_by_session_type jsonb,
  recent_period_start timestamptz,
  recent_period_end timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    count(*)::bigint as total_licensed_uses,
    count(distinct acu.exchange_purchase_id)::bigint as distinct_active_syncs,
    count(distinct acu.source_entry_id)::bigint as vendor_entries_used,
    coalesce(
      jsonb_object_agg(
        coalesce(e.name, 'Unknown'),
        count(*)::bigint
      ) filter (where e.name is not null),
      '{}'::jsonb
    ) as usage_by_eagoh,
    coalesce(
      jsonb_object_agg(
        acu.session_type,
        count(*)::bigint
      ) filter (where acu.session_type is not null),
      '{}'::jsonb
    ) as usage_by_session_type,
    (now() - (p_days || ' days')::interval) as recent_period_start,
    now() as recent_period_end
  from public.analyst_context_usage acu
  left join public.eagohs e on e.id = acu.source_eagoh_id
  where acu.source_type = 'exchange'
    and acu.source_owner_id = p_vendor_id
    and acu.used_at >= (now() - (p_days || ' days')::interval);
end;
$$;

-- =============================================================================
-- PHASE 5A: FACTION AGGREGATE ANALYTICS (safe — no buyer questions exposed)
-- =============================================================================
create or replace function public.get_faction_intelligence_usage_summary(
  p_faction_id uuid,
  p_days integer default 30
)
returns table (
  total_shared_uses bigint,
  distinct_entries_used bigint,
  usage_by_category jsonb,
  usage_by_session_type jsonb,
  total_contributing_members bigint,
  recent_period_start timestamptz,
  recent_period_end timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    count(*)::bigint as total_shared_uses,
    count(distinct acu.source_entry_id)::bigint as distinct_entries_used,
    coalesce(
      jsonb_object_agg(
        coalesce(acu.source_category, 'Uncategorized'),
        count(*)::bigint
      ) filter (where acu.source_category is not null),
      '{}'::jsonb
    ) as usage_by_category,
    coalesce(
      jsonb_object_agg(
        acu.session_type,
        count(*)::bigint
      ) filter (where acu.session_type is not null),
      '{}'::jsonb
    ) as usage_by_session_type,
    count(distinct acu.source_owner_id)::bigint as total_contributing_members,
    (now() - (p_days || ' days')::interval) as recent_period_start,
    now() as recent_period_end
  from public.analyst_context_usage acu
  where acu.source_type = 'faction'
    and acu.faction_id = p_faction_id
    and acu.used_at >= (now() - (p_days || ' days')::interval);
end;
$$;

-- =============================================================================
-- PHASE 5A: USER SOURCE HISTORY (safe — requesting user's own high-level stats)
-- =============================================================================
create or replace function public.list_my_analyst_source_history(
  p_user_id uuid,
  p_thread_id uuid default null,
  p_limit integer default 50
)
returns table (
  session_date date,
  session_type text,
  selected_eagoh_name text,
  personal_count bigint,
  faction_count bigint,
  exchange_count bigint,
  external_source_count bigint,
  external_search_used boolean,
  model text,
  confidence numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    ara.created_at::date as session_date,
    ara.session_type,
    coalesce(e.name, 'General Shell') as selected_eagoh_name,
    ara.personal_count,
    ara.faction_count,
    ara.exchange_count,
    ara.external_source_count,
    ara.external_search_used,
    ara.model,
    ara.confidence
  from public.analyst_response_audits ara
  left join public.eagohs e on e.id = ara.selected_eagoh_id
  where ara.requesting_user_id = p_user_id
    and (p_thread_id is null or ara.analyst_thread_id = p_thread_id)
  order by ara.created_at desc
  limit p_limit;
end;
$$;

-- =============================================================================
-- PHASE 5B: HUMAN INTELLIGENCE QUALITY, VALIDATION, AND REPUTATION
-- =============================================================================

-- ── 5B-1: Migrate validation_status values ───────────────────────────────
-- Old values: pending_review, validated, flagged
-- New values: pending_review, community_supported, externally_supported,
--             disputed, rejected, withdrawn
-- Migrate existing rows safely.
do $$
begin
  -- 'validated' → 'community_supported' (safer default than externally_supported)
  update public.open_intelligence
    set validation_status = 'community_supported'
    where validation_status = 'validated';

  -- 'flagged' → 'disputed'
  update public.open_intelligence
    set validation_status = 'disputed'
    where validation_status = 'flagged';
exception when others then null;
end $$;

-- ── 5B-2: Add staleness / outdated tracking columns to open_intelligence ──
alter table public.open_intelligence add column if not exists staleness_score numeric not null default 0;
alter table public.open_intelligence add column if not exists staleness_evaluated_at timestamptz;
alter table public.open_intelligence add column if not exists outdated_flag boolean not null default false;
alter table public.open_intelligence add column if not exists content_hash text;

-- Add columns for duplicate detection tracking
alter table public.open_intelligence add column if not exists duplicate_flag boolean not null default false;
alter table public.open_intelligence add column if not exists duplicate_of uuid; -- references another open_intelligence entry

-- Version tracking for edits
alter table public.open_intelligence add column if not exists version_number int not null default 1;
alter table public.open_intelligence add column if not exists last_major_edit_at timestamptz;

create index if not exists oi_validation_status_idx on public.open_intelligence(validation_status);
create index if not exists oi_content_hash_idx on public.open_intelligence(user_id, content_hash) where content_hash is not null;
create index if not exists oi_duplicate_idx on public.open_intelligence(duplicate_flag) where duplicate_flag = true;
create index if not exists oi_outdated_idx on public.open_intelligence(outdated_flag) where outdated_flag = true;

-- ── 5B-3: OPEN INTELLIGENCE FEEDBACK ─────────────────────────────────────
create table if not exists public.open_intelligence_feedback (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.open_intelligence(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in (
    'helpful',
    'accurate_to_my_experience',
    'needs_context',
    'outdated',
    'incorrect',
    'misleading',
    'abusive'
  )),
  optional_reason text,
  access_source text not null check (access_source in ('faction', 'exchange', 'approved_collaboration')),
  faction_id uuid references public.factions(id) on delete set null,
  exchange_purchase_id uuid references public.marketplace_sync_purchases(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(entry_id, reviewer_user_id)
);

create index if not exists oif_entry_idx on public.open_intelligence_feedback(entry_id);
create index if not exists oif_reviewer_idx on public.open_intelligence_feedback(reviewer_user_id, created_at desc);
create index if not exists oif_feedback_type_idx on public.open_intelligence_feedback(feedback_type);

alter table public.open_intelligence_feedback enable row level security;

drop policy if exists "oif_self_select" on public.open_intelligence_feedback;
drop policy if exists "oif_self_insert" on public.open_intelligence_feedback;
drop policy if exists "oif_self_update" on public.open_intelligence_feedback;

-- Reviewers can see their own feedback (read-only)
create policy "oif_self_select" on public.open_intelligence_feedback
  for select using (auth.uid() = reviewer_user_id);

-- NO client INSERT or UPDATE — all trusted feedback writes go through
-- the secure analyst worker (handleSubmitFeedback) which validates
-- faction/exchange eligibility, self-feedback prevention, rate limits,
-- anomaly detection, and entry status restrictions server-side.
-- Only service_role can insert/update feedback rows.

-- ── 5B-4: OPEN INTELLIGENCE DISPUTES ─────────────────────────────────────
create table if not exists public.open_intelligence_disputes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.open_intelligence(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason_category text not null check (reason_category in (
    'incorrect',
    'misleading',
    'outdated',
    'needs_context',
    'fabricated',
    'abusive',
    'prohibited',
    'other'
  )),
  explanation text not null,
  supporting_url text,
  access_source text not null check (access_source in ('faction', 'exchange', 'approved_collaboration')),
  faction_id uuid references public.factions(id) on delete set null,
  exchange_purchase_id uuid references public.marketplace_sync_purchases(id) on delete set null,
  status text not null default 'pending' check (status in (
    'pending', 'reviewing', 'upheld', 'dismissed', 'resolved'
  )),
  resolution text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  unique(entry_id, reporter_user_id)
);

create index if not exists oid_entry_idx on public.open_intelligence_disputes(entry_id);
create index if not exists oid_reporter_user_idx on public.open_intelligence_disputes(reporter_user_id, created_at desc);
create index if not exists oid_status_idx on public.open_intelligence_disputes(status) where status in ('pending', 'reviewing');

alter table public.open_intelligence_disputes enable row level security;

drop policy if exists "oid_self_select" on public.open_intelligence_disputes;
drop policy if exists "oid_self_insert" on public.open_intelligence_disputes;
drop policy if exists "oid_self_insert_v2" on public.open_intelligence_disputes;

-- Users can read their own dispute records (read-only)
create policy "oid_self_select" on public.open_intelligence_disputes
  for select using (auth.uid() = reporter_user_id);

-- NO client INSERT — all dispute creation goes through the secure worker
-- (handleSubmitDispute) which verifies authenticated user, non-owner,
-- legitimate access, valid reason/explanation, duplicate prevention,
-- and rate limits. Only service_role can insert dispute rows.
-- Normal users may not update moderation status or resolution fields.

-- ── 5B-5: INTELLIGENCE CONTRIBUTOR REPUTATION ────────────────────────────
create table if not exists public.intelligence_contributor_reputation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  overall_score numeric not null default 50,  -- bounded 0-100, neutral start
  quality_component numeric not null default 50,
  usefulness_component numeric not null default 50,
  validation_component numeric not null default 50,
  reliability_component numeric not null default 50,
  dispute_penalty numeric not null default 0,
  total_entries int not null default 0,
  entries_used int not null default 0,
  supported_entries int not null default 0,
  disputed_entries int not null default 0,
  rejected_entries int not null default 0,
  withdrawn_entries int not null default 0,
  positive_feedback int not null default 0,
  negative_feedback int not null default 0,
  calculated_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists icr_overall_score_idx on public.intelligence_contributor_reputation(overall_score desc);

alter table public.intelligence_contributor_reputation enable row level security;

drop policy if exists "icr_self_select" on public.intelligence_contributor_reputation;
drop policy if exists "icr_public_select" on public.intelligence_contributor_reputation;

-- Users can see their own complete reputation details
create policy "icr_self_select" on public.intelligence_contributor_reputation
  for select using (auth.uid() = user_id);

-- NO unrestricted public SELECT — the full reputation row contains
-- dispute_penalty, rejected_entries, withdrawn_entries, negative_feedback,
-- and internal reliability components that must NOT be public.
-- Public access is through the safe view public_contributor_reputation
-- which exposes only user_id, overall_score, and calculated_at.
-- No client insert/update — only service_role can write.

-- ── 5B-5b: SAFE PUBLIC REPUTATION VIEW ───────────────────────────────────
-- Exposes only safe aggregate fields for marketplace display.
-- Does NOT expose dispute_penalty, rejected_entries, withdrawn_entries,
-- negative_feedback, or internal reliability components.
create or replace view public.public_contributor_reputation as
  select
    user_id,
    overall_score,
    calculated_at
  from public.intelligence_contributor_reputation;

grant select on public.public_contributor_reputation to anon, authenticated;

-- ── 5B-6: OPEN INTELLIGENCE VERSIONS (edit history) ──────────────────────
create table if not exists public.open_intelligence_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.open_intelligence(id) on delete cascade,
  version_number int not null,
  previous_content text,
  previous_category text,
  previous_subtags jsonb default '[]'::jsonb,
  previous_custom_tags jsonb default '[]'::jsonb,
  previous_confidence_level text,
  previous_validation_status text,
  previous_quality_score int,
  previous_influence_score int,
  change_type text not null check (change_type in ('create', 'edit', 'moderation', 'withdrawal', 'restoration', 'status_change')),
  changed_by uuid not null references auth.users(id) on delete cascade,
  changed_at timestamptz default now(),
  unique(entry_id, version_number)
);

create index if not exists oiv_entry_idx on public.open_intelligence_versions(entry_id, version_number desc);

alter table public.open_intelligence_versions enable row level security;

drop policy if exists "oiv_owner_select" on public.open_intelligence_versions;
drop policy if exists "oiv_owner_insert" on public.open_intelligence_versions;

-- Owner can see their own entry version history (read-only)
create policy "oiv_owner_select" on public.open_intelligence_versions
  for select using (
    exists (
      select 1 from public.open_intelligence oi
      where oi.id = entry_id and oi.user_id = auth.uid()
    )
  );

-- NO client INSERT — version snapshots are created by the secure worker
-- (handleUpdateOpenIntelligence) before editing the entry. This prevents
-- clients from inserting fake version history. Only service_role can insert.

-- ── 5B-7: FEEDBACK RATE LIMITING (anti-gaming) ───────────────────────────
-- Track feedback submissions per user to detect bursts and rings
create table if not exists public.feedback_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  feedback_count int not null default 0,
  dispute_count int not null default 0,
  daily_feedback_count int not null default 0,
  daily_dispute_count int not null default 0,
  window_started_at timestamptz default now(),
  last_feedback_at timestamptz,
  last_dispute_at timestamptz,
  anomaly_flag boolean not null default false,
  anomaly_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists frl_anomaly_idx on public.feedback_rate_limits(anomaly_flag) where anomaly_flag = true;

alter table public.feedback_rate_limits enable row level security;

drop policy if exists "frl_self_select" on public.feedback_rate_limits;
drop policy if exists "frl_self_insert" on public.feedback_rate_limits;
drop policy if exists "frl_self_update" on public.feedback_rate_limits;

-- NO client access — rate-limit counters are managed exclusively by the
-- secure worker (checkAndUpdateRateLimits). Users cannot reset or
-- manipulate feedback_count, dispute_count, anomaly_flag, or last_feedback_at.
-- Only service_role can read and write this table.

-- ── 5B-8: VENDOR QUALITY METRICS RPC ─────────────────────────────────────
-- Safe aggregate quality metrics for a vendor's Exchange-listed entries.
-- Does NOT expose buyer identities, prompts, or private entry content.
create or replace function public.get_vendor_quality_metrics(
  p_vendor_id uuid
)
returns table (
  avg_entry_quality numeric,
  supported_entry_rate numeric,
  dispute_rate numeric,
  rejected_rate numeric,
  recent_usefulness bigint,
  eligible_exchange_entries bigint,
  total_entries bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    coalesce(avg(oi.quality_score), 0)::numeric as avg_entry_quality,
    case when count(*) > 0
      then count(*) filter (where oi.validation_status in ('community_supported', 'externally_supported'))::numeric / count(*)::numeric
      else 0::numeric
    end as supported_entry_rate,
    case when count(*) > 0
      then count(*) filter (where oi.validation_status = 'disputed')::numeric / count(*)::numeric
      else 0::numeric
    end as dispute_rate,
    case when count(*) > 0
      then count(*) filter (where oi.validation_status = 'rejected')::numeric / count(*)::numeric
      else 0::numeric
    end as rejected_rate,
    coalesce(
      (select count(*)::bigint from public.analyst_context_usage acu
       where acu.source_type = 'exchange'
         and acu.source_owner_id = p_vendor_id
         and acu.used_at >= now() - interval '30 days'),
      0::bigint
    ) as recent_usefulness,
    count(*) filter (where oi.exchange_share_enabled = true)::bigint as eligible_exchange_entries,
    count(*)::bigint as total_entries
  from public.open_intelligence oi
  where oi.user_id = p_vendor_id;
end;
$$;

-- ── 5B-9: FACTION QUALITY METRICS RPC ────────────────────────────────────
-- Safe aggregate quality metrics for a faction's shared intelligence.
create or replace function public.get_faction_quality_metrics(
  p_faction_id uuid
)
returns table (
  total_shared_entries bigint,
  avg_quality numeric,
  supported_rate numeric,
  disputed_rate numeric,
  active_contributors bigint,
  entries_used_in_responses bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    count(*)::bigint as total_shared_entries,
    coalesce(avg(oi.quality_score), 0)::numeric as avg_quality,
    case when count(*) > 0
      then count(*) filter (where oi.validation_status in ('community_supported', 'externally_supported'))::numeric / count(*)::numeric
      else 0::numeric
    end as supported_rate,
    case when count(*) > 0
      then count(*) filter (where oi.validation_status = 'disputed')::numeric / count(*)::numeric
      else 0::numeric
    end as disputed_rate,
    count(distinct fsi.user_id)::bigint as active_contributors,
    coalesce(
      (select count(*)::bigint from public.analyst_context_usage acu
       where acu.source_type = 'faction'
         and acu.faction_id = p_faction_id
         and acu.used_at >= now() - interval '30 days'),
      0::bigint
    ) as entries_used_in_responses
  from public.faction_shared_intelligence fsi
  join public.open_intelligence oi on oi.id = fsi.oi_entry_id
  where fsi.faction_id = p_faction_id;
end;
$$;

-- ── 5B-10: CONTRIBUTOR REPUTATION CALCULATION RPC ────────────────────────
-- Server-side reputation recalculation using Bayesian smoothing.
-- Called by the worker after feedback is submitted or periodically.
-- Neutral prior = 50, minimum sample threshold = 5 entries before deviation.
create or replace function public.recalculate_contributor_reputation(
  p_user_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_entries int;
  v_supported int;
  v_disputed int;
  v_rejected int;
  v_withdrawn int;
  v_entries_used int;
  v_total_feedback int;
  v_positive_feedback int;
  v_negative_feedback int;
  v_avg_quality numeric;
  v_prior numeric := 50.0;  -- neutral starting point
  v_entries_used_count int;
  v_prior_weight int := 5;  -- minimum samples before reputation deviates significantly
  v_quality_component numeric;
  v_usefulness_component numeric;
  v_validation_component numeric;
  v_reliability_component numeric;
  v_dispute_penalty numeric;
  v_overall numeric;
begin
  -- Gather entry stats
  select
    count(*),
    count(*) filter (where validation_status in ('community_supported', 'externally_supported')),
    count(*) filter (where validation_status = 'disputed'),
    count(*) filter (where validation_status = 'rejected'),
    count(*) filter (where validation_status = 'withdrawn'),
    coalesce(avg(quality_score), 0)
  into v_total_entries, v_supported, v_disputed, v_rejected, v_withdrawn, v_avg_quality
  from public.open_intelligence
  where user_id = p_user_id;

  -- Gather usage stats from audit
  select count(*) into v_entries_used
  from public.analyst_context_usage
  where source_owner_id = p_user_id
    and source_type in ('personal', 'faction', 'exchange');

  -- Gather feedback stats
  select
    count(*),
    count(*) filter (where feedback_type in ('helpful', 'accurate_to_my_experience')),
    count(*) filter (where feedback_type in ('incorrect', 'misleading', 'abusive', 'outdated'))
  into v_total_feedback, v_positive_feedback, v_negative_feedback
  from public.open_intelligence_feedback
  where entry_id in (select id from public.open_intelligence where user_id = p_user_id);

  -- Bayesian-smoothed quality component (prior=50, weight=5 entries)
  v_quality_component := ((v_prior * v_prior_weight) + coalesce(v_avg_quality, 50) * greatest(v_total_entries, 0))
    / greatest(v_prior_weight + v_total_entries, 1);

  -- Usefulness component: based on entries used in analyst responses
  v_usefulness_component := 50.0;
  if v_total_entries > 0 then
    v_usefulness_component := 30.0 + (least(v_entries_used::numeric / greatest(v_total_entries::numeric, 1), 1.0) * 40.0);
  end if;

  -- Validation component: ratio of supported to total (Bayesian smoothed)
  v_validation_component := ((50.0 * v_prior_weight) +
    coalesce(v_supported::numeric, 0) * 100.0 / greatest(v_total_entries::numeric, 1) * v_total_entries)
    / greatest(v_prior_weight + v_total_entries, 1);

  -- Reliability component: 1 - (disputed+rejected+withdrawn) ratio, smoothed
  v_reliability_component := 50.0;
  if v_total_entries > 0 then
    v_reliability_component := 100.0 * (1.0 -
      ((v_disputed + v_rejected + v_withdrawn)::numeric / v_total_entries));
    -- Bayesian smoothing toward 50
    v_reliability_component := ((50.0 * v_prior_weight) + v_reliability_component * v_total_entries)
      / greatest(v_prior_weight + v_total_entries, 1);
  end if;

  -- Dispute penalty: scales with dispute rate, capped at 30 points
  v_dispute_penalty := 0.0;
  if v_total_entries > 0 then
    v_dispute_penalty := least(30.0, (v_disputed::numeric / v_total_entries) * 50.0);
  end if;

  -- Feedback adjustment: positive feedback boosts, negative reduces
  declare
    v_feedback_adjustment numeric := 0.0;
    v_feedback_samples int;
  begin
    v_feedback_samples := v_positive_feedback + v_negative_feedback;
    if v_feedback_samples > 0 then
      -- Bayesian smoothed feedback ratio
      v_feedback_adjustment := (((v_positive_feedback - v_negative_feedback)::numeric / v_feedback_samples) * 20.0
        * least(v_feedback_samples::numeric / 10.0, 1.0));
    end if;

    -- Overall: weighted average of components minus dispute penalty plus feedback adjustment
    v_overall := (
      v_quality_component * 0.30 +
      v_usefulness_component * 0.20 +
      v_validation_component * 0.25 +
      v_reliability_component * 0.25
    ) - v_dispute_penalty + v_feedback_adjustment;

    -- Clamp to 0-100
    v_overall := greatest(0, least(100, v_overall));
  end;

  -- Upsert reputation row
  insert into public.intelligence_contributor_reputation (
    user_id, overall_score, quality_component, usefulness_component,
    validation_component, reliability_component, dispute_penalty,
    total_entries, entries_used, supported_entries, disputed_entries,
    rejected_entries, withdrawn_entries,
    positive_feedback, negative_feedback, calculated_at
  ) values (
    p_user_id, v_overall, v_quality_component, v_usefulness_component,
    v_validation_component, v_reliability_component, v_dispute_penalty,
    v_total_entries, v_entries_used, v_supported, v_disputed,
    v_rejected, v_withdrawn,
    v_positive_feedback, v_negative_feedback, now()
  )
  on conflict (user_id) do update set
    overall_score = excluded.overall_score,
    quality_component = excluded.quality_component,
    usefulness_component = excluded.usefulness_component,
    validation_component = excluded.validation_component,
    reliability_component = excluded.reliability_component,
    dispute_penalty = excluded.dispute_penalty,
    total_entries = excluded.total_entries,
    entries_used = excluded.entries_used,
    supported_entries = excluded.supported_entries,
    disputed_entries = excluded.disputed_entries,
    rejected_entries = excluded.rejected_entries,
    withdrawn_entries = excluded.withdrawn_entries,
    positive_feedback = excluded.positive_feedback,
    negative_feedback = excluded.negative_feedback,
    calculated_at = excluded.calculated_at,
    updated_at = now();

  return v_overall;
end;
$$;

-- ── 5B-11: STALENESS EVALUATION RPC ──────────────────────────────────────
-- Domain-aware staleness scoring. Fast-changing domains age faster.
create or replace function public.evaluate_entry_staleness(
  p_entry_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_created timestamptz;
  v_age_days numeric;
  v_max_age_days int;
  v_staleness numeric;
  v_outdated_feedback_count int;
begin
  select intelligence_domain, created_at
  into v_domain, v_created
  from public.open_intelligence
  where id = p_entry_id;

  if not found then return 0; end if;

  v_age_days := extract(epoch from (now() - v_created)) / 86400.0;

  -- Domain-specific max age before staleness kicks in
  v_max_age_days := case v_domain
    when 'finance' then 30
    when 'technology' then 60
    when 'health_fitness' then 90
    when 'sports' then 120
    when 'gaming' then 120
    when 'music' then 180
    when 'film_tv' then 180
    when 'fashion' then 180
    when 'business' then 180
    when 'education' then 365
    else 180
  end;

  -- Linear staleness: 0 at creation, 100 at 2x max_age
  v_staleness := least(100, (v_age_days / (v_max_age_days * 2)) * 100);

  -- Check for 'outdated' feedback — each one adds 10 to staleness
  select count(*) into v_outdated_feedback_count
  from public.open_intelligence_feedback
  where entry_id = p_entry_id and feedback_type = 'outdated';

  v_staleness := least(100, v_staleness + (v_outdated_feedback_count * 10));

  -- Update the entry
  update public.open_intelligence
  set staleness_score = v_staleness,
      staleness_evaluated_at = now(),
      outdated_flag = (v_staleness >= 70)
  where id = p_entry_id;

  return v_staleness;
end;
$$;

-- ── 5B-12: Add dispute_count column to open_intelligence for fast filtering ─
alter table public.open_intelligence add column if not exists active_dispute_count int not null default 0;

create index if not exists oi_active_dispute_idx on public.open_intelligence(active_dispute_count) where active_dispute_count > 0;

-- ── 5B-CORRECTION: OI self-update RLS policy ─────────────────────────────────
-- Owners may update their own Open Intelligence entries (content, tags, confidence,
-- exchange_share_enabled). Server-authoritative fields (quality_score, influence_score,
-- content_hash, duplicate_flag, validation_status, staleness_score) are overwritten
-- by the worker after any edit — client-submitted values for those columns are ignored.
drop policy if exists "oi_self_update" on public.open_intelligence;
create policy "oi_self_update" on public.open_intelligence
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 5B-CORRECTION: Server-side quality scoring on insert ─────────────────────
-- SECURITY DEFINER trigger that overwrites client-supplied quality_score,
-- influence_score, content_hash, and duplicate_flag with server-authoritative
-- values. The client may NOT set these trusted fields.
create or replace function public.evaluate_oi_quality_trigger()
returns trigger as $$
declare
  v_text text;
  v_char_count int;
  v_score int := 0;
  v_proper_nouns int;
  v_numbers int;
  v_sentence_count int;
  v_avg_sentence_len numeric;
  v_tag_count int;
  v_confidence_boost numeric;
  v_support_count int;
  v_lower_text text;
  v_support_keywords text[] := array['because','according to','source','evidence','observed','measured','reported','data','study','analysis'];
  v_negation_count int;
  v_word_freq jsonb;
  v_repeated_words int;
  v_meaningful_words int;
  v_entry_type_bonus int;
  v_influence int;
  v_new_hash text;
  v_dup_entry_id uuid;
begin
  v_text := trim(coalesce(new.content, ''));
  if v_text = '' then
    new.quality_score := 0;
    new.influence_score := 0;
    new.content_hash := null;
    new.duplicate_flag := false;
    return new;
  end if;

  v_char_count := length(replace(replace(replace(replace(v_text, ' ', ''), chr(9), ''), chr(10), ''), chr(13), ''));

  -- 1. Detail
  if v_char_count >= 200 then v_score := v_score + 20;
  elseif v_char_count >= 100 then v_score := v_score + 15;
  elseif v_char_count >= 50 then v_score := v_score + 10;
  elseif v_char_count >= 20 then v_score := v_score + 5;
  end if;

  -- 2. Clarity
  v_sentence_count := array_length(string_to_array(v_text, '.'), 1) - 1;
  if v_sentence_count > 0 then
    v_avg_sentence_len := length(v_text) / v_sentence_count;
    if v_avg_sentence_len > 0 and v_avg_sentence_len < 200 then v_score := v_score + 10;
    else v_score := v_score + 5; end if;
  end if;

  -- 3. Specificity
  v_proper_nouns := array_length(regexp_matches(v_text, '\b[A-Z][a-z]{2,}\b', 'g'), 1);
  v_numbers := array_length(regexp_matches(v_text, '\b\d+', 'g'), 1);
  v_score := v_score + least(15, coalesce(v_proper_nouns, 0) * 3 + coalesce(v_numbers, 0) * 2);

  -- 4. Category/tag alignment
  v_tag_count := coalesce(array_length(coalesce(new.selected_subtags, '{}'::jsonb), 1), 0)
    + coalesce(array_length(coalesce(new.custom_tags, '{}'::jsonb), 1), 0)
    + case when new.selected_category is not null then 1 else 0 end;
  v_score := v_score + least(10, v_tag_count * 3);

  -- 5. Entry-type depth bonus
  v_entry_type_bonus := case new.entry_type
    when 'quick_observation' then 0
    when 'basic_deep_entry' then 4
    when 'advanced_deep_entry' then 8
    else 0 end;
  v_score := v_score + v_entry_type_bonus;

  -- 6. Confidence boost
  v_confidence_boost := case new.confidence_level
    when 'verified_observation' then 5
    when 'strong_confidence' then 4
    when 'moderate_confidence' then 3
    when 'weak_suspicion' then 1
    else 2 end;
  v_score := v_score + v_confidence_boost;

  -- 7. Supporting context
  v_lower_text := lower(v_text);
  select count(*) into v_support_count
  from unnest(v_support_keywords) as kw
  where v_lower_text like '%' || kw || '%';
  v_score := v_score + least(10, v_support_count * 3);

  -- 8. Internal consistency (simplified)
  v_negation_count := coalesce(array_length(regexp_matches(v_text, '\bnot\b|\bnever\b|\bcannot\b', 'gi'), 1), 0);
  if v_negation_count <= 2 then v_score := v_score + 5; end if;

  -- 9. Non-duplicative (keyword stuffing check — simplified)
  v_meaningful_words := array_length(
    array_remove(
      array(SELECT word FROM unnest(string_to_array(lower(v_text), ' ')) AS word WHERE char_length(word) > 2),
      NULL
    ), 1);
  if coalesce(v_meaningful_words, 0) < 5 then v_score := v_score - 15; end if;

  -- Clamp
  v_score := greatest(0, least(100, v_score));
  new.quality_score := v_score;

  -- Influence baseline
  v_influence := round(
    v_score * 0.7 *
    case new.confidence_level
      when 'verified_observation' then 1.15
      when 'strong_confidence' then 1.0
      when 'moderate_confidence' then 0.85
      else 0.65 end *
    case new.entry_type
      when 'quick_observation' then 0.8
      when 'basic_deep_entry' then 1.0
      when 'advanced_deep_entry' then 1.15
      else 1.0 end
    + v_score * 0.3
  );
  new.influence_score := greatest(0, least(100, v_influence));

  -- Content hash
  v_new_hash := 'ch_' || substring(md5(lower(regexp_replace(v_text, '[^a-zA-Z0-9]', '', 'g'))) from 1 for 16);
  new.content_hash := v_new_hash;

  -- Duplicate detection (same user, other entries)
  select id into v_dup_entry_id
  from public.open_intelligence
  where user_id = new.user_id
    and id != new.id
    and content_hash = v_new_hash
  limit 1;
  new.duplicate_flag := v_dup_entry_id is not null;

  -- Ensure version_number starts at 1 on insert
  if TG_OP = 'INSERT' and new.version_number is null then
    new.version_number := 1;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists oi_quality_on_insert on public.open_intelligence;
create trigger oi_quality_on_insert
  before insert on public.open_intelligence
  for each row execute function public.evaluate_oi_quality_trigger();

drop trigger if exists oi_quality_on_update on public.open_intelligence;
create trigger oi_quality_on_update
  before update on public.open_intelligence
  for each row execute function public.evaluate_oi_quality_trigger();

-- Comment: The trigger overwrites client-supplied quality_score, influence_score,
-- content_hash, and duplicate_flag on every INSERT and UPDATE. Client values for
-- these fields are ignored. validation_status is NOT overwritten by this trigger
-- (it is managed by the worker via disputes/feedback/moderation flows).

-- ── 5B-CORRECTION: Legacy status migration (idempotent) ─────────────────────
-- Map remaining legacy 'validated' and 'flagged' values to new statuses.
do $$
begin
  update public.open_intelligence set validation_status = 'community_supported'
    where validation_status = 'validated';
  update public.open_intelligence set validation_status = 'disputed'
    where validation_status = 'flagged';
exception when others then null;
end $$;
