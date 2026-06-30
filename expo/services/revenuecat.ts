/**
 * RevenueCat service — lazy Purchases configuration and helpers.
 *
 * No Purchases.configure() runs at module import — RevenueCatProvider calls
 * configureRevenueCat() in a useEffect guarded by runtime detection.
 * This avoids crashing Expo Go (which lacks native StoreKit).
 *
 * Key selection rules:
 *  - iOS native builds (not Expo Go) → EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
 *  - Android native builds (not Expo Go) → EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
 *  - Test store only when EXPO_PUBLIC_REVENUECAT_USE_TEST_STORE === "true"
 *  - Expo Go, Rork preview, or Web → skip configuration (graceful preview mode)
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";
import type { SubscriptionTier } from "@/services/tiers";
import { SUBSCRIPTION_PRODUCT_IDS, normalizeNeuronProductId } from "@/services/tiers";

// ── Runtime detection ───────────────────────────────────────────────────────

/** The overarching runtime category for RevenueCat behaviour. */
export type RevenueCatRuntimeMode =
  | "ios-store"
  | "android-store"
  | "test-store"
  | "expo-go-disabled"
  | "web-disabled"
  | "unconfigured";

export type RevenueCatKeyMode = "ios" | "android" | "test-store" | "unavailable";

/** True when running inside Expo Go (or Rork's Expo Go-based preview). */
export function isExpoGoRuntime(): boolean {
  try {
    // executionEnvironment is "storeClient" inside Expo Go
    const env = (Constants as { executionEnvironment?: string }).executionEnvironment;
    return env === "storeClient";
  } catch {
    return false;
  }
}

/** True when running on a native build that has the App Store / Play Store environment. */
export function isNativeStoreRuntime(): boolean {
  if (Platform.OS === "web") return false;
  return !isExpoGoRuntime();
}

/** True when the RevenueCat Test Store is explicitly enabled via env flag. */
export function isRevenueCatTestStoreEnabled(): boolean {
  return process.env.EXPO_PUBLIC_REVENUECAT_USE_TEST_STORE === "true";
}

// ── Configuration state (set by configureRevenueCat) ────────────────────────

let _apiKey = "";
let _keyMode: RevenueCatKeyMode = "unavailable";
let _runtimeMode: RevenueCatRuntimeMode = "unconfigured";
let _configured = false;
let _configurationError: string | null = null;

/** Pick the correct RevenueCat API key and runtime mode based on the current environment. */
function resolveRevenueCatConfig(): {
  apiKey: string;
  keyMode: RevenueCatKeyMode;
  runtimeMode: RevenueCatRuntimeMode;
} {
  // Web — never use native RevenueCat
  if (Platform.OS === "web") {
    if (isRevenueCatTestStoreEnabled()) {
      const testKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? "";
      if (testKey) {
        if (__DEV__) console.log("[RevenueCat] key mode: test-store (web, test store enabled)");
        return { apiKey: testKey, keyMode: "test-store", runtimeMode: "test-store" };
      }
    }
    if (__DEV__) console.log("[RevenueCat] web — RevenueCat disabled");
    return { apiKey: "", keyMode: "unavailable", runtimeMode: "web-disabled" };
  }

  const expoGo = isExpoGoRuntime();

  // Test Store explicitly enabled — allowed in any environment including Expo Go
  if (isRevenueCatTestStoreEnabled()) {
    const testKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? "";
    if (testKey) {
      if (__DEV__) {
        console.log("[RevenueCat] key mode: test-store (env flag)");
      }
      return { apiKey: testKey, keyMode: "test-store", runtimeMode: "test-store" };
    }
    if (__DEV__) {
      console.warn("[RevenueCat] Test Store flag set but no test API key — disabled");
    }
    return { apiKey: "", keyMode: "unavailable", runtimeMode: "unconfigured" };
  }

  // Expo Go / Rork preview — cannot use native StoreKit
  if (expoGo) {
    if (__DEV__) {
      console.warn("[RevenueCat] Expo Go detected — native purchases unavailable, preview mode only");
    }
    return { apiKey: "", keyMode: "unavailable", runtimeMode: "expo-go-disabled" };
  }

  // iOS native build (custom dev build or TestFlight)
  if (Platform.OS === "ios") {
    const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "";
    if (iosKey) {
      if (__DEV__) console.log("[RevenueCat] key mode: ios (native build)");
      return { apiKey: iosKey, keyMode: "ios", runtimeMode: "ios-store" };
    }
    if (__DEV__) console.warn("[RevenueCat] iOS native build but no iOS API key — unconfigured");
    return { apiKey: "", keyMode: "unavailable", runtimeMode: "unconfigured" };
  }

  // Android native build
  if (Platform.OS === "android") {
    const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "";
    if (androidKey) {
      if (__DEV__) console.log("[RevenueCat] key mode: android (native build)");
      return { apiKey: androidKey, keyMode: "android", runtimeMode: "android-store" };
    }
    if (__DEV__) console.warn("[RevenueCat] Android native build but no Android API key — unconfigured");
    return { apiKey: "", keyMode: "unavailable", runtimeMode: "unconfigured" };
  }

  // Unknown platform
  if (__DEV__) console.warn("[RevenueCat] Unknown platform — RevenueCat disabled");
  return { apiKey: "", keyMode: "unavailable", runtimeMode: "unconfigured" };
}

