import { palette, glow } from "@/constants/colors";
import { LIST_PERFORMANCE_PROPS } from "@/app/components/PerformancePrimitives";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import {
  canParticipateInFactions,
  createFaction,
  getFactionLimit,
  getFactionFull,
  getMemberStatusColor,
  getMemberStatusLabel,
  getRoleLabel,
  joinFaction,
  listAllFactions,
  listUserFactions,
  listPendingInvites,
  acceptInvite,
  declineInvite,
  shareIntelToFaction,
  purchaseFactionSlots,
  SLOT_EXPANSION_COSTS,
  computeFactionIntelScore,
  recalculateFactionScore,
  type FactionRow,
  type FactionFull,
  type FactionMemberRow,
  type FactionInviteRow,
} from "@/services/factions";
import { useEdge } from "@/providers/EdgeProvider";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  ChevronRight,
  Plus,
  RadioTower,
  Shield,
  Users,
  Zap,
  X,
  Check,
  ArrowRight,
  Clock,
  UserPlus,
  AlertTriangle,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
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

// ── Section item for FlatList ──────────────────────────────────────────

type SectionItem =
  | { id: string; kind: "hero" }
  | { id: string; kind: "gate" }
  | { id: string; kind: "invites" }
  | { id: string; kind: "factions"; factions: FactionRow[] }
  | { id: string; kind: "rankings" }
  | { id: string; kind: "empty" };

// ── Helpers ────────────────────────────────────────────────────────────

function toneColor(tone: string): string {
  if (tone === "gold") return palette.gold;
  if (tone === "violet") return palette.violet;
  if (tone === "ember") return palette.ember;
  if (tone === "success") return palette.success;
  return palette.cyan;
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }): JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ── Create Faction Modal ───────────────────────────────────────────────

