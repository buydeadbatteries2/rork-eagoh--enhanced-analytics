/**
 * Subscription / Paywall screen.
 *
 * Displays live RevenueCat subscription packages for Pro, Oracle Elite, and
 * Syndicate tiers. Each card shows tier name, localized App Store price,
 * billing period, monthly Neuron allocation, EAGOH limit, feature benefits
 * and a Subscribe button.
 *
 * States: Loading, Loaded, Configuration Error, No matching products,
 * Purchase in progress, Purchase cancelled, Purchase successful.
 * Includes Retry and Restore Purchases buttons.
 */

import { palette } from "@/constants/colors";
import { useHaptics } from "@/hooks/useHaptics";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useRevenueCat } from "@/providers/RevenueCatProvider";
import {
  TIER_LABELS,
  TIER_MONTHLY_ALLOCATION,
  TIER_MAX_EAGOHS,
  TIER_BENEFITS,
  SUBSCRIPTION_PRODUCT_IDS,
  subscriptionTierFromProductId,
  type SubscriptionTier,
} from "@/services/tiers";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  BadgeCheck,
  BrainCircuit,
  Coins,
  Crown,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import type { PurchasesPackage } from "react-native-purchases";

// ── Tier-specific accent colours ───────────────────────────────────────────

const TIER_ACCENTS: Record<Exclude<SubscriptionTier, "free">, { accent: string; soft: string; border: string; glow: string; gradient: readonly [string, string, string] }> = {
  pro: {
    accent: palette.cyan,
    soft: "rgba(54,245,255,0.10)",
    border: "rgba(54,245,255,0.30)",
    glow: "rgba(54,245,255,0.14)",
    gradient: ["rgba(54,245,255,0.14)", "rgba(10,18,30,0.80)", "rgba(3,6,11,0.96)"] as const,
  },
  oracle_elite: {
    accent: palette.gold,
    soft: "rgba(255,184,77,0.10)",
    border: "rgba(255,184,77,0.35)",
    glow: "rgba(255,184,77,0.16)",
    gradient: ["rgba(255,184,77,0.14)", "rgba(10,18,30,0.80)", "rgba(3,6,11,0.96)"] as const,
  },
  syndicate: {
    accent: palette.violet,
    soft: "rgba(138,92,255,0.10)",
    border: "rgba(138,92,255,0.35)",
    glow: "rgba(138,92,255,0.16)",
    gradient: ["rgba(138,92,255,0.14)", "rgba(10,18,30,0.80)", "rgba(3,6,11,0.96)"] as const,
  },
};

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.void },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    backgroundColor: palette.obsidian,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
  },
  headerTitle: { color: palette.text, fontSize: 18, fontWeight: "900" as const, flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 60, gap: 18 },

  // Hero
  heroCard: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden" as const,
  },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroBody: { padding: 22, alignItems: "center" as const, gap: 10 },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,184,77,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,184,77,0.30)",
  },
  heroTitle: { color: palette.text, fontSize: 22, fontWeight: "900" as const, letterSpacing: -0.5 },
  heroSubtitle: { color: palette.muted, fontSize: 13, fontWeight: "600" as const, textAlign: "center" as const, lineHeight: 19 },

  // Tier cards
  tierCard: {
    borderRadius: 5,
    borderWidth: 1,
    overflow: "hidden" as const,
  },
  tierGradient: { ...StyleSheet.absoluteFillObject },
  tierBody: { padding: 18, gap: 14 },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tierNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tierName: { fontSize: 18, fontWeight: "900" as const },
  tierPrice: { fontSize: 15, fontWeight: "700" as const },
  tierPeriod: { fontSize: 11, fontWeight: "600" as const, marginTop: 1 },
  tierDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)" },
  tierAllocations: { flexDirection: "row", gap: 12 },
  tierAllocationChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  tierAllocationLabel: { fontSize: 10, fontWeight: "800" as const, letterSpacing: 0.5 },
  tierAllocationValue: { fontSize: 12, fontWeight: "900" as const, marginTop: 2 },
  tierBenefits: { gap: 6 },
  tierBenefitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tierBenefitText: { color: palette.muted, fontSize: 12, fontWeight: "600" as const, flex: 1 },

  // Subscribe button
  subscribeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 5,
    borderWidth: 1,
  },
  subscribeBtnText: { fontSize: 14, fontWeight: "900" as const },

  // Current tier badge
  currentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  currentBadgeText: { fontSize: 10, fontWeight: "900" as const, letterSpacing: 0.5 },

  // Restore button
  restoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,32,0.60)",
  },
  restoreBtnText: { color: palette.muted, fontSize: 13, fontWeight: "700" as const },

  // Status states
  statusCenter: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, padding: 40, gap: 14 },
  statusTitle: { color: palette.text, fontSize: 17, fontWeight: "900" as const, textAlign: "center" as const },
  statusSubtitle: { color: palette.muted, fontSize: 13, fontWeight: "600" as const, textAlign: "center" as const, lineHeight: 19 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.cyan,
    backgroundColor: "rgba(54,245,255,0.10)",
  },
  retryBtnText: { color: palette.cyan, fontSize: 13, fontWeight: "800" as const },

  // Success banner
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 5,
    backgroundColor: "rgba(0,200,130,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,200,130,0.30)",
  },
  successText: { color: palette.success, fontSize: 13, fontWeight: "800" as const, flex: 1 },
});

