/**
 * RevenueCat service — module-level Purchases configuration and helpers.
 *
 * Configured at the top level so it runs once when the module is first imported.
 * The React Query provider in providers/RevenueCatProvider.tsx wraps the async
 * fetches for offerings and customer info.
 *
 * Key selection rules:
 *  - iOS native builds → EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
 *  - Android native builds → EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
 *  - Test store only when EXPO_PUBLIC_REVENUECAT_USE_TEST_STORE === "true"
 *  - Web / unknown platform → no key (test-store fallback if flag is set)
 */

import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";
import type { SubscriptionTier } from "@/services/tiers";
import { SUBSCRIPTION_PRODUCT_IDS } from "@/services/tiers";

// ── API Key selection ──────────────────────────────────────────────────────

export type RevenueCatKeyMode = "ios" | "android" | "test-store" | "unavailable";

/** Pick the correct RevenueCat API key based on the runtime environment. */
function getRevenueCatApiKey(): { apiKey: string; mode: RevenueCatKeyMode } {
  const useTestStore = process.env.EXPO_PUBLIC_REVENUECAT_USE_TEST_STORE === "true";

  if (useTestStore) {
    const testKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? "";
    if (testKey) {
      if (__DEV__) {
        console.log("[RevenueCat] key mode: test-store (EXPO_PUBLIC_REVENUECAT_USE_TEST_STORE=true)");
      }
      return { apiKey: testKey, mode: "test-store" };
    }
  }

  // Native platforms — use their production/sandbox keys
  if (Platform.OS === "ios") {
    const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "";
    if (iosKey) {
      if (__DEV__) {
        console.log("[RevenueCat] key mode: ios");
      }
      return { apiKey: iosKey, mode: "ios" };
    }
  }

  if (Platform.OS === "android") {
    const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "";
    if (androidKey) {
      if (__DEV__) {
        console.log("[RevenueCat] key mode: android");
      }
      return { apiKey: androidKey, mode: "android" };
    }
  }

  // Fallback to test key only on web or when no platform key is set
  const testKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? "";
  if (testKey) {
    if (__DEV__) {
      console.log("[RevenueCat] key mode: test-store (fallback — no platform key set)");
    }
    return { apiKey: testKey, mode: "test-store" };
  }

  console.warn("[RevenueCat] No API key configured — RevenueCat disabled");
  return { apiKey: "", mode: "unavailable" };
}

// ── Configure at module level ──────────────────────────────────────────────

const { apiKey, mode: keyMode } = getRevenueCatApiKey();

if (apiKey) {
  Purchases.configure({ apiKey });
  if (__DEV__) {
    console.log("[RevenueCat] Purchases.configure() called with key mode:", keyMode);
    console.log("[RevenueCat] Runtime platform:", Platform.OS);
    console.log("[RevenueCat] Configured:", !!apiKey);
  }
} else {
  console.warn("[RevenueCat] Purchases NOT configured — no valid API key");
}

/** Whether RevenueCat has been configured with a valid API key. */
export const isRevenueCatConfigured = (): boolean => !!apiKey;

/** The active key mode for diagnostics. */
export const getRevenueCatKeyMode = (): RevenueCatKeyMode => keyMode;

// ── Tier derivation from CustomerInfo ──────────────────────────────────────

/**
 * Derive the paid subscription tier from RevenueCat CustomerInfo.
 *
 * Priority (highest first): syndicate → oracle_elite → pro → free.
 * Detects using activeSubscriptions containing known product identifiers.
 */
export function getRevenueCatSubscriptionTier(
  customerInfo: CustomerInfo | null,
): SubscriptionTier {
  if (!customerInfo) return "free";

  const activeSubs = customerInfo.activeSubscriptions;
  if (!activeSubs || activeSubs.length === 0) return "free";

  const activeIds = new Set(activeSubs);

  // Check in priority order — highest tier first
  if (activeIds.has(SUBSCRIPTION_PRODUCT_IDS.syndicate)) return "syndicate";
  if (activeIds.has(SUBSCRIPTION_PRODUCT_IDS.oracle_elite)) return "oracle_elite";
  if (activeIds.has(SUBSCRIPTION_PRODUCT_IDS.pro)) return "pro";

  return "free";
}

