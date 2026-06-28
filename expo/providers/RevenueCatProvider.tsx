/**
 * RevenueCatProvider — React Query wrapper around the RevenueCat SDK.
 *
 * Exposes offerings, customer info, active entitlements, purchase/restore
 * functions, and a login/logout bridge for cross-device purchase sync.
 *
 * The underlying Purchases SDK is configured at module level in
 * services/revenuecat.ts when this provider is first imported.
 */

import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAuth } from "@/providers/AuthProvider";
import {
  getCustomerInfo,
  getOfferings,
  isRevenueCatConfigured,
  logInRevenueCat,
  logOutRevenueCat,
  purchasePackage,
  restorePurchases,
} from "@/services/revenuecat";
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";

// ── Query keys ────────────────────────────────────────────────────────────

const offeringsKey = ["revenuecat", "offerings"] as const;
const customerInfoKey = ["revenuecat", "customerInfo"] as const;

// ── Provider ──────────────────────────────────────────────────────────────

export const [RevenueCatProvider, useRevenueCat] = createContextHook(() => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const configured = isRevenueCatConfigured();

  // ── Offerings ────────────────────────────────────────────────────────

  const offeringsQuery = useQuery<PurchasesOffering | null>({
    queryKey: offeringsKey,
    queryFn: getOfferings,
    staleTime: 5 * 60 * 1000,
  });

  const currentOffering: PurchasesOffering | null = offeringsQuery.data ?? null;
  const packages: PurchasesPackage[] = useMemo(
    () => currentOffering?.availablePackages ?? [],
    [currentOffering],
  );

  // ── Customer Info ────────────────────────────────────────────────────

  const customerInfoQuery = useQuery<CustomerInfo | null>({
    queryKey: customerInfoKey,
    queryFn: getCustomerInfo,
    staleTime: 60 * 1000,
  });

  const customerInfo: CustomerInfo | null = customerInfoQuery.data ?? null;

  const activeEntitlements: string[] = useMemo(
    () => customerInfo?.entitlements.active
      ? Object.keys(customerInfo.entitlements.active)
      : [],
    [customerInfo],
  );

  // ── Invalidate helpers ───────────────────────────────────────────────

  const invalidateOfferings = useCallback((): void => {
    queryClient.invalidateQueries({ queryKey: offeringsKey });
  }, [queryClient]);

  const invalidateCustomerInfo = useCallback((): void => {
    queryClient.invalidateQueries({ queryKey: customerInfoKey });
  }, [queryClient]);

  const refreshAll = useCallback((): void => {
    invalidateOfferings();
    invalidateCustomerInfo();
  }, [invalidateOfferings, invalidateCustomerInfo]);

  // ── Purchase ─────────────────────────────────────────────────────────

  const purchaseMutation = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePackage(pkg),
    onSuccess: () => {
      invalidateCustomerInfo();
    },
  });

  /** Purchase a package. Handles user-cancelled without throwing. */
  const purchase = useCallback(
    async (pkg: PurchasesPackage): Promise<CustomerInfo> => {
      return purchaseMutation.mutateAsync(pkg).then((r) => r.customerInfo);
    },
    [purchaseMutation],
  );

  // ── Restore ──────────────────────────────────────────────────────────

  const restoreMutation = useMutation({
    mutationFn: restorePurchases,
    onSuccess: () => {
      invalidateCustomerInfo();
    },
  });

  const restore = useCallback((): Promise<CustomerInfo> => {
    return restoreMutation.mutateAsync();
  }, [restoreMutation]);

  // ── Login / Logout sync ──────────────────────────────────────────────

  const loginMutation = useMutation({
    mutationFn: (uid: string) => logInRevenueCat(uid),
    onSuccess: () => refreshAll(),
  });

  const logoutMutation = useMutation({
    mutationFn: logOutRevenueCat,
    onSuccess: () => refreshAll(),
  });

  // ── Derived state ───────────────────────────────────────────────────

  const isSubscribed = activeEntitlements.length > 0;
  const isLoading = offeringsQuery.isLoading || customerInfoQuery.isLoading;

  return {
    /** Whether the RevenueCat SDK is configured with a valid API key. */
    configured,
    /** The current offering with its packages. */
    currentOffering,
    /** Available packages in the current offering. */
    packages,
    /** The latest customer info from RevenueCat. */
    customerInfo,
    /** Active entitlement identifiers. */
    activeEntitlements,
    /** Whether the user has at least one active entitlement. */
    isSubscribed,
    /** Whether offerings or customer info are still loading. */
    isLoading,
    /** Refetch offerings and customer info. */
    refreshAll,

    /** Purchase a package — returns the updated CustomerInfo. */
    purchase,
    /** Restore previous purchases — returns the latest CustomerInfo. */
    restore,
    /** Log the current auth user into RevenueCat for cross-device sync. */
    logIn: (uid: string) => loginMutation.mutateAsync(uid),
    /** Log out the current RevenueCat user. */
    logOut: () => logoutMutation.mutateAsync(),

    /** Whether a purchase is in flight. */
    isPurchasing: purchaseMutation.isPending,
    /** Whether a restore is in flight. */
    isRestoring: restoreMutation.isPending,
  };
});
