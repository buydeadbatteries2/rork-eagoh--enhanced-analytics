import { supabase } from "@/lib/supabase";
import { TIER_MONTHLY_ALLOCATION } from "@/services/edge";

/**
 * Profile service – persists user profile data in the `profiles` Supabase table.
 *
 * Expected schema (run in Supabase SQL editor):
 * ```
 * create table public.profiles (
 *   id uuid primary key references auth.users(id) on delete cascade,
 *   username text,
 *   subscription_tier text default 'free',
 *   edge_subscription int default 0,
 *   edge_purchased int default 0,
 *   selected_labs jsonb default '[]'::jsonb,
 *   selected_eagohs jsonb default '[]'::jsonb,
 *   preferences jsonb default '{}'::jsonb,
 *   created_at timestamptz default now(),
 *   updated_at timestamptz default now()
 * );
 * alter table public.profiles enable row level security;
 * create policy "profiles_self_select" on public.profiles for select using (auth.uid() = id);
 * create policy "profiles_self_upsert" on public.profiles for insert with check (auth.uid() = id);
 * create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);
 * ```
 */

export type SubscriptionTier = "free" | "pro" | "oracle_elite" | "syndicate";

export type ProfilePreferences = {
  notifications?: boolean;
  hapticsEnabled?: boolean;
  reducedMotion?: boolean;
  [key: string]: unknown;
};

export type UserProfile = {
  id: string;
  username: string | null;
  subscription_tier: SubscriptionTier;
  edge_subscription: number;
  edge_purchased: number;
  selected_labs: string[];
  selected_eagohs: string[];
  preferences: ProfilePreferences;
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = Partial<Omit<UserProfile, "id" | "created_at" | "updated_at">>;

const DEFAULT_PROFILE = (id: string, username?: string | null): UserProfile => ({
  id,
  username: username ?? null,
  subscription_tier: "free",
  edge_subscription: 0,
  edge_purchased: 0,
  selected_labs: [],
  selected_eagohs: [],
  preferences: {},
});

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data as UserProfile | null) ?? null;
}

export async function ensureProfile(userId: string, username?: string | null): Promise<UserProfile> {
  const existing = await fetchProfile(userId);
  if (existing) return existing;
  const base = DEFAULT_PROFILE(userId, username);
  const { data, error } = await supabase.from("profiles").insert(base).select("*").single();
  if (error) throw error;
  return data as UserProfile;
}

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<UserProfile> {
  const payload = { ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data as UserProfile;
}

export async function setSubscriptionTier(userId: string, tier: SubscriptionTier): Promise<UserProfile> {
  return updateProfile(userId, { subscription_tier: tier });
}

export async function setSelectedLabs(userId: string, labs: string[]): Promise<UserProfile> {
  return updateProfile(userId, { selected_labs: labs });
}

export async function setSelectedEagohs(userId: string, eagohs: string[]): Promise<UserProfile> {
  return updateProfile(userId, { selected_eagohs: eagohs });
}

export async function setPreferences(userId: string, preferences: ProfilePreferences): Promise<UserProfile> {
  return updateProfile(userId, { preferences });
}

/**
 * Subscription Testing Mode — sets tier AND refills subscription Edge.
 * Does NOT touch purchased Edge. Only for dev/internal testing.
 */
export async function setTestTier(userId: string, tier: SubscriptionTier): Promise<UserProfile> {
  const allocation = TIER_MONTHLY_ALLOCATION[tier] ?? 0;
  return updateProfile(userId, {
    subscription_tier: tier,
    edge_subscription: allocation,
  });
}
