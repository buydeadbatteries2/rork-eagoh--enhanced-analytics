import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "@/providers/AuthProvider";
import {
  ensureProfile,
  setPreferences as setPreferencesService,
  setSelectedEagohs as setSelectedEagohsService,
  setSelectedLabs as setSelectedLabsService,
  setSubscriptionTier as setSubscriptionTierService,
  setTestTier as setTestTierService,
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

  const setTestTierMutation = useMutation({
    mutationFn: (tier: SubscriptionTier): Promise<UserProfile> => {
      if (!userId) throw new Error("Not signed in");
      return setTestTierService(userId, tier);
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
      return applyMonthlyRolloverService(userId, profile, profile.subscription_tier);
    },
    onSuccess: (next) => queryClient.setQueryData(profileKey(userId), next),
  });

  const balances = profile ? getBalances(profile) : { subscription: 0, purchased: 0, total: 0 };

  return {
    profile,
    balances,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error as Error | null,
    refetch: profileQuery.refetch,
    invalidate,

    updateProfile: (patch: ProfileUpdate) => updateMutation.mutateAsync(patch),
    setSubscriptionTier: (tier: SubscriptionTier) => setTierMutation.mutateAsync(tier),
    setTestTier: (tier: SubscriptionTier) => setTestTierMutation.mutateAsync(tier),
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
