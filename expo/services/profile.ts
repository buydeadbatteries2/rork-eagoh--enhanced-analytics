import { supabase } from "@/lib/supabase";

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

/** Admin override tier — mirrors SubscriptionTier but also allows null (no override). */
export type AdminTierOverride = null | "free" | "pro" | "oracle_elite" | "syndicate";

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
  admin_tier_override: AdminTierOverride;
  admin_tier_expires_at: string | null;
  admin_tier_note: string | null;
  edge_subscription: number;
  edge_purchased: number;
  selected_labs: string[];
  selected_eagohs: string[];
  preferences: ProfilePreferences;
  avatar_url: string | null;
  banner_url: string | null;
  public_display_title: string | null;
  is_social_verified: boolean;
  social_verified_platform: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Users can never update admin override fields from the app. Only service_role / Supabase dashboard can. */
export type ProfileUpdate = Partial<Omit<UserProfile, "id" | "created_at" | "updated_at" | "admin_tier_override" | "admin_tier_expires_at" | "admin_tier_note">>;

const DEFAULT_PROFILE = (id: string, username?: string | null): UserProfile => ({
  id,
  username: username ?? null,
  subscription_tier: "free",
  admin_tier_override: null,
  admin_tier_expires_at: null,
  admin_tier_note: null,
  edge_subscription: 0,
  edge_purchased: 0,
  selected_labs: [],
  selected_eagohs: [],
  preferences: {},
  avatar_url: null,
  banner_url: null,
  public_display_title: null,
  is_social_verified: false,
  social_verified_platform: null,
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

// ── Admin Tier Override ────────────────────────────────────────────────────

/**
 * Compute the user's effective subscription tier, respecting any active admin
 * tier override. Rules:
 *
 * 1. If admin_tier_override is null → normal subscription_tier
 * 2. If admin_tier_expires_at is null → override is permanent (no expiry)
 * 3. If admin_tier_expires_at is in the future → override is active
 * 4. If admin_tier_expires_at is in the past → ignore the override
 * 5. The result is always a valid SubscriptionTier (falls back to "free" when
 *    the profile itself is null/undefined, e.g. before first fetch).
 *
 * This function accepts a minimal shape so callers can pass either a full
 * UserProfile or a partial object without needing to import the full type.
 */
export function getEffectiveSubscriptionTier(
  profile: Pick<UserProfile, "subscription_tier" | "admin_tier_override" | "admin_tier_expires_at"> | null | undefined,
): SubscriptionTier {
  if (!profile) return "free";

  const override = profile.admin_tier_override;
  if (!override) return profile.subscription_tier ?? "free";

  const expiresAt = profile.admin_tier_expires_at;
  if (expiresAt) {
    const now = new Date();
    const expiry = new Date(expiresAt);
    if (expiry <= now) return profile.subscription_tier ?? "free";
  }

  return override;
}

/** Returns true when the profile has an active admin tier override. */
export function hasActiveAdminOverride(
  profile: Pick<UserProfile, "subscription_tier" | "admin_tier_override" | "admin_tier_expires_at"> | null | undefined,
): boolean {
  if (!profile) return false;
  return getEffectiveSubscriptionTier(profile) !== (profile.subscription_tier ?? "free");
}
