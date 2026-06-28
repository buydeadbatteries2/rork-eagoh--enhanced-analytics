/**
 * RevenueCat service — module-level Purchases configuration and helpers.
 *
 * Configured at the top level so it runs once when the module is first imported.
 * The React Query provider in providers/RevenueCatProvider.tsx wraps the async
 * fetches for offerings and customer info.
 */

import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";

// ── API Key selection ──────────────────────────────────────────────────────

/** Pick the correct RevenueCat API key based on the runtime environment. */
function getRevenueCatApiKey(): string {
  if (__DEV__ || Platform.OS === "web") {
    return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? "";
  }
  return Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "",
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "",
    default: process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? "",
  });
}

// ── Configure at module level ──────────────────────────────────────────────

const apiKey = getRevenueCatApiKey();

if (apiKey) {
  Purchases.configure({ apiKey });
}

/** Whether RevenueCat has been configured with a valid API key. */
export const isRevenueCatConfigured = (): boolean => !!apiKey;

// ── Async helpers ──────────────────────────────────────────────────────────

/** Fetch the current offerings from RevenueCat. Returns null if not configured. */
export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (!apiKey) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
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
    return Purchases.getCustomerInfo();
  }
  const { customerInfo } = await Purchases.logIn(userId);
  return customerInfo;
}

/** Log out the current RevenueCat user. */
export async function logOutRevenueCat(): Promise<CustomerInfo> {
  if (!apiKey) {
    return Purchases.getCustomerInfo();
  }
  const customerInfo = await Purchases.logOut();
  return customerInfo;
}
