/**
 * Development-only test subscription persistence.
 *
 * Stores a per-user test tier in AsyncStorage so test subscriptions
 * survive app restarts in Expo Go / Rork preview. Each user gets their
 * own key — one account never inherits another's test tier.
 *
 * This module is a no-op outside of __DEV__.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SubscriptionTier } from "@/services/profile";

const keyFor = (userId: string): string => `eagoh_test_subscription_${userId}`;

/**
 * Read the persisted test subscription tier for a user.
 * Returns null in production or when no test tier is stored.
 */
export async function getTestSubscriptionTier(userId: string): Promise<SubscriptionTier | null> {
  if (!__DEV__) return null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    // Validate the stored value is a known tier
    if (raw === "free" || raw === "pro" || raw === "oracle_elite" || raw === "syndicate") {
      return raw as SubscriptionTier;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist a test subscription tier for a user (development only).
 */
export async function setTestSubscriptionTier(userId: string, tier: SubscriptionTier): Promise<void> {
  if (!__DEV__) return;
  await AsyncStorage.setItem(keyFor(userId), tier);
}

/**
 * Remove the persisted test subscription tier for a user.
 */
export async function clearTestSubscriptionTier(userId: string): Promise<void> {
  if (!__DEV__) return;
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // Best-effort
  }
}
