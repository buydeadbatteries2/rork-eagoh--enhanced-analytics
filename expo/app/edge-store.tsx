/**
 * Edge Store — Premium cybernetic screen for purchasing Neurons.
 *
 * Displays current balances (subscription, purchased, total), Neuron
 * packs from RevenueCat offerings, and a real purchase flow with
 * confirmation modal. Uses RevenueCat for purchase verification and
 * Supabase for edge wallet crediting.
 */

import { palette } from "@/constants/colors";
import { useAppTheme } from "@/providers/ThemeProvider";
import { useHaptics } from "@/hooks/useHaptics";
import { useAuth } from "@/providers/AuthProvider";
import { useEdge } from "@/providers/EdgeProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useRevenueCat } from "@/providers/RevenueCatProvider";
import { EDGE_PACKS, type EdgePack } from "@/services/edgeStore";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  BadgeCheck,
  Coins,
  Infinity,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from "lucide-react-native";
import type { PurchasesPackage } from "react-native-purchases";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

// ── Constants ──────────────────────────────────────────────────────────────

const PACK_COLORS: Record<string, { accent: string; soft: string; border: string; glow: string }> = {
  edge_250: {
    accent: palette.cyan,
    soft: "rgba(108,230,255,0.12)",
    border: "rgba(108,230,255,0.30)",
    glow: "rgba(108,230,255,0.16)",
  },
  edge_750: {
    accent: palette.cyan,
    soft: "rgba(108,230,255,0.12)",
    border: "rgba(108,230,255,0.30)",
    glow: "rgba(108,230,255,0.16)",
  },
  edge_2000: {
    accent: palette.blue,
    soft: "rgba(61,165,255,0.14)",
    border: "rgba(61,165,255,0.36)",
    glow: "rgba(61,165,255,0.20)",
  },
  edge_6000: {
    accent: palette.gold,
    soft: "rgba(255,181,71,0.12)",
    border: "rgba(255,181,71,0.40)",
    glow: "rgba(255,181,71,0.20)",
  },
  edge_15000: {
    accent: palette.violet,
    soft: "rgba(138,92,255,0.12)",
    border: "rgba(138,92,255,0.40)",
    glow: "rgba(138,92,255,0.22)",
  },
};

const BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  "Best Value": {
    bg: "rgba(255,181,71,0.16)",
    text: palette.gold,
    border: "rgba(255,181,71,0.40)",
  },
  "Power User": {
    bg: "rgba(138,92,255,0.16)",
    text: palette.violet,
    border: "rgba(138,92,255,0.40)",
  },
};

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

  // Status banner
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 5,
    backgroundColor: "rgba(54,245,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(54,245,255,0.18)",
  },
  statusBannerText: {
    color: palette.cyan,
    fontSize: 12,
    fontWeight: "800" as const,
    flex: 1,
  },

  // Balance card
  balanceCard: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panel,
    overflow: "hidden" as const,
  },
  balanceGradient: { ...StyleSheet.absoluteFillObject },
  balanceBody: { padding: 18, gap: 14 },
  balanceHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  balanceTitle: { color: palette.text, fontSize: 14, fontWeight: "900" as const, flex: 1 },
  balanceGrid: { flexDirection: "row", gap: 10 },
  balanceCell: {
    flex: 1,
    borderRadius: 5,
    padding: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
  },
  balanceCellLabel: { fontSize: 10, fontWeight: "800" as const, letterSpacing: 1.2, textTransform: "uppercase" as const },
  balanceCellValue: { fontSize: 22, fontWeight: "900" as const },
  balanceTotal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  balanceTotalLabel: { color: palette.muted, fontSize: 12, fontWeight: "700" as const },
  balanceTotalValue: { color: palette.text, fontSize: 20, fontWeight: "900" as const, flex: 1, textAlign: "right" as const },

  // Info note
  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 5,
    backgroundColor: "rgba(108,230,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(108,230,255,0.14)",
  },
  infoNoteText: { color: palette.muted, fontSize: 12, fontWeight: "600" as const, flex: 1, lineHeight: 18 },

  // Pack grid
  packGrid: { gap: 12 },

  // Pack card
  packCard: {
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: "rgba(10,18,32,0.80)",
    overflow: "hidden" as const,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  packGradient: { ...StyleSheet.absoluteFillObject },
  packIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  packInfo: { flex: 1 },
  packLabel: { fontSize: 17, fontWeight: "900" as const },
  packPrice: { fontSize: 14, fontWeight: "700" as const, marginTop: 3 },
  packBadge: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomLeftRadius: 5,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
  },
  packBadgeText: { fontSize: 10, fontWeight: "900" as const, letterSpacing: 0.8 },
  packArrow: { opacity: 0.5 },

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

  // Confirmation modal
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,4,10,0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.obsidian,
    padding: 22,
    gap: 16,
    overflow: "hidden" as const,
  },
  confirmHeader: {
    color: palette.cyan,
    fontSize: 11,
    fontWeight: "900" as const,
    letterSpacing: 1.8,
    textAlign: "center" as const,
    textTransform: "uppercase" as const,
  },
  confirmPackLabel: { color: palette.text, fontSize: 22, fontWeight: "900" as const, textAlign: "center" as const },
  confirmDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  confirmDetailLabel: { color: palette.muted, fontSize: 13, fontWeight: "600" as const },
  confirmDetailValue: { color: palette.text, fontSize: 13, fontWeight: "800" as const },
  confirmActions: { flexDirection: "row", gap: 10 },
  confirmCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelText: { color: palette.muted, fontSize: 14, fontWeight: "800" as const },
  confirmBuy: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  confirmBuyText: { color: palette.void, fontSize: 14, fontWeight: "900" as const },
  disabledBtn: { opacity: 0.5 },
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Map a RevenueCat package identifier to our local EdgePack metadata. */
function findEdgePack(pkgIdentifier: string): EdgePack | undefined {
  return EDGE_PACKS.find((p) => p.productId === pkgIdentifier);
}

