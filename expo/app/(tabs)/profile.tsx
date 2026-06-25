import { palette } from "@/constants/colors";
import { LIST_PERFORMANCE_PROPS, OptimizedEagohImage } from "@/app/components/PerformancePrimitives";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Activity, Award, BadgeCheck, BarChart3, BrainCircuit, Cpu, Crown, FlaskConical, Gauge, Layers3, Lock, LogOut, Radar, RefreshCcw, Shield, Sparkles, Swords, TrendingUp, Trophy, Wrench, WalletCards, Zap } from "lucide-react-native";
import { INTELLIGENCE_DOMAINS } from "@/services/domains";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useEagohs } from "@/providers/EagohProvider";
import type { EagohRecord } from "@/services/eagohs";
import type { SubscriptionTier } from "@/services/profile";
import {
  getEagohReputationDisplay,
  computeRank,
  rankColor as repRankColor,
  RANK_TIERS,
  BADGE_DEFINITIONS,
  type EagohReputationDisplay,
  type RankTier,
} from "@/services/reputation";
import { getUserRankings, type LeaderboardEntry } from "@/services/leaderboards";

type LabTone = "cyan" | "gold" | "violet" | "ember" | "success";
type LabEnvironment = {
  id: string;
  name: string;
  theme: string;
  cost: number;
  premium: boolean;
  tone: LabTone;
  grid: string;
};
type ProfileSection = { id: string; kind: "hero" | "stats" | "identity" | "features" | "wallet" | "subscriptions" | "edge" | "labs" | "testMode" };
type MultiplierTier = { name: string; value: string; detail: string; active: boolean; tone: LabTone };
type UsageMetric = { label: string; value: string; detail: string; progress: number; tone: LabTone };
type SubscriptionPlan = {
  name: string;
  label: string;
  edge: string;
  eagohLimit: string;
  teamLimit: string;
  efficiency: string;
  marketplace: string;
  labs: string;
  sync: string;
  tone: LabTone;
  featured: boolean;
};
type Stat = { label: string; value: string; detail: string; tone: LabTone };

const sections: ProfileSection[] = [
  ...(__DEV__ ? [{ id: "testMode", kind: "testMode" as const }] : []),
  { id: "hero", kind: "hero" },
  { id: "stats", kind: "stats" },
  { id: "features", kind: "features" },
  { id: "identity", kind: "identity" },
  { id: "wallet", kind: "wallet" },
  { id: "subscriptions", kind: "subscriptions" },
  { id: "edge", kind: "edge" },
  { id: "labs", kind: "labs" },
];

const labs: LabEnvironment[] = [
  { id: "dormant", name: "Dormant Lab", theme: "Free inactive containment bay", cost: 0, premium: false, tone: "cyan", grid: "LOW POWER" },
  { id: "war", name: "Tactical War Room", theme: "Command walls, threat glass, battle telemetry", cost: 25, premium: true, tone: "ember", grid: "TACTICAL" },
  { id: "neon", name: "Neon Analytics Chamber", theme: "Live signal panels and cyan market lasers", cost: 25, premium: true, tone: "cyan", grid: "ANALYTICS" },
  { id: "syndicate", name: "Syndicate Command Center", theme: "Obsidian decks with encrypted faction relays", cost: 25, premium: true, tone: "violet", grid: "COMMAND" },
  { id: "fight", name: "Underground Fight Lab", theme: "Concrete pit, red scanners, impact monitors", cost: 25, premium: true, tone: "ember", grid: "COMBAT" },
  { id: "cathedral", name: "AI Data Cathedral", theme: "Vertical data columns and sacred machine light", cost: 25, premium: true, tone: "gold", grid: "ORACLE" },
  { id: "penthouse", name: "Luxury Penthouse Lab", theme: "Skyline glass, elite vault lighting, premium calm", cost: 25, premium: true, tone: "gold", grid: "LUX" },
  { id: "cryo", name: "Cryo Scout Vault", theme: "Frosted bay with blue biometric vapor", cost: 25, premium: true, tone: "cyan", grid: "CRYO" },
  { id: "forge", name: "Blacksite Forge", theme: "Industrial rails and molten Edge diagnostics", cost: 25, premium: true, tone: "ember", grid: "FORGE" },
  { id: "halo", name: "Halo Strategy Deck", theme: "Circular holo-table with team prediction rings", cost: 25, premium: true, tone: "success", grid: "SYNC" },
  { id: "void", name: "Void Mirror Lab", theme: "Dark reflective chamber and identity doubles", cost: 25, premium: true, tone: "violet", grid: "MIRROR" },
];



const dna = ["Predictive Vision", "Pressure Mapping", "Fanatic Memory", "Market Instinct"];
const teams = ["Metro Ultras", "Austin Fanatics", "North End Loyal"];
const labGridLines = [0, 1, 2, 3, 4, 5, 6];
const edgeActivity = ["+420 Edge from faction validation", "25 Edge reserved for lab preview", "+88 Edge observation streak", "Mock chamber upgrade viewed"];
const walletUsage: UsageMetric[] = [
  { label: "Analyst Sessions", value: "1,840", detail: "42% of monthly flow", progress: 0.42, tone: "cyan" },
  { label: "Marketplace Sync", value: "980", detail: "22% reserved for vendors", progress: 0.22, tone: "violet" },
  { label: "Lab Cosmetics", value: "725", detail: "16% profile chambers", progress: 0.16, tone: "gold" },
  { label: "Faction Boosts", value: "540", detail: "12% alliance influence", progress: 0.12, tone: "success" },
];
const multipliers: MultiplierTier[] = [
  { name: "Pro", value: "1.0x", detail: "Baseline Edge velocity", active: false, tone: "cyan" },
  { name: "Oracle Elite", value: "1.2x", detail: "Current mock tier", active: true, tone: "gold" },
  { name: "Syndicate", value: "1.5x", detail: "Elite faction economy", active: false, tone: "violet" },
];
const subscriptionPlans: SubscriptionPlan[] = [
  { name: "Free", label: "Dormant access", edge: "0", eagohLimit: "1 dormant EAGOH", teamLimit: "No Fanatic Team binding", efficiency: "—", marketplace: "Browse-only marketplace", labs: "Dormant lab preview", sync: "Manual Quick Check previews", tone: "cyan", featured: false },
  { name: "Pro", label: "Active analyst", edge: "600", eagohLimit: "2 EAGOHs", teamLimit: "1 Fanatic Team per EAGOH", efficiency: "1.0x", marketplace: "Standard vendor visibility", labs: "Core labs unlocked", sync: "25% and 50% sync access", tone: "cyan", featured: false },
  { name: "Oracle Elite", label: "Premium prediction layer", edge: "1,400", eagohLimit: "3 EAGOHs", teamLimit: "2 Fanatic Teams per EAGOH", efficiency: "1.2x", marketplace: "Boosted vendor confidence reads", labs: "Advanced Oracle lab access", sync: "25% · 50% · 75% sync access", tone: "gold", featured: true },
  { name: "Syndicate", label: "Faction command tier", edge: "3,700", eagohLimit: "5 EAGOHs", teamLimit: "3 Fanatic Teams per EAGOH", efficiency: "1.5x", marketplace: "Priority exchange positioning", labs: "Syndicate labs and elite chambers", sync: "Full 25% to 100% sync access", tone: "violet", featured: false },
];

