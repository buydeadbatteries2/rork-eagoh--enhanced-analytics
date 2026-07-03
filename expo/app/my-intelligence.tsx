/**
 * My Intelligence — Phase 6B
 *
 * Owner management screen for the user's own Open Intelligence entries.
 * Shows entry content preview, category, confidence, quality, validation status,
 * dates, Faction/Exchange sharing status, and disputed/outdated warnings.
 *
 * Entry actions (all through secure worker):
 *   - Edit entry
 *   - Withdraw entry
 *   - Restore withdrawn entry
 *   - Enable/disable Faction sharing
 *   - Enable/disable Exchange sharing
 *   - View version history
 *
 * Trusted fields (quality_score, influence_score, validation_status, reputation)
 * are server-controlled and cannot be set by the client.
 */

import { palette } from "@/constants/colors";
import { useAppTheme } from "@/providers/ThemeProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useHaptics } from "@/hooks/useHaptics";
import { useSafeBack } from "@/hooks/useSafeBack";
import {
  VALIDATION_STATUS_LABELS,
  validationStatusColor,
  CHANGE_TYPE_LABELS,
  listAllEntries,
  updateEntry,
  withdrawEntry,
  restoreEntry,
  toggleExchangeShare,
  toggleFactionShare,
  fetchVersionHistory,
  hasModerationAccess,
  type OpenIntelligenceRow,
  type VersionHistoryEntry,
  type ValidationStatus,
  type ConfidenceLevel,
  type EntryType,
} from "@/services/openIntelligence";
import { listUserFactions, type FactionRow } from "@/services/factions";
import { supabase } from "@/lib/supabase";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  Clock,
  Edit3,
  FileClock,
  Flag,
  GitBranch,
  RotateCcw,
  Save,
  Shield,
  ShieldAlert,
  Share2,
  Trash2,
  X,
  Zap,
} from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";

// ── Entry Card ──────────────────────────────────────────────────────────

const EntryStatusBadge = memo(function EntryStatusBadge({
  status,
}: {
  status: string;
}): JSX.Element {
  const color = validationStatusColor(status);
  const label = VALIDATION_STATUS_LABELS[status] ?? "Pending Review";
  return (
    <View style={[mgmtStyles.badge, { borderColor: `${color}44`, backgroundColor: `${color}12` }]}>
      <Shield color={color} size={9} />
      <Text style={[mgmtStyles.badgeText, { color }]}>{label}</Text>
    </View>
  );
});

const ShareStatusPill = memo(function ShareStatusPill({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}): JSX.Element {
  const color = enabled ? palette.success : palette.muted;
  return (
    <View style={[mgmtStyles.sharePill, { borderColor: `${color}33` }]}>
      <Share2 color={color} size={9} />
      <Text style={[mgmtStyles.sharePillText, { color }]}>
        {label}: {enabled ? "On" : "Off"}
      </Text>
    </View>
  );
});

type ExpandedEntry = {
  entry: OpenIntelligenceRow;
  sharedFactionIds: string[];
};