/** Format a RevenueCat price string (e.g. "$4.99") for display. */
function formatPrice(pkg: PurchasesPackage): string {
  return pkg.product.priceString ?? `$${pkg.product.price.toFixed(2)}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Small balance display cell. */
function BalanceCell({
  label,
  value,
  accent,
  bgColor,
  borderColor,
}: {
  label: string;
  value: string;
  accent: string;
  bgColor: string;
  borderColor: string;
}): JSX.Element {
  return (
    <View style={[styles.balanceCell, { backgroundColor: bgColor, borderColor }]}>
      <Text style={[styles.balanceCellLabel, { color: accent }]}>{label}</Text>
      <Text style={[styles.balanceCellValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

/** Single Neuron pack card powered by RevenueCat. */
function PackCard({
  pack,
  rcPackage,
  onPress,
  disabled,
}: {
  pack: EdgePack;
  rcPackage: PurchasesPackage;
  onPress: () => void;
  disabled: boolean;
}): JSX.Element {
  const c = PACK_COLORS[pack.productId] ?? PACK_COLORS.edge_250;
  const badge = pack.badge ? BADGE_STYLES[pack.badge] : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.packCard,
        { borderColor: c.border },
        pressed && { opacity: 0.85 },
        disabled && styles.disabledBtn,
      ]}
    >
      <LinearGradient colors={["rgba(10,18,32,0.60)", c.soft, "rgba(10,18,32,0.94)"]} style={styles.packGradient} />
      {/* Icon */}
      <View style={[styles.packIconWrap, { backgroundColor: c.soft, borderColor: c.border }]}>
        <WalletCards color={c.accent} size={24} />
      </View>
      {/* Info */}
      <View style={styles.packInfo}>
        <Text style={[styles.packLabel, { color: palette.text }]}>{pack.label}</Text>
        <Text style={[styles.packPrice, { color: c.accent }]}>{formatPrice(rcPackage)}</Text>
      </View>
      {/* Badge */}
      {badge && (
        <View style={[styles.packBadge, { backgroundColor: badge.bg, borderLeftColor: badge.border, borderBottomColor: badge.border }]}>
          <Text style={[styles.packBadgeText, { color: badge.text }]}>{pack.badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function EdgeStoreScreen(): JSX.Element {
  const { palette: pal } = useAppTheme();
  const h = useHaptics();
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { balances, purchase: creditEdge, isMutating } = useEdge();
  const {
    configured: rcConfigured,
    packages: rcPackages,
    purchase: rcPurchase,
    restore: rcRestore,
    isPurchasing,
    isRestoring,
  } = useRevenueCat();

  const [confirmPack, setConfirmPack] = useState<EdgePack | null>(null);
  const [confirmRcPkg, setConfirmRcPkg] = useState<PurchasesPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  // Map RevenueCat packages to local EdgePack metadata, sorted by sortKey
  const displayPacks = useMemo(() => {
    if (rcPackages.length === 0) {
      // Fallback: show local packs sorted by price when RevenueCat isn't ready
      return EDGE_PACKS.map((ep) => ({ edgePack: ep, rcPackage: null }))
        .sort((a, b) => a.edgePack.sortKey - b.edgePack.sortKey);
    }
    const mapped: { edgePack: EdgePack; rcPackage: PurchasesPackage }[] = [];
    for (const rcPkg of rcPackages) {
      const ep = findEdgePack(rcPkg.identifier);
      if (ep) {
        mapped.push({ edgePack: ep, rcPackage: rcPkg });
      }
    }
    mapped.sort((a, b) => a.edgePack.sortKey - b.edgePack.sortKey);
    return mapped;
  }, [rcPackages]);

  const handleBack = useCallback((): void => {
    h.selection();
    router.back();
  }, [router, h]);

  const handleSelectPack = useCallback(
    (edgePack: EdgePack, rcPkg: PurchasesPackage | null): void => {
      h.medium();
      setConfirmPack(edgePack);
      setConfirmRcPkg(rcPkg);
    },
    [h],
  );

  const handleConfirmPurchase = useCallback(async (): Promise<void> => {
    if (!confirmPack || !user?.id || !profile) return;
    h.heavy();
    setPurchasing(true);
    try {
      if (rcConfigured && confirmRcPkg) {
        // Real RevenueCat purchase
        const customerInfo = await rcPurchase(confirmRcPkg);
        // After successful purchase, credit the user's neuron wallet
        await creditEdge(confirmPack.edgeAmount, `RevenueCat purchase: ${confirmPack.label}`);
        setConfirmPack(null);
        setConfirmRcPkg(null);
        Alert.alert("Purchase Successful", `${confirmPack.edgeAmount.toLocaleString()} Neurons added to your wallet.`);
      } else {
        // Fallback: RevenueCat not configured — use direct Supabase credit
        await creditEdge(confirmPack.edgeAmount, `Neuron purchase: ${confirmPack.label}`);
        setConfirmPack(null);
        setConfirmRcPkg(null);
        Alert.alert("Purchase Successful", `${confirmPack.edgeAmount.toLocaleString()} Neurons added to your wallet.`);
      }
    } catch (err: unknown) {
      // Check if the user cancelled the purchase
      const msg = err instanceof Error ? err.message : "Purchase failed";
      if (
        typeof err === "object" &&
        err !== null &&
        "userCancelled" in err &&
        (err as { userCancelled?: boolean }).userCancelled
      ) {
        // User cancelled — just close the modal quietly
        setConfirmPack(null);
        setConfirmRcPkg(null);
      } else {
        Alert.alert("Purchase Failed", msg);
      }
    } finally {
      setPurchasing(false);
    }
  }, [confirmPack, confirmRcPkg, user?.id, profile, rcConfigured, rcPurchase, creditEdge, h]);

  const handleCancelConfirm = useCallback((): void => {
    h.selection();
    setConfirmPack(null);
    setConfirmRcPkg(null);
  }, [h]);

  const handleRestore = useCallback(async (): Promise<void> => {
    h.medium();
    try {
      const customerInfo = await rcRestore();
      const activeCount = customerInfo?.entitlements.active
        ? Object.keys(customerInfo.entitlements.active).length
        : 0;
      if (activeCount > 0) {
        Alert.alert("Purchases Restored", `${activeCount} active entitlement(s) found and restored.`);
      } else {
        Alert.alert("No Purchases Found", "No previous purchases were found to restore.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      Alert.alert("Restore Failed", msg);
    }
  }, [rcRestore, h]);

  // Total Edge
  const totalEdge = balances.total.toLocaleString();
  const subEdge = balances.subscription.toLocaleString();
  const purchasedEdge = balances.purchased.toLocaleString();

  // Disable when a mutation is in flight
  const disabled = isMutating || purchasing || isPurchasing;

  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, { backgroundColor: pal.void }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <ArrowLeft color={palette.text} size={18} />
        </Pressable>
        <Text style={styles.headerTitle}>Neuron Store</Text>
        <Sparkles color={palette.gold} size={18} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* RevenueCat status banner */}
        <View style={styles.statusBanner}>
          <ShieldCheck color={palette.cyan} size={16} />
          <Text style={styles.statusBannerText}>
            {rcConfigured ? "Purchases secured by RevenueCat" : "Neuron Store — direct wallet credit"}
          </Text>
        </View>

        {/* Balance card */}
        <View style={styles.balanceCard}>
          <LinearGradient colors={["rgba(54,245,255,0.08)", "rgba(138,92,255,0.04)", "rgba(10,20,40,0.60)"]} style={styles.balanceGradient} />
          <View style={styles.balanceBody}>
            <View style={styles.balanceHeader}>
              <WalletCards color={palette.gold} size={18} />
              <Text style={styles.balanceTitle}>Your Neuron Wallet</Text>
            </View>
            <View style={styles.balanceGrid}>
              <BalanceCell
                label="Subscription"
                value={subEdge}
                accent={palette.cyan}
                bgColor="rgba(108,230,255,0.08)"
                borderColor="rgba(108,230,255,0.18)"
              />
              <BalanceCell
                label="Purchased"
                value={purchasedEdge}
                accent={palette.gold}
                bgColor="rgba(255,181,71,0.08)"
                borderColor="rgba(255,181,71,0.18)"
              />
            </View>
            <View style={[styles.balanceTotal, { borderTopColor: palette.line }]}>
              <Zap color={palette.text} size={14} />
              <Text style={styles.balanceTotalLabel}>Total Neurons</Text>
              <Text style={styles.balanceTotalValue}>{totalEdge} EC</Text>
            </View>
          </View>
        </View>

        {/* Info note */}
        <View style={styles.infoNote}>
          <Infinity color={palette.success} size={14} />
          <Text style={styles.infoNoteText}>
            Purchased Neurons do not expire. Subscription Neurons are always spent first, purchased Neurons second.
          </Text>
        </View>

        {/* Pack header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Coins color={palette.gold} size={18} />
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900" as const }}>Neuron Packs</Text>
        </View>

        {/* Pack cards */}
        <View style={styles.packGrid}>
          {displayPacks.map(({ edgePack, rcPackage }) => (
            <PackCard
              key={edgePack.productId}
              pack={edgePack}
              rcPackage={rcPackage ?? {
                identifier: edgePack.productId,
                offeringIdentifier: "default",
                packageType: "CUSTOM" as const,
                product: {
                  identifier: edgePack.productId,
                  price: edgePack.priceUsd,
                  priceString: `$${edgePack.priceUsd.toFixed(2)}`,
                  currencyCode: "USD",
                  title: edgePack.label,
                  description: `${edgePack.edgeAmount} Neurons`,
                  productCategory: "NON_SUBSCRIPTION" as const,
                } as PurchasesPackage["product"],
              } as unknown as PurchasesPackage}
              onPress={() => handleSelectPack(edgePack, rcPackage)}
              disabled={disabled}
            />
          ))}
        </View>

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
            {isRestoring ? "Restoring..." : "Restore Purchases"}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Confirmation modal */}
      {confirmPack && (
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCancelConfirm} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmHeader}>Confirm Purchase</Text>
            <Text style={styles.confirmPackLabel}>{confirmPack.label}</Text>
            <View style={styles.confirmDetailRow}>
              <Text style={styles.confirmDetailLabel}>Neuron Amount</Text>
              <Text style={[styles.confirmDetailValue, { color: palette.gold }]}>{confirmPack.edgeAmount.toLocaleString()} EC</Text>
            </View>
            <View style={styles.confirmDetailRow}>
              <Text style={styles.confirmDetailLabel}>Price</Text>
              <Text style={styles.confirmDetailValue}>
                {confirmRcPkg ? formatPrice(confirmRcPkg) : `$${confirmPack.priceUsd.toFixed(2)} USD`}
              </Text>
            </View>
            <View style={styles.confirmDetailRow}>
              <Text style={styles.confirmDetailLabel}>Expiration</Text>
              <Text style={[styles.confirmDetailValue, { color: palette.success }]}>Never expires</Text>
            </View>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={handleCancelConfirm}
                disabled={purchasing}
                style={({ pressed }) => [styles.confirmCancel, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmPurchase}
                disabled={purchasing || (rcConfigured && isPurchasing)}
                style={({ pressed }) => [
                  styles.confirmBuy,
                  { backgroundColor: palette.gold },
                  pressed && { opacity: 0.8 },
                  (purchasing || isPurchasing) && styles.disabledBtn,
                ]}
              >
                {(purchasing || isPurchasing) ? (
                  <ActivityIndicator color={palette.void} size="small" />
                ) : (
                  <>
                    <BadgeCheck color={palette.void} size={16} />
                    <Text style={styles.confirmBuyText}>Confirm</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