function toneColor(tone: LabTone): string {
  if (tone === "gold") return palette.gold;
  if (tone === "violet") return palette.violet;
  if (tone === "ember") return palette.ember;
  if (tone === "success") return palette.success;
  return palette.cyan;
}

const RepMetric = memo(function RepMetric({ label, value, max, tone }: { label: string; value: number; max: number; tone: LabTone }): JSX.Element {
  const accent = toneColor(tone);
  const pct = Math.min(1, value / (max || 1));
  return (
    <View style={styles.repMetricCard}>
      <View style={styles.repMetricHeader}>
        <Text style={styles.repMetricLabel}>{label}</Text>
        <Text style={[styles.repMetricValue, { color: accent }]}>{value}</Text>
      </View>
      <View style={styles.repProgressTrack}>
        <View style={[styles.repProgressFill, { width: `${pct * 100}%`, backgroundColor: accent }]} />
      </View>
    </View>
  );
});

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }): JSX.Element {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function ProfileChamber({ lab, eagoh }: { lab: LabEnvironment; eagoh?: EagohRecord }): JSX.Element {
  const accent = toneColor(lab.tone);
  const eagohName = eagoh?.name ?? "No EAGOH";
  const renderUri = eagoh?.image_url ?? eagoh?.image_thumb_url ?? null;
  return (
    <View style={styles.chamber}>
      <LinearGradient colors={[`${accent}33`, "rgba(10,18,30,0.88)", "rgba(3,6,11,0.98)"]} style={StyleSheet.absoluteFill} />
      <View style={[styles.backHalo, { borderColor: `${accent}55` }]} />
      <View style={[styles.floorEllipse, { borderColor: `${accent}66`, backgroundColor: `${accent}12` }]} />
      <View style={styles.labGrid}>{labGridLines.map((index) => <View key={index} style={[styles.gridLine, { backgroundColor: `${accent}18`, left: `${index * 16}%` }]} />)}</View>
      <View style={styles.scanPanelLeft}><Text style={[styles.scanText, { color: accent }]}>{lab.grid}</Text></View>
      <View style={styles.scanPanelRight}><Radar color={accent} size={20} /><Text style={styles.scanSub}>LIVE MOCK</Text></View>
      <View style={styles.eagohBody}>
        {renderUri ? (
          <View style={[styles.chamberRender, { borderColor: `${accent}66`, shadowColor: accent }]}>
            <Image source={{ uri: renderUri }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={160} recyclingKey={eagoh?.id ?? eagohName} />
            <LinearGradient colors={["transparent", "rgba(3,6,11,0.42)"]} style={StyleSheet.absoluteFill} />
          </View>
        ) : (
          <OptimizedEagohImage tone={lab.tone} label={eagohName.slice(0, 8).toUpperCase()} size="profile" highResolution />
        )}
        <Text style={[styles.chamberEagohName, { color: accent }]} numberOfLines={1}>{eagohName}</Text>
      </View>
      <View style={styles.chamberFooter}>
        <Text style={styles.chamberName}>{lab.name}</Text>
        <Text style={styles.chamberTheme}>{lab.theme}</Text>
      </View>
    </View>
  );
}

const StatCard = memo(function StatCard({ item }: { item: Stat }): JSX.Element {
  const accent = toneColor(item.tone);
  return (
    <View style={styles.statCard}>
      <View style={[styles.statDot, { backgroundColor: accent }]} />
      <Text style={styles.statValue}>{item.value}</Text>
      <Text style={styles.statLabel}>{item.label}</Text>
      <Text style={styles.statDetail}>{item.detail}</Text>
    </View>
  );
});

const UsageCard = memo(function UsageCard({ item }: { item: UsageMetric }): JSX.Element {
  const accent = toneColor(item.tone);
  return (
    <View style={styles.usageCard}>
      <View style={styles.usageHeader}><Text style={styles.usageLabel}>{item.label}</Text><Text style={[styles.usageValue, { color: accent }]}>{item.value}</Text></View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${item.progress * 100}%`, backgroundColor: accent }]} /></View>
      <Text style={styles.usageDetail}>{item.detail}</Text>
    </View>
  );
});

const SubscriptionCard = memo(function SubscriptionCard({ item }: { item: SubscriptionPlan }): JSX.Element {
  const accent = toneColor(item.tone);
  return (
    <View style={[styles.subscriptionCard, item.featured && { borderColor: "rgba(255,184,77,0.55)", backgroundColor: "rgba(255,184,77,0.12)" }]}>
      <LinearGradient colors={[`${accent}20`, "rgba(3,6,11,0.24)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.planHeader}>
        <View style={[styles.planIcon, { borderColor: `${accent}66`, backgroundColor: `${accent}16` }]}>{item.name === "Free" ? <Lock color={accent} size={18} /> : <Crown color={accent} size={18} />}</View>
        <View style={styles.planTitleBlock}><Text style={styles.planName}>{item.name}</Text><Text style={styles.planLabel}>{item.label}</Text></View>
        {item.featured ? <View style={styles.featuredPill}><Sparkles color={palette.gold} size={12} /><Text style={styles.featuredText}>ACTIVE MOCK</Text></View> : null}
      </View>
      <View style={styles.edgeAmountRow}><Text style={[styles.edgeAmount, { color: accent }]}>{item.edge}</Text><Text style={styles.edgeAmountLabel}>Edge / month</Text></View>
      <View style={styles.planMetricGrid}>
        <View style={styles.planMetric}><Text style={styles.planMetricValue}>{item.efficiency}</Text><Text style={styles.planMetricLabel}>Efficiency</Text></View>
        <View style={styles.planMetric}><Text style={styles.planMetricValue}>{item.eagohLimit}</Text><Text style={styles.planMetricLabel}>EAGOH limit</Text></View>
      </View>
      <View style={styles.planRows}>
        <Text style={styles.planRow}>Fanatic Teams: {item.teamLimit}</Text>
        <Text style={styles.planRow}>Marketplace: {item.marketplace}</Text>
        <Text style={styles.planRow}>Labs: {item.labs}</Text>
        <Text style={styles.planRow}>Sync: {item.sync}</Text>
      </View>
    </View>
  );
});

const LabCard = memo(function LabCard({ item, selected, onPress }: { item: LabEnvironment; selected: boolean; onPress: (id: string) => void }): JSX.Element {
  const accent = toneColor(item.tone);
  const handlePress = useCallback((): void => onPress(item.id), [item.id, onPress]);
  return (
    <Pressable onPress={handlePress} style={[styles.labCard, selected && { borderColor: accent, backgroundColor: `${accent}14` }]}>
      <View style={[styles.labThumb, { borderColor: `${accent}66` }]}>
        <LinearGradient colors={[`${accent}44`, "rgba(255,255,255,0.04)", "rgba(3,6,11,0.9)"]} style={StyleSheet.absoluteFill} />
        <Layers3 color={accent} size={22} />
      </View>
      <View style={styles.labInfo}>
        <Text style={styles.labName}>{item.name}</Text>
        <Text style={styles.labTheme} numberOfLines={2}>{item.theme}</Text>
        <View style={styles.labMetaRow}>{item.premium ? <Lock color={palette.gold} size={13} /> : <BadgeCheck color={palette.success} size={13} />}<Text style={[styles.labCost, { color: item.premium ? palette.gold : palette.success }]}>{item.premium ? `${item.cost} Edge` : "Free"}</Text></View>
      </View>
      {selected ? <Text style={[styles.selectedText, { color: accent }]}>ACTIVE</Text> : null}
    </Pressable>
  );
});

export default function ProfileScreen(): JSX.Element {
  const { user, signOut, signOutState } = useAuth();
  const { eagohs } = useEagohs();
  const { profile, setTestTier, setSubscriptionTier } = useProfile();
  const router = useRouter();
  const handleSignOut = useCallback((): void => {
    Haptics.selectionAsync().catch(() => undefined);
    signOut().catch((e) => console.warn("[auth] signOut failed", e));
  }, [signOut]);
  const displayAlias = (user?.user_metadata as { username?: string } | undefined)?.username ?? user?.email ?? "EAGOH operator";
  const [selectedLabId, setSelectedLabId] = useState<string>("neon");
  const selectedLab = useMemo<LabEnvironment>(() => labs.find((lab) => lab.id === selectedLabId) ?? labs[0], [selectedLabId]);

  // ── Reputation for primary EAGOH ────────────────────────────────────
  const [reputation, setReputation] = useState<EagohReputationDisplay | null>(null);
  const [userRankings, setUserRankings] = useState<{ eagohEntries: LeaderboardEntry[]; bestCategory: string; rankChanges: any[] } | null>(null);
  const primaryEagoh = (eagohs ?? [])[0];
  useEffect(() => {
    if (!primaryEagoh?.id || !user?.id) return;
    getEagohReputationDisplay(primaryEagoh.id, user.id)
      .then(setReputation)
      .catch(() => undefined);
  }, [primaryEagoh?.id, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    getUserRankings(user.id)
      .then(setUserRankings)
      .catch(() => undefined);
  }, [user?.id]);

  const reputationStats: Stat[] = useMemo<Stat[]>(() => {
    if (!reputation) {
      return [
        { label: "Rank", value: "—", detail: "No EAGOH active", tone: "cyan" },
        { label: "Reputation", value: "—", detail: "Forge an EAGOH first", tone: "gold" },
        { label: "Quality", value: "—", detail: "intelligence score", tone: "violet" },
        { label: "Trust", value: "—", detail: "marketplace", tone: "success" },
      ];
    }
    return [
      { label: "Rank", value: reputation.rank, detail: `${reputation.reputationScore}/100`, tone: "gold" },
      { label: "Reputation", value: `${reputation.reputationScore}`, detail: "total score", tone: "gold" },
      { label: "Quality", value: `${reputation.intelligenceQuality}`, detail: `${reputation.totalObservations} obs`, tone: "cyan" },
      { label: "Trust", value: `${reputation.marketplaceTrust}`, detail: `${reputation.marketplaceSales} sales`, tone: "success" },
    ];
  }, [reputation]);

  const currentTier = profile?.subscription_tier ?? "free";
  const handleSetTestTier = useCallback((tier: SubscriptionTier): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setTestTier(tier).catch((err: unknown) => console.warn("[testMode] setTestTier failed", err));
  }, [setTestTier]);
  const handleLabPress = useCallback((id: string): void => {
    setSelectedLabId(id);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const renderSection = useCallback(({ item }: { item: ProfileSection }): JSX.Element => {
    if (item.kind === "hero") {
      return (
        <View>
          <View style={styles.topline}><View><Text style={styles.kicker}>PROFILE CHAMBER</Text><Text style={styles.title} numberOfLines={1}>{displayAlias}</Text></View><View style={[styles.rankPill, reputation ? { borderColor: `${repRankColor(reputation.rank)}66`, backgroundColor: `${repRankColor(reputation.rank)}22` } : undefined]}><Crown color={reputation ? repRankColor(reputation.rank) : palette.gold} size={16} /><Text style={[styles.rankText, reputation ? { color: repRankColor(reputation.rank) } : undefined]}>{reputation?.rank ?? "No Rank"}</Text></View></View>
          <ProfileChamber lab={selectedLab} eagoh={primaryEagoh} />
          <Pressable onPress={handleSignOut} disabled={signOutState.isPending} style={({ pressed }) => [styles.signOutButton, pressed && { opacity: 0.85 }]}>
            {signOutState.isPending ? <ActivityIndicator color={palette.ember} /> : <LogOut color={palette.ember} size={16} />}
            <Text style={styles.signOutText}>{signOutState.isPending ? "Signing out…" : "Sign out"}</Text>
          </Pressable>
        </View>
      );
    }
    if (item.kind === "stats") {
      return (
        <View>
          <View style={styles.statGrid}>{reputationStats.map((stat) => <StatCard key={stat.label} item={stat} />)}</View>
          {/* Domain breakdown */}
          {eagohs.length > 0 && (
            <View style={styles.domainPanel}>
              <SectionTitle eyebrow="DOMAIN SPECIALIZATION" title="My Intelligence Domains" />
              <View style={styles.domainGrid}>
                {(() => {
                  const domainCounts = new Map<string, number>();
                  const domainMap = new Map<string, typeof INTELLIGENCE_DOMAINS[number]>();
                  eagohs.forEach((e) => {
                    const d = e.domain ?? "unknown";
                    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
                    if (!domainMap.has(d)) {
                      const info = INTELLIGENCE_DOMAINS.find((di) => di.id === d);
                      if (info) domainMap.set(d, info);
                    }
                  });
                  return Array.from(domainCounts.entries()).map(([domainId, count]) => {
                    const info = domainMap.get(domainId);
                    const color = info?.color ?? palette.muted;
                    return (
                      <View key={domainId} style={[styles.domainChip, { borderColor: `${color}44`, backgroundColor: `${color}16` }]}>
                        <View style={[styles.domainDot, { backgroundColor: color }]} />
                        <Text style={[styles.domainChipLabel, { color }]}>{info?.label ?? domainId}</Text>
                        <Text style={styles.domainChipCount}>{count} EAGOH{count > 1 ? "s" : ""}</Text>
                      </View>
                    );
                  });
                })()}
              </View>
            </View>
          )}
          {/* Expanded reputation breakdown */}
          {reputation && (
            <View style={styles.reputationPanel}>
              <SectionTitle eyebrow="REPUTATION BREAKDOWN" title="EAGOH Rank & Trust" />
              <View style={styles.repGrid}>
                <RepMetric label="Intelligence Quality" value={reputation.intelligenceQuality} max={25} tone="cyan" />
                <RepMetric label="Marketplace Trust" value={reputation.marketplaceTrust} max={20} tone="violet" />
                <RepMetric label="Faction Influence" value={reputation.factionInfluence} max={20} tone="gold" />
                <RepMetric label="Sync Success" value={reputation.syncSuccess} max={100} tone="success" />
                <RepMetric label="Activity Level" value={reputation.activityLevel} max={10} tone="cyan" />
                <RepMetric label="Fanatic Strength" value={reputation.fanaticTeamStrength} max={10} tone="ember" />
              </View>
              {/* Rank progression bar */}
              <View style={styles.rankProgression}>
                <Text style={styles.repDetailLabel}>Rank Progression</Text>
                <View style={styles.rankBarTrack}>
                  {RANK_TIERS.map((tier) => {
                    const threshold = { Dormant: 0, Activated: 1, Bronze: 15, Silver: 30, Gold: 45, Platinum: 60, Diamond: 75, Oracle: 88, "Syndicate Prime": 96 }[tier];
                    const achieved = reputation.reputationScore >= threshold;
                    return (
                      <View key={tier} style={[styles.rankBarStep, achieved && { backgroundColor: repRankColor(tier) }]}>
                        <View style={[styles.rankBarStepDot, achieved && { backgroundColor: repRankColor(tier), borderColor: repRankColor(tier) }]} />
                      </View>
                    );
                  })}
                </View>
              </View>
              {/* ── My Rankings ─────────────────────────────────────── */}
              {userRankings && userRankings.eagohEntries.length > 0 && (
                <View style={styles.rankingsSection}>
                  <Text style={styles.repDetailLabel}>My Leaderboard Rankings</Text>
                  <View style={styles.rankingsList}>
                    {userRankings.eagohEntries.slice(0, 3).map((entry) => (
                      <View key={entry.eagoh_id} style={styles.rankingMiniCard}>
                        <View style={styles.rankingMiniLeft}>
                          <Text style={styles.rankingMiniRank}>#{entry.rank}</Text>
                          <Text style={styles.rankingMiniName} numberOfLines={1}>{entry.eagoh_name}</Text>
                          <View style={[styles.rankingMiniBadge, { borderColor: `${repRankColor(entry.rank_tier)}44`, backgroundColor: `${repRankColor(entry.rank_tier)}18` }]}>
                            <Text style={[styles.rankingMiniBadgeText, { color: repRankColor(entry.rank_tier) }]}>{entry.rank_tier}</Text>
                          </View>
                        </View>
                        <Text style={[styles.rankingMiniScore, { color: repRankColor(entry.rank_tier) }]}>{entry.reputation_score}</Text>
                      </View>
                    ))}
                  </View>
                  {userRankings.bestCategory && (
                    <View style={styles.bestCategoryRow}>
                      <Trophy color={palette.gold} size={13} />
                      <Text style={styles.bestCategoryText}>Strongest: {userRankings.bestCategory.replace(/_/g, " ")}</Text>
                    </View>
                  )}
                  {/* Rank changes */}
                  {userRankings.rankChanges.length > 0 && (
                    <View style={styles.rankChangesSection}>
                      <Text style={styles.repDetailLabel}>Recent Rank Changes</Text>
                      {userRankings.rankChanges.slice(0, 3).map((change: any, i: number) => (
                        <View key={i} style={styles.rankChangeRow}>
                          <TrendingUp color={change.new_rank && change.previous_rank && change.new_rank !== change.previous_rank ? palette.success : palette.muted} size={14} />
                          <Text style={styles.rankChangeText}>
                            {change.previous_rank ?? "None"} → {change.new_rank}
                          </Text>
                          <Text style={styles.rankChangeDate}>{new Date(change.created_at).toLocaleDateString()}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Badges */}
              {reputation.badges.length > 0 && (
                <View style={styles.badgesSection}>
                  <Text style={styles.repDetailLabel}>Earned Badges</Text>
                  <View style={styles.badgesGrid}>
                    {reputation.badges.map((badge) => (
                      <View key={badge.id} style={styles.badgeCard}>
                        <Award color={palette.gold} size={18} />
                        <View style={styles.badgeInfo}>
                          <Text style={styles.badgeName}>{badge.badge_name}</Text>
                          <Text style={styles.badgeDesc} numberOfLines={2}>{badge.badge_description}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      );
    }
    if (item.kind === "features") {
      const handleLabsPress = (): void => {
        Haptics.selectionAsync().catch(() => undefined);
        router.push("/labs" as never);
      };
      const handleFactionsPress = (): void => {
        Haptics.selectionAsync().catch(() => undefined);
        router.push("/factions" as never);
      };
      const handleOpenIntelPress = (): void => {
        Haptics.selectionAsync().catch(() => undefined);
        router.push("/open-intelligence" as never);
      };
      const handleLeaderboardsPress = (): void => {
        Haptics.selectionAsync().catch(() => undefined);
        router.push("/leaderboards" as never);
      };
      return (
        <View style={styles.panel}>
          <SectionTitle eyebrow="FEATURES" title="Labs, Factions & Intelligence" />
          <Pressable onPress={handleLabsPress} style={({ pressed }) => [styles.featureCard, pressed && { opacity: 0.8 }]}>
            <View style={[styles.featureIconWrap, { borderColor: "rgba(108,230,255,0.4)" }]}>
              <FlaskConical color={palette.cyan} size={20} />
            </View>
            <View style={styles.featureInfo}>
              <Text style={styles.featureTitle}>EAGOH Forge & Labs</Text>
              <Text style={styles.featureDesc}>Create EAGOHs with brain-in-glass-dome, full-body cybernetic chassis, domain intelligence tuning, and open intelligence observation feeds.</Text>
            </View>
          </Pressable>
          <Pressable onPress={handleOpenIntelPress} style={({ pressed }) => [styles.featureCard, pressed && { opacity: 0.8 }]}>
            <View style={[styles.featureIconWrap, { borderColor: "rgba(255,181,71,0.4)" }]}>
              <BrainCircuit color={palette.gold} size={20} />
            </View>
            <View style={styles.featureInfo}>
              <Text style={styles.featureTitle}>Open Intelligence</Text>
              <Text style={styles.featureDesc}>Feed observations into your EAGOHs. Select domain, entry depth, tag signals, and confidence levels. Quality-scored and Edge-gated.</Text>
            </View>
          </Pressable>
          <Pressable onPress={handleFactionsPress} style={({ pressed }) => [styles.featureCard, pressed && { opacity: 0.8 }]}>
            <View style={[styles.featureIconWrap, { borderColor: "rgba(138,92,255,0.4)" }]}>
              <Shield color={palette.violet} size={20} />
            </View>
            <View style={styles.featureInfo}>
              <Text style={styles.featureTitle}>Faction Network</Text>
              <Text style={styles.featureDesc}>Align with intelligence syndicates, pool observations, earn reputation badges, and climb the faction influence ladder.</Text>
            </View>
          </Pressable>
          <Pressable onPress={handleLeaderboardsPress} style={({ pressed }) => [styles.featureCard, pressed && { opacity: 0.8 }]}>
            <View style={[styles.featureIconWrap, { borderColor: "rgba(255,215,0,0.4)" }]}>
              <Trophy color={palette.gold} size={20} />
            </View>
            <View style={styles.featureInfo}>
              <Text style={styles.featureTitle}>My Rankings</Text>
              <Text style={styles.featureDesc}>Track your EAGOH leaderboard positions, reputation growth, and earned badges across all leaderboard categories.</Text>
            </View>
          </Pressable>
        </View>
      );
    }
    if (item.kind === "identity") {
      return (
        <View style={styles.panel}>
          <SectionTitle eyebrow="IDENTITY MATRIX" title="DNA, teams, and faction alignment" />
          <View style={styles.chipWrap}>{dna.map((label) => <View key={label} style={styles.chip}><Sparkles color={palette.cyan} size={13} /><Text style={styles.chipText}>{label}</Text></View>)}</View>
          <View style={styles.divider} />
          <Text style={styles.miniLabel}>Fanatic Teams</Text>
          <View style={styles.chipWrap}>{teams.map((label) => <View key={label} style={[styles.chip, styles.teamChip]}><Shield color={palette.gold} size={13} /><Text style={styles.chipText}>{label}</Text></View>)}</View>
          <View style={styles.alignment}><Swords color={palette.ember} size={18} /><View><Text style={styles.alignmentTitle}>Faction Alignment</Text><Text style={styles.alignmentBody}>Obsidian Syndicate · strategic intelligence wing</Text></View></View>
        </View>
      );
    }
    if (item.kind === "wallet") {
      return (
        <View style={styles.walletPanel}>
          <LinearGradient colors={["rgba(255,184,77,0.22)", "rgba(54,245,255,0.08)", "rgba(10,18,30,0.84)"]} style={StyleSheet.absoluteFill} />
          <SectionTitle eyebrow="EDGE WALLET" title="Mock economy command vault" />
          <View style={styles.walletHero}>
            <View><Text style={styles.walletLabel}>Available Edge</Text><Text style={styles.walletTotal}>12,480</Text><Text style={styles.edgeHint}>No real payments · no live deductions</Text></View>
            <View style={styles.walletOrb}><WalletCards color={palette.gold} size={30} /><Text style={styles.walletOrbText}>EDGE</Text></View>
          </View>
          <View style={styles.balanceGrid}>
            <View style={styles.balanceCard}><Zap color={palette.cyan} size={18} /><Text style={styles.balanceValue}>8,250</Text><Text style={styles.balanceLabel}>Subscription Edge</Text><Text style={styles.balanceRule}>10% rollover max if 10% retained</Text></View>
            <View style={styles.balanceCard}><BadgeCheck color={palette.success} size={18} /><Text style={styles.balanceValue}>4,230</Text><Text style={styles.balanceLabel}>Purchased Edge</Text><Text style={styles.balanceRule}>Permanent rollover · never expires</Text></View>
          </View>
          <View style={styles.rolloverBox}>
            <View style={styles.rolloverTop}><RefreshCcw color={palette.gold} size={18} /><Text style={styles.rolloverTitle}>Monthly rollover progress</Text><Text style={styles.rolloverPct}>7.8%</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: "78%", backgroundColor: palette.gold }]} /></View>
            <Text style={styles.rolloverBody}>Eligible for subscription rollover because mock retained balance is above 10%. Cap locks at 10%.</Text>
          </View>
          <View style={styles.multiplierRow}>{multipliers.map((tier) => <View key={tier.name} style={[styles.multiplierCard, tier.active && styles.multiplierActive]}><Gauge color={toneColor(tier.tone)} size={16} /><Text style={styles.multiplierName}>{tier.name}</Text><Text style={[styles.multiplierValue, { color: toneColor(tier.tone) }]}>{tier.value}</Text><Text style={styles.multiplierDetail}>{tier.detail}</Text></View>)}</View>
          <View style={styles.analyticsHeader}><BarChart3 color={palette.cyan} size={18} /><Text style={styles.analyticsTitle}>Edge usage analytics</Text></View>
          {walletUsage.map((metric) => <UsageCard key={metric.label} item={metric} />)}
        </View>
      );
    }
    if (item.kind === "subscriptions") {
      return (
        <View style={styles.subscriptionPanel}>
          <LinearGradient colors={["rgba(124,92,255,0.18)", "rgba(54,245,255,0.06)", "rgba(10,18,30,0.88)"]} style={StyleSheet.absoluteFill} />
          <SectionTitle eyebrow="SUBSCRIPTION MATRIX" title="Choose your intelligence tier" />
          <Text style={styles.panelBody}>Mock-only plan comparison for Edge flow, EAGOH capacity, Fanatic Team bindings, marketplace access, labs, and synchronization depth.</Text>
          {subscriptionPlans.map((plan) => <SubscriptionCard key={plan.name} item={plan} />)}
        </View>
      );
    }
    if (item.kind === "edge") {
      return (
        <View style={styles.panel}>
          <SectionTitle eyebrow="EDGE ACTIVITY" title="Recent mock economy signals" />
          <View style={styles.edgeBalance}><TrendingUp color={palette.gold} size={22} /><View><Text style={styles.edgeValue}>Oracle Elite · 1.2x active</Text><Text style={styles.edgeHint}>Preview-only wallet states and economy rules</Text></View></View>
          {edgeActivity.map((activity) => <View key={activity} style={styles.activityRow}><Activity color={palette.success} size={15} /><Text style={styles.activityText}>{activity}</Text></View>)}
        </View>
      );
    }
    if (item.kind === "testMode") {
      const tiers: { tier: SubscriptionTier; label: string; edge: number; tone: LabTone }[] = [
        { tier: "free", label: "Free", edge: 0, tone: "cyan" },
        { tier: "pro", label: "Pro", edge: 600, tone: "cyan" },
        { tier: "oracle_elite", label: "Oracle Elite", edge: 1400, tone: "gold" },
        { tier: "syndicate", label: "Syndicate", edge: 3700, tone: "violet" },
      ];
      return (
        <View style={styles.testPanel}>
          <LinearGradient colors={["rgba(255,107,53,0.14)", "rgba(10,18,30,0.90)", "rgba(3,6,11,0.98)"]} style={StyleSheet.absoluteFill} />
          <View style={styles.testBanner}>
            <Wrench color={palette.gold} size={16} />
            <Text style={styles.testBannerText}>Subscription Test Mode</Text>
          </View>
          <Text style={styles.testHint}>RevenueCat not connected</Text>
          <View style={styles.testButtonGrid}>
            {tiers.map((t) => {
              const isActive = currentTier === t.tier;
              const accent = toneColor(t.tone);
              const handlePress = (): void => handleSetTestTier(t.tier);
              return (
                <Pressable
                  key={t.tier}
                  onPress={handlePress}
                  style={({ pressed }) => [
                    styles.testButton,
                    { borderColor: isActive ? accent : palette.line },
                    isActive && { backgroundColor: `${accent}18` },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[styles.testButtonLabel, { color: accent }]}>{t.label}</Text>
                  <Text style={styles.testButtonEdge}>{t.edge} Edge</Text>
                  {isActive && <View style={[styles.testActiveDot, { backgroundColor: accent }]} />}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.testCurrentLabel}>
            Current: <Text style={{ fontWeight: "900", color: palette.text }}>{currentTier.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</Text>
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.panel}>
        <SectionTitle eyebrow="LAB ENVIRONMENTS" title="Choose the profile headquarters" />
        <Text style={styles.panelBody}>One dormant lab is free. Ten premium environments display a mock 25 Edge cost and use optimized layered backgrounds instead of live 3D.</Text>
        <FlatList data={labs} keyExtractor={(lab) => lab.id} renderItem={({ item: lab }) => <LabCard item={lab} selected={lab.id === selectedLabId} onPress={handleLabPress} />} scrollEnabled={false} {...LIST_PERFORMANCE_PROPS} />
      </View>
    );
  }, [handleLabPress, selectedLab, selectedLabId, reputationStats, reputation, currentTier, handleSetTestTier]);

  return (
    <LinearGradient colors={["#020409", "#07111D", "#03060B"]} style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <FlatList data={sections} keyExtractor={(item) => item.id} renderItem={renderSection} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} {...LIST_PERFORMANCE_PROPS} />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 18, paddingBottom: 120, gap: 16 },
  topline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  kicker: { color: palette.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2.2 },
  title: { color: palette.text, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 4 },
  rankPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 5, borderWidth: 1, borderColor: "rgba(255,184,77,0.38)", backgroundColor: palette.goldSoft },
  rankText: { color: palette.gold, fontWeight: "900", fontSize: 12 },
  chamber: { height: 500, overflow: "hidden", borderRadius: 5, borderWidth: 1, borderColor: "rgba(54,245,255,0.24)", marginTop: 18, backgroundColor: palette.obsidian },
  backHalo: { position: "absolute", top: 54, alignSelf: "center", width: 260, height: 260, borderRadius: 130, borderWidth: 1, opacity: 0.8 },
  floorEllipse: { position: "absolute", bottom: 78, alignSelf: "center", width: 270, height: 68, borderRadius: 5, borderWidth: 1 },
  labGrid: { ...StyleSheet.absoluteFillObject, opacity: 0.8 },
  gridLine: { position: "absolute", top: 0, bottom: 0, width: 1 },
  scanPanelLeft: { position: "absolute", top: 22, left: 18, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 5, backgroundColor: "rgba(3,6,11,0.58)", borderWidth: 1, borderColor: palette.line },
  scanText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  scanPanelRight: { position: "absolute", top: 20, right: 16, alignItems: "center", gap: 4 },
  scanSub: { color: palette.muted, fontSize: 9, fontWeight: "800" },
  eagohBody: { position: "absolute", top: 56, alignSelf: "center", alignItems: "center", width: 280, height: 495 },
  chamberRender: { width: 270, height: 405, borderRadius: 5, borderWidth: 1, overflow: "hidden", backgroundColor: "transparent", shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 0 } },
  chamberEagohName: { marginTop: 14, fontSize: 22, fontWeight: "900", letterSpacing: 0.4 },
  head: { width: 72, height: 80, borderRadius: 5, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(244,250,255,0.08)" },
  headText: { fontSize: 20, fontWeight: "900" },
  shoulders: { width: 150, height: 38, borderTopLeftRadius: 5, borderTopRightRadius: 5, borderWidth: 1, marginTop: 8, backgroundColor: "rgba(244,250,255,0.08)" },
  torso: { width: 112, height: 150, borderRadius: 5, marginTop: -3, borderWidth: 1, borderColor: "rgba(244,250,255,0.16)" },
  armLeft: { position: "absolute", top: 110, left: 4, width: 30, height: 150, borderRadius: 5, transform: [{ rotate: "13deg" }], backgroundColor: "rgba(141,162,181,0.24)" },
  armRight: { position: "absolute", top: 110, right: 4, width: 30, height: 150, borderRadius: 5, transform: [{ rotate: "-13deg" }], backgroundColor: "rgba(141,162,181,0.24)" },
  legWrap: { flexDirection: "row", gap: 14, marginTop: 8 },
  leg: { width: 36, height: 94, borderRadius: 5, backgroundColor: "rgba(141,162,181,0.22)" },
  chamberFooter: { position: "absolute", left: 18, right: 18, bottom: 18, padding: 16, borderRadius: 5, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(3,6,11,0.68)" },
  chamberName: { color: palette.text, fontSize: 20, fontWeight: "900" },
  chamberTheme: { color: palette.muted, marginTop: 5, lineHeight: 18 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "48%", minHeight: 118, borderRadius: 5, padding: 14, backgroundColor: "rgba(16,27,42,0.76)", borderWidth: 1, borderColor: palette.line },
  statDot: { width: 9, height: 9, borderRadius: 9, marginBottom: 14 },
  statValue: { color: palette.text, fontSize: 25, fontWeight: "900" },
  statLabel: { color: palette.muted, marginTop: 3, fontWeight: "800" },
  statDetail: { color: palette.muted, fontSize: 11, marginTop: 8 },
  panel: { borderRadius: 5, padding: 16, backgroundColor: "rgba(10,18,30,0.78)", borderWidth: 1, borderColor: palette.line, gap: 12 },
  walletPanel: { borderRadius: 5, padding: 16, backgroundColor: "rgba(10,18,30,0.84)", borderWidth: 1, borderColor: "rgba(255,184,77,0.28)", gap: 12, overflow: "hidden" },
  subscriptionPanel: { borderRadius: 5, padding: 16, backgroundColor: "rgba(10,18,30,0.84)", borderWidth: 1, borderColor: "rgba(124,92,255,0.32)", gap: 12, overflow: "hidden" },
  sectionTitleWrap: { marginBottom: 4 },
  eyebrow: { color: palette.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 1.8 },
  sectionTitle: { color: palette.text, fontSize: 22, fontWeight: "900", marginTop: 3 },
  panelBody: { color: palette.muted, lineHeight: 20 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 5, backgroundColor: palette.cyanSoft, borderWidth: 1, borderColor: "rgba(54,245,255,0.26)" },
  teamChip: { backgroundColor: palette.goldSoft, borderColor: "rgba(255,184,77,0.25)" },
  chipText: { color: palette.text, fontSize: 12, fontWeight: "800" },
  divider: { height: 1, backgroundColor: palette.line, marginVertical: 2 },
  miniLabel: { color: palette.muted, fontWeight: "900", fontSize: 12, textTransform: "uppercase" },
  alignment: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 5, backgroundColor: "rgba(255,107,53,0.10)", borderWidth: 1, borderColor: "rgba(255,107,53,0.22)" },
  alignmentTitle: { color: palette.text, fontWeight: "900" },
  alignmentBody: { color: palette.muted, marginTop: 3, flexShrink: 1 },
  walletHero: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderRadius: 5, backgroundColor: "rgba(3,6,11,0.48)", borderWidth: 1, borderColor: "rgba(255,184,77,0.18)" },
  walletLabel: { color: palette.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.2 },
  walletTotal: { color: palette.text, fontSize: 42, fontWeight: "900", letterSpacing: -1.5, marginTop: 2 },
  walletOrb: { width: 88, height: 88, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: palette.goldSoft, borderWidth: 1, borderColor: "rgba(255,184,77,0.42)" },
  walletOrbText: { color: palette.gold, fontSize: 10, fontWeight: "900", marginTop: 4, letterSpacing: 1.2 },
  balanceGrid: { flexDirection: "row", gap: 10 },
  balanceCard: { flex: 1, minHeight: 142, padding: 13, borderRadius: 5, backgroundColor: "rgba(3,6,11,0.42)", borderWidth: 1, borderColor: palette.line },
  balanceValue: { color: palette.text, fontSize: 24, fontWeight: "900", marginTop: 10 },
  balanceLabel: { color: palette.text, fontWeight: "900", marginTop: 4, fontSize: 12 },
  balanceRule: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 7 },
  rolloverBox: { padding: 14, borderRadius: 5, backgroundColor: "rgba(255,184,77,0.10)", borderWidth: 1, borderColor: "rgba(255,184,77,0.25)" },
  rolloverTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  rolloverTitle: { color: palette.text, fontWeight: "900", flex: 1 },
  rolloverPct: { color: palette.gold, fontWeight: "900" },
  rolloverBody: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  multiplierRow: { flexDirection: "row", gap: 8 },
  multiplierCard: { flex: 1, padding: 10, borderRadius: 5, backgroundColor: "rgba(3,6,11,0.36)", borderWidth: 1, borderColor: palette.line, minHeight: 128 },
  multiplierActive: { borderColor: "rgba(255,184,77,0.42)", backgroundColor: "rgba(255,184,77,0.12)" },
  multiplierName: { color: palette.text, fontSize: 11, fontWeight: "900", marginTop: 8 },
  multiplierValue: { fontSize: 20, fontWeight: "900", marginTop: 4 },
  multiplierDetail: { color: palette.muted, fontSize: 10, lineHeight: 14, marginTop: 6 },
  analyticsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  analyticsTitle: { color: palette.text, fontWeight: "900" },
  usageCard: { padding: 12, borderRadius: 17, backgroundColor: "rgba(16,27,42,0.58)", borderWidth: 1, borderColor: palette.line },
  usageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  usageLabel: { color: palette.text, fontWeight: "900", flex: 1 },
  usageValue: { fontWeight: "900" },
  progressTrack: { height: 7, borderRadius: 5, backgroundColor: "rgba(141,162,181,0.16)", overflow: "hidden", marginTop: 10 },
  progressFill: { height: "100%", borderRadius: 5 },
  usageDetail: { color: palette.muted, fontSize: 11, marginTop: 7 },
  subscriptionCard: { borderRadius: 5, padding: 14, backgroundColor: "rgba(3,6,11,0.48)", borderWidth: 1, borderColor: palette.line, overflow: "hidden", gap: 12 },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  planIcon: { width: 40, height: 40, borderRadius: 5, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  planTitleBlock: { flex: 1 },
  planName: { color: palette.text, fontSize: 18, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  planLabel: { color: palette.muted, fontSize: 12, marginTop: 2, fontWeight: "700" },
  featuredPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 5, backgroundColor: palette.goldSoft, borderWidth: 1, borderColor: "rgba(255,184,77,0.32)" },
  featuredText: { color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  edgeAmountRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  edgeAmount: { fontSize: 34, fontWeight: "900", letterSpacing: -1 },
  edgeAmountLabel: { color: palette.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  planMetricGrid: { flexDirection: "row", gap: 8 },
  planMetric: { flex: 1, padding: 11, borderRadius: 5, backgroundColor: "rgba(16,27,42,0.62)", borderWidth: 1, borderColor: palette.line },
  planMetricValue: { color: palette.text, fontWeight: "900", fontSize: 13 },
  planMetricLabel: { color: palette.muted, fontSize: 10, fontWeight: "900", marginTop: 5, textTransform: "uppercase" },
  planRows: { gap: 7 },
  planRow: { color: palette.text, fontSize: 12, lineHeight: 17 },
  edgeBalance: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 5, backgroundColor: palette.goldSoft, borderWidth: 1, borderColor: "rgba(255,184,77,0.24)" },
  edgeValue: { color: palette.text, fontSize: 19, fontWeight: "900" },
  edgeHint: { color: palette.muted, marginTop: 3, fontSize: 12 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  activityText: { color: palette.text, flex: 1 },
  labCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 5, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(3,6,11,0.38)" },
  labThumb: { width: 58, height: 58, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  labInfo: { flex: 1 },
  labName: { color: palette.text, fontWeight: "900", fontSize: 15 },
  labTheme: { color: palette.muted, fontSize: 12, lineHeight: 16, marginTop: 3 },
  labMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7 },
  labCost: { fontWeight: "900", fontSize: 12 },
  selectedText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  reputationPanel: { borderRadius: 5, padding: 14, marginTop: 14, backgroundColor: "rgba(10,18,30,0.82)", borderWidth: 1, borderColor: "rgba(255,184,77,0.20)", gap: 10 },
  repGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  repMetricCard: { width: "48%", padding: 10, borderRadius: 5, backgroundColor: "rgba(16,27,42,0.64)", borderWidth: 1, borderColor: palette.line },
  repMetricHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  repMetricLabel: { color: palette.muted, fontSize: 11, fontWeight: "900" as const, flex: 1 },
  repMetricValue: { fontSize: 16, fontWeight: "900" as const },
  repProgressTrack: { height: 5, borderRadius: 5, backgroundColor: "rgba(141,162,181,0.14)", overflow: "hidden" as const },
  repProgressFill: { height: "100%", borderRadius: 5 },
  repDetailLabel: { color: palette.text, fontSize: 13, fontWeight: "900" as const, marginBottom: 8 },
  rankProgression: { marginTop: 4 },
  rankBarTrack: { flexDirection: "row" as const, gap: 3, alignItems: "flex-end" as const, height: 28 },
  rankBarStep: { flex: 1, height: 8, borderRadius: 5, backgroundColor: "rgba(141,162,181,0.16)" },
  rankBarStepDot: { width: 12, height: 12, borderRadius: 6, alignSelf: "center" as const, marginTop: 12, borderWidth: 1, borderColor: "rgba(141,162,181,0.3)", backgroundColor: "rgba(3,6,11,0.8)" },
  badgesSection: { marginTop: 4 },
  badgesGrid: { gap: 8 },
  badgeCard: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 10, padding: 10, borderRadius: 5, backgroundColor: palette.goldSoft, borderWidth: 1, borderColor: "rgba(255,184,77,0.18)" },
  badgeInfo: { flex: 1 },
  badgeName: { color: palette.gold, fontSize: 13, fontWeight: "900" as const },
  badgeDesc: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  signOutButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, paddingVertical: 12, borderRadius: 5, borderWidth: 1, borderColor: "rgba(255,107,53,0.32)", backgroundColor: "rgba(255,107,53,0.08)" },
  // Domain breakdown
  domainPanel: { borderRadius: 5, padding: 14, marginTop: 14, backgroundColor: "rgba(10,18,30,0.82)", borderWidth: 1, borderColor: "rgba(54,245,255,0.18)", gap: 10 },
  domainGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  domainChip: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 5, borderWidth: 1 },
  domainDot: { width: 8, height: 8, borderRadius: 4 },
  domainChipLabel: { fontSize: 11, fontWeight: "900" as const },
  domainChipCount: { color: palette.muted, fontSize: 10, fontWeight: "800" as const, marginLeft: 2 },
  signOutText: { color: palette.ember, fontWeight: "900", fontSize: 13, letterSpacing: 1.2 },
  // Rankings
  rankingsSection: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
  rankingsList: { gap: 6 },
  rankingMiniCard: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, padding: 10, borderRadius: 5, backgroundColor: "rgba(16,27,42,0.54)", borderWidth: 1, borderColor: palette.line },
  rankingMiniLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, flex: 1 },
  rankingMiniRank: { color: palette.gold, fontSize: 14, fontWeight: "900" as const, minWidth: 28 },
  rankingMiniName: { color: palette.text, fontSize: 13, fontWeight: "900" as const, flex: 1 },
  rankingMiniBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  rankingMiniBadgeText: { fontSize: 9, fontWeight: "900" as const },
  rankingMiniScore: { fontSize: 18, fontWeight: "900" as const, minWidth: 36, textAlign: "right" as const },
  bestCategoryRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, marginTop: 6 },
  bestCategoryText: { color: palette.gold, fontSize: 11, fontWeight: "800" as const, textTransform: "capitalize" as const },
  rankChangesSection: { marginTop: 10 },
  rankChangeRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, paddingVertical: 6 },
  rankChangeText: { color: palette.text, fontSize: 12, fontWeight: "700" as const, flex: 1 },
  rankChangeDate: { color: palette.muted, fontSize: 10 },
  featureCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 5, padding: 13, backgroundColor: "rgba(14,24,37,0.64)", borderWidth: 1, borderColor: palette.line, marginBottom: 8 },
  featureIconWrap: { width: 42, height: 42, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.035)" },
  featureInfo: { flex: 1 },
  featureTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
  featureDesc: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  // Subscription Test Mode
  testPanel: { borderRadius: 5, padding: 14, backgroundColor: "rgba(10,18,30,0.88)", borderWidth: 1, borderColor: "rgba(255,77,109,0.28)", gap: 12, overflow: "hidden" as const },
  testBanner: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  testBannerText: { color: palette.gold, fontSize: 14, fontWeight: "900" as const, letterSpacing: 1 },
  testHint: { color: palette.ember, fontSize: 10, fontWeight: "800" as const, letterSpacing: 1.2, textTransform: "uppercase" as const },
  testButtonGrid: { flexDirection: "row" as const, gap: 8 },
  testButton: { flex: 1, paddingVertical: 13, paddingHorizontal: 6, borderRadius: 5, borderWidth: 1, alignItems: "center" as const, gap: 6, backgroundColor: "rgba(16,27,42,0.62)", minHeight: 88, position: "relative" as const },
  testButtonLabel: { fontSize: 11, fontWeight: "900" as const, letterSpacing: 0.8, textTransform: "uppercase" as const },
  testButtonEdge: { color: palette.muted, fontSize: 10, fontWeight: "800" as const },
  testActiveDot: { position: "absolute" as const, top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },
  testCurrentLabel: { color: palette.muted, fontSize: 11, fontWeight: "800" as const, marginTop: 2 },
});