function CreateFactionModal({
  visible,
  onClose,
  onCreate,
  isCreating,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string, domain: string) => void;
  isCreating: boolean;
}): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("sports");

  const handleCreate = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, description.trim(), domain);
    setName("");
    setDescription("");
    setDomain("sports");
  }, [name, description, domain, onCreate]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={["#03060B", "#07101B", "#101420"]} style={styles.modalRoot}>
        <SafeAreaView edges={["top"]} style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={12}><X color={palette.muted} size={22} /></Pressable>
            <Text style={styles.modalTitle}>Create Faction</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>FACTION NAME</Text>
            <TextInput
              style={styles.fieldInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Neon Guard"
              placeholderTextColor={palette.muted}
              autoFocus
              maxLength={40}
            />

            <Text style={styles.fieldLabel}>DESCRIPTION</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldTextArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="What does your Faction do?"
              placeholderTextColor={palette.muted}
              multiline
              numberOfLines={3}
              maxLength={200}
            />

            <Text style={styles.fieldLabel}>INTELLIGENCE DOMAIN</Text>
            <View style={styles.domainRow}>
              {["sports", "music", "gaming", "business", "technology"].map((d) => (
                <Pressable
                  key={d}
                  style={[styles.domainChip, domain === d && styles.domainChipActive]}
                  onPress={() => setDomain(d)}
                >
                  <Text style={[styles.domainChipText, domain === d && styles.domainChipTextActive]}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.createBtn, !name.trim() && styles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={!name.trim() || isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color={palette.text} />
              ) : (
                <>
                  <Shield color={palette.text} size={18} />
                  <Text style={styles.createBtnText}>CREATE FACTION</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

// ── Faction Card ──────────────────────────────────────────────────────

function FactionCard({
  faction,
  membership,
  onPress,
  onExpand,
  expanded,
}: {
  faction: FactionRow;
  membership: FactionMemberRow | null;
  onPress?: () => void;
  onExpand?: () => void;
  expanded?: boolean;
}): JSX.Element {
  const accent = membership?.status === "dormant" ? palette.muted : palette.cyan;
  const role = membership ? getRoleLabel(membership.role) : null;
  const status = membership ? membership.status : null;

  return (
    <Pressable
      onPress={onExpand ?? onPress}
      style={({ pressed }) => [styles.factionCard, pressed && styles.pressed]}
    >
      <View style={[styles.cardGlow, { backgroundColor: accent }]} />
      <View style={styles.factionTop}>
        <View style={[styles.emblem, { borderColor: accent, backgroundColor: `${accent}18` }]}>
          <Text style={[styles.emblemText, { color: accent }]}>
            {faction.emblem ?? faction.name.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={styles.factionTitleWrap}>
          <Text style={styles.factionName}>{faction.name}</Text>
          {role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{role}</Text>
            </View>
          )}
        </View>
        {expanded !== undefined ? (
          <ChevronRight color={accent} size={18} style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }} />
        ) : (
          <ChevronRight color={accent} size={18} />
        )}
      </View>

      <View style={styles.metricRow}>
        <Metric label="Members" value={`${faction.current_members}/${faction.max_members}`} />
        <Metric label="Influence" value={`${faction.influence_score}`} />
        <Metric label="Domain" value={faction.intelligence_domain} />
      </View>

      {status && (
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: palette[getMemberStatusColor(status)] }]} />
          <Text style={[styles.statusText, { color: palette[getMemberStatusColor(status)] }]}>
            {getMemberStatusLabel(status)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

// ── Expanded Faction Detail ───────────────────────────────────────────

function FactionDetail({
  faction,
  full,
}: {
  faction: FactionRow;
  full: FactionFull | null | undefined;
}): JSX.Element {
  const { user } = useAuth();
  const { profile } = useProfile();
  const edge = useEdge();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const isCommander = full?.members.some(
    (m) => m.user_id === userId && m.role === "commander",
  );

  const [inviteUserId, setInviteUserId] = useState("");

  const handleInvite = useCallback(async () => {
    if (!inviteUserId.trim() || !userId) return;
    try {
      const { inviteToFaction: sendInvite } = await import("@/services/factions");
      const result = await sendInvite(faction.id, userId, inviteUserId.trim(), "analyst");
      if (result.ok) {
        Alert.alert("Invite Sent", `Invited ${inviteUserId.trim()} to ${faction.name}.`);
        setInviteUserId("");
        queryClient.invalidateQueries({ queryKey: ["faction", faction.id] });
      } else {
        Alert.alert("Error", result.error ?? "Failed to send invite.");
      }
    } catch {
      Alert.alert("Error", "Failed to send invite.");
    }
  }, [inviteUserId, userId, faction.id, faction.name, queryClient]);

  const handleSlotPurchase = useCallback(
    async (slots: number) => {
      if (!userId || !profile) return;
      const cost = SLOT_EXPANSION_COSTS.find((s) => s.slots === slots);
      if (!cost) return;

      if (!edge.canAfford(cost.cost)) {
        Alert.alert("Insufficient Edge", `Need ${cost.cost} Edge for +${slots} slots.`);
        return;
      }

      try {
        const result = await purchaseFactionSlots(faction.id, userId, profile, slots);
        if (result.ok) {
          Alert.alert("Slots Expanded", `Added +${slots} slots. New max: ${result.faction.max_members}`);
          queryClient.invalidateQueries({ queryKey: ["faction", faction.id] });
          queryClient.invalidateQueries({ queryKey: ["factions"] });
        } else {
          Alert.alert("Error", result.error);
        }
      } catch {
        Alert.alert("Error", "Slot expansion failed.");
      }
    },
    [userId, profile, faction.id, edge, queryClient],
  );

  const members = full?.members ?? [];
  const activePaid = members.filter((m) => m.status === "active").length;
  const { score } = computeFactionIntelScore(
    activePaid,
    full?.sharedEntries.length ?? 0,
    0,
    full?.recentActivity.length ?? 0,
  );

  return (
    <View style={styles.detailWrap}>
      {/* Members */}
      <SectionHeader eyebrow="ROSTER" title={`Members (${faction.current_members}/${faction.max_members})`} />
      {members.map((m) => (
        <View key={m.id} style={styles.memberRow}>
          <View style={[styles.memberDot, { backgroundColor: palette[getMemberStatusColor(m.status)] }]} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{getRoleLabel(m.role)}</Text>
            <Text style={styles.rowSub}>{getMemberStatusLabel(m.status)}</Text>
          </View>
        </View>
      ))}

      {/* Commander controls */}
      {isCommander && (
        <View style={styles.commanderSection}>
          <SectionHeader eyebrow="COMMAND" title="Faction Management" />

          {/* Slot expansion */}
          <Text style={styles.fieldLabel}>EXPAND MEMBER SLOTS</Text>
          <View style={styles.slotRow}>
            {SLOT_EXPANSION_COSTS.map(({ slots, cost }) => (
              <Pressable
                key={slots}
                style={styles.slotBtn}
                onPress={() => handleSlotPurchase(slots)}
              >
                <Text style={styles.slotBtnLabel}>+{slots}</Text>
                <Text style={styles.slotBtnCost}>{cost}E</Text>
              </Pressable>
            ))}
          </View>

          {/* Invite */}
          <Text style={styles.fieldLabel}>INVITE ANALYST (user ID)</Text>
          <View style={styles.inviteInputRow}>
            <TextInput
              style={[styles.fieldInput, { flex: 1 }]}
              value={inviteUserId}
              onChangeText={setInviteUserId}
              placeholder="User UUID"
              placeholderTextColor={palette.muted}
            />
            <Pressable style={styles.inviteBtn} onPress={handleInvite}>
              <UserPlus color={palette.text} size={16} />
              <Text style={styles.inviteBtnText}>Invite</Text>
            </Pressable>
          </View>

          {/* Faction Intel Score */}
          <SectionHeader eyebrow="SCORE" title="Faction Intelligence Score" />
          <View style={styles.scoreCard}>
            <Text style={styles.scoreValue}>{score}</Text>
            <Text style={styles.scoreLabel}>Influence Score</Text>
            <View style={styles.scoreBreakdown}>
              <Text style={styles.scoreDetail}>Active: {activePaid}</Text>
              <Text style={styles.scoreDetail}>Shared: {full?.sharedEntries.length ?? 0}</Text>
              <Text style={styles.scoreDetail}>Activity: {full?.recentActivity.length ?? 0}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Shared Intelligence */}
      <SectionHeader eyebrow="POOL" title="Shared Intelligence" />
      {(!full?.sharedEntries || full.sharedEntries.length === 0) ? (
        <Text style={styles.emptyText}>No shared intelligence yet.</Text>
      ) : (
        <View />
      )}

      {/* Recent Activity */}
      <SectionHeader eyebrow="LOG" title="Recent Activity" />
      {full?.recentActivity.slice(0, 10).map((act) => (
        <View key={act.id} style={styles.activityRow}>
          <View style={[styles.dot, { backgroundColor: palette.cyan }]} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{act.kind.replace(/_/g, " ")}</Text>
            <Text style={styles.rowSub}>{new Date(act.created_at).toLocaleDateString()}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────

export default function FactionsScreen(): JSX.Element {
  const { user } = useAuth();
  const { profile } = useProfile();
  const userId = user?.id;
  const tier = profile?.subscription_tier ?? "free";
  const limits = getFactionLimit(tier);
  const canParticipate = canParticipateInFactions(tier);
  const queryClient = useQueryClient();

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [expandedFactionId, setExpandedFactionId] = useState<string | null>(null);

  // Queries
  const userFactionsQuery = useQuery<FactionRow[]>({
    queryKey: ["factions", "user", userId],
    enabled: !!userId,
    queryFn: () => (userId ? listUserFactions(userId) : Promise.resolve([])),
  });

  const allFactionsQuery = useQuery<FactionRow[]>({
    queryKey: ["factions", "all"],
    enabled: true,
    queryFn: () => listAllFactions(),
  });

  const invitesQuery = useQuery<FactionInviteRow[]>({
    queryKey: ["factions", "invites", userId],
    enabled: !!userId,
    queryFn: () => (userId ? listPendingInvites(userId) : Promise.resolve([])),
  });

  const expandedQuery = useQuery<FactionFull | null>({
    queryKey: ["faction", expandedFactionId],
    enabled: !!expandedFactionId,
    queryFn: () => (expandedFactionId ? getFactionFull(expandedFactionId) : Promise.resolve(null)),
  });

  // Create faction
  const createMutation = useMutation({
    mutationFn: async (input: { name: string; description: string; domain: string }) => {
      if (!userId || !profile) throw new Error("Not signed in");
      return createFaction({ userId, profile, name: input.name, description: input.description, intelligence_domain: input.domain });
    },
    onSuccess: (result) => {
      if (result.ok) {
        setCreateModalVisible(false);
        queryClient.invalidateQueries({ queryKey: ["factions", "user", userId] });
        queryClient.invalidateQueries({ queryKey: ["factions", "all"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else {
        Alert.alert("Error", result.error);
      }
    },
  });

  // Accept invite
  const acceptMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!userId || !profile) throw new Error("Not signed in");
      return acceptInvite(inviteId, userId, profile);
    },
    onSuccess: (result, inviteId) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ["factions", "invites", userId] });
        queryClient.invalidateQueries({ queryKey: ["factions", "user", userId] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else {
        Alert.alert("Error", result.error);
      }
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!userId) return;
      return declineInvite(inviteId, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["factions", "invites", userId] });
    },
  });

  // Build sections
  const sections: SectionItem[] = useMemo(() => {
    const items: SectionItem[] = [];

    // Hero always
    items.push({ id: "hero", kind: "hero" });

    // Tier gate for free users
    if (!canParticipate) {
      items.push({ id: "gate", kind: "gate" });
      items.push({ id: "rankings", kind: "rankings" });
      return items;
    }

    // Invites
    const invites = invitesQuery.data ?? [];
    if (invites.length > 0) {
      items.push({ id: "invites", kind: "invites" });
    }

    // User's factions
    const userFactions = userFactionsQuery.data ?? [];
    if (userFactions.length > 0) {
      items.push({ id: "user-factions", kind: "factions", factions: userFactions });
    }

    // All factions for discovery
    const all = allFactionsQuery.data ?? [];
    const userFactionIds = new Set(userFactions.map((f) => f.id));
    const discoverable = all.filter((f) => !userFactionIds.has(f.id));
    if (discoverable.length > 0) {
      items.push({ id: "discover", kind: "factions", factions: discoverable });
    }

    if (items.length <= 2) {
      items.push({ id: "empty", kind: "empty" });
    }

    items.push({ id: "rankings", kind: "rankings" });
    return items;
  }, [canParticipate, invitesQuery.data, userFactionsQuery.data, allFactionsQuery.data]);

  const handleCreateFaction = useCallback(
    (name: string, description: string, domain: string) => {
      createMutation.mutate({ name, description, domain });
    },
    [createMutation],
  );

  const renderSection = useCallback(
    ({ item }: { item: SectionItem }): JSX.Element => {
      if (item.kind === "hero") {
        return (
          <View style={styles.hero}>
            <LinearGradient
              colors={["rgba(54,245,255,0.22)", "rgba(124,92,255,0.13)", "rgba(255,184,77,0.08)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroGrid} />
            <Text style={styles.kicker}>FACTION NETWORK</Text>
            <Text style={styles.title}>Intelligence alliances for the sharpest analysts.</Text>
            <Text style={styles.subtitle}>
              {canParticipate
                ? "Create or join Factions to pool observations, share intelligence, and amplify your EAGOH's influence."
                : "Factions are reserved for Pro, Oracle Elite, and Syndicate subscribers."}
            </Text>
            {canParticipate && (
              <Pressable
                style={styles.createFactionBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                  setCreateModalVisible(true);
                }}
              >
                <Plus color={palette.text} size={18} />
                <Text style={styles.createFactionBtnText}>NEW FACTION</Text>
              </Pressable>
            )}
            {canParticipate && (
              <View style={styles.limitsRow}>
                <Text style={styles.limitsText}>
                  {tier} tier: {limits.maxFactions} Faction{limits.maxFactions !== 1 ? "s" : ""}, {limits.includedSlots} included members, max {limits.maxMembers}
                </Text>
              </View>
            )}
          </View>
        );
      }

      if (item.kind === "gate") {
        return (
          <View style={styles.gateCard}>
            <AlertTriangle color={palette.gold} size={28} />
            <Text style={styles.gateTitle}>Faction Access Restricted</Text>
            <Text style={styles.gateSubtitle}>
              Faction creation and membership require a paid subscription. Upgrade to Pro, Oracle Elite, or Syndicate to join intelligence alliances.
            </Text>
            <View style={styles.gateTiers}>
              <View style={styles.gateTier}>
                <Text style={styles.gateTierName}>Pro</Text>
                <Text style={styles.gateTierLimit}>1 Faction · 3 Members · Max 10</Text>
              </View>
              <View style={styles.gateTier}>
                <Text style={styles.gateTierName}>Oracle Elite</Text>
                <Text style={styles.gateTierLimit}>2 Factions · 5 Members · Max 25</Text>
              </View>
              <View style={styles.gateTier}>
                <Text style={styles.gateTierName}>Syndicate</Text>
                <Text style={styles.gateTierLimit}>3 Factions · 10 Members · Max 100</Text>
              </View>
            </View>
          </View>
        );
      }

      if (item.kind === "invites") {
        return (
          <View>
            <SectionHeader eyebrow="INVITES" title="Pending Alliance Invitations" />
            {(invitesQuery.data ?? []).map((invite) => {
              const accent = "violet";
              return (
                <View key={invite.id} style={styles.inviteCard}>
                  <Shield color={toneColor(accent)} size={20} />
                  <View style={styles.rowText}>
                    <Text style={styles.inviteTitle}>Faction Invitation</Text>
                    <Text style={styles.inviteRole}>{getRoleLabel(invite.role)}</Text>
                  </View>
                  <View style={styles.inviteActions}>
                    <Pressable
                      style={[styles.inviteActionBtn, { backgroundColor: palette.success }]}
                      onPress={() => acceptMutation.mutate(invite.id)}
                    >
                      <Check color={palette.void} size={14} />
                    </Pressable>
                    <Pressable
                      style={[styles.inviteActionBtn, { backgroundColor: palette.ember }]}
                      onPress={() => declineMutation.mutate(invite.id)}
                    >
                      <X color={palette.void} size={14} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        );
      }

      if (item.kind === "factions") {
        return (
          <View>
            <SectionHeader
              eyebrow={item.id === "user-factions" ? "YOUR ALLIANCES" : "DISCOVER"}
              title={item.id === "user-factions" ? "Your Factions" : "All Factions"}
            />
            {item.factions.map((faction) => {
              const membership =
                userFactionsQuery.data?.find((uf) => uf.id === faction.id)
                  ? null // We'd need the member row, just pass null for now
                  : null;
              const isExpanded = expandedFactionId === faction.id;
              return (
                <View key={faction.id}>
                  <FactionCard
                    faction={faction}
                    membership={null}
                    expanded={isExpanded}
                    onExpand={() => {
                      setExpandedFactionId(isExpanded ? null : faction.id);
                      Haptics.selectionAsync().catch(() => undefined);
                    }}
                  />
                  {isExpanded && (
                    <FactionDetail faction={faction} full={expandedQuery.data} />
                  )}
                </View>
              );
            })}

            {item.id !== "user-factions" && item.factions.length > 0 && (
              <Pressable
                style={styles.joinBtn}
                onPress={async () => {
                  if (!userId || !profile || item.factions.length === 0) return;
                  const target = item.factions[0]!;
                  try {
                    const result = await joinFaction(userId, profile, target.id);
                    if (result.ok) {
                      queryClient.invalidateQueries({ queryKey: ["factions", "user", userId] });
                      queryClient.invalidateQueries({ queryKey: ["factions", "all"] });
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
                    } else {
                      Alert.alert("Error", result.error);
                    }
                  } catch {
                    Alert.alert("Error", "Failed to join faction.");
                  }
                }}
              >
                <UserPlus color={palette.cyan} size={16} />
                <Text style={styles.joinBtnText}>Join First Available</Text>
              </Pressable>
            )}
          </View>
        );
      }

      if (item.kind === "rankings") {
        const all = allFactionsQuery.data ?? [];
        const sorted = all.slice().sort((a, b) => b.influence_score - a.influence_score).slice(0, 10);
        return (
          <View>
            <SectionHeader eyebrow="RANKINGS" title="Faction Influence Ladder" />
            {sorted.map((faction, index) => (
              <View key={faction.id} style={styles.rankingRow}>
                <Text style={styles.rankNumber}>#{index + 1}</Text>
                <Text style={styles.rankName}>{faction.name}</Text>
                <View style={styles.rankBar}>
                  <View
                    style={[
                      styles.rankFill,
                      { width: `${Math.min(100, faction.influence_score)}%`, backgroundColor: palette.cyan },
                    ]}
                  />
                </View>
                <Text style={styles.rankScore}>{faction.influence_score}</Text>
              </View>
            ))}
            {sorted.length === 0 && (
              <Text style={styles.emptyText}>No factions yet. Create one to begin.</Text>
            )}
          </View>
        );
      }

      return (
        <View style={styles.emptySection}>
          <Zap color={palette.cyan} size={32} />
          <Text style={styles.emptyTitle}>No Factions Found</Text>
          <Text style={styles.emptySubtitle}>Create a new Faction or join an existing alliance to get started.</Text>
          {canParticipate && (
            <Pressable
              style={styles.createFactionBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                setCreateModalVisible(true);
              }}
            >
              <Plus color={palette.text} size={18} />
              <Text style={styles.createFactionBtnText}>CREATE FACTION</Text>
            </Pressable>
          )}
        </View>
      );
    },
    [
      canParticipate,
      tier,
      limits,
      invitesQuery.data,
      userFactionsQuery.data,
      allFactionsQuery.data,
      expandedFactionId,
      expandedQuery.data,
      createMutation,
      acceptMutation,
      declineMutation,
      userId,
      profile,
      queryClient,
    ],
  );

  const isLoading =
    userFactionsQuery.isLoading || allFactionsQuery.isLoading || invitesQuery.isLoading;

  return (
    <LinearGradient colors={["#03060B", "#07101B", "#101420"]} style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safe}>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={palette.cyan} size="large" />
          </View>
        ) : (
          <FlatList
            data={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderSection}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            {...LIST_PERFORMANCE_PROPS}
          />
        )}
      </SafeAreaView>

      <CreateFactionModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onCreate={handleCreateFaction}
        isCreating={createMutation.isPending}
      />
    </LinearGradient>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 18, paddingBottom: 120, gap: 18 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Hero
  hero: {
    borderRadius: 5,
    overflow: "hidden",
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(54,245,255,0.28)",
    backgroundColor: palette.panel,
    gap: 4,
  },
  heroGrid: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    transform: [{ rotate: "-8deg" }, { scale: 1.18 }],
  },
  kicker: { color: palette.cyan, fontSize: 12, fontWeight: "900", letterSpacing: 2.4 },
  title: { color: palette.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.8, lineHeight: 28, marginTop: 6 },
  subtitle: { color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19, marginTop: 8 },
  createFactionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.cyan,
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    marginTop: 12,
  },
  createFactionBtnText: { color: palette.void, fontSize: 13, fontWeight: "900", letterSpacing: 1.2 },
  limitsRow: { marginTop: 8 },
  limitsText: { color: palette.muted, fontSize: 11, fontWeight: "800" },

  // Gate
  gateCard: {
    borderRadius: 5,
    padding: 20,
    borderWidth: 1,
    borderColor: palette.gold,
    backgroundColor: "rgba(255,181,71,0.06)",
    alignItems: "center",
    gap: 10,
  },
  gateTitle: { color: palette.gold, fontSize: 18, fontWeight: "900" },
  gateSubtitle: { color: palette.muted, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 19 },
  gateTiers: { width: "100%", gap: 8, marginTop: 6 },
  gateTier: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  gateTierName: { color: palette.text, fontSize: 14, fontWeight: "900" },
  gateTierLimit: { color: palette.muted, fontSize: 12, fontWeight: "700" },

  // Section headers
  sectionHeader: { marginTop: 2, marginBottom: 10 },
  eyebrow: { color: palette.gold, fontSize: 11, fontWeight: "900", letterSpacing: 2, textTransform: "uppercase" as const },
  sectionTitle: { color: palette.text, fontSize: 18, fontWeight: "900", marginTop: 4 },

  // Faction card
  factionCard: {
    marginBottom: 12,
    borderRadius: 5,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(8,15,26,0.92)",
    overflow: "hidden",
  },
  cardGlow: { position: "absolute", right: -28, top: -32, width: 96, height: 96, borderRadius: 5, opacity: 0.18 },
  factionTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  emblem: {
    width: 52,
    height: 52,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emblemText: { fontSize: 17, fontWeight: "900", letterSpacing: 1 },
  factionTitleWrap: { flex: 1, gap: 4 },
  factionName: { color: palette.text, fontSize: 17, fontWeight: "900" },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "rgba(108,230,255,0.12)",
  },
  roleBadgeText: { color: palette.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  metricRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  metric: {
    flex: 1,
    borderRadius: 5,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  metricValue: { color: palette.text, fontSize: 14, fontWeight: "900" },
  metricLabel: { color: palette.muted, fontSize: 10, fontWeight: "800", marginTop: 2, textTransform: "uppercase" as const },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },

  // Detail wrap
  detailWrap: {
    marginTop: -8,
    marginBottom: 12,
    padding: 14,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(8,12,22,0.86)",
  },

  // Member row
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.line },
  memberDot: { width: 8, height: 8, borderRadius: 4 },

  // Commander section
  commanderSection: { marginTop: 8, gap: 8 },

  // Slot expansion
  slotRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  slotBtn: {
    flex: 1,
    borderRadius: 5,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(108,230,255,0.06)",
  },
  slotBtnLabel: { color: palette.text, fontSize: 15, fontWeight: "900" },
  slotBtnCost: { color: palette.cyan, fontSize: 11, fontWeight: "900", marginTop: 2 },

  // Invite
  inviteInputRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: palette.cyan,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inviteBtnText: { color: palette.void, fontSize: 11, fontWeight: "900" },

  // Score card
  scoreCard: {
    borderRadius: 5,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(108,230,255,0.05)",
    alignItems: "center",
    marginBottom: 10,
  },
  scoreValue: { color: palette.cyan, fontSize: 36, fontWeight: "900" },
  scoreLabel: { color: palette.muted, fontSize: 12, fontWeight: "800", marginTop: 2 },
  scoreBreakdown: { flexDirection: "row", gap: 12, marginTop: 8 },
  scoreDetail: { color: palette.muted, fontSize: 11, fontWeight: "700" },

  // Invite card (in list)
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 5,
    padding: 14,
    marginBottom: 9,
    backgroundColor: "rgba(14,24,37,0.72)",
    borderWidth: 1,
    borderColor: palette.line,
  },
  inviteTitle: { color: palette.text, fontSize: 14, fontWeight: "900" },
  inviteRole: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  inviteActions: { flexDirection: "row", gap: 6 },
  inviteActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },

  // Activity row
  activityRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.line },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowText: { flex: 1 },
  rowTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
  rowSub: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  // Join CTA
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.cyan,
    borderStyle: "dashed" as const,
    marginTop: 4,
  },
  joinBtnText: { color: palette.cyan, fontSize: 12, fontWeight: "900" },

  // Rankings
  rankingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rankNumber: { color: palette.gold, width: 30, fontSize: 13, fontWeight: "900" },
  rankName: { color: palette.text, flex: 1, fontSize: 13, fontWeight: "900" },
  rankBar: { width: 78, height: 8, borderRadius: 5, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)" },
  rankFill: { height: "100%", borderRadius: 5 },
  rankScore: { color: palette.muted, width: 28, textAlign: "right", fontSize: 12, fontWeight: "900" },

  // Empty state
  emptySection: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: "900" },
  emptySubtitle: { color: palette.muted, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 19 },
  emptyText: { color: palette.muted, fontSize: 13, fontWeight: "700", paddingVertical: 8 },

  // Modal
  modalRoot: { flex: 1 },
  modalSafe: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  modalTitle: { color: palette.text, fontSize: 17, fontWeight: "900" },
  modalBody: { padding: 18, gap: 14 },
  fieldLabel: { color: palette.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginTop: 4, textTransform: "uppercase" as const },
  fieldInput: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  fieldTextArea: { minHeight: 80, textAlignVertical: "top" as const },
  domainRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  domainChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  domainChipActive: { borderColor: palette.cyan, backgroundColor: "rgba(108,230,255,0.12)" },
  domainChipText: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  domainChipTextActive: { color: palette.cyan },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.cyan,
    borderRadius: 5,
    paddingVertical: 14,
    marginTop: 8,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: palette.void, fontSize: 14, fontWeight: "900", letterSpacing: 1.4 },

  pressed: { transform: [{ scale: 0.985 }], opacity: 0.86 },
});
