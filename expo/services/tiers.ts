/**
 * Shared tier types and constants.
 *
 * Extracted to break the require cycle between profile.ts and edge.ts.
 */

/** Subscription tiers available in the EAGOH platform. */
export type SubscriptionTier = "free" | "pro" | "oracle_elite" | "syndicate";

/** Admin override tier — mirrors SubscriptionTier but also allows null (no override). */
export type AdminOverrideTier = SubscriptionTier | null;

/** Monthly subscription Neuron allocations per tier. Free tier receives 25 Neurons monthly. */
export const TIER_MONTHLY_ALLOCATION: Record<SubscriptionTier, number> = {
  free: 25,
  pro: 600,
  oracle_elite: 1400,
  syndicate: 3700,
};

/** Maximum number of user-forged EAGOHs per tier. Default shells are excluded. */
export const TIER_MAX_EAGOHS: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 2,
  oracle_elite: 3,
  syndicate: 5,
};

/** Neuron efficiency multiplier per tier. */
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

/**
 * RevenueCat Test Store product aliases — maps Test Store product IDs to their
 * real App Store counterparts. When Test Store mode is active, the subscription
 * screen uses these to match test products to the correct tier.
 *
 * Server-side, RevenueCat Test Store may create products with different
 * identifiers than the production App Store Connect products. This map
 * bridges the gap so test purchases still flow through the correct tier flow.
 */
export const TEST_STORE_SUBSCRIPTION_ALIASES: Record<string, string> = {
  // Common RevenueCat Test Store naming conventions
  test_pro_sub: "pro_sub",
  test_oracle_elite_sub: "oracle_elite_sub",
  test_syndicate_sub: "syndicate_sub",
  // Also match bare product IDs in case Test Store returns them directly
  pro_sub: "pro_sub",
  oracle_elite_sub: "oracle_elite_sub",
  syndicate_sub: "syndicate_sub",
};

/** Map a RevenueCat product ID to its corresponding subscription tier. */
export function subscriptionTierFromProductId(productId: string): SubscriptionTier | null {
  // Check the direct mapping first
  for (const [tier, id] of Object.entries(SUBSCRIPTION_PRODUCT_IDS)) {
    if (id === productId) return tier as SubscriptionTier;
  }
  // Check test store aliases
  const aliased = TEST_STORE_SUBSCRIPTION_ALIASES[productId];
  if (aliased) {
    for (const [tier, id] of Object.entries(SUBSCRIPTION_PRODUCT_IDS)) {
      if (id === aliased) return tier as SubscriptionTier;
    }
  }
  return null;
}

/** Display labels for each tier. */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  pro: "Pro",
  oracle_elite: "Oracle Elite",
  syndicate: "Syndicate",
};

/** Feature benefit descriptions per tier. */
export const TIER_BENEFITS: Record<Exclude<SubscriptionTier, "free">, string[]> = {
  pro: [
    "600 monthly Neurons",
    "Up to 2 EAGOHs",
    "1.0x Neuron efficiency",
    "Full Intelligence Domain access",
    "Marketplace access",
    "Faction Network access",
  ],
  oracle_elite: [
    "1,400 monthly Neurons",
    "Up to 3 EAGOHs",
    "1.2x Neuron efficiency",
    "Priority analyst processing",
    "Advanced Marketplace tools",
    "Faction Network leadership",
  ],
  syndicate: [
    "3,700 monthly Neurons",
    "Up to 5 EAGOHs",
    "1.5x Neuron efficiency",
    "Maximum analyst processing",
    "Full Marketplace suite",
    "Faction Network command",
    "Sponsored Banner discounts",
  ],
};
