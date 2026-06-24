import { palette } from "@/constants/colors";
import { HORIZONTAL_LIST_PERFORMANCE_PROPS, LIST_PERFORMANCE_PROPS, OptimizedEagohImage } from "@/app/components/PerformancePrimitives";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  ArrowRightLeft,
  Award,
  Clock,
  Coins,
  Crown,
  Dna,
  Filter,
  PackageOpen,
  PlusCircle,
  Power,
  Search,
  Shield,
  Signal,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  UserCheck,
  Megaphone,
  TrendingUp,
  X,
} from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { useEdge } from "@/providers/EdgeProvider";
import { useEagohs } from "@/providers/EagohProvider";
import { useProfile } from "@/providers/ProfileProvider";
import {
  canTransact,
  computeTotalCost,
  createListing,
  getActiveFilters,
  getActiveSyncs,
  getMyListings,
  getMyPurchases,
  getVendorStats,
  listActiveListings,
  purchaseSync,
  recalculateVendorStats,
  toggleListingActive,
  type EnrichedListing,
  type EnrichedPurchase,
  type ListingFilters,
  type SyncLevel,
} from "@/services/marketplace";
import type { EagohRecord } from "@/services/eagohs";
import {
  getActiveBanners,
  recordBannerImpression,
  recordBannerTap,
  recordBannerTapHold,
  type EnrichedBanner,
} from "@/services/sponsoredBanners";
import { getBulkReputations, rankColor as repRankColor, RANK_TIERS, type RankTier } from "@/services/reputation";
import type { ReputationRow } from "@/services/reputation";
import { getLeaderboard } from "@/services/leaderboards";

// ── Constants ──────────────────────────────────────────────────────────

const SYNC_LEVELS: SyncLevel[] = ["25%", "50%", "75%", "100%"];
const DAYS = [1, 2, 3, 4, 5];
const RANKS = ["Any Rank", "Syndicate Prime", "Oracle", "Diamond", "Platinum", "Gold", "Silver", "Bronze", "Activated"];

const RANK_FILTER_OPTIONS = ["Any Rank", "Syndicate Prime", "Oracle", "Diamond", "Platinum", "Gold", "Silver", "Bronze", "Activated"];

const SYNC_DESCRIPTIONS: Record<SyncLevel, string> = {
  "25%": "Basic surface-level intelligence signals",
  "50%": "Moderate depth analysis patterns",
  "75%": "Advanced analytical framework access",
  "100%": "Full intelligence model synchronization",
};

// ── Helpers ────────────────────────────────────────────────────────────

function domainLabel(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1).replace(/_/g, " ");
}

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return `${days}d ${remainHours}h left`;
}

function rankEmoji(rank: string): string {
  if (rank === "Syndicate Prime") return "★";
  if (rank === "Oracle") return "◆";
  if (rank === "Diamond") return "◇";
  if (rank === "Platinum") return "●";
  if (rank === "Gold") return "⬡";
  return "";
}