// ── Sub-component: Preview Tier Card (Expo Go / preview) ──────────────────

function PreviewTierCard({ tier, runtimeMode }: { tier: Exclude<SubscriptionTier, "free">; runtimeMode: string }): JSX.Element {
  const c = TIER_ACCENTS[tier];
  const label = TIER_LABELS[tier];
  const allocation = TIER_MONTHLY_ALLOCATION[tier];
  const maxEagohs = TIER_MAX_EAGOHS[tier];
  const benefits = TIER_BENEFITS[tier];

  return (
    <View style={[styles.tierCard, { borderColor: c.border }]}>
      <LinearGradient colors={c.gradient} style={styles.tierGradient} />
      <View style={styles.tierBody}>
        <View style={styles.tierHeader}>
          <View style={styles.tierNameRow}>
            <Crown color={c.accent} size={20} />
            <Text style={[styles.tierName, { color: c.accent }]}>{label}</Text>
          </View>
          <Text style={[styles.tierPrice, { color: palette.muted }]}>Preview</Text>
        </View>
        <View style={styles.tierDivider} />
        <View style={styles.tierAllocations}>
          <View style={[styles.tierAllocationChip, { backgroundColor: c.soft, borderColor: c.border }]}>
            <Zap color={c.accent} size={13} />
            <View>
              <Text style={[styles.tierAllocationLabel, { color: palette.muted }]}>NEURONS/MO</Text>
              <Text style={[styles.tierAllocationValue, { color: c.accent }]}>{allocation.toLocaleString()}</Text>
            </View>
          </View>
          <View style={[styles.tierAllocationChip, { backgroundColor: c.soft, borderColor: c.border }]}>
            <BrainCircuit color={c.accent} size={13} />
            <View>
              <Text style={[styles.tierAllocationLabel, { color: palette.muted }]}>MAX EAGOHS</Text>
              <Text style={[styles.tierAllocationValue, { color: c.accent }]}>{maxEagohs}</Text>
            </View>
          </View>
        </View>
        <View style={styles.tierBenefits}>
          {benefits.map((benefit) => (
            <View key={benefit} style={styles.tierBenefitRow}>
              <Star color={c.accent} size={12} />
              <Text style={styles.tierBenefitText}>{benefit}</Text>
            </View>
          ))}
        </View>
        <Pressable
          disabled
          style={[styles.subscribeBtn, { backgroundColor: "rgba(255,255,255,0.03)", borderColor: palette.line }]}
        >
          <Text style={[styles.subscribeBtnText, { color: palette.muted }]}>
            {runtimeMode === "web-disabled"
              ? "Native build required"
              : "Available in TestFlight or Test Store"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Sub-component: Tier Card ───────────────────────────────────────────────

function TierCard({
  tier,
  rcPackage,
  isCurrent,
  onSubscribe,
  isPurchasing,
}: {
  tier: Exclude<SubscriptionTier, "free">;
  rcPackage: PurchasesPackage | null;
  isCurrent: boolean;
  onSubscribe: (pkg: PurchasesPackage) => void;
  isPurchasing: boolean;
}): JSX.Element {
  const c = TIER_ACCENTS[tier];
  const label = TIER_LABELS[tier];
  const allocation = TIER_MONTHLY_ALLOCATION[tier];
  const maxEagohs = TIER_MAX_EAGOHS[tier];
  const benefits = TIER_BENEFITS[tier];

  const priceStr = rcPackage?.product.priceString ?? "Unavailable";
  const periodStr = rcPackage?.product.subscriptionPeriod
    ? `per ${rcPackage.product.subscriptionPeriod}`
    : "";
  const canPurchase = !!rcPackage;

  return (
    <View style={[styles.tierCard, { borderColor: isCurrent ? c.accent : c.border }]}>
      <LinearGradient colors={c.gradient} style={styles.tierGradient} />
      <View style={styles.tierBody}>
        {/* Header: name + price */}
        <View style={styles.tierHeader}>
          <View style={styles.tierNameRow}>
            <Crown color={c.accent} size={20} />
            <Text style={[styles.tierName, { color: c.accent }]}>{label}</Text>
          </View>
          <View style={{ alignItems: "flex-end" as const }}>
            <Text style={[styles.tierPrice, { color: palette.text }]}>
              {rcPackage ? priceStr : "—"}
            </Text>
            {periodStr ? (
              <Text style={[styles.tierPeriod, { color: palette.muted }]}>{periodStr}</Text>
            ) : null}
          </View>
        </View>

        {isCurrent ? (
          <View style={[styles.currentBadge, { backgroundColor: c.soft, borderColor: c.border, borderWidth: 1, alignSelf: "flex-start" as const }]}>
            <BadgeCheck color={c.accent} size={12} />
            <Text style={[styles.currentBadgeText, { color: c.accent }]}>Current Plan</Text>
          </View>
        ) : null}

        <View style={styles.tierDivider} />

        {/* Allocations */}
        <View style={styles.tierAllocations}>
          <View style={[styles.tierAllocationChip, { backgroundColor: c.soft, borderColor: c.border }]}>
            <Zap color={c.accent} size={13} />
            <View>
              <Text style={[styles.tierAllocationLabel, { color: palette.muted }]}>NEURONS/MO</Text>
              <Text style={[styles.tierAllocationValue, { color: c.accent }]}>{allocation.toLocaleString()}</Text>
            </View>
          </View>
          <View style={[styles.tierAllocationChip, { backgroundColor: c.soft, borderColor: c.border }]}>
            <BrainCircuit color={c.accent} size={13} />
            <View>
              <Text style={[styles.tierAllocationLabel, { color: palette.muted }]}>MAX EAGOHS</Text>
              <Text style={[styles.tierAllocationValue, { color: c.accent }]}>{maxEagohs}</Text>
            </View>
          </View>
        </View>

        {/* Benefits */}
        <View style={styles.tierBenefits}>
          {benefits.map((benefit) => (
            <View key={benefit} style={styles.tierBenefitRow}>
              <Star color={c.accent} size={12} />
              <Text style={styles.tierBenefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        {/* Subscribe button */}
        {canPurchase && !isCurrent ? (
          <Pressable
            onPress={() => onSubscribe(rcPackage!)}
            disabled={isPurchasing}
            style={({ pressed }) => [
              styles.subscribeBtn,
              { backgroundColor: c.accent, borderColor: c.accent },
              pressed && { opacity: 0.8 },
              isPurchasing && { opacity: 0.5 },
            ]}
          >
            {isPurchasing ? (
              <ActivityIndicator color={palette.void} size="small" />
            ) : (
              <>
                <Sparkles color={palette.void} size={16} />
                <Text style={[styles.subscribeBtnText, { color: palette.void }]}>
                  Subscribe to {label}
                </Text>
              </>
            )}
          </Pressable>
        ) : canPurchase && isCurrent ? (
          <Pressable
            disabled
            style={[styles.subscribeBtn, { backgroundColor: c.soft, borderColor: c.border }]}
          >
            <ShieldCheck color={c.accent} size={16} />
            <Text style={[styles.subscribeBtnText, { color: c.accent }]}>Current Plan</Text>
          </Pressable>
        ) : (
          <View style={[styles.subscribeBtn, { backgroundColor: "rgba(255,255,255,0.03)", borderColor: palette.line }]}>
            <Text style={[styles.subscribeBtnText, { color: palette.muted }]}>Loading price…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function SubscriptionScreen(): JSX.Element {
  const router = useRouter();
  const h = useHaptics();
  const { user } = useAuth();
  const { effectiveSubscriptionTier, profile } = useProfile();
  const {
    configured: rcConfigured,
    subscriptionPackages: rcSubPkgs,
    isLoading: rcLoading,
    isOfferingsLoading,
    isCustomerInfoLoading,
    purchase: rcPurchase,
    restore: rcRestore,
    isPurchasing,
    isRestoring,
    revenueCatTier,
    refreshAll,
    runtimeMode,
    canRealPurchase,
  } = useRevenueCat();

  const [purchasingTier, setPurchasingTier] = useState<SubscriptionTier | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);

  const currentTier: SubscriptionTier = useMemo(
    () => effectiveSubscriptionTier,
    [effectiveSubscriptionTier],
  );

  // Map RC packages to tiers using the shared mapping (handles Test Store aliases too)
  const tierPackages = useMemo(() => {
    const map: Record<string, PurchasesPackage | null> = {
      pro: null,
      oracle_elite: null,
      syndicate: null,
    };
    for (const pkg of rcSubPkgs) {
      const pid = pkg.product.identifier;
      const tier = subscriptionTierFromProductId(pid);
      if (tier && tier in map) {
        map[tier] = pkg;
      }
    }
    return map;
  }, [rcSubPkgs]);

  const handleBack = useCallback((): void => {
    h.selection();
    router.back();
  }, [router, h]);

  const handleSubscribe = useCallback(
    async (pkg: PurchasesPackage): Promise<void> => {
      if (!user?.id) return;
      h.heavy();
      const pid = pkg.product.identifier;
      const tier = subscriptionTierFromProductId(pid);

      if (!tier || tier === "free") {
        Alert.alert("Error", "Unknown subscription product.");
        return;
      }

      setPurchasingTier(tier);
      setPurchaseSuccess(false);

      try {
        const purchaseResult = await rcPurchase(pkg);
        const activeSubs = purchaseResult.customerInfo.activeSubscriptions;
        if (__DEV__) {
          console.log("[Subscription] Purchase success — active subs:", activeSubs);
        }

        setPurchaseSuccess(true);

        const tierLabel = TIER_LABELS[tier as keyof typeof TIER_LABELS];
        Alert.alert(
          "Subscription Activated",
          `Welcome to ${tierLabel}! Your benefits are now active.`,
        );
      } catch (err: unknown) {
        const errObj = err as { userCancelled?: boolean; message?: string };
        if (errObj?.userCancelled) {
          // User cancelled — not an error
          if (__DEV__) {
            console.log("[Subscription] User cancelled purchase");
          }
        } else {
          const msg = errObj?.message ?? "Purchase failed";
          Alert.alert("Purchase Failed", msg);
        }
      } finally {
        setPurchasingTier(null);
      }
    },
    [user?.id, rcPurchase, h],
  );

  const handleRestore = useCallback(async (): Promise<void> => {
    h.medium();
    try {
      const customerInfo = await rcRestore();
      const activeCount = customerInfo?.activeSubscriptions?.length ?? 0;
      if (activeCount > 0) {
        const tier = revenueCatTier;
        const tierLabel = TIER_LABELS[tier];
        Alert.alert(
          "Purchases Restored",
          `${tierLabel} subscription restored successfully.`,
        );
      } else {
        Alert.alert("No Purchases Found", "No previous subscriptions were found to restore.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      Alert.alert("Restore Failed", msg);
    }
  }, [rcRestore, revenueCatTier, h]);

  const handleRetry = useCallback((): void => {
    refreshAll();
  }, [refreshAll]);

  // ── Loading state ──────────────────────────────────────────────────────

  if (rcLoading && !rcConfigured) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <ArrowLeft color={palette.text} size={18} />
          </Pressable>
          <Text style={styles.headerTitle}>Subscription</Text>
        </View>
        <View style={styles.statusCenter}>
          <Loader2 color={palette.cyan} size={36} />
          <Text style={styles.statusTitle}>Connecting to App Store…</Text>
          <Text style={styles.statusSubtitle}>Checking subscription availability</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Not configured — show preview cards in Expo Go / preview; error otherwise ─

  if (!rcConfigured) {
    const isPreview = runtimeMode === "expo-go-disabled" || runtimeMode === "web-disabled";
    const isTestStoreUnconfigured = runtimeMode === "unconfigured" && process.env.EXPO_PUBLIC_REVENUECAT_USE_TEST_STORE === "true";
    return (
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <ArrowLeft color={palette.text} size={18} />
          </Pressable>
          <Text style={styles.headerTitle}>Subscription</Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Hero card */}
          <View style={styles.heroCard}>
            <LinearGradient colors={["rgba(255,184,77,0.10)", "rgba(10,18,30,0.84)", "rgba(3,6,11,0.96)"]} style={styles.heroGradient} />
            <View style={styles.heroBody}>
              <View style={styles.heroIconWrap}>
                <Crown color={palette.gold} size={28} />
              </View>
              <Text style={styles.heroTitle}>Choose Your Plan</Text>
              <Text style={styles.heroSubtitle}>
                {isPreview
                  ? "Store purchases require a development build or TestFlight. Previewing subscription tiers below."
                  : isTestStoreUnconfigured
                  ? "RevenueCat Test Store API key is missing. Add EXPO_PUBLIC_REVENUECAT_TEST_API_KEY to enable Test Store purchases."
                  : "Unlock the full power of EAGOH intelligence. All plans include a monthly Neuron allocation, EAGOH slots, and exclusive features."}
              </Text>
            </View>
          </View>

          {/* Preview tier cards (disabled) */}
          {isPreview ? (
            <>
              <PreviewTierCard tier="pro" runtimeMode={runtimeMode} />
              <PreviewTierCard tier="oracle_elite" runtimeMode={runtimeMode} />
              <PreviewTierCard tier="syndicate" runtimeMode={runtimeMode} />
            </>
          ) : isTestStoreUnconfigured ? (
            <View style={styles.statusCenter}>
              <Coins color={palette.muted} size={40} />
              <Text style={styles.statusTitle}>RevenueCat Test Store Unavailable</Text>
              <Text style={styles.statusSubtitle}>
                The Test Store flag is enabled but no Test Store API key was found. Add EXPO_PUBLIC_REVENUECAT_TEST_API_KEY to your environment.
              </Text>
              <Pressable onPress={handleRetry} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}>
                <RefreshCw color={palette.cyan} size={16} />
                <Text style={styles.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.statusCenter}>
              <Coins color={palette.muted} size={40} />
              <Text style={styles.statusTitle}>App Store Unavailable</Text>
              <Text style={styles.statusSubtitle}>
                Subscriptions require the iOS App Store. This feature is not available in the current build environment.
              </Text>
              <Pressable onPress={handleRetry} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}>
                <RefreshCw color={palette.cyan} size={16} />
                <Text style={styles.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Loading but configured ─────────────────────────────────────────────

  const stillLoading = isOfferingsLoading || isCustomerInfoLoading;

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <ArrowLeft color={palette.text} size={18} />
        </Pressable>
        <Text style={styles.headerTitle}>Subscription</Text>
        <Crown color={palette.gold} size={18} />
      </View>

      {/* Test Store badge */}
      {runtimeMode === "test-store" ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 5, backgroundColor: "rgba(54,245,255,0.12)", borderWidth: 1, borderColor: "rgba(54,245,255,0.25)" }}>
            <ShieldCheck color={palette.cyan} size={14} />
            <Text style={{ color: palette.cyan, fontSize: 12, fontWeight: "700" as const }}>RevenueCat Test Store</Text>
          </View>
        </View>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero card */}
        <View style={styles.heroCard}>
          <LinearGradient colors={["rgba(255,184,77,0.10)", "rgba(10,18,30,0.84)", "rgba(3,6,11,0.96)"]} style={styles.heroGradient} />
          <View style={styles.heroBody}>
            <View style={styles.heroIconWrap}>
              <Crown color={palette.gold} size={28} />
            </View>
            <Text style={styles.heroTitle}>Choose Your Plan</Text>
            <Text style={styles.heroSubtitle}>
              Unlock the full power of EAGOH intelligence. All plans include a monthly Neuron allocation, EAGOH slots, and exclusive features.
            </Text>
          </View>
        </View>

        {/* Success banner */}
        {purchaseSuccess ? (
          <View style={styles.successBanner}>
            <BadgeCheck color={palette.success} size={18} />
            <Text style={styles.successText}>
              Subscription activated successfully! Your benefits are now live.
            </Text>
          </View>
        ) : null}

        {/* Loading indicator while RC data loads */}
        {stillLoading ? (
          <View style={styles.statusCenter}>
            <ActivityIndicator color={palette.cyan} size="large" />
            <Text style={styles.statusSubtitle}>Loading subscription products…</Text>
          </View>
        ) : null}

        {/* No subscription products found */}
        {!stillLoading && rcSubPkgs.length === 0 ? (
          <View style={styles.statusCenter}>
            <Coins color={palette.muted} size={36} />
            <Text style={styles.statusTitle}>No Subscription Products</Text>
            <Text style={styles.statusSubtitle}>
              Subscription products could not be loaded from the App Store. Please check your connection and try again.
            </Text>
            <Pressable onPress={handleRetry} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}>
              <RefreshCw color={palette.cyan} size={16} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Tier cards */}
        {!stillLoading ? (
          <>
            <TierCard
              tier="pro"
              rcPackage={tierPackages.pro}
              isCurrent={currentTier === "pro" && !purchaseSuccess}
              onSubscribe={handleSubscribe}
              isPurchasing={isPurchasing && purchasingTier === "pro"}
            />
            <TierCard
              tier="oracle_elite"
              rcPackage={tierPackages.oracle_elite}
              isCurrent={currentTier === "oracle_elite" && !purchaseSuccess}
              onSubscribe={handleSubscribe}
              isPurchasing={isPurchasing && purchasingTier === "oracle_elite"}
            />
            <TierCard
              tier="syndicate"
              rcPackage={tierPackages.syndicate}
              isCurrent={currentTier === "syndicate" && !purchaseSuccess}
              onSubscribe={handleSubscribe}
              isPurchasing={isPurchasing && purchasingTier === "syndicate"}
            />
          </>
        ) : null}

        {/* Restore purchases */}
        <Pressable
          onPress={handleRestore}
          disabled={isRestoring}
          style={({ pressed }) => [styles.restoreBtn, pressed && { opacity: 0.7 }]}
        >
          {isRestoring ? (
            <ActivityIndicator color={palette.muted} size="small" />
          ) : (
            <RefreshCw color={palette.muted} size={16} />
          )}
          <Text style={styles.restoreBtnText}>
            {isRestoring ? "Restoring…" : "Restore Purchases"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