/**
 * Configure the RevenueCat Purchases SDK.
 *
 * MUST be called once, lazily (e.g. from a useEffect), NOT at module import time.
 * Returns the resolved runtime mode and configuration status.
 */
export function configureRevenueCat(): {
  runtimeMode: RevenueCatRuntimeMode;
  keyMode: RevenueCatKeyMode;
  configured: boolean;
  error: string | null;
} {
  // Only configure once
  if (_configured || _configurationError) {
    return {
      runtimeMode: _runtimeMode,
      keyMode: _keyMode,
      configured: _configured,
      error: _configurationError,
    };
  }

  const config = resolveRevenueCatConfig();
  _runtimeMode = config.runtimeMode;
  _keyMode = config.keyMode;
  _apiKey = config.apiKey;

  if (!config.apiKey) {
    _configured = false;
    if (__DEV__) {
      console.log("[RevenueCat] Not configured — runtime mode:", config.runtimeMode);
    }
    return { runtimeMode: config.runtimeMode, keyMode: config.keyMode, configured: false, error: null };
  }

  try {
    Purchases.configure({ apiKey: config.apiKey });
    _configured = true;
    if (__DEV__) {
      console.log("[RevenueCat] Purchases.configure() succeeded — key mode:", config.keyMode, "| runtime:", config.runtimeMode);
    }
    return { runtimeMode: config.runtimeMode, keyMode: config.keyMode, configured: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    _configured = false;
    _configurationError = msg;
    // Use console.warn for expected unsupported-runtime conditions
    if (config.runtimeMode === "expo-go-disabled" || config.runtimeMode === "web-disabled") {
      console.warn("[RevenueCat] Configuration skipped — unsupported runtime:", config.runtimeMode);
    } else {
      console.warn("[RevenueCat] Configuration failed:", msg);
    }
    return { runtimeMode: config.runtimeMode, keyMode: config.keyMode, configured: false, error: msg };
  }
}

/** Whether RevenueCat has been configured with a valid API key. */
export function isRevenueCatConfigured(): boolean {
  return _configured;
}

/** The active key mode for diagnostics. */
export function getRevenueCatKeyMode(): RevenueCatKeyMode {
  return _keyMode;
}

/** The resolved runtime mode for diagnostics. */
export function getRevenueCatRuntimeMode(): RevenueCatRuntimeMode {
  return _runtimeMode;
}

/** The configuration error message, if any. */
export function getRevenueCatConfigError(): string | null {
  return _configurationError;
}

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

/**
 * Search ALL available offerings for subscription packages.
 *
 * Uses SUBSCRIPTION_PRODUCT_IDS and TEST_STORE_SUBSCRIPTION_ALIASES to identify
 * matching products by `product.identifier`. Deduplicates by product identifier.
 */
export function getSubscriptionPackagesFromAllOfferings(
  currentOffering: PurchasesOffering | null,
  allOfferings: PurchasesOffering[],
): PurchasesPackage[] {
  const seen = new Set<string>();
  const result: PurchasesPackage[] = [];

  const offerings: PurchasesOffering[] = [];
  if (currentOffering) offerings.push(currentOffering);
  for (const off of allOfferings) {
    if (off !== currentOffering) offerings.push(off);
  }

  for (const offering of offerings) {
    for (const pkg of offering.availablePackages) {
      const pid = pkg.product.identifier;
      const tier = subscriptionTierFromProductId(pid);
      if (tier !== null && !seen.has(pid)) {
        seen.add(pid);
        result.push(pkg);
        if (__DEV__) {
          console.log(`[RevenueCat] Subscription pack found: ${pkg.identifier} → product: ${pid} → tier: ${tier} ${pkg.product.priceString ?? `$${pkg.product.price}`}`);
        }
      }
    }
  }

  if (__DEV__) {
    console.log(`[RevenueCat] Total subscription packs across all offerings: ${result.length}`);
  }

  return result;
}

/** Check if a product identifier is a known consumable Neuron product (including Test Store aliases). */
export function isNeuronProduct(productId: string): boolean {
  const normalized = normalizeNeuronProductId(productId);
  return normalized !== null && normalized in NEURON_PRODUCT_AMOUNTS;
}

/**
 * Map of known Neuron product identifiers to their Neuron amounts.
 * Used both for filtering and for determining the credit amount after purchase.
 */
export const NEURON_PRODUCT_AMOUNTS: Record<string, number> = {
  store_edge_250: 250,
  store_edge_750: 750,
  store_edge_2000: 2000,
  store_edge_6000: 6000,
  store_edge_15000: 15000,
};

// ── Async helpers ──────────────────────────────────────────────────────────

/** Fetch the current offerings from RevenueCat. Returns null if not configured. */
export async function getOfferings(): Promise<{
  offering: PurchasesOffering | null;
  allOfferings: PurchasesOffering[];
}> {
  if (!_configured) return { offering: null, allOfferings: [] };

  const offerings = await Purchases.getOfferings();

  const current = offerings.current;
  const all: PurchasesOffering[] = [];

  if (offerings.all) {
    for (const [id, off] of Object.entries(offerings.all)) {
      if (off) {
        all.push(off);
        if (__DEV__) {
          console.log(`[RevenueCat] Offering "${id}":`, off.identifier, `(${off.availablePackages.length} packages)`);
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

/**
 * Search ALL available offerings for Neuron (consumable) packages.
 *
 * Uses NEURON_PRODUCT_AMOUNTS to identify matching products by their
 * `product.identifier` (NOT `package.identifier`), which is the App Store
 * product ID. Deduplicates by product identifier.
 *
 * This is the single source of truth for the Neuron Store — even if the
 * current offering only contains subscriptions, this function finds Neuron
 * packs in any offering.
 */
export function getNeuronPackagesFromAllOfferings(
  currentOffering: PurchasesOffering | null,
  allOfferings: PurchasesOffering[],
): PurchasesPackage[] {
  const seen = new Set<string>();
  const result: PurchasesPackage[] = [];

  // Collect all unique offerings (current first, then rest)
  const offerings: PurchasesOffering[] = [];
  if (currentOffering) offerings.push(currentOffering);
  for (const off of allOfferings) {
    if (off !== currentOffering) offerings.push(off);
  }

  for (const offering of offerings) {
    for (const pkg of offering.availablePackages) {
      const pid = pkg.product.identifier;
      // Normalize through Test Store aliases first, then check the amount map
      const normalized = normalizeNeuronProductId(pid);
      if (normalized !== null && NEURON_PRODUCT_AMOUNTS[normalized] !== undefined && !seen.has(pid)) {
        seen.add(pid);
        result.push(pkg);
        if (__DEV__) {
          console.log(`[RevenueCat] Neuron pack found: ${pkg.identifier} → product: ${pid} (${NEURON_PRODUCT_AMOUNTS[normalized]} Neurons) ${normalized !== pid ? `→ normalized: ${normalized} ` : ""}${pkg.product.priceString ?? `$${pkg.product.price}`}`);
        }
      }
    }
  }

  if (__DEV__) {
    console.log(`[RevenueCat] Total Neuron packs across all offerings: ${result.length}`);
  }

  return result;
}

/** Purchase a package. Returns the transaction result including transactionIdentifier for idempotency. */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<{
  customerInfo: CustomerInfo;
  transactionIdentifier: string;
  productIdentifier: string;
}> {
  const result = await Purchases.purchasePackage(pkg);
  return {
    customerInfo: result.customerInfo,
    transactionIdentifier: result.transaction.transactionIdentifier,
    productIdentifier: result.productIdentifier,
  };
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
  if (!_configured) {
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
  if (!_configured) {
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
