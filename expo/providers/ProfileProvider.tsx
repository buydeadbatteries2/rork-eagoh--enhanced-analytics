import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/providers/AuthProvider";
import {
  ensureProfile,
  getEffectiveSubscriptionTier,
  hasActiveAdminOverride,
  setPreferences as setPreferencesService,
  setSelectedEagohs as setSelectedEagohsService,
  setSelectedLabs as setSelectedLabsService,
  setSubscriptionTier as setSubscriptionTierService,
  updateProfile as updateProfileService,
  type ProfilePreferences,
  type ProfileUpdate,
  type SubscriptionTier,
  type UserProfile,
} from "@/services/profile";
import {
  addPurchasedEdge as addPurchasedEdgeService,
  addSubscriptionEdge as addSubscriptionEdgeService,
  applyMonthlyRollover as applyMonthlyRolloverService,
  getBalances,
  spendEdge as spendEdgeService,
  type EdgeReason,
} from "@/services/edge";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Returns true when lastRolloverAt is null or in a past calendar month. */
function needsMonthlyAllocation(lastRolloverAt: string | null | undefined): boolean {
  if (!lastRolloverAt) return true;
  const last = new Date(lastRolloverAt);
  const now = new Date();
  return (
    last.getUTCFullYear() < now.getUTCFullYear() ||
    (last.getUTCFullYear() === now.getUTCFullYear() && last.getUTCMonth() < now.getUTCMonth())
  );
}

/**
 * ProfileProvider – owns the React Query cache for the current user's profile
 * and exposes typed mutations for updating it. Edge helpers operate against
 * the latest cached profile so the UI never needs to refetch first.
 */

const profileKey = (userId: string | null | undefined): readonly unknown[] => ["profile", userId ?? "anon"] as const;

