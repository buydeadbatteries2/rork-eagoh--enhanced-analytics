/**
 * Shared tier types and constants.
 *
 * Extracted to break the require cycle between profile.ts and edge.ts.
 */

/** Subscription tiers available in the EAGOH platform. */
export type SubscriptionTier = "free" | "pro" | "oracle_elite" | "syndicate";

/** Admin override tier — mirrors SubscriptionTier but also allows null (no override). */
export type AdminOverrideTier = SubscriptionTier | null;

/** Monthly subscription Edge allocations per tier. Free tier is dormant (no allocation). */
export const TIER_MONTHLY_ALLOCATION: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 600,
  oracle_elite: 1400,
  syndicate: 3700,
};

/** Maximum number of EAGOHs per tier. */
export const TIER_MAX_EAGOHS: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 2,
  oracle_elite: 3,
  syndicate: 5,
};

/** Edge efficiency multiplier per tier. */
export const TIER_MULTIPLIER: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 1.0,
  oracle_elite: 1.2,
  syndicate: 1.5,
};

/** RevenueCat product IDs for each subscription tier. */
export const SUBSCRIPTION_PRODUCT_IDS: Record<Exclude<SubscriptionTier, "free">, string> = {
  pro: "pro_sub",
  oracle_elite: "oracle_elite_sub",
  syndicate: "syndicate_sub",
};

/** Map a RevenueCat product ID to its corresponding subscription tier. */
export function subscriptionTierFromProductId(productId: string): SubscriptionTier | null {
  for (const [tier, id] of Object.entries(SUBSCRIPTION_PRODUCT_IDS)) {
    if (id === productId) return tier as SubscriptionTier;
  }
  return null;
}