function rankColor(rank: string): string {
  if (RANK_TIERS.includes(rank as RankTier)) return repRankColor(rank as RankTier);
  switch (rank) {
    case "S-TIER": return palette.gold;
    case "ELITE": return palette.cyan;
    case "PRO": return palette.violet;
    case "RISING": return palette.success;
    default: return palette.muted;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────

function Hero(): JSX.Element {
  return (
    <View style={styles.hero}>
      <LinearGradient
        colors={["rgba(54,245,255,0.18)", "rgba(138,92,255,0.12)", "rgba(255,184,77,0.07)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.radarDisc} />
      <Text style={styles.kicker}>EAGOH MARKETPLACE</Text>
      <Text style={styles.title}>Intelligence Exchange</Text>
      <Text style={styles.subtitle}>
        Browse premium EAGOH analyst entities. Paid subscribers can buy sync access
        and list their own EAGOHs for sale. Syncs expire automatically.
      </Text>
      <View style={styles.heroStats}>
        <View style={styles.heroStat}>
          <Shield color={palette.cyan} size={14} />
          <Text style={styles.heroStatText}>Secure Sync</Text>
        </View>
        <View style={styles.heroStat}>
          <Clock color={palette.gold} size={14} />
          <Text style={styles.heroStatText}>1-5 Day Access</Text>
        </View>
        <View style={styles.heroStat}>
          <ArrowRightLeft color={palette.violet} size={14} />
          <Text style={styles.heroStatText}>No Platform Fee</Text>
        </View>
      </View>
    </View>
  );
}

// ── Vendor Stats Card ──────────────────────────────────────────────────

const VendorStatsCard = memo(function VendorStatsCard(): JSX.Element | null {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id || !profile || !canTransact(profile.subscription_tier)) return;
    setLoading(true);
    getVendorStats(user.id)
      .then((s) => { setStats(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user?.id, profile]);

  if (!profile || !canTransact(profile.subscription_tier) || loading) return null;
  if (!stats || stats.total_listings === 0) return null;

  return (
    <View style={styles.vendorStatsCard}>
      <LinearGradient colors={["rgba(138,92,255,0.18)", "rgba(10,20,38,0.90)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.vendorStatsHeader}>
        <Crown color={palette.violet} size={18} />
        <Text style={styles.vendorStatsTitle}>Vendor Dashboard</Text>
        <Text style={[styles.rankBadge, { color: rankColor(stats.rank), borderColor: `${rankColor(stats.rank)}55` }]}>{stats.rank}</Text>
      </View>
      <View style={styles.vendorStatsGrid}>
        <View style={styles.vendorStatItem}>
          <Text style={styles.vendorStatValue}>{stats.active_listings}</Text>
          <Text style={styles.vendorStatLabel}>Active</Text>
        </View>
        <View style={styles.vendorStatItem}>
          <Text style={styles.vendorStatValue}>{stats.total_sales}</Text>
          <Text style={styles.vendorStatLabel}>Sales</Text>
        </View>
        <View style={styles.vendorStatItem}>
          <Text style={[styles.vendorStatValue, { color: palette.gold }]}>{stats.edge_earned_this_month}</Text>
          <Text style={styles.vendorStatLabel}>EC This Month</Text>
        </View>
        <View style={styles.vendorStatItem}>
          <Text style={[styles.vendorStatValue, { color: palette.cyan }]}>{stats.sync_success_score}</Text>
          <Text style={styles.vendorStatLabel}>Sync Score</Text>
        </View>
      </View>
    </View>
  );
});

// ── Filters ────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  setFilters,
  domains,
  sports,
  ranks,
}: {
  filters: ListingFilters;
  setFilters: (f: ListingFilters) => void;
  domains: string[];
  sports: string[];
  ranks: string[];
}): JSX.Element {
  const renderChips = (items: string[], selected: string | undefined, onSelect: (v: string) => void, allLabel: string = "All"): JSX.Element => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
      <Pressable onPress={() => onSelect("")} style={[styles.chip, !selected && styles.activeChip]}>
        <Text style={[styles.chipText, !selected && styles.activeChipText]}>{allLabel}</Text>
      </Pressable>
      {items.map((item) => (
        <Pressable key={item} onPress={() => onSelect(item)} style={[styles.chip, selected === item && styles.activeChip]}>
          <Text style={[styles.chipText, selected === item && styles.activeChipText]}>{item}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.filterPanel}>
      <View style={styles.searchBox}>
        <Search color={palette.muted} size={18} />
        <TextInput
          value={filters.search ?? ""}
          onChangeText={(v) => setFilters({ ...filters, search: v || undefined })}
          placeholder="Search EAGOH, vendor, team..."
          placeholderTextColor={palette.muted}
          style={styles.searchInput}
        />
      </View>
      <View style={styles.filterHeader}>
        <SlidersHorizontal color={palette.gold} size={16} />
        <Text style={styles.filterTitle}>Filters</Text>
        {Object.values(filters).some((v) => v) && (
          <Pressable onPress={() => setFilters({})} style={styles.clearFilterBtn}>
            <Text style={styles.clearFilterText}>Clear</Text>
          </Pressable>
        )}
      </View>
      {domains.length > 0 && (
        <View>
          <Text style={styles.filterLabel}>Domain</Text>
          {renderChips(domains, filters.domain, (v) => setFilters({ ...filters, domain: v || undefined }))}
        </View>
      )}
      {sports.length > 0 && (
        <View>
          <Text style={styles.filterLabel}>Sport</Text>
          {renderChips(sports, filters.sport, (v) => setFilters({ ...filters, sport: v || undefined }))}
        </View>
      )}
      <View>
        <Text style={styles.filterLabel}>Sync Level</Text>
        {renderChips(SYNC_LEVELS, filters.syncLevel, (v) => setFilters({ ...filters, syncLevel: (v || undefined) as SyncLevel | undefined }))}
      </View>
      <View>
        <Text style={styles.filterLabel}>Vendor Rank</Text>
        {renderChips(RANKS, filters.rank, (v) => setFilters({ ...filters, rank: v || undefined }))}
      </View>
    </View>
  );
}

// ── Listing Card ───────────────────────────────────────────────────────

const ListingCard = memo(function ListingCard({
  item,
  isPaid,
  onPurchase,
  reputation,
}: {
  item: EnrichedListing;
  isPaid: boolean;
  onPurchase: (listing: EnrichedListing) => void;
  reputation: ReputationRow | undefined;
}): JSX.Element {
  const eagoh = item.eagoh;
  const domain = eagoh?.domain ?? eagoh?.sport ?? "Unknown";
  const minPrice = [item.price_25_per_day, item.price_50_per_day, item.price_75_per_day, item.price_100_per_day]
    .filter((p) => p > 0)
    .sort((a, b) => a - b)[0];

  const eagohRank: RankTier = (reputation?.rank as RankTier) ?? "Dormant";
  const repScore = reputation?.reputation_score ?? 0;
  const rkColor = rankColor(eagohRank);

  return (
    <View style={styles.listingCard}>
      <View style={[styles.cardGlow, { backgroundColor: rkColor }]} />
      <View style={styles.listingTop}>
        <View style={styles.listingImageWrap}>
          {eagoh?.image_thumb_url ? (
            <OptimizedEagohImage
              tone={eagohRank === "Syndicate Prime" || eagohRank === "Oracle" ? "gold" : eagohRank === "Diamond" ? "cyan" : "violet"}
              label={eagoh.name}
              size="banner"
            />
          ) : (
            <View style={styles.listingImagePlaceholder}>
              <Dna color={palette.muted} size={28} />
            </View>
          )}
          <View style={[styles.rankPillSmall, { backgroundColor: `${rkColor}1F`, borderColor: `${rkColor}44` }]}>
            <Text style={[styles.rankPillSmallText, { color: rkColor }]}>{rankEmoji(eagohRank)} {eagohRank}</Text>
          </View>
        </View>
        <View style={styles.listingInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.listingName} numberOfLines={1}>{eagoh?.name ?? "Unnamed"}</Text>
            {repScore > 0 && (
              <View style={[styles.repScoreBadge, { borderColor: rkColor }]}>
                <Star color={rkColor} size={11} />
                <Text style={[styles.repScoreText, { color: rkColor }]}>{repScore}</Text>
              </View>
            )}
          </View>
          <Text style={styles.listingDomain}>{domainLabel(domain)}</Text>
          <View style={styles.listingDna}>
            {(eagoh?.dna ?? []).slice(0, 3).map((d) => (
              <View key={d} style={styles.dnaTag}>
                <Text style={styles.dnaTagText}>{d}</Text>
              </View>
            ))}
          </View>
          {item.fanatic_teams.length > 0 && (
            <Text style={styles.teamText} numberOfLines={1}>{item.fanatic_teams.join(" · ")}</Text>
          )}
          <View style={styles.metricGrid}>
            <View style={styles.metricRow}>
              <Signal color={palette.success} size={12} />
              <Text style={styles.metric}>Sync: {item.sync_success_score}</Text>
            </View>
            <View style={styles.metricRow}>
              <Sparkles color={palette.cyan} size={12} />
              <Text style={styles.metric}>Quality: {item.avg_quality_score}</Text>
            </View>
            <View style={styles.metricRow}>
              <Coins color={palette.gold} size={12} />
              <Text style={styles.metric}>Earned: {item.edge_earned_this_month} EC/mo</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.vendorStrip}>
        <UserCheck color={palette.muted} size={14} />
        <Text style={styles.vendorText}>{item.vendor_username ?? "Anonymous"}</Text>
        {reputation && (
          <>
            <View style={styles.vendorDivider} />
            <Shield color={rkColor} size={12} />
            <Text style={[styles.vendorRepText, { color: rkColor }]}>Trust: {reputation.marketplace_trust}</Text>
          </>
        )}
      </View>
      <Text style={styles.pricePreview}>
        From {minPrice ?? "—"} EC/day
      </Text>
      <Pressable
        onPress={() => isPaid && onPurchase(item)}
        style={({ pressed }) => [
          styles.buyButton,
          !isPaid && styles.buyButtonDisabled,
          pressed && styles.pressed,
        ]}
      >
        <Tag color={isPaid ? palette.void : palette.muted} size={15} />
        <Text style={[styles.buyButtonText, !isPaid && styles.buyButtonTextDisabled]}>
          {isPaid ? "View & Purchase" : "Browse Only"}
        </Text>
      </Pressable>
    </View>
  );
});

// ── Purchase Modal ─────────────────────────────────────────────────────

function PurchaseModal({
  visible,
  listing,
  onClose,
  onConfirm,
  purchasing,
}: {
  visible: boolean;
  listing: EnrichedListing | null;
  onClose: () => void;
  onConfirm: (level: SyncLevel, days: number) => void;
  purchasing: boolean;
}): JSX.Element {
  const [selectedLevel, setSelectedLevel] = useState<SyncLevel>("25%");
  const [selectedDays, setSelectedDays] = useState<number>(1);

  useEffect(() => {
    setSelectedLevel("25%");
    setSelectedDays(1);
  }, [listing?.id]);

  if (!listing) return <></>;

  const eagoh = listing.eagoh;
  const totalCost = computeTotalCost(listing, selectedLevel, selectedDays);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <LinearGradient colors={["#0A1628", "#050D18"]} style={StyleSheet.absoluteFill} />
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Purchase Sync</Text>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <X color={palette.muted} size={20} />
            </Pressable>
          </View>

          {/* EAGOH preview */}
          <View style={styles.modalEagohPreview}>
            <View style={styles.modalEagohImage}>
              <OptimizedEagohImage tone="cyan" label={eagoh?.name ?? "EAGOH"} size="banner" />
            </View>
            <View>
              <Text style={styles.modalEagohName}>{eagoh?.name}</Text>
              <Text style={styles.modalEagohDomain}>{domainLabel(eagoh?.domain ?? eagoh?.sport ?? "")}</Text>
              <Text style={styles.modalVendor}>by {listing.vendor_username ?? "Anonymous"}</Text>
            </View>
          </View>

          {/* Sync level */}
          <Text style={styles.modalSectionLabel}>Sync Level</Text>
          <Text style={styles.modalSectionDesc}>{SYNC_DESCRIPTIONS[selectedLevel]}</Text>
          <View style={styles.syncLevelGrid}>
            {SYNC_LEVELS.map((level) => {
              const price = (level === "25%" ? listing.price_25_per_day : level === "50%" ? listing.price_50_per_day : level === "75%" ? listing.price_75_per_day : listing.price_100_per_day);
              const disabled = price <= 0;
              return (
                <Pressable
                  key={level}
                  onPress={() => !disabled && setSelectedLevel(level)}
                  style={[
                    styles.syncLevelChip,
                    selectedLevel === level && styles.syncLevelChipActive,
                    disabled && styles.syncLevelChipDisabled,
                  ]}
                >
                  <Text style={[styles.syncLevelText, selectedLevel === level && styles.syncLevelTextActive, disabled && styles.syncLevelTextDisabled]}>
                    {level}
                  </Text>
                  <Text style={[styles.syncLevelPrice, selectedLevel === level && styles.syncLevelPriceActive]}>
                    {disabled ? "—" : `${price} EC`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Duration */}
          <Text style={styles.modalSectionLabel}>Duration (Days)</Text>
          <View style={styles.daysRow}>
            {DAYS.map((day) => (
              <Pressable
                key={day}
                onPress={() => setSelectedDays(day)}
                style={[styles.dayChip, selectedDays === day && styles.dayChipActive]}
              >
                <Text style={[styles.dayChipText, selectedDays === day && styles.dayChipTextActive]}>{day}</Text>
              </Pressable>
            ))}
          </View>

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Cost</Text>
            <View style={styles.totalValueRow}>
              <Coins color={palette.gold} size={18} />
              <Text style={styles.totalValue}>{totalCost} EC</Text>
            </View>
          </View>
          <Text style={styles.totalBreakdown}>
            {selectedLevel} sync × {selectedDays} day{selectedDays > 1 ? "s" : ""}
          </Text>

          {/* Confirm */}
          <Pressable
            onPress={() => onConfirm(selectedLevel, selectedDays)}
            disabled={purchasing || totalCost <= 0}
            style={({ pressed }) => [
              styles.confirmButton,
              (purchasing || totalCost <= 0) && styles.confirmButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {purchasing ? (
              <ActivityIndicator color={palette.void} size="small" />
            ) : (
              <>
                <ArrowRightLeft color={palette.void} size={17} />
                <Text style={styles.confirmButtonText}>Confirm Purchase</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Create Listing Modal ───────────────────────────────────────────────

function CreateListingModal({
  visible,
  onClose,
  onCreated,
  creating,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  creating: boolean;
}): JSX.Element {
  const { user } = useAuth();
  const { eagohs } = useEagohs();
  const [selectedEagohId, setSelectedEagohId] = useState<string>("");
  const [price25, setPrice25] = useState<string>("");
  const [price50, setPrice50] = useState<string>("");
  const [price75, setPrice75] = useState<string>("");
  const [price100, setPrice100] = useState<string>("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setSelectedEagohId("");
    setPrice25("");
    setPrice50("");
    setPrice75("");
    setPrice100("");
    setDescription("");
  };

  const handleCreate = async () => {
    if (!user?.id || !selectedEagohId) return;
    try {
      await createListing({
        vendorId: user.id,
        eagohId: selectedEagohId,
        price25PerDay: parseInt(price25, 10) || 0,
        price50PerDay: parseInt(price50, 10) || 0,
        price75PerDay: parseInt(price75, 10) || 0,
        price100PerDay: parseInt(price100, 10) || 0,
        description: description.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onCreated();
      onClose();
    } catch (err: unknown) {
      Alert.alert("Error", (err as Error).message ?? "Failed to create listing.");
    }
  };

  const myEagohs = (eagohs ?? []).filter((e: EagohRecord) => e.user_id === user?.id);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <LinearGradient colors={["#0A1628", "#050D18"]} style={StyleSheet.absoluteFill} />
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Listing</Text>
            <Pressable onPress={() => { reset(); onClose(); }} style={styles.modalClose}>
              <X color={palette.muted} size={20} />
            </Pressable>
          </View>

          <Text style={styles.modalSectionLabel}>Select EAGOH</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
            {myEagohs.map((e: EagohRecord) => (
              <Pressable
                key={e.id}
                onPress={() => setSelectedEagohId(e.id)}
                style={[styles.chip, selectedEagohId === e.id && styles.activeChip]}
              >
                <Text style={[styles.chipText, selectedEagohId === e.id && styles.activeChipText]}>{e.name}</Text>
              </Pressable>
            ))}
            {myEagohs.length === 0 && (
              <Text style={styles.emptyHint}>No EAGOHs available. Forge one first.</Text>
            )}
          </ScrollView>

          <Text style={styles.modalSectionLabel}>Price Per Day (EC)</Text>
          <View style={styles.priceGrid}>
            <View style={styles.priceInputWrap}>
              <Text style={styles.priceInputLabel}>25% Sync</Text>
              <TextInput value={price25} onChangeText={setPrice25} keyboardType="numeric" placeholder="0" placeholderTextColor={palette.muted} style={styles.priceInput} />
            </View>
            <View style={styles.priceInputWrap}>
              <Text style={styles.priceInputLabel}>50% Sync</Text>
              <TextInput value={price50} onChangeText={setPrice50} keyboardType="numeric" placeholder="0" placeholderTextColor={palette.muted} style={styles.priceInput} />
            </View>
            <View style={styles.priceInputWrap}>
              <Text style={styles.priceInputLabel}>75% Sync</Text>
              <TextInput value={price75} onChangeText={setPrice75} keyboardType="numeric" placeholder="0" placeholderTextColor={palette.muted} style={styles.priceInput} />
            </View>
            <View style={styles.priceInputWrap}>
              <Text style={styles.priceInputLabel}>100% Sync</Text>
              <TextInput value={price100} onChangeText={setPrice100} keyboardType="numeric" placeholder="0" placeholderTextColor={palette.muted} style={styles.priceInput} />
            </View>
          </View>

          <Text style={styles.modalSectionLabel}>Description (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description of what buyers get..."
            placeholderTextColor={palette.muted}
            multiline
            numberOfLines={3}
            style={styles.descriptionInput}
          />

          <Pressable
            onPress={handleCreate}
            disabled={creating || !selectedEagohId}
            style={({ pressed }) => [
              styles.confirmButton,
              (creating || !selectedEagohId) && styles.confirmButtonDisabled,
              pressed && styles.pressed,
              { marginTop: 16 },
            ]}
          >
            {creating ? (
              <ActivityIndicator color={palette.void} size="small" />
            ) : (
              <>
                <PlusCircle color={palette.void} size={17} />
                <Text style={styles.confirmButtonText}>Publish Listing</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Active Syncs ───────────────────────────────────────────────────────

const ActiveSyncCard = memo(function ActiveSyncCard({ item }: { item: EnrichedPurchase }): JSX.Element {
  const remaining = timeLeft(item.expires_at);
  const isExpiring = remaining.includes("h") && parseInt(remaining) < 4;

  return (
    <View style={styles.activeSyncCard}>
      <View style={styles.activeSyncLeft}>
        <View style={styles.activeSyncImage}>
          <OptimizedEagohImage tone="cyan" label={item.eagoh_name} size="banner" />
        </View>
        <View style={styles.activeSyncInfo}>
          <Text style={styles.activeSyncName} numberOfLines={1}>{item.eagoh_name}</Text>
          <Text style={styles.activeSyncVendor}>by {item.vendor_username ?? "Anonymous"}</Text>
          <Text style={styles.activeSyncLevel}>{item.sync_level} Sync · {item.days} day(s)</Text>
        </View>
      </View>
      <View style={styles.activeSyncRight}>
        <View style={[styles.activeSyncStatus, isExpiring && styles.activeSyncStatusWarn]}>
          <Power color={isExpiring ? palette.ember : palette.success} size={12} />
          <Text style={[styles.activeSyncStatusText, isExpiring && styles.activeSyncStatusTextWarn]}>
            {isExpiring ? "Expiring" : "Active"}
          </Text>
        </View>
        <Text style={[styles.activeSyncTime, isExpiring && styles.activeSyncTimeWarn]}>{remaining}</Text>
        <Text style={styles.activeSyncCost}>{item.edge_cost} EC</Text>
      </View>
    </View>
  );
});

// ── My Listing Card ────────────────────────────────────────────────────

const MyListingCard = memo(function MyListingCard({
  item,
  onToggle,
  onRecalc,
  reputation,
}: {
  item: EnrichedListing;
  onToggle: (id: string, active: boolean) => void;
  onRecalc: () => void;
  reputation: ReputationRow | undefined;
}): JSX.Element {
  const eagohRank: RankTier = (reputation?.rank as RankTier) ?? "Dormant";
  const rkColor = rankColor(eagohRank);
  return (
    <View style={[styles.myListingCard, !item.active && styles.myListingCardInactive]}>
      <View style={styles.myListingTop}>
        <Text style={styles.myListingName}>{item.eagoh?.name ?? "Unnamed"}</Text>
        <View style={[styles.activeDot, item.active ? styles.activeDotOn : styles.activeDotOff]} />
      </View>
      <View style={styles.myListingPrices}>
        {(["25%", "50%", "75%", "100%"] as const).map((level) => {
          const price = level === "25%" ? item.price_25_per_day : level === "50%" ? item.price_50_per_day : level === "75%" ? item.price_75_per_day : item.price_100_per_day;
          if (price <= 0) return null;
          return (
            <View key={level} style={styles.myListingPriceTag}>
              <Text style={styles.myListingPriceText}>{level}: {price} EC</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.myListingActions}>
        <Pressable
          onPress={() => onToggle(item.id, !item.active)}
          style={[styles.myListingActionBtn, item.active ? styles.myListingActionBtnOff : styles.myListingActionBtnOn]}
        >
          <Text style={[styles.myListingActionText, item.active && styles.myListingActionTextOff]}>
            {item.active ? "Deactivate" : "Activate"}
          </Text>
        </Pressable>
      </View>
      {reputation && (
        <View style={styles.myListingRepRow}>
          <Award color={rkColor} size={13} />
          <Text style={[styles.myListingRepText, { color: rkColor }]}>
            {eagohRank} · Rep: {reputation.reputation_score}
          </Text>
        </View>
      )}
    </View>
  );
});

// ── Marketplace Sponsored Banner Carousel ──────────────────────────────

const MktSponsoredBanner = memo(function MktSponsoredBanner({ item, userId, reputation }: { item: EnrichedBanner; userId: string | null; reputation: ReputationRow | undefined }): JSX.Element {
  const eagohRank: RankTier = (reputation?.rank as RankTier) ?? "Dormant";
  const repScore = reputation?.reputation_score ?? 0;
  const accent = repScore > 0 ? rankColor(eagohRank) : (item.vendor_rank === "S-TIER" ? palette.gold : item.vendor_rank === "ELITE" ? palette.cyan : palette.violet);
  const domainLabel: string = item.eagoh_domain.charAt(0).toUpperCase() + item.eagoh_domain.slice(1).replace(/_/g, " ");

  useEffect(() => {
    if (userId) recordBannerImpression(item.id, userId).catch(() => undefined);
  }, [item.id, userId]);

  return (
    <Pressable
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (userId) recordBannerTapHold(item.id, userId).catch(() => undefined);
      }}
      onPress={() => {
        if (userId) recordBannerTap(item.id, userId).catch(() => undefined);
      }}
      delayLongPress={280}
      style={({ pressed }) => [
        styles.mktBannerCard,
        pressed && styles.pressed,
        item.colored_border && { borderColor: accent, borderWidth: 1.5 },
        item.hot_badge && { borderColor: palette.ember },
      ]}
    >
      {item.hot_badge && (
        <View style={styles.mktHotBadge}>
          <Text style={styles.mktHotBadgeText}>HOT</Text>
        </View>
      )}
      <View style={styles.mktBannerImage}>
        <OptimizedEagohImage tone={item.vendor_rank === "S-TIER" ? "gold" : item.vendor_rank === "ELITE" ? "cyan" : "violet"} label={item.eagoh_name.slice(0, 8).toUpperCase()} size="banner" />
      </View>
      <View style={styles.mktBannerInfo}>
        <Text style={styles.mktBannerName} numberOfLines={1}>{item.eagoh_name}</Text>
        <Text style={styles.mktBannerDomain}>{domainLabel}</Text>
        {repScore > 0 && (
          <View style={[styles.mktBannerRankRow, { borderColor: `${accent}33`, backgroundColor: `${accent}10` }]}>
            <Award color={accent} size={11} />
            <Text style={[styles.mktBannerRankText, { color: accent }]}>{rankEmoji(eagohRank)} {eagohRank} · {repScore}</Text>
          </View>
        )}
        <View style={styles.mktBannerMeta}>
          <Text style={styles.mktBannerScore}>Q: {item.quality_score}</Text>
          <Text style={styles.mktBannerSync}>Sync: {item.sync_score}</Text>
        </View>
      </View>
    </Pressable>
  );
});

const MktSponsoredCarousel = memo(function MktSponsoredCarousel({ userId }: { userId: string | null }): JSX.Element | null {
  const [banners, setBanners] = useState<EnrichedBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerRepMap, setBannerRepMap] = useState<Map<string, ReputationRow>>(new Map());

  useEffect(() => {
    setLoading(true);
    getActiveBanners("marketplace")
      .then((b) => {
        setBanners(b);
        setLoading(false);
        const eagohIds = [...new Set(b.map((bb) => bb.eagoh_id))];
        if (eagohIds.length > 0) {
          getBulkReputations(eagohIds).then(setBannerRepMap).catch(() => undefined);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (banners.length === 0) return null;

  return (
    <View style={{ marginTop: 16, gap: 10 }}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Megaphone color={palette.gold} size={15} />
          <Text style={styles.sectionTitle}>Sponsored EAGOHs</Text>
        </View>
        <Text style={styles.sectionCount}>{banners.length}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }} {...HORIZONTAL_LIST_PERFORMANCE_PROPS}>
        {banners.map((b) => (
          <MktSponsoredBanner key={b.id} item={b} userId={userId} reputation={bannerRepMap.get(b.eagoh_id)} />
        ))}
      </ScrollView>
    </View>
  );
});

// ── Main Screen ────────────────────────────────────────────────────────

export default function MarketplaceScreen(): JSX.Element {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { balances } = useEdge();

  const [filters, setFilters] = useState<ListingFilters>({});
  const [listings, setListings] = useState<EnrichedListing[]>([]);
  const [myListings, setMyListings] = useState<EnrichedListing[]>([]);
  const [activeSyncs, setActiveSyncsState] = useState<EnrichedPurchase[]>([]);
  const [purchases, setPurchases] = useState<EnrichedPurchase[]>([]);
  const [filterMeta, setFilterMeta] = useState<{ domains: string[]; sports: string[]; ranks: string[] }>({ domains: [], sports: [], ranks: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"browse" | "rankings" | "my-listings" | "my-syncs" | "my-purchases">("browse");
  const [rankingsData, setRankingsData] = useState<Array<{ rank: number; eagoh_id: string; eagoh_name: string; reputation_score: number; rank_tier: RankTier; marketplace_trust: number; sync_success: number; marketplace_sales: number; owner_username: string }>>([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [repMap, setRepMap] = useState<Map<string, ReputationRow>>(new Map());

  const [purchaseModal, setPurchaseModal] = useState<EnrichedListing | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const [createModal, setCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const isPaid = profile ? canTransact(profile.subscription_tier) : false;

  const loadData = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const [l, meta, syncs, myList, myPurch] = await Promise.all([
        listActiveListings(filters),
        getActiveFilters(),
        getActiveSyncs(user.id),
        isPaid ? getMyListings(user.id) : Promise.resolve([]),
        isPaid ? getMyPurchases(user.id) : Promise.resolve([]),
      ]);
      setListings(l);
      setFilterMeta(meta);
      setActiveSyncsState(syncs);
      setMyListings(myList);
      setPurchases(myPurch);
      // Load reputations for all listings
      const allEagohIds = [...new Set(l.map((li) => li.eagoh_id))];
      if (allEagohIds.length > 0) {
        getBulkReputations(allEagohIds).then(setRepMap).catch(() => undefined);
      }
    } catch (err) {
      console.warn("[marketplace] load error", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isPaid, filters]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const handlePurchaseConfirm = useCallback(async (level: SyncLevel, days: number) => {
    if (!user?.id || !profile || !purchaseModal) return;
    setPurchasing(true);
    try {
      const result = await purchaseSync(user.id, profile, purchaseModal.id, level, days);
      if (!result.ok) {
        Alert.alert("Purchase Failed", result.error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Sync Purchased", `You now have ${level} sync access for ${days} day(s).`);
        setPurchaseModal(null);
        loadData();
      }
    } catch (err: unknown) {
      Alert.alert("Error", (err as Error).message ?? "Purchase failed.");
    } finally {
      setPurchasing(false);
    }
  }, [user?.id, profile, purchaseModal, loadData]);

  const handleToggleListing = useCallback(async (id: string, active: boolean) => {
    try {
      await toggleListingActive(id, active);
      Haptics.selectionAsync();
      loadData();
    } catch {
      Alert.alert("Error", "Failed to update listing.");
    }
  }, [loadData]);

  const renderHeader = useCallback(
    () => (
      <View>
        <Hero />
        <VendorStatsCard />

        {/* Active Syncs (above filters, compact) */}
        {isPaid && activeSyncs.length > 0 && (
          <View style={styles.activeSyncsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Active Syncs</Text>
              <Text style={styles.sectionCount}>{activeSyncs.length}</Text>
            </View>
            {activeSyncs.map((s) => (
              <ActiveSyncCard key={s.id} item={s} />
            ))}
          </View>
        )}

        {/* Tab bar: Browse | Rankings | My Listings | My Syncs | My Purchases */}
        {(true) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRail}>
            {([
              { key: "browse", label: "Browse" },
              { key: "rankings", label: "Rankings" },
              ...(isPaid ? [
                { key: "my-listings" as const, label: "My Listings" },
                { key: "my-syncs" as const, label: "Active Syncs" },
                { key: "my-purchases" as const, label: "History" },
              ] : []),
            ]).map((t) => (
              <Pressable
                key={t.key}
                onPress={() => {
                  setTab(t.key as typeof tab);
                  if (t.key === "rankings" && rankingsData.length === 0) {
                    setRankingsLoading(true);
                    getLeaderboard("top_vendors", {}, 10, 0)
                      .then((r) => {
                        setRankingsData(r.entries.map((e) => ({
                          rank: e.rank,
                          eagoh_id: e.eagoh_id,
                          eagoh_name: e.eagoh_name,
                          reputation_score: e.reputation_score,
                          rank_tier: e.rank_tier,
                          marketplace_trust: e.marketplace_trust,
                          sync_success: e.sync_success,
                          marketplace_sales: e.marketplace_sales,
                          owner_username: e.owner_username,
                        })));
                        setRankingsLoading(false);
                      })
                      .catch(() => setRankingsLoading(false));
                  }
                }}
                style={[styles.tabChip, tab === t.key && styles.tabChipActive]}
              >
                <Text style={[styles.tabChipText, tab === t.key && styles.tabChipTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
            {isPaid && (
              <Pressable onPress={() => setCreateModal(true)} style={styles.createListingBtn}>
                <PlusCircle color={palette.cyan} size={14} />
                <Text style={styles.createListingText}>Create Listing</Text>
              </Pressable>
            )}
          </ScrollView>
        )}

        {/* Filters (only in browse) */}
        {tab === "browse" && (
          <FilterPanel
            filters={filters}
            setFilters={setFilters}
            domains={filterMeta.domains}
            sports={filterMeta.sports}
            ranks={filterMeta.ranks}
          />
        )}
      </View>
    ),
    [filters, setFilters, filterMeta, tab, activeSyncs, isPaid],
  );

  const renderListings = () => {
    if (tab === "browse") {
      if (loading) {
        return (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={palette.cyan} size="large" />
          </View>
        );
      }
      if (listings.length === 0) {
        return (
          <View style={styles.emptyWrap}>
            <PackageOpen color={palette.muted} size={40} />
            <Text style={styles.emptyTitle}>No Listings Found</Text>
            <Text style={styles.emptyBody}>
              {Object.values(filters).some((v) => v)
                ? "Try adjusting your filters."
                : "No EAGOHs are currently listed for sync. Be the first to list one!"}
            </Text>
          </View>
        );
      }
      return (
        <View style={styles.listingsWrap}>
          {listings.map((item) => (
            <ListingCard
              key={item.id}
              item={item}
              isPaid={isPaid}
              onPurchase={(l) => setPurchaseModal(l)}
              reputation={repMap.get(item.eagoh_id)}
            />
          ))}
        </View>
      );
    }

    if (tab === "my-listings") {
      if (myListings.length === 0) {
        return (
          <View style={styles.emptyWrap}>
            <PackageOpen color={palette.muted} size={40} />
            <Text style={styles.emptyTitle}>No Listings</Text>
            <Text style={styles.emptyBody}>Create your first listing to offer EAGOH sync access.</Text>
            <Pressable onPress={() => setCreateModal(true)} style={styles.emptyActionBtn}>
              <PlusCircle color={palette.void} size={16} />
              <Text style={styles.emptyActionText}>Create Listing</Text>
            </Pressable>
          </View>
        );
      }
      return (
        <View style={styles.listingsWrap}>
          {myListings.map((item) => (
            <MyListingCard
              key={item.id}
              item={item}
              onToggle={handleToggleListing}
              onRecalc={loadData}
              reputation={repMap.get(item.eagoh_id)}
            />
          ))}
        </View>
      );
    }

    if (tab === "my-syncs") {
      const allActive = activeSyncs;
      if (allActive.length === 0) {
        return (
          <View style={styles.emptyWrap}>
            <Clock color={palette.muted} size={40} />
            <Text style={styles.emptyTitle}>No Active Syncs</Text>
            <Text style={styles.emptyBody}>Purchase sync access from the Browse tab.</Text>
          </View>
        );
      }
      return (
        <View style={styles.listingsWrap}>
          {allActive.map((s) => (
            <ActiveSyncCard key={s.id} item={s} />
          ))}
        </View>
      );
    }

    if (tab === "my-purchases") {
      if (purchases.length === 0) {
        return (
          <View style={styles.emptyWrap}>
            <Clock color={palette.muted} size={40} />
            <Text style={styles.emptyTitle}>No Purchase History</Text>
            <Text style={styles.emptyBody}>Your past sync purchases will appear here.</Text>
          </View>
        );
      }
      return (
        <View style={styles.listingsWrap}>
          {purchases.map((s) => (
            <ActiveSyncCard key={s.id} item={s} />
          ))}
        </View>
      );
    }

    if (tab === "rankings") {
      if (rankingsLoading) {
        return (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={palette.gold} size="large" />
          </View>
        );
      }
      if (rankingsData.length === 0) {
        return (
          <View style={styles.emptyWrap}>
            <TrendingUp color={palette.muted} size={40} />
            <Text style={styles.emptyTitle}>No Rankings Yet</Text>
            <Text style={styles.emptyBody}>Marketplace rankings will appear as vendors list their EAGOHs.</Text>
          </View>
        );
      }
      return (
        <View style={styles.listingsWrap}>
          {rankingsData.map((entry) => {
            const rkColor = rankColor(entry.rank_tier as RankTier);
            return (
              <View key={entry.eagoh_id} style={styles.rankingCard}>
                <View style={[styles.cardGlow, { backgroundColor: rkColor }]} />
                <View style={styles.rankingCardLeft}>
                  <Text style={[styles.rankingNumber, entry.rank <= 3 && { color: palette.gold }]}>#{entry.rank}</Text>
                  <View>
                    <Text style={styles.rankingName} numberOfLines={1}>{entry.eagoh_name}</Text>
                    <Text style={styles.rankingVendor}>{entry.owner_username || "Anonymous"}</Text>
                  </View>
                </View>
                <View style={styles.rankingCardRight}>
                  <View style={[styles.rankingRankBadge, { borderColor: rkColor + "44", backgroundColor: rkColor + "18" }]}>
                    <Text style={[styles.rankingRankBadgeText, { color: rkColor }]}>{entry.rank_tier}</Text>
                  </View>
                  <View style={styles.rankingMetrics}>
                    <View style={styles.rankingMetric}>
                      <Signal color={palette.success} size={10} />
                      <Text style={styles.rankingMetricText}>{entry.sync_success}</Text>
                    </View>
                    <View style={styles.rankingMetric}>
                      <Star color={palette.gold} size={10} />
                      <Text style={styles.rankingMetricText}>{entry.reputation_score}</Text>
                    </View>
                    <View style={styles.rankingMetric}>
                      <Coins color={palette.gold} size={10} />
                      <Text style={styles.rankingMetricText}>{entry.marketplace_sales}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      );
    }

    return null;
  };

  const renderSponsoredCarousel = useCallback(() => {
    if (tab !== "browse") return null;
    return <MktSponsoredCarousel userId={user?.id ?? null} />;
  }, [tab, user?.id]);

  return (
    <LinearGradient colors={["#03060B", "#08111C", "#0B141F"]} style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <FlatList
          data={[] as any[]}
          renderItem={null}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={() => (<View>{renderListings()}{renderSponsoredCarousel()}</View>)}
          keyExtractor={() => "dummy"}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          {...LIST_PERFORMANCE_PROPS}
        />
      </SafeAreaView>

      {/* Free user upsell */}
      {!isPaid && !loading && (
        <View style={styles.freeUpsell}>
          <LinearGradient colors={["rgba(138,92,255,0.25)", "rgba(10,20,38,0.95)"]} style={StyleSheet.absoluteFill} />
          <Shield color={palette.violet} size={18} />
          <Text style={styles.freeUpsellText}>Upgrade to Pro to buy and sell EAGOH syncs</Text>
        </View>
      )}

      {/* Modals */}
      <PurchaseModal
        visible={!!purchaseModal}
        listing={purchaseModal}
        onClose={() => setPurchaseModal(null)}
        onConfirm={handlePurchaseConfirm}
        purchasing={purchasing}
      />
      <CreateListingModal
        visible={createModal}
        onClose={() => setCreateModal(false)}
        onCreated={loadData}
        creating={creating}
      />
    </LinearGradient>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 130, gap: 16 },

  // Hero
  hero: {
    minHeight: 200,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(54,245,255,0.18)",
    padding: 20,
    justifyContent: "flex-end",
    backgroundColor: palette.panelStrong,
  },
  radarDisc: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: "rgba(54,245,255,0.18)",
    right: -40,
    top: -40,
    backgroundColor: "rgba(54,245,255,0.04)",
  },
  kicker: { color: palette.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2.2, marginBottom: 6 },
  title: { color: palette.text, fontSize: 32, fontWeight: "900", letterSpacing: -0.8, lineHeight: 34 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 8, fontWeight: "700" },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  heroStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "rgba(3,6,11,0.45)",
  },
  heroStatText: { color: palette.text, fontSize: 11, fontWeight: "900" },

  // Vendor Stats
  vendorStatsCard: {
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(138,92,255,0.25)",
    padding: 14,
  },
  vendorStatsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  vendorStatsTitle: { color: palette.text, fontSize: 15, fontWeight: "900", flex: 1 },
  rankBadge: {
    fontSize: 10,
    fontWeight: "900",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: "hidden",
  },
  vendorStatsGrid: { flexDirection: "row", gap: 10 },
  vendorStatItem: { flex: 1, alignItems: "center", gap: 3 },
  vendorStatValue: { color: palette.text, fontSize: 20, fontWeight: "900" },
  vendorStatLabel: { color: palette.muted, fontSize: 10, fontWeight: "800", textAlign: "center" },

  // Active Syncs section
  activeSyncsSection: { gap: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  sectionTitle: { color: palette.text, fontSize: 16, fontWeight: "900" },
  sectionCount: {
    color: palette.cyan,
    fontSize: 12,
    fontWeight: "900",
    backgroundColor: palette.cyanSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },

  // Filters
  filterPanel: {
    gap: 10,
    borderRadius: 5,
    padding: 12,
    backgroundColor: "rgba(14,24,37,0.72)",
    borderWidth: 1,
    borderColor: palette.line,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 42,
    borderRadius: 5,
    paddingHorizontal: 12,
    backgroundColor: "rgba(3,6,11,0.62)",
    borderWidth: 1,
    borderColor: palette.line,
  },
  searchInput: { color: palette.text, flex: 1, fontSize: 13, fontWeight: "800" },
  filterHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterTitle: { color: palette.text, fontSize: 13, fontWeight: "900", letterSpacing: 1, flex: 1 },
  filterLabel: { color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 2 },
  clearFilterBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, backgroundColor: palette.emberSoft },
  clearFilterText: { color: palette.ember, fontSize: 11, fontWeight: "900" },
  chipRail: { gap: 7, paddingRight: 8 },
  chip: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  activeChip: { backgroundColor: palette.cyan, borderColor: palette.cyan },
  chipText: { color: palette.muted, fontSize: 11, fontWeight: "900" },
  activeChipText: { color: palette.void },

  // Tabs
  tabRail: { gap: 8, paddingRight: 8, marginTop: -4 },
  tabChip: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tabChipActive: { backgroundColor: palette.cyan, borderColor: palette.cyan },
  tabChipText: { color: palette.muted, fontSize: 12, fontWeight: "900" },
  tabChipTextActive: { color: palette.void },
  createListingBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: palette.cyan,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: palette.cyanSoft,
  },
  createListingText: { color: palette.cyan, fontSize: 12, fontWeight: "900" },

  // Listing Cards
  listingsWrap: { gap: 12 },
  listingCard: {
    borderRadius: 5,
    padding: 13,
    backgroundColor: "rgba(14,24,37,0.84)",
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
  },
  cardGlow: { position: "absolute", width: 100, height: 100, borderRadius: 50, opacity: 0.10, right: -28, top: -30 },
  listingTop: { flexDirection: "row", gap: 12 },
  listingImageWrap: {
    width: 90,
    height: 110,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.void,
    alignItems: "center",
    justifyContent: "center",
  },
  listingImagePlaceholder: { alignItems: "center", justifyContent: "center", flex: 1 },
  rankPillSmall: {
    position: "absolute",
    bottom: 6,
    left: 6,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  rankPillSmallText: { fontSize: 8, fontWeight: "900" },
  listingInfo: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  listingName: { color: palette.text, fontSize: 17, fontWeight: "900", flex: 1 },
  listingDomain: { color: palette.cyan, fontSize: 12, fontWeight: "800" },
  listingDna: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  dnaTag: {
    backgroundColor: "rgba(138,92,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(138,92,255,0.25)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dnaTagText: { color: palette.violet, fontSize: 10, fontWeight: "900" },
  teamText: { color: palette.gold, fontSize: 11, fontWeight: "900" },
  metricGrid: { gap: 2, marginTop: 2 },
  metricRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metric: { color: palette.text, fontSize: 11, fontWeight: "800" },
  vendorStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: palette.line,
  },
  vendorText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  pricePreview: { color: palette.gold, fontSize: 13, fontWeight: "900", marginTop: 6 },
  buyButton: {
    marginTop: 10,
    minHeight: 40,
    borderRadius: 5,
    backgroundColor: palette.cyan,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  buyButtonDisabled: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: palette.line },
  buyButtonText: { color: palette.void, fontSize: 13, fontWeight: "900" },
  buyButtonTextDisabled: { color: palette.muted },

  // My Listing Card
  myListingCard: {
    borderRadius: 5,
    padding: 12,
    backgroundColor: "rgba(14,24,37,0.84)",
    borderWidth: 1,
    borderColor: palette.line,
  },
  myListingCardInactive: { opacity: 0.55 },
  myListingTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  myListingName: { color: palette.text, fontSize: 16, fontWeight: "900" },
  activeDot: { width: 10, height: 10, borderRadius: 5 },
  activeDotOn: { backgroundColor: palette.success },
  activeDotOff: { backgroundColor: palette.ember },
  myListingPrices: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 8 },
  myListingPriceTag: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  myListingPriceText: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  myListingActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  myListingActionBtn: { borderRadius: 5, paddingHorizontal: 14, paddingVertical: 7 },
  myListingActionBtnOff: { backgroundColor: palette.emberSoft, borderWidth: 1, borderColor: palette.ember },
  myListingActionBtnOn: { backgroundColor: palette.successSoft, borderWidth: 1, borderColor: palette.success },
  myListingActionText: { fontSize: 12, fontWeight: "900", color: palette.success },
  myListingActionTextOff: { color: palette.ember },

  // Active Sync Card
  activeSyncCard: {
    flexDirection: "row",
    borderRadius: 5,
    padding: 10,
    backgroundColor: "rgba(14,24,37,0.76)",
    borderWidth: 1,
    borderColor: palette.line,
    justifyContent: "space-between",
  },
  activeSyncLeft: { flexDirection: "row", gap: 10, flex: 1 },
  activeSyncImage: {
    width: 48,
    height: 58,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.line,
  },
  activeSyncInfo: { flex: 1, justifyContent: "center", gap: 2 },
  activeSyncName: { color: palette.text, fontSize: 14, fontWeight: "900" },
  activeSyncVendor: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  activeSyncLevel: { color: palette.cyan, fontSize: 11, fontWeight: "800" },
  activeSyncRight: { alignItems: "flex-end", justifyContent: "center", gap: 4 },
  activeSyncStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: palette.successSoft,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  activeSyncStatusWarn: { backgroundColor: palette.emberSoft },
  activeSyncStatusText: { color: palette.success, fontSize: 10, fontWeight: "900" },
  activeSyncStatusTextWarn: { color: palette.ember },
  activeSyncTime: { color: palette.text, fontSize: 12, fontWeight: "900" },
  activeSyncTimeWarn: { color: palette.ember },
  activeSyncCost: { color: palette.gold, fontSize: 11, fontWeight: "900" },

  // Empty
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyTitle: { color: palette.text, fontSize: 18, fontWeight: "900" },
  emptyBody: { color: palette.muted, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 19, paddingHorizontal: 20 },
  emptyHint: { color: palette.muted, fontSize: 13, fontWeight: "700", paddingVertical: 8 },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: palette.cyan,
    borderRadius: 5,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 6,
  },
  emptyActionText: { color: palette.void, fontSize: 13, fontWeight: "900" },

  // Loading
  loadingWrap: { alignItems: "center", paddingVertical: 40 },

  // Free upsell
  freeUpsell: {
    position: "absolute",
    bottom: 90,
    left: 16,
    right: 16,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(138,92,255,0.25)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  freeUpsellText: { color: palette.text, fontSize: 13, fontWeight: "800", flex: 1 },

  // ── Modals ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    maxHeight: "85%",
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    overflow: "hidden",
    padding: 18,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.line,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: { color: palette.text, fontSize: 20, fontWeight: "900" },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  modalSectionLabel: { color: palette.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1, marginBottom: 4, marginTop: 12 },
  modalSectionDesc: { color: palette.text, fontSize: 12, fontWeight: "700", marginBottom: 8, lineHeight: 17 },

  // Purchase modal specific
  modalEagohPreview: { flexDirection: "row", gap: 12, marginBottom: 8 },
  modalEagohImage: {
    width: 64,
    height: 78,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.line,
  },
  modalEagohName: { color: palette.text, fontSize: 17, fontWeight: "900" },
  modalEagohDomain: { color: palette.cyan, fontSize: 12, fontWeight: "800" },
  modalVendor: { color: palette.muted, fontSize: 12, fontWeight: "700" },

  syncLevelGrid: { flexDirection: "row", gap: 8 },
  syncLevelChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    padding: 10,
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  syncLevelChipActive: { borderColor: palette.cyan, backgroundColor: palette.cyanSoft },
  syncLevelChipDisabled: { opacity: 0.35 },
  syncLevelText: { color: palette.text, fontSize: 13, fontWeight: "900" },
  syncLevelTextActive: { color: palette.cyan },
  syncLevelTextDisabled: { color: palette.muted },
  syncLevelPrice: { color: palette.gold, fontSize: 10, fontWeight: "900" },
  syncLevelPriceActive: { color: palette.gold },

  daysRow: { flexDirection: "row", gap: 8 },
  dayChip: {
    width: 44,
    height: 38,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  dayChipActive: { borderColor: palette.cyan, backgroundColor: palette.cyanSoft },
  dayChipText: { color: palette.text, fontSize: 15, fontWeight: "900" },
  dayChipTextActive: { color: palette.cyan },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: palette.line,
  },
  totalLabel: { color: palette.muted, fontSize: 13, fontWeight: "800" },
  totalValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  totalValue: { color: palette.gold, fontSize: 22, fontWeight: "900" },
  totalBreakdown: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  confirmButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 5,
    backgroundColor: palette.cyan,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmButtonDisabled: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: palette.line },
  confirmButtonText: { color: palette.void, fontSize: 14, fontWeight: "900" },

  // Create listing specific
  priceGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  priceInputWrap: { flex: 1, minWidth: "45%", gap: 3 },
  priceInputLabel: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  priceInput: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "900",
    backgroundColor: "rgba(3,6,11,0.62)",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  descriptionInput: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(3,6,11,0.62)",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 70,
    textAlignVertical: "top",
  },

  repScoreBadge: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  repScoreText: { fontSize: 10, fontWeight: "900" as const },
  vendorDivider: { width: 1, height: 12, backgroundColor: palette.line },
  vendorRepText: { fontSize: 11, fontWeight: "800" as const },
  myListingRepRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.line },
  myListingRepText: { fontSize: 11, fontWeight: "800" as const },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },

  // Marketplace sponsored banner carousel
  mktBannerCard: {
    width: 200,
    borderRadius: 5,
    padding: 10,
    backgroundColor: "rgba(14,24,37,0.84)",
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
    flexDirection: "column",
    gap: 8,
  },
  mktHotBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 2,
    borderRadius: 5,
    backgroundColor: palette.ember,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mktHotBadgeText: { color: palette.text, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  mktBannerImage: {
    width: "100%",
    height: 100,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.line,
  },
  mktBannerInfo: { gap: 3 },
  mktBannerName: { color: palette.text, fontSize: 14, fontWeight: "900" },
  mktBannerDomain: { color: palette.cyan, fontSize: 11, fontWeight: "800" },
  mktBannerMeta: { flexDirection: "row", gap: 10, marginTop: 2 },
  mktBannerScore: { color: palette.gold, fontSize: 11, fontWeight: "900" },
  mktBannerSync: { color: palette.violet, fontSize: 11, fontWeight: "900" },
  mktBannerRankRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, borderRadius: 5, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3, marginTop: 2 },
  mktBannerRankText: { fontSize: 10, fontWeight: "900" as const },

  // Rankings tab
  rankingCard: {
    borderRadius: 5,
    padding: 12,
    backgroundColor: "rgba(14,24,37,0.84)",
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden" as const,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  rankingCardLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, flex: 1 },
  rankingNumber: { color: palette.text, fontSize: 18, fontWeight: "900" as const, minWidth: 36 },
  rankingName: { color: palette.text, fontSize: 14, fontWeight: "900" as const },
  rankingVendor: { color: palette.muted, fontSize: 11, fontWeight: "700" as const, marginTop: 1 },
  rankingCardRight: { alignItems: "flex-end" as const, gap: 6 },
  rankingRankBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden" as const,
  },
  rankingRankBadgeText: { fontSize: 10, fontWeight: "900" as const },
  rankingMetrics: { flexDirection: "row" as const, gap: 8 },
  rankingMetric: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3 },
  rankingMetricText: { color: palette.text, fontSize: 10, fontWeight: "800" as const },
});
