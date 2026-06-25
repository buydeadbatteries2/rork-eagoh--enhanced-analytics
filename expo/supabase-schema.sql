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

drop policy if exists "fsi_select_all" on public.faction_shared_intelligence;
drop policy if exists "fsi_self_insert" on public.faction_shared_intelligence;
drop policy if exists "fsi_commander_delete" on public.faction_shared_intelligence;

create policy "fsi_select_faction_members" on public.faction_shared_intelligence
  for select using (
    exists (
      select 1 from public.faction_members fm
      where fm.faction_id = faction_id
        and fm.user_id = auth.uid()
        and fm.status = 'active'
    )
  );

create policy "fsi_self_insert" on public.faction_shared_intelligence
  for insert with check (auth.uid() = user_id);

create policy "fsi_commander_delete" on public.faction_shared_intelligence
  for delete using (
    exists (
      select 1 from public.factions f
      where f.id = faction_id and f.commander_id = auth.uid()
    )
  );

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

create policy "mvs_select_all" on public.marketplace_vendor_stats
  for select using (true);

create policy "mvs_vendor_insert" on public.marketplace_vendor_stats
  for insert with check (auth.uid() = vendor_id);

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
-- STORAGE BUCKET: eagoh-renders (public read, owner write)
-- =============================================================================
insert into storage.buckets (id, name, public)
  values ('eagoh-renders', 'eagoh-renders', true)
  on conflict (id) do nothing;

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