export const [ProfileProvider, useProfile] = createContextHook(() => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const username = (user?.user_metadata as { username?: string } | undefined)?.username ?? null;
  const queryClient = useQueryClient();

  const profileQuery = useQuery<UserProfile | null>({
    queryKey: profileKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      return ensureProfile(userId, username);
    },
  });

  const profile: UserProfile | null = profileQuery.data ?? null;

  const invalidate = useCallback((): void => {
    queryClient.invalidateQueries({ queryKey: profileKey(userId) });
  }, [queryClient, userId]);

  const setQueryData = useCallback((next: UserProfile): void => {
    queryClient.setQueryData(profileKey(userId), next);
  }, [queryClient, userId]);

  const updateMutation = useMutation({
    mutationFn: (patch: ProfileUpdate): Promise<UserProfile> => {
      if (!userId) throw new Error("Not signed in");
      return updateProfileService(userId, patch);
    },
    onSuccess: (next) => queryClient.setQueryData(profileKey(userId), next),
  });

  const setTierMutation = useMutation({
    mutationFn: (tier: SubscriptionTier): Promise<UserProfile> => {
      if (!userId) throw new Error("Not signed in");
      return setSubscriptionTierService(userId, tier);
    },
    onSuccess: (next) => queryClient.setQueryData(profileKey(userId), next),
  });

  const setLabsMutation = useMutation({
    mutationFn: (labs: string[]): Promise<UserProfile> => {
      if (!userId) throw new Error("Not signed in");
      return setSelectedLabsService(userId, labs);
    },
    onSuccess: (next) => queryClient.setQueryData(profileKey(userId), next),
  });

  const setEagohsMutation = useMutation({
    mutationFn: (eagohs: string[]): Promise<UserProfile> => {
      if (!userId) throw new Error("Not signed in");
      return setSelectedEagohsService(userId, eagohs);
    },
    onSuccess: (next) => queryClient.setQueryData(profileKey(userId), next),
  });

  const setPreferencesMutation = useMutation({
    mutationFn: (preferences: ProfilePreferences): Promise<UserProfile> => {
      if (!userId) throw new Error("Not signed in");
      return setPreferencesService(userId, preferences);
    },
    onSuccess: (next) => queryClient.setQueryData(profileKey(userId), next),
  });

  const addPurchasedEdgeMutation = useMutation({
    mutationFn: (amount: number): Promise<UserProfile> => {
      if (!userId || !profile) throw new Error("Profile not loaded");
      return addPurchasedEdgeService(userId, profile, amount);
    },
    onSuccess: (next) => queryClient.setQueryData(profileKey(userId), next),
  });

  const addSubscriptionEdgeMutation = useMutation({
    mutationFn: (amount: number): Promise<UserProfile> => {
      if (!userId || !profile) throw new Error("Profile not loaded");
      return addSubscriptionEdgeService(userId, profile, amount);
    },
    onSuccess: (next) => queryClient.setQueryData(profileKey(userId), next),
  });

  const spendEdgeMutation = useMutation({
    mutationFn: (amount: number): Promise<UserProfile> => {
      if (!userId || !profile) throw new Error("Profile not loaded");
      return spendEdgeService(userId, profile, amount, "manual");
    },
    onSuccess: (next) => queryClient.setQueryData(profileKey(userId), next),
  });

  const rolloverMutation = useMutation({
    mutationFn: (capPct?: number): Promise<UserProfile> => {
      if (!userId || !profile) throw new Error("Profile not loaded");
      void capPct;
      return applyMonthlyRolloverService(userId, profile, getEffectiveSubscriptionTier(profile));
    },
    onSuccess: (next) => queryClient.setQueryData(profileKey(userId), next),
  });

  const balances = profile ? getBalances(profile) : { subscription: 0, purchased: 0, total: 0 };

  // ── Auto-allocation: grant free tier Neurons on first login and monthly thereafter ──
  const allocRanRef = useRef(false);
  useEffect(() => {
    if (!profile || !userId) return;
    if (allocRanRef.current) return;
    const tier = getEffectiveSubscriptionTier(profile);
    if (tier !== "free") return;

    // Only grant if the user hasn't received allocation this calendar month.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastRollover: string | null = (profile as any).last_rollover_at ?? null;
    if (!needsMonthlyAllocation(lastRollover)) return;

    allocRanRef.current = true;
    applyMonthlyRolloverService(userId, profile, tier).then((next) => {
      queryClient.setQueryData(profileKey(userId), next);
    }).catch((err) => {
      console.warn("[ProfileProvider] auto-allocation failed:", (err as Error).message);
      allocRanRef.current = false; // retry next mount
    });
  }, [profile, userId, queryClient]);

  // ── Upgrade allocation: trigger rollover when tier changes from free → paid ──
  const prevTierRef = useRef<SubscriptionTier | null>(null);
  useEffect(() => {
    if (!profile || !userId) return;
    const tier = getEffectiveSubscriptionTier(profile);
    const prevTier = prevTierRef.current;
    prevTierRef.current = tier;

    // Only trigger on actual upgrade from free to paid (not on first mount)
    if (!prevTier || prevTier === tier) return;
    if (prevTier !== "free") return;
    if (tier === "free") return;

    // Grant the new paid tier's monthly allocation immediately
    if (__DEV__) {
      console.log(`[ProfileProvider] Tier upgrade detected: ${prevTier} → ${tier} — triggering allocation`);
    }
    applyMonthlyRolloverService(userId, profile, tier).then((next) => {
      queryClient.setQueryData(profileKey(userId), next);
    }).catch((err) => {
      console.warn("[ProfileProvider] upgrade allocation failed:", (err as Error).message);
    });
  }, [profile, userId, queryClient]);

  const effectiveSubscriptionTier: SubscriptionTier = getEffectiveSubscriptionTier(profile);
  const isAdminOverrideActive: boolean = hasActiveAdminOverride(profile);

  return {
    profile,
    balances,
    effectiveSubscriptionTier,
    isAdminOverrideActive,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error as Error | null,
    refetch: profileQuery.refetch,
    invalidate,

    updateProfile: (patch: ProfileUpdate) => updateMutation.mutateAsync(patch),
    setSubscriptionTier: (tier: SubscriptionTier) => setTierMutation.mutateAsync(tier),
    setSelectedLabs: (labs: string[]) => setLabsMutation.mutateAsync(labs),
    setSelectedEagohs: (eagohs: string[]) => setEagohsMutation.mutateAsync(eagohs),
    setPreferences: (preferences: ProfilePreferences) => setPreferencesMutation.mutateAsync(preferences),

    addPurchasedEdge: (amount: number) => addPurchasedEdgeMutation.mutateAsync(amount),
    addSubscriptionEdge: (amount: number) => addSubscriptionEdgeMutation.mutateAsync(amount),
    spendEdge: (amount: number) => spendEdgeMutation.mutateAsync(amount),
    applyMonthlyRollover: (capPct?: number) => rolloverMutation.mutateAsync(capPct ?? 0.1),
    _edgeReason: undefined as EdgeReason | undefined,
  };
});