function MyEntryCard({
  data,
  factions,
  onEdit,
  onWithdraw,
  onRestore,
  onToggleExchange,
  onToggleFaction,
  onShowVersions,
  busy,
}: {
  data: ExpandedEntry;
  factions: FactionRow[];
  onEdit: (entry: OpenIntelligenceRow) => void;
  onWithdraw: (entryId: string) => void;
  onRestore: (entryId: string) => void;
  onToggleExchange: (entryId: string, enabled: boolean) => void;
  onToggleFaction: (entryId: string, factionId: string, enabled: boolean) => void;
  onShowVersions: (entryId: string) => void;
  busy: string | null;
}): JSX.Element {
  const h = useHaptics();
  const { entry, sharedFactionIds } = data;
  const status = entry.validation_status ?? "pending_review";
  const isWithdrawn = status === "withdrawn";
  const isRejected = status === "rejected";
  const isDisputed = status === "disputed" || (entry.active_dispute_count ?? 0) > 0;
  const isOutdated = entry.outdated_flag ?? false;
  const [factionPickerOpen, setFactionPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const canEdit = !isWithdrawn && !isRejected;
  const canWithdraw = !isWithdrawn && !isRejected;
  const canRestore = isWithdrawn;
  const canShare = !isWithdrawn && !isRejected;

  const createdDate = useMemo(() => new Date(entry.created_at).toLocaleDateString(), [entry.created_at]);
  const updatedDate = useMemo(() => new Date(entry.updated_at).toLocaleDateString(), [entry.updated_at]);

  return (
    <View style={mgmtStyles.entryCard}>
      {/* Status + Warnings row */}
      <View style={mgmtStyles.entryTopRow}>
        <EntryStatusBadge status={status} />
        {isOutdated ? (
          <View style={[mgmtStyles.warnBadge, { borderColor: `${palette.gold}33` }]}>
            <Clock color={palette.gold} size={9} />
            <Text style={[mgmtStyles.warnText, { color: palette.gold }]}>Outdated</Text>
          </View>
        ) : null}
        {isDisputed ? (
          <View style={[mgmtStyles.warnBadge, { borderColor: `${palette.ember}33` }]}>
            <AlertTriangle color={palette.ember} size={9} />
            <Text style={[mgmtStyles.warnText, { color: palette.ember }]}>Disputed</Text>
          </View>
        ) : null}
      </View>

      {/* Content preview */}
      <Text style={mgmtStyles.entryContent} numberOfLines={expanded ? undefined : 3}>
        {entry.content}
      </Text>
      {entry.content.length > 120 ? (
        <Pressable onPress={() => { h.selection(); setExpanded(!expanded); }} style={mgmtStyles.expandBtn}>
          <Text style={mgmtStyles.expandText}>{expanded ? "Show less" : "Show more"}</Text>
        </Pressable>
      ) : null}

      {/* Meta row */}
      <View style={mgmtStyles.metaGrid}>
        <View style={mgmtStyles.metaItem}>
          <Text style={mgmtStyles.metaLabel}>Category</Text>
          <Text style={mgmtStyles.metaValue}>{entry.selected_category ?? entry.tag ?? "—"}</Text>
        </View>
        <View style={mgmtStyles.metaItem}>
          <Text style={mgmtStyles.metaLabel}>Confidence</Text>
          <Text style={mgmtStyles.metaValue}>
            {(entry.confidence_level ?? "").replace(/_/g, " ")}
          </Text>
        </View>
        <View style={mgmtStyles.metaItem}>
          <Text style={mgmtStyles.metaLabel}>Quality</Text>
          <Text style={[mgmtStyles.metaValue, { color: palette.cyan }]}>{entry.quality_score}</Text>
        </View>
        <View style={mgmtStyles.metaItem}>
          <Text style={mgmtStyles.metaLabel}>Version</Text>
          <Text style={mgmtStyles.metaValue}>{entry.version_number ?? 1}</Text>
        </View>
        <View style={mgmtStyles.metaItem}>
          <Text style={mgmtStyles.metaLabel}>Created</Text>
          <Text style={mgmtStyles.metaValue}>{createdDate}</Text>
        </View>
        <View style={mgmtStyles.metaItem}>
          <Text style={mgmtStyles.metaLabel}>Updated</Text>
          <Text style={mgmtStyles.metaValue}>{updatedDate}</Text>
        </View>
      </View>

      {/* Sharing status */}
      <View style={mgmtStyles.shareRow}>
        <ShareStatusPill enabled={entry.exchange_share_enabled ?? false} label="Exchange" />
        {sharedFactionIds.length > 0 ? (
          <ShareStatusPill enabled={true} label={`Faction (${sharedFactionIds.length})`} />
        ) : (
          <ShareStatusPill enabled={false} label="Faction" />
        )}
      </View>

      {/* Actions */}
      <View style={mgmtStyles.actionsRow}>
        {canEdit ? (
          <Pressable
            onPress={() => { h.selection(); onEdit(entry); }}
            style={({ pressed }) => [mgmtStyles.actionBtn, pressed && mgmtStyles.pressed]}
            disabled={busy !== null}
          >
            <Edit3 color={palette.cyan} size={13} />
            <Text style={[mgmtStyles.actionText, { color: palette.cyan }]}>Edit</Text>
          </Pressable>
        ) : null}

        {canWithdraw ? (
          <Pressable
            onPress={() => { h.selection(); onWithdraw(entry.id); }}
            style={({ pressed }) => [mgmtStyles.actionBtn, { borderColor: `${palette.ember}33` }, pressed && mgmtStyles.pressed]}
            disabled={busy !== null}
          >
            {busy === `withdraw:${entry.id}` ? (
              <ActivityIndicator color={palette.ember} size={13} />
            ) : (
              <Trash2 color={palette.ember} size={13} />
            )}
            <Text style={[mgmtStyles.actionText, { color: palette.ember }]}>Withdraw</Text>
          </Pressable>
        ) : null}

        {canRestore ? (
          <Pressable
            onPress={() => { h.selection(); onRestore(entry.id); }}
            style={({ pressed }) => [mgmtStyles.actionBtn, { borderColor: `${palette.success}33` }, pressed && mgmtStyles.pressed]}
            disabled={busy !== null}
          >
            {busy === `restore:${entry.id}` ? (
              <ActivityIndicator color={palette.success} size={13} />
            ) : (
              <RotateCcw color={palette.success} size={13} />
            )}
            <Text style={[mgmtStyles.actionText, { color: palette.success }]}>Restore</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => { h.selection(); onShowVersions(entry.id); }}
          style={({ pressed }) => [mgmtStyles.actionBtn, pressed && mgmtStyles.pressed]}
          disabled={busy !== null}
        >
          <FileClock color={palette.muted} size={13} />
          <Text style={[mgmtStyles.actionText, { color: palette.muted }]}>History</Text>
        </Pressable>
      </View>

      {/* Sharing toggles (only for non-withdrawn, non-rejected) */}
      {canShare ? (
        <View style={mgmtStyles.sharingSection}>
          <Pressable
            onPress={() => { h.selection(); onToggleExchange(entry.id, !(entry.exchange_share_enabled ?? false)); }}
            style={({ pressed }) => [mgmtStyles.toggleRow, pressed && mgmtStyles.pressed]}
            disabled={busy !== null}
          >
            <Share2 color={palette.cyan} size={12} />
            <Text style={mgmtStyles.toggleLabel}>Exchange Sharing</Text>
            <View style={[mgmtStyles.toggleSwitch, entry.exchange_share_enabled && { backgroundColor: palette.cyan, borderColor: palette.cyan }]}>
              <View style={[mgmtStyles.toggleKnob, entry.exchange_share_enabled && { transform: [{ translateX: 16 }] }]} />
            </View>
          </Pressable>

          {factions.length > 0 ? (
            <View>
              <Pressable
                onPress={() => { h.selection(); setFactionPickerOpen(!factionPickerOpen); }}
                style={({ pressed }) => [mgmtStyles.toggleRow, pressed && mgmtStyles.pressed]}
              >
                <Flag color={palette.violet} size={12} />
                <Text style={mgmtStyles.toggleLabel}>Faction Sharing</Text>
                <ChevronDown color={palette.muted} size={14} />
              </Pressable>

              {factionPickerOpen ? (
                <View style={mgmtStyles.factionList}>
                  {factions.map((f) => {
                    const isShared = sharedFactionIds.includes(f.id);
                    return (
                      <Pressable
                        key={f.id}
                        onPress={() => { h.selection(); onToggleFaction(entry.id, f.id, !isShared); }}
                        style={({ pressed }) => [mgmtStyles.factionItem, pressed && mgmtStyles.pressed]}
                        disabled={busy !== null}
                      >
                        <Text style={mgmtStyles.factionName}>{f.name}</Text>
                        <View style={[mgmtStyles.toggleSwitch, isShared && { backgroundColor: palette.violet, borderColor: palette.violet }]}>
                          <View style={[mgmtStyles.toggleKnob, isShared && { transform: [{ translateX: 16 }] }]} />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ── Edit Modal ──────────────────────────────────────────────────────────

function EditEntryModal({
  visible,
  entry,
  onClose,
  onSaved,
}: {
  visible: boolean;
  entry: OpenIntelligenceRow | null;
  onClose: () => void;
  onSaved: () => void;
}): JSX.Element {
  const h = useHaptics();
  const [content, setContent] = useState<string>("");
  const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>("moderate_confidence");
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible && entry) {
      setContent(entry.content);
      setConfidenceLevel((entry.confidence_level as ConfidenceLevel) ?? "moderate_confidence");
      setResultMsg(null);
    }
  }, [visible, entry]);

  const canSubmit = content.trim().length > 0 && !submitting;

  const handleSave = useCallback(async (): Promise<void> => {
    if (!entry || !content.trim()) return;
    h.light();
    setSubmitting(true);
    setResultMsg(null);

    const result = await updateEntry({
      entryId: entry.id,
      content: content.trim(),
      confidenceLevel,
    });

    setSubmitting(false);

    if (result.ok) {
      setResultMsg("Entry updated. Quality recalculated server-side.");
      h.success();
      onSaved();
      setTimeout(() => onClose(), 800);
    } else {
      setResultMsg(result.error ?? "Failed to update entry.");
    }
  }, [entry, content, confidenceLevel, h, onSaved, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mgmtStyles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={mgmtStyles.modalSheet}>
          <LinearGradient colors={["#0A1628", "#050D18"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={mgmtStyles.modalHandle} />
          <View style={mgmtStyles.modalHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Edit3 color={palette.cyan} size={18} />
              <Text style={mgmtStyles.modalTitle}>Edit Intelligence</Text>
            </View>
            <Pressable onPress={onClose} style={mgmtStyles.modalCloseBtn}>
              <X color={palette.muted} size={20} />
            </Pressable>
          </View>

          <ScrollView style={mgmtStyles.modalScroll} contentContainerStyle={mgmtStyles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={mgmtStyles.sectionLabel}>Content</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Edit your observation..."
              placeholderTextColor={palette.muted}
              multiline
              style={mgmtStyles.contentInput}
              textAlignVertical="top"
            />
            <Text style={mgmtStyles.charHint}>{content.trim().replace(/\s/g, "").length} chars (excl. spaces)</Text>

            <Text style={[mgmtStyles.sectionLabel, { marginTop: 14 }]}>Confidence Level</Text>
            <View style={mgmtStyles.confidenceRow}>
              {(["weak_suspicion", "moderate_confidence", "strong_confidence", "verified_observation"] as ConfidenceLevel[]).map((level) => {
                const isSelected = confidenceLevel === level;
                return (
                  <Pressable
                    key={level}
                    onPress={() => { h.selection(); setConfidenceLevel(level); }}
                    style={({ pressed }) => [
                      mgmtStyles.confidenceChip,
                      isSelected && { borderColor: palette.cyan, backgroundColor: "rgba(108,230,255,0.10)" },
                      pressed && mgmtStyles.pressed,
                    ]}
                  >
                    <Text style={[mgmtStyles.confidenceText, isSelected && { color: palette.cyan }]}>
                      {level.replace(/_/g, " ")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={mgmtStyles.noticeText}>
              Quality score, influence score, and validation status are calculated
              server-side and cannot be set manually.
            </Text>

            {resultMsg ? (
              <View style={[mgmtStyles.resultBox, { borderColor: `${resultMsg.includes("updated") ? palette.success : palette.ember}33` }]}>
                <Text style={[mgmtStyles.resultText, { color: resultMsg.includes("updated") ? palette.success : palette.ember }]}>
                  {resultMsg}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleSave}
              disabled={!canSubmit}
              style={({ pressed }) => [
                mgmtStyles.submitBtn,
                !canSubmit && mgmtStyles.submitBtnDisabled,
                pressed && { opacity: 0.85 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={palette.void} size="small" />
              ) : (
                <>
                  <Save color={canSubmit ? palette.void : palette.muted} size={15} />
                  <Text style={[mgmtStyles.submitBtnText, !canSubmit && { color: palette.muted }]}>
                    Save Changes
                  </Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Version History Modal ───────────────────────────────────────────────

function VersionHistoryModal({
  visible,
  entryId,
  onClose,
}: {
  visible: boolean;
  entryId: string | null;
  onClose: () => void;
}): JSX.Element {
  const [versions, setVersions] = useState<VersionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && entryId) {
      setLoading(true);
      setError(null);
      fetchVersionHistory(entryId).then((result) => {
        setLoading(false);
        if (result.ok) {
          setVersions(result.versions);
        } else {
          setError(result.error);
        }
      });
    }
  }, [visible, entryId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mgmtStyles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={mgmtStyles.modalSheet}>
          <LinearGradient colors={["#0A1628", "#050D18"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={mgmtStyles.modalHandle} />
          <View style={mgmtStyles.modalHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <GitBranch color={palette.cyan} size={18} />
              <Text style={mgmtStyles.modalTitle}>Version History</Text>
            </View>
            <Pressable onPress={onClose} style={mgmtStyles.modalCloseBtn}>
              <X color={palette.muted} size={20} />
            </Pressable>
          </View>

          <ScrollView style={mgmtStyles.modalScroll} contentContainerStyle={mgmtStyles.modalBody}>
            {loading ? (
              <ActivityIndicator color={palette.cyan} size="large" style={{ paddingVertical: 30 }} />
            ) : error ? (
              <Text style={mgmtStyles.errorText}>{error}</Text>
            ) : versions.length === 0 ? (
              <Text style={mgmtStyles.emptyText}>No version history yet.</Text>
            ) : (
              versions.map((v) => {
                const changeLabel = CHANGE_TYPE_LABELS[v.change_type] ?? v.change_type;
                const dateLabel = new Date(v.changed_at).toLocaleDateString();
                return (
                  <View key={v.id} style={mgmtStyles.versionItem}>
                    <View style={mgmtStyles.versionHeader}>
                      <View style={[mgmtStyles.versionBadge, { borderColor: `${palette.cyan}33` }]}>
                        <Text style={[mgmtStyles.versionBadgeText, { color: palette.cyan }]}>
                          v{v.version_number}
                        </Text>
                      </View>
                      <Text style={mgmtStyles.versionChangeType}>{changeLabel}</Text>
                      <Text style={mgmtStyles.versionDate}>{dateLabel}</Text>
                    </View>
                    {v.previous_content ? (
                      <Text style={mgmtStyles.versionContent} numberOfLines={3}>
                        {v.previous_content}
                      </Text>
                    ) : (
                      <Text style={mgmtStyles.versionNoContent}>No content snapshot</Text>
                    )}
                    <View style={mgmtStyles.versionMetaRow}>
                      {v.previous_validation_status ? (
                        <Text style={mgmtStyles.versionMetaText}>
                          Status: {VALIDATION_STATUS_LABELS[v.previous_validation_status] ?? v.previous_validation_status}
                        </Text>
                      ) : null}
                      {v.previous_quality_score !== null ? (
                        <Text style={mgmtStyles.versionMetaText}>Q: {v.previous_quality_score}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────

export default function MyIntelligenceScreen(): JSX.Element {
  const h = useHaptics();
  const goBack = useSafeBack();
  const router = useRouter();
  const { profile } = useProfile();
  const { palette: pal } = useAppTheme();
  const queryClient = useQueryClient();

  const [editingEntry, setEditingEntry] = useState<OpenIntelligenceRow | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [versionModalVisible, setVersionModalVisible] = useState(false);
  const [versionEntryId, setVersionEntryId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Fetch user's entries
  const entriesQuery = useQuery<OpenIntelligenceRow[]>({
    queryKey: ["oi", "my-entries", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => listAllEntries(profile!.id, 100),
  });

  // Fetch user's factions for sharing toggles
  const factionsQuery = useQuery<FactionRow[]>({
    queryKey: ["factions", "user", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => listUserFactions(profile!.id),
  });

  // Fetch shared faction intelligence for the user's entries
  const sharedFactionQuery = useQuery<Array<{ oi_entry_id: string; faction_id: string }>>(
    {
      queryKey: ["oi", "my-shared-factions", profile?.id],
      enabled: !!profile?.id && (factionsQuery.data?.length ?? 0) > 0,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("faction_shared_intelligence")
          .select("oi_entry_id, faction_id")
          .eq("user_id", profile!.id);
        if (error) throw error;
        return (data ?? []) as Array<{ oi_entry_id: string; faction_id: string }>;
      },
    }
  );

  const factions = factionsQuery.data ?? [];

  // Build expanded entries with faction sharing info
  const expandedEntries: ExpandedEntry[] = useMemo(() => {
    const entries = entriesQuery.data ?? [];
    const sharedMap = sharedFactionQuery.data ?? [];
    return entries.map((entry) => ({
      entry,
      sharedFactionIds: sharedMap
        .filter((s) => s.oi_entry_id === entry.id)
        .map((s) => s.faction_id),
    }));
  }, [entriesQuery.data, sharedFactionQuery.data]);

  const refreshAll = useCallback((): void => {
    queryClient.invalidateQueries({ queryKey: ["oi", "my-entries"] });
    queryClient.invalidateQueries({ queryKey: ["oi", "my-shared-factions"] });
  }, [queryClient]);

  const handleEdit = useCallback((entry: OpenIntelligenceRow): void => {
    setEditingEntry(entry);
    setEditModalVisible(true);
  }, []);

  const handleWithdraw = useCallback(async (entryId: string): Promise<void> => {
    setBusy(`withdraw:${entryId}`);
    setActionMsg(null);
    const result = await withdrawEntry(entryId);
    setBusy(null);
    if (result.ok) {
      h.success();
      setActionMsg("Entry withdrawn. It is no longer visible in analyst context.");
      refreshAll();
    } else {
      setActionMsg(result.error ?? "Failed to withdraw entry.");
    }
  }, [h, refreshAll]);

  const handleRestore = useCallback(async (entryId: string): Promise<void> => {
    setBusy(`restore:${entryId}`);
    setActionMsg(null);
    const result = await restoreEntry(entryId);
    setBusy(null);
    if (result.ok) {
      h.success();
      setActionMsg("Entry restored to Pending Review. Re-enable sharing manually.");
      refreshAll();
    } else {
      setActionMsg(result.error ?? "Failed to restore entry.");
    }
  }, [h, refreshAll]);

  const handleToggleExchange = useCallback(async (entryId: string, enabled: boolean): Promise<void> => {
    setBusy(`exchange:${entryId}`);
    setActionMsg(null);
    const result = await toggleExchangeShare(entryId, enabled);
    setBusy(null);
    if (result.ok) {
      h.selection();
      setActionMsg(`Exchange sharing ${enabled ? "enabled" : "disabled"}.`);
      refreshAll();
    } else {
      setActionMsg(result.error ?? "Failed to toggle sharing.");
    }
  }, [h, refreshAll]);

  const handleToggleFaction = useCallback(async (entryId: string, factionId: string, enabled: boolean): Promise<void> => {
    setBusy(`faction:${entryId}:${factionId}`);
    setActionMsg(null);
    const result = await toggleFactionShare(entryId, factionId, enabled);
    setBusy(null);
    if (result.ok) {
      h.selection();
      setActionMsg(`Faction sharing ${enabled ? "enabled" : "disabled"}.`);
      refreshAll();
    } else {
      setActionMsg(result.error ?? "Failed to toggle faction sharing.");
    }
  }, [h, refreshAll]);

  const handleShowVersions = useCallback((entryId: string): void => {
    setVersionEntryId(entryId);
    setVersionModalVisible(true);
  }, []);

  const isAdmin = hasModerationAccess(profile);

  return (
    <SafeAreaView style={[mgmtStyles.safe, { backgroundColor: pal.void }]} edges={["top"]}>
      {/* Header */}
      <View style={mgmtStyles.header}>
        <Pressable onPress={goBack} style={mgmtStyles.backBtn}>
          <ChevronLeft color={palette.text} size={22} />
        </Pressable>
        <View style={mgmtStyles.headerCenter}>
          <Text style={mgmtStyles.kicker}>MY INTELLIGENCE</Text>
          <Text style={mgmtStyles.title}>Entry Management</Text>
        </View>
        {isAdmin ? (
          <Pressable
            onPress={() => { h.selection(); router.push("/moderation" as never); }}
            style={mgmtStyles.adminBtn}
          >
            <ShieldAlert color={palette.gold} size={18} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        style={mgmtStyles.scroll}
        contentContainerStyle={mgmtStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary */}
        <View style={mgmtStyles.summaryRow}>
          <View style={mgmtStyles.summaryItem}>
            <Text style={mgmtStyles.summaryValue}>{expandedEntries.length}</Text>
            <Text style={mgmtStyles.summaryLabel}>Total Entries</Text>
          </View>
          <View style={mgmtStyles.summaryItem}>
            <Text style={[mgmtStyles.summaryValue, { color: palette.cyan }]}>
              {expandedEntries.filter((e) => (e.entry.exchange_share_enabled ?? false)).length}
            </Text>
            <Text style={mgmtStyles.summaryLabel}>Exchange Shared</Text>
          </View>
          <View style={mgmtStyles.summaryItem}>
            <Text style={[mgmtStyles.summaryValue, { color: palette.violet }]}>
              {expandedEntries.filter((e) => e.sharedFactionIds.length > 0).length}
            </Text>
            <Text style={mgmtStyles.summaryLabel}>Faction Shared</Text>
          </View>
        </View>

        {/* Action message */}
        {actionMsg ? (
          <View style={[mgmtStyles.actionMsgBox, { borderColor: `${actionMsg.includes("Failed") || actionMsg.includes("error") ? palette.ember : palette.success}33` }]}>
            <Text style={[mgmtStyles.actionMsgText, { color: actionMsg.includes("Failed") || actionMsg.includes("error") ? palette.ember : palette.success }]}>
              {actionMsg}
            </Text>
          </View>
        ) : null}

        {/* Entries list */}
        {entriesQuery.isLoading ? (
          <ActivityIndicator color={palette.cyan} size="large" style={{ paddingVertical: 40 }} />
        ) : expandedEntries.length === 0 ? (
          <View style={mgmtStyles.emptyState}>
            <Activity color={palette.muted} size={32} />
            <Text style={mgmtStyles.emptyTitle}>No Intelligence Entries</Text>
            <Text style={mgmtStyles.emptyDesc}>
              Submit observations from the Open Intelligence screen to see them here.
            </Text>
          </View>
        ) : (
          <View style={mgmtStyles.entriesList}>
            {expandedEntries.map((data) => (
              <MyEntryCard
                key={data.entry.id}
                data={data}
                factions={factions}
                onEdit={handleEdit}
                onWithdraw={handleWithdraw}
                onRestore={handleRestore}
                onToggleExchange={handleToggleExchange}
                onToggleFaction={handleToggleFaction}
                onShowVersions={handleShowVersions}
                busy={busy}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      <EditEntryModal
        visible={editModalVisible}
        entry={editingEntry}
        onClose={() => setEditModalVisible(false)}
        onSaved={refreshAll}
      />

      {/* Version History Modal */}
      <VersionHistoryModal
        visible={versionModalVisible}
        entryId={versionEntryId}
        onClose={() => setVersionModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const mgmtStyles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  kicker: { color: palette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  title: { color: palette.text, fontSize: 18, fontWeight: "900", marginTop: 1 },
  adminBtn: {
    width: 40, height: 40, borderRadius: 5,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: `${palette.gold}33`,
    backgroundColor: `${palette.gold}0A`,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 10 },

  // Summary
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,20,38,0.45)",
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 2 },
  summaryValue: { fontSize: 22, fontWeight: "900", color: palette.text },
  summaryLabel: { fontSize: 9, fontWeight: "700", color: palette.muted, textTransform: "uppercase", letterSpacing: 0.5 },

  // Action message
  actionMsgBox: {
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  actionMsgText: { fontSize: 11, fontWeight: "800", textAlign: "center" },

  // Entries
  entriesList: { gap: 10 },
  entryCard: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,20,38,0.50)",
    padding: 12,
    gap: 8,
  },
  entryTopRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  entryContent: { color: palette.text, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  expandBtn: { alignSelf: "flex-start", paddingVertical: 2 },
  expandText: { color: palette.cyan, fontSize: 10, fontWeight: "800" },

  // Badges
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1,
  },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  warnBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1,
    backgroundColor: "rgba(255,77,109,0.06)",
  },
  warnText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  // Meta grid
  metaGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 6,
    paddingTop: 6, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)",
  },
  metaItem: { width: "48%", gap: 1 },
  metaLabel: { fontSize: 8, fontWeight: "700", color: palette.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 11, fontWeight: "800", color: palette.text },

  // Share pills
  shareRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  sharePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  sharePillText: { fontSize: 9, fontWeight: "800" },

  // Actions
  actionsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, borderWidth: 1,
    borderColor: palette.line, backgroundColor: "rgba(255,255,255,0.03)",
    minHeight: 32,
  },
  actionText: { fontSize: 10, fontWeight: "800" },

  // Sharing toggles
  sharingSection: {
    gap: 4, paddingTop: 8, marginTop: 4,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)",
  },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  toggleLabel: { flex: 1, color: palette.text, fontSize: 12, fontWeight: "800" },
  toggleSwitch: {
    width: 34, height: 18, borderRadius: 9,
    borderWidth: 1, borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
  },
  toggleKnob: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: palette.text,
    marginLeft: 2,
  },

  factionList: { paddingLeft: 20, gap: 2 },
  factionItem: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6, paddingHorizontal: 4,
  },
  factionName: { flex: 1, color: palette.text, fontSize: 11, fontWeight: "700" },

  // Empty state
  emptyState: { alignItems: "center", paddingVertical: 50, gap: 8 },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: "900" },
  emptyDesc: { color: palette.muted, fontSize: 12, fontWeight: "700", textAlign: "center", lineHeight: 18 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,4,10,0.80)" },
  modalSheet: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: "85%", minHeight: "50%", overflow: "hidden",
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 8 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  modalTitle: { color: palette.text, fontSize: 17, fontWeight: "900" },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  modalScroll: { flex: 1 },
  modalBody: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  sectionLabel: { color: palette.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase" },

  contentInput: {
    color: palette.text, fontSize: 13, fontWeight: "700",
    minHeight: 100, borderRadius: 5, padding: 12,
    borderWidth: 1, borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.50)",
  },
  charHint: { color: palette.muted, fontSize: 10, fontWeight: "700", textAlign: "right", marginTop: 4 },

  confidenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  confidenceChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, borderWidth: 1,
    borderColor: palette.line, backgroundColor: "rgba(255,255,255,0.03)",
  },
  confidenceText: { fontSize: 10, fontWeight: "800", color: palette.muted },

  noticeText: {
    color: palette.muted, fontSize: 10, fontWeight: "700",
    lineHeight: 15, marginTop: 10, padding: 8, borderRadius: 4,
    backgroundColor: "rgba(255,181,71,0.06)",
  },

  resultBox: { marginTop: 12, padding: 10, borderRadius: 5, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.03)" },
  resultText: { fontSize: 12, fontWeight: "800" },

  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 6, paddingVertical: 12, marginTop: 16,
    backgroundColor: palette.cyan,
  },
  submitBtnDisabled: { backgroundColor: "rgba(255,255,255,0.06)" },
  submitBtnText: { color: palette.void, fontSize: 14, fontWeight: "900" },

  // Version history
  versionItem: {
    borderRadius: 5, borderWidth: 1, borderColor: palette.line,
    backgroundColor: "rgba(10,20,38,0.45)", padding: 10, marginBottom: 8, gap: 4,
  },
  versionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  versionBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  versionBadgeText: { fontSize: 10, fontWeight: "900" },
  versionChangeType: { fontSize: 11, fontWeight: "800", color: palette.text, flex: 1 },
  versionDate: { fontSize: 10, fontWeight: "700", color: palette.muted },
  versionContent: { color: palette.text, fontSize: 11, fontWeight: "600", lineHeight: 16 },
  versionNoContent: { color: palette.muted, fontSize: 10, fontWeight: "700", fontStyle: "italic" },
  versionMetaRow: { flexDirection: "row", gap: 10 },
  versionMetaText: { fontSize: 9, fontWeight: "700", color: palette.muted },

  errorText: { color: palette.ember, fontSize: 12, fontWeight: "800", textAlign: "center", paddingVertical: 20 },
  emptyText: { color: palette.muted, fontSize: 12, fontWeight: "700", textAlign: "center", paddingVertical: 20 },

  pressed: { transform: [{ scale: 0.985 }], opacity: 0.88 },
});