// ── Product mapping ────────────────────────────────────────────────────────

/** Map a RevenueCat product identifier to subscription tier. */
export function subscriptionTierFromProductId(productId: string): SubscriptionTier | null {
  for (const [tier, id] of Object.entries(SUBSCRIPTION_PRODUCT_IDS)) {
    if (id === productId) return tier as SubscriptionTier;
  }
  return null;
}

/** Check if a product identifier is a known subscription product. */
export function isSubscriptionProduct(productId: string): boolean {
  return subscriptionTierFromProductId(productId) !== null;
}

/** Check if a product identifier is a known consumable Neuron product. */
export function isNeuronProduct(productId: string): boolean {
  return productId.startsWith("store_edge_");
}

// ── Async helpers ──────────────────────────────────────────────────────────

/** Fetch the current offerings from RevenueCat. Returns null if not configured. */
export async function getOfferings(): Promise<{
  offering: PurchasesOffering | null;
  allOfferings: PurchasesOffering[];
}> {
  if (!apiKey) return { offering: null, allOfferings: [] };

  const offerings = await Purchases.getOfferings();

  const current = offerings.current;
  const all: PurchasesOffering[] = [];

  if (offerings.all) {
    for (const [id, offering] of Object.entries(offerings.all)) {
      if (offering) {
        all.push(offering);
        if (__DEV__) {
          console.log(`[RevenueCat] Offering "${id}":`, offering.identifier, `(${offering.availablePackages.length} packages)`);
        }
      }
    }
  }

  // Prefer current; fall back to "default"
  let offering: PurchasesOffering | null = current ?? null;
  if (!offering && offerings.all?.["default"]) {
    offering = offerings.all["default"];
    if (__DEV__) {
      console.log("[RevenueCat] No current offering — falling back to 'default'");
    }
  }

  if (__DEV__) {
    if (offering) {
      console.log(`[RevenueCat] Active offering: "${offering.identifier}"`);
      for (const pkg of offering.availablePackages) {
        console.log(`[RevenueCat]   Package: ${pkg.identifier} → product: ${pkg.product.identifier} (${pkg.product.productCategory ?? "unknown"}) ${pkg.product.priceString ?? `$${pkg.product.price}`}`);
      }
    } else {
      console.log("[RevenueCat] No offerings available");
    }
  }

  return { offering, allOfferings: all };
}

/** Purchase a package. Returns the resulting CustomerInfo on success. */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<{ customerInfo: CustomerInfo }> {
  const result = await Purchases.purchasePackage(pkg);
  return result;
}

/** Restore previous purchases. Returns the latest CustomerInfo. */
export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

/** Fetch the latest customer info (entitlements, active subscriptions, etc.). */
export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

/** Log the current user into RevenueCat for cross-device purchase sync. */
export async function logInRevenueCat(userId: string): Promise<CustomerInfo> {
  if (!apiKey) {
    if (__DEV__) {
      console.log("[RevenueCat] logIn skipped — RC not configured");
    }
    return Purchases.getCustomerInfo();
  }
  if (__DEV__) {
    console.log("[RevenueCat] logIn:", userId);
  }
  const { customerInfo } = await Purchases.logIn(userId);
  return customerInfo;
}

/** Log out the current RevenueCat user. */
export async function logOutRevenueCat(): Promise<CustomerInfo> {
  if (!apiKey) {
    return Purchases.getCustomerInfo();
  }
  if (__DEV__) {
    console.log("[RevenueCat] logOut");
  }
  const customerInfo = await Purchases.logOut();
  return customerInfo;
}

/**
 * Register a listener for customer info updates.
 * Returns a handle so callers can clean up via Purchases.removeCustomerInfoUpdateListener.
 */
export function addCustomerInfoListener(
  callback: (customerInfo: CustomerInfo) => void,
): { remove: () => void } {
  Purchases.addCustomerInfoUpdateListener(callback);
  return {
    remove: () => {
      Purchases.removeCustomerInfoUpdateListener(callback);
    },
  };
}
