/**
 * EAGOH Sessions — premium mobile intelligence platform screen.
 * Compact session type cards with glass styling. Selected EAGOH card at top.
 *
 * Session types:
 *   Quick Check: 1-3 Edge (live OpenAI)
 *   Quick Analysis: 10-15 Edge
 *   Standard Analysis: 40-75 Edge
 *   Oracle Deep Dive: 150-300 Edge
 *   Premium Event Analysis: 75-150 Edge
 */

import { palette } from "@/constants/colors";
import { useHaptics } from "@/hooks/useHaptics";
import {
  Activity,
  ArrowLeft,
  Award,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Cpu,
  Eye,
  Flame,
  Globe,
  Hash,
  MessageSquare,
  Orbit,
  Plus,
  Save,
  Search,
  Send,
  Shield,
  Sparkles,
  Star,
  Swords,
  Tag,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useEdge } from "@/providers/EdgeProvider";
import { useEagohs } from "@/providers/EagohProvider";
import { INTELLIGENCE_DOMAINS, getDomainColor, normalizeDomainId } from "@/services/domains";
import { guardDomainRequest } from "@/services/domainGuard";
import { getQuickCheckCost, runQuickCheck, runQuickAnalytics, runStandardSession, runDeepDive, runPremiumEvent, getSessionCost, type AnalystSessionType, type AnalystRequestKind, type AnalystErrorCode } from "@/services/analyst";
import {
  createThread,
  addMessage,
  listMessages,
  listThreads,
  deleteThread,
  generateThreadTitle,
  type AnalystThread,
  type AnalystMessage,
  type ThreadWithMeta,
} from "@/services/analystThreads";
import type { EagohRecord } from "@/services/eagohs";
import type { EdgeReason } from "@/services/edge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ENTRY_TYPE_EDGE_COST,
  ENTRY_TYPE_LIMITS,
  getTagsForDomain,
  getAllTagsForDomain,
  computeQualityScore,
  influenceLabel,
  listEntriesForEagoh,
  submitEntry,
  type EntryType,
  type ConfidenceLevel,
  type OpenIntelligenceRow,
} from "@/services/openIntelligence";
import {
  canParticipateInFactions,
  getFactionLimit,
  getFactionFull,
  getMemberStatusColor,
  getMemberStatusLabel,
  getRoleLabel,
  listAllFactions,
  listUserFactions,
  listPendingInvites,
  type FactionRow,
  type FactionInviteRow,
  type MemberStatus,
} from "@/services/factions";
import {
  getUserRankings,
  type LeaderboardEntry,
} from "@/services/leaderboards";
import {
  getEagohReputationDisplay,
  rankColor as repRankColor,
  RANK_TIERS,
  BADGE_DEFINITIONS,
  type EagohReputationDisplay,
  type RankTier,
} from "@/services/reputation";

type SessionTone = "cyan" | "gold" | "violet" | "ember" | "success";

type SessionType = {
  id: string;
  name: string;
  description: string;
  costRange: string;
  minCost: number;
  maxCost: number;
  model: string;
  duration: string;
  tone: SessionTone;
  active: boolean;
};

const sessionTypes: SessionType[] = [
  { id: "quick-check", name: "Quick Check", description: "Rapid intelligence check", costRange: "1-3 Edge", minCost: 1, maxCost: 3, model: "Pulse-Lite", duration: "~2 min", tone: "cyan", active: true },
  { id: "quick-analysis", name: "Quick Analysis", description: "Tactical strategic read", costRange: "10-15 Edge", minCost: 10, maxCost: 15, model: "Tactic-Core", duration: "~5 min", tone: "gold", active: true },
  { id: "standard", name: "Standard Analysis", description: "Deep strategic assessment", costRange: "40-75 Edge", minCost: 40, maxCost: 75, model: "EAGOH Analyst", duration: "~8 min", tone: "success", active: true },
  { id: "oracle", name: "Oracle Deep Dive", description: "Elite predictive modeling", costRange: "150-300 Edge", minCost: 150, maxCost: 300, model: "Oracle-Synapse", duration: "~15 min", tone: "violet", active: true },
  { id: "premium-event", name: "Premium Event", description: "Event-focused intelligence", costRange: "75-150 Edge", minCost: 75, maxCost: 150, model: "Event-Lens Pro", duration: "~10 min", tone: "ember", active: true },
  { id: "open-intelligence", name: "Open Intelligence", description: "Feed observations to your EAGOH", costRange: "10-25 Edge", minCost: 10, maxCost: 25, model: "Open Intel", duration: "Per entry", tone: "gold", active: true },
  { id: "faction-network", name: "Faction Network", description: "Intelligence alliance network", costRange: "Free", minCost: 0, maxCost: 0, model: "Network View", duration: "Live", tone: "violet", active: true },
  { id: "my-rankings", name: "My Rankings", description: "Leaderboard positions & badges", costRange: "Free", minCost: 0, maxCost: 0, model: "Rankings View", duration: "Live", tone: "gold", active: true },
];

type ChatMessage = { id: string; sender: "user" | "analyst"; text: string; confidence?: number; cost?: number };

function toneColor(tone: SessionTone): string {
  if (tone === "gold") return palette.gold;
  if (tone === "violet") return palette.violet;
  if (tone === "ember") return palette.ember;
  if (tone === "success") return palette.success;
  return palette.cyan;
}

function toneBg(tone: SessionTone): string {
  if (tone === "gold") return "rgba(255,181,71,0.10)";
  if (tone === "violet") return "rgba(138,92,255,0.10)";
  if (tone === "ember") return "rgba(255,77,109,0.10)";
  if (tone === "success") return "rgba(0,255,178,0.10)";
  return "rgba(108,230,255,0.10)";
}

function detectQuickCheckKind(prompt: string): AnalystRequestKind {
  const lower = prompt.toLowerCase();
  if (/(vs\.?|against|matchup|face off|faceoff)/.test(lower)) return "matchup";
  if (/(player|starter|qb|guard|forward|striker|pitcher|rb|wr|confidence|fatigue)/.test(lower)) return "player_confidence";
  if (/(team|roster|lineup|squad|franchise|defense|offense)/.test(lower)) return "team_analysis";
  return "general";
}

function sessionIcon(id: string, color: string, size: number): React.ReactNode {
  if (id === "quick-check") return <Zap color={color} size={size} />;
  if (id === "oracle") return <Orbit color={color} size={size} />;
  if (id === "premium-event") return <Flame color={color} size={size} />;
  if (id === "open-intelligence") return <Eye color={color} size={size} />;
  if (id === "faction-network") return <Shield color={color} size={size} />;
  if (id === "my-rankings") return <Trophy color={color} size={size} />;
  return <BrainCircuit color={color} size={size} />;
}

// ── Compact glass session card (max 140px) ──
function SessionCard({
  session,
  onPress,
  disabled,
}: {
  session: SessionType;
  onPress: () => void;
  disabled: boolean;
}): JSX.Element {
  const accent = toneColor(session.tone);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.sessionCard,
        { borderColor: session.active ? `${accent}55` : palette.line, shadowColor: accent },
        disabled && styles.cardDisabled,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={[`${accent}14`, "rgba(8,15,26,0.85)", "rgba(6,11,20,0.92)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Left accent glow bar */}
      <View style={[styles.cardAccent, { backgroundColor: accent, shadowColor: accent }]} />
      {/* Icon */}
      <View style={[styles.cardIcon, { backgroundColor: toneBg(session.tone), borderColor: `${accent}44` }]}>
        {sessionIcon(session.id, accent, 22)}
      </View>
      {/* Body */}
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardName} numberOfLines={1}>{session.name}</Text>
          {session.active ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardDesc} numberOfLines={1}>{session.description}</Text>
        <View style={styles.cardMeta}>
          <Clock color={palette.muted} size={11} />
          <Text style={styles.cardMetaText}>{session.duration}</Text>
          <View style={[styles.costChip, { backgroundColor: toneBg(session.tone), borderColor: `${accent}33` }]}>
            <Zap color={accent} size={11} />
            <Text style={[styles.cardCost, { color: accent }]}>{session.costRange}</Text>
          </View>
        </View>
      </View>
      {/* Arrow */}
      <View style={styles.cardRight}>
        <View style={[styles.cardArrow, { borderColor: `${accent}33` }]}>
          <ChevronRight color={accent} size={16} />
        </View>
      </View>
    </Pressable>
  );
}

// ── Selected EAGOH card ──
function SelectedEagohCard({
  eagoh,
  onPress,
  hasMultiple,
  userTier,
}: {
  eagoh: EagohRecord | null;
  onPress: () => void;
  hasMultiple: boolean;
  userTier: string;
}): JSX.Element {
  const domain = eagoh ? INTELLIGENCE_DOMAINS.find((d) => d.id === eagoh.domain) : null;
  const domainTone = domain ? toneColor(domain.tone) : palette.cyan;
  const hero = eagoh?.image_url ?? eagoh?.image_thumb_url ?? null;
  const isActive = userTier !== "free";

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.eagohHero, { shadowColor: domainTone, borderColor: eagoh ? `${domainTone}55` : palette.lineStrong }, pressed && styles.pressed]}>
      {/* Featured image */}
      <View style={styles.eagohHeroImageWrap}>
        {hero ? (
          <Image source={{ uri: hero }} style={styles.eagohHeroImage} resizeMode="contain" />
        ) : (
          <View style={styles.eagohHeroPlaceholder}>
            <BrainCircuit color={eagoh ? domainTone : palette.muted} size={64} />
          </View>
        )}
        {/* atmospheric tint + bottom fade */}
        <LinearGradient
          colors={[`${domainTone}22`, "transparent", "rgba(5,9,16,0.96)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* top badges */}
        <View style={styles.eagohHeroTopRow}>
          <View style={[styles.eagohHeroDomainTag, { borderColor: `${domainTone}55`, backgroundColor: `${domainTone}1F` }]}>
            <Text style={[styles.eagohHeroDomainText, { color: domainTone }]} numberOfLines={1}>
              {eagoh ? (domain?.label ?? eagoh.domain ?? "No domain").toUpperCase() : "SELECT EAGOH"}
            </Text>
          </View>
          {eagoh ? (
            <View style={[styles.eagohHeroStatus, { borderColor: isActive ? "rgba(0,255,178,0.4)" : palette.line, backgroundColor: isActive ? "rgba(0,255,178,0.12)" : "rgba(255,255,255,0.04)" }]}>
              <View style={[styles.eagohStatusDot, { backgroundColor: isActive ? palette.success : palette.muted, shadowColor: isActive ? palette.success : "transparent" }]} />
              <Text style={[styles.eagohStatusText, { color: isActive ? palette.success : palette.muted }]}>
                {isActive ? "SHELL ACTIVE" : "DORMANT"}
              </Text>
            </View>
          ) : null}
        </View>
        {/* bottom name + change button */}
        <View style={styles.eagohHeroBottom}>
          <View style={styles.eagohHeroNameWrap}>
            <Text style={styles.eagohHeroLabel}>ACTIVE EAGOH</Text>
            <Text style={styles.eagohHeroName} numberOfLines={1}>
              {eagoh?.name || "No EAGOH selected"}
            </Text>
          </View>
          <View style={[styles.eagohChangeBtn, { borderColor: `${domainTone}55`, backgroundColor: `${domainTone}22` }]}>
            <Text style={[styles.eagohChangeText, { color: domainTone }]}>{hasMultiple ? "Change" : "Select"}</Text>
            <ChevronDown color={domainTone} size={13} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ── EAGOH picker dropdown ──
function EagohPicker({
  eagohs,
  selectedId,
  onSelect,
  onClose,
}: {
  eagohs: EagohRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <View style={styles.pickerOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.pickerSheet}>
        <LinearGradient colors={["rgba(14,24,37,0.98)", "rgba(8,15,26,0.98)"]} style={StyleSheet.absoluteFill} />
        <Text style={styles.pickerTitle}>Select EAGOH</Text>
        {eagohs.length === 0 ? (
          <Text style={styles.pickerEmpty}>No EAGOHs forged yet. Visit the Forge to create one.</Text>
        ) : (
          eagohs.map((eagoh) => {
            const domain = INTELLIGENCE_DOMAINS.find((d) => d.id === eagoh.domain);
            const dt = domain ? toneColor(domain.tone) : palette.muted;
            const isSelected = selectedId === eagoh.id;
            return (
              <Pressable
                key={eagoh.id}
                onPress={() => { onSelect(eagoh.id); onClose(); }}
                style={({ pressed }) => [
                  styles.pickerItem,
                  isSelected && { borderColor: palette.cyan, backgroundColor: "rgba(108,230,255,0.08)" },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.pickerDot, { backgroundColor: dt }]} />
                <View style={styles.pickerItemInfo}>
                  <Text style={styles.pickerItemName}>{eagoh.name || "Unnamed"}</Text>
                  <Text style={styles.pickerItemDomain}>{domain?.label ?? eagoh.domain ?? "No domain"}</Text>
                </View>
                {isSelected ? <Check color={palette.cyan} size={16} /> : null}
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

// ── Session setup ──
function SessionSetup({
  session,
  selectedEagohId,
  onBack,
  onStart,
  onChangeEagoh,
}: {
  session: SessionType;
  selectedEagohId: string;
  onBack: () => void;
  onStart: (eagohId: string, prompt: string) => void;
  onChangeEagoh: () => void;
}): JSX.Element {
  const h = useHaptics();
  const { eagohs } = useEagohs();
  const { profile } = useProfile();
  const [prompt, setPrompt] = useState<string>("");

  const selectedEagoh = useMemo(() => eagohs.find((e) => e.id === selectedEagohId), [eagohs, selectedEagohId]);
  const { effectiveSubscriptionTier: userTier } = useProfile();
  const domain = useMemo(() => INTELLIGENCE_DOMAINS.find((d) => d.id === selectedEagoh?.domain), [selectedEagoh]);

  const cost = prompt.trim() ? getSessionCost(session.id as AnalystSessionType, prompt) : session.minCost;
  const { total: edgeTotal } = useEdge();
  const canAfford = edgeTotal >= cost;
  const domainGuardResult = !prompt || !selectedEagoh?.domain ? null : guardDomainRequest(selectedEagoh.domain, prompt, true, selectedEagoh ? { id: selectedEagoh.id, name: selectedEagoh.name || "Unnamed" } : undefined);
  const isDomainMatch = !domainGuardResult || domainGuardResult.ok;

  const handleStart = useCallback((): void => {
    if (!selectedEagohId || !prompt.trim()) return;
    h.selection();
    onStart(selectedEagohId, prompt);
  }, [selectedEagohId, prompt, onStart, h]);

  return (
    <KeyboardAvoidingView
      style={styles.setupWrap}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {/* Back — fixed above scroll */}
      <Pressable onPress={onBack} style={styles.backBtn}>
        <ArrowLeft color={palette.muted} size={18} />
        <Text style={styles.backText}>Sessions</Text>
      </Pressable>

      {/* Scrollable content */}
      <ScrollView
        style={styles.setupScroll}
        contentContainerStyle={styles.setupScrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {/* EAGOH Hero Card */}
        <SelectedEagohCard
          eagoh={selectedEagoh ?? null}
          onPress={onChangeEagoh}
          hasMultiple={eagohs.length > 1}
          userTier={userTier}
        />

        {/* Session header */}
        <View style={styles.setupHeader}>
          <View style={[styles.setupIconRing, { borderColor: toneColor(session.tone) }]}>
            {sessionIcon(session.id, toneColor(session.tone), 28)}
          </View>
          <Text style={styles.setupTitle}>{session.name}</Text>
          <Text style={styles.setupSub}>{session.model} · {session.duration}</Text>
        </View>

        {/* Topic */}
        <View style={styles.setupBlock}>
          <Text style={styles.setupLabel}>Topic</Text>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="What intelligence do you need…"
            placeholderTextColor={palette.muted}
            multiline
            style={styles.setupInput}
            onFocus={() => { /* scroll handled by keyboardShouldPersistTaps */ }}
          />
        </View>

        {/* Domain check */}
        {selectedEagoh && domain ? (
          <View style={[styles.domainBanner, { borderColor: isDomainMatch ? "rgba(0,255,178,0.30)" : "rgba(255,107,53,0.30)", backgroundColor: isDomainMatch ? "rgba(0,255,178,0.06)" : "rgba(255,107,53,0.06)" }]}>
            <BrainCircuit color={isDomainMatch ? palette.success : palette.ember} size={14} />
            <View style={styles.domainBannerText}>
              <Text style={[styles.domainBannerTitle, { color: isDomainMatch ? palette.success : palette.ember }]}>{domain.label}</Text>
              <Text style={styles.domainBannerDesc}>
                {isDomainMatch ? "Within domain — ready." : (domainGuardResult && !domainGuardResult.ok ? domainGuardResult.rejectionMessage : "Domain mismatch.")}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Extra padding so bottom content isn't hidden behind footer */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Cost + Start — fixed below scroll, inside KAV */}
      <View style={styles.setupFooter}>
        <View style={styles.setupCostRow}>
          <Zap color={palette.gold} size={16} />
          <Text style={styles.setupCostLabel}>{cost} Edge</Text>
        </View>
        {!canAfford ? <Text style={styles.errorText}>Insufficient Edge.</Text> : null}
        <Pressable
          onPress={handleStart}
          disabled={!selectedEagohId || !prompt.trim() || !canAfford || !isDomainMatch}
          style={({ pressed }) => [
            styles.setupStartBtn,
            (!selectedEagohId || !prompt.trim() || !canAfford) && styles.disabledButton,
            pressed && styles.pressed,
          ]}
        >
          <Sparkles color={palette.void} size={14} />
          <Text style={styles.setupStartText}>Start Session</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Analyst Chat Thread (persistent, messenger-style) ──
function AnalystChatThread({
  threadId,
  eagoh,
  session,
  initialPrompt,
  onDone,
}: {
  threadId?: string;
  eagoh: EagohRecord;
  session: SessionType;
  initialPrompt?: string;
  onDone: () => void;
}): JSX.Element {
  const { profile } = useProfile();
  const { spend, total: edgeTotal } = useEdge();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(threadId ?? null);
  const [isInitialising, setIsInitialising] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialisedRef = useRef(false);

  // Load existing messages if reopening a thread
  useEffect(() => {
    if (!threadId || initialisedRef.current) return;
    initialisedRef.current = true;
    if (__DEV__) {
      console.log("[analyst-thread] routeThreadId:", threadId);
    }
    listMessages(threadId)
      .then((msgs) => {
        if (__DEV__) {
          console.log("[analyst-thread] messages load result:", msgs.length, "messages");
        }
        const chatMsgs: ChatMessage[] = msgs.map((m) => ({
          id: m.id,
          sender: m.role as "user" | "analyst",
          text: m.content,
          cost: m.edge_cost > 0 ? m.edge_cost : undefined,
        }));
        setMessages(chatMsgs);
        setIsInitialising(false);
      })
      .catch((err) => {
        if (__DEV__) {
          console.log("[analyst-thread] messages load error:", err?.message ?? err);
        }
        setLoadError("Failed to load thread messages. The thread may have been deleted or the database is unreachable.");
        setIsInitialising(false);
      });
  }, [threadId]);

  // Stable refs so the effect can safely retry when profile loads asynchronously
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const edgeTotalRef = useRef(edgeTotal);
  edgeTotalRef.current = edgeTotal;
  const eagohRef = useRef(eagoh);
  eagohRef.current = eagoh;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // 8-second timeout — never leave screen stuck indefinitely
  useEffect(() => {
    if (!isInitialising) return;
    timeoutRef.current = setTimeout(() => {
      if (__DEV__) {
        console.log("[analyst-thread] timeout after 8s — isInitialising still true");
      }
      setLoadError("Loading timed out. The server may be slow or unreachable.");
      setIsInitialising(false);
    }, 8000);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isInitialising]);

  // Send first message for new threads — retries when profile loads
  useEffect(() => {
    if (threadId || !initialPrompt || initialisedRef.current) return;
    if (!profile) return; // wait for profile to load — effect will re-run when profile changes
    initialisedRef.current = true;
    if (__DEV__) {
      console.log("[analyst-thread] starting new thread, profile ready, initialPrompt length:", initialPrompt.length);
    }
    sendInitialMessage(initialPrompt);
  }, [threadId, initialPrompt, profile]);

  const sendInitialMessage = useCallback(async (prompt: string): Promise<void> => {
    const currentProfile = profileRef.current;
    const currentEagoh = eagohRef.current;
    const currentSession = sessionRef.current;
    const currentEdgeTotal = edgeTotalRef.current;
    if (!currentProfile) {
      setLoadError("Profile not loaded. Please try again.");
      setIsInitialising(false);
      return;
    }
    setIsSending(true);
    setError(null);
    setLoadError(null);

    if (__DEV__) {
      console.log("[analyst-thread] selectedEagoh.name:", currentEagoh.name);
      console.log("[analyst-thread] selectedEagoh.domain:", currentEagoh.domain);
    }

    const title = generateThreadTitle(prompt);
    const eagohMeta = { id: currentEagoh.id, name: currentEagoh.name || "Unnamed", domain: currentEagoh.domain ?? "unknown" };

    // 1. Domain guard
    if (currentEagoh.domain) {
      const domainCheck = guardDomainRequest(currentEagoh.domain, prompt, true, { id: currentEagoh.id, name: currentEagoh.name || "Unnamed" });
      if (!domainCheck.ok) {
        setMessages((prev) => [...prev, { id: `error-${Date.now()}`, sender: "analyst", text: domainCheck.rejectionMessage }]);
        setIsSending(false);
        setIsInitialising(false);
        return;
      }
    }

    // 2. Compute cost
    const cost = getSessionCost(currentSession.id as AnalystSessionType, prompt);
    if (currentEdgeTotal < cost) {
      setError(`Insufficient Edge. Need ${cost} Edge (have ${currentEdgeTotal}).`);
      setIsSending(false);
      setIsInitialising(false);
      return;
    }

    // 3. Call analyst
    try {
      const kind = detectQuickCheckKind(prompt);
      let result;
      if (currentSession.id === "quick-check") {
        result = await runQuickCheck({ prompt, kind, personality: "tactical", context: [], eagohMeta });
      } else if (currentSession.id === "quick-analysis") {
        result = await runQuickAnalytics({ prompt, kind: "general", personality: "calm", context: [], eagohMeta });
      } else if (currentSession.id === "oracle") {
        result = await runDeepDive({ prompt, kind: "general", personality: "oracle", context: [], eagohMeta });
      } else if (currentSession.id === "premium-event") {
        result = await runPremiumEvent({ prompt, kind: "general", personality: "calm", context: [], eagohMeta });
      } else {
        result = await runStandardSession({ prompt, kind: "general", personality: "calm", context: [], eagohMeta });
      }

      if (!result.ok) {
        setError(result.error);
        setIsSending(false);
        setIsInitialising(false);
        return;
      }

      // 4. Deduct Edge
      const reasonMap: Record<string, EdgeReason> = {
        "quick-check": "quick_check",
        "quick-analysis": "quick_analysis",
        "standard": "standard_analysis",
        "oracle": "oracle_dive",
        "premium-event": "premium_event",
      };
      try {
        await spend(cost, reasonMap[currentSession.id] ?? "manual", `${currentSession.name} · ${cost} Edge`);
      } catch {
        setError("Edge deduction failed.");
        setIsSending(false);
        setIsInitialising(false);
        return;
      }

      // 5. Create thread in DB
      try {
        const thread = await createThread({
          userId: currentProfile.id,
          eagohId: currentEagoh.id,
          sessionType: currentSession.id as AnalystSessionType,
          title,
          domain: currentEagoh.domain ?? null,
        });
        if (__DEV__) {
          console.log("[analyst-thread] createdThreadId:", thread.id);
          console.log("[analyst-thread] thread load result: created new thread");
        }
        setCurrentThreadId(thread.id);

        const userMsg = await addMessage({ threadId: thread.id, userId: currentProfile.id, role: "user", content: prompt, edgeCost: cost });
        const assistantMsg = await addMessage({ threadId: thread.id, userId: currentProfile.id, role: "assistant", content: result.reply, edgeCost: 0 });

        setMessages([
          { id: userMsg.id, sender: "user", text: prompt, cost },
          { id: assistantMsg.id, sender: "analyst", text: result.reply, confidence: result.confidence },
        ]);
      } catch (dbErr: unknown) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        if (__DEV__) {
          console.log("[analyst-thread] Supabase error:", msg);
        }
        setError("Failed to save session. The database may be unreachable. Please try again.");
      }
    } catch (unexpectedErr: unknown) {
      const msg = unexpectedErr instanceof Error ? unexpectedErr.message : String(unexpectedErr);
      if (__DEV__) {
        console.log("[analyst-thread] unexpected error in sendInitialMessage:", msg);
      }
      setError(`Session failed: ${msg}`);
    }

    setIsSending(false);
    setIsInitialising(false);
  }, [spend]);

  // Send follow-up message
  const handleSend = useCallback(async (): Promise<void> => {
    const text = inputText.trim();
    if (!text || !profile || !currentThreadId) return;
    Keyboard.dismiss();
    setInputText("");
    setIsSending(true);
    setError(null);

    const eagohMeta = { id: eagoh.id, name: eagoh.name || "Unnamed", domain: eagoh.domain ?? "unknown" };
    const cost = getSessionCost(session.id as AnalystSessionType, text);

    // Domain guard
    if (eagoh.domain) {
      const domainCheck = guardDomainRequest(eagoh.domain, text, true, { id: eagoh.id, name: eagoh.name || "Unnamed" });
      if (!domainCheck.ok) {
        setMessages((prev) => [...prev, { id: `u-${Date.now()}`, sender: "user", text, cost }, { id: `domain-${Date.now()}`, sender: "analyst", text: domainCheck.rejectionMessage }]);
        setIsSending(false);
        return;
      }
    }

    // Edge check
    if (edgeTotal < cost) {
      setError(`Insufficient Edge. Need ${cost} Edge (have ${edgeTotal}).`);
      setInputText(text);
      setIsSending(false);
      return;
    }

    // Build context from last 10 messages
    const context = messages.slice(-10).map((m) => `${m.sender === "user" ? "User" : "EAGOH"}: ${m.text}`);

    // Call analyst
    const kind = detectQuickCheckKind(text);
    let result;
    if (session.id === "quick-check") {
      result = await runQuickCheck({ prompt: text, kind, personality: "tactical", context, eagohMeta });
    } else if (session.id === "quick-analysis") {
      result = await runQuickAnalytics({ prompt: text, kind: "general", personality: "calm", context, eagohMeta });
    } else if (session.id === "oracle") {
      result = await runDeepDive({ prompt: text, kind: "general", personality: "oracle", context, eagohMeta });
    } else if (session.id === "premium-event") {
      result = await runPremiumEvent({ prompt: text, kind: "general", personality: "calm", context, eagohMeta });
    } else {
      result = await runStandardSession({ prompt: text, kind: "general", personality: "calm", context, eagohMeta });
    }

    if (!result.ok) {
      // Don't deduct Edge on failure
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, sender: "user", text, cost }]);
      setError(result.error);
      setIsSending(false);
      return;
    }

    // Deduct Edge
    const reasonMap: Record<string, EdgeReason> = {
      "quick-check": "quick_check",
      "quick-analysis": "quick_analysis",
      "standard": "standard_analysis",
      "oracle": "oracle_dive",
      "premium-event": "premium_event",
    };
    try {
      await spend(cost, reasonMap[session.id] ?? "manual", `${session.name} follow-up · ${cost} Edge`);
    } catch {
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, sender: "user", text, cost }]);
      setError("Edge deduction failed.");
      setIsSending(false);
      return;
    }

    // Save to DB
    try {
      const userMsg = await addMessage({ threadId: currentThreadId, userId: profile.id, role: "user", content: text, edgeCost: cost });
      const assistantMsg = await addMessage({ threadId: currentThreadId, userId: profile.id, role: "assistant", content: result.reply, edgeCost: 0 });

      setMessages((prev) => [
        ...prev,
        { id: userMsg.id, sender: "user", text, cost },
        { id: assistantMsg.id, sender: "analyst", text: result.reply, confidence: result.confidence },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, sender: "user", text, cost },
        { id: `a-${Date.now()}`, sender: "analyst", text: result.reply, confidence: result.confidence },
      ]);
      setError("Could not save to history.");
    }

    setIsSending(false);
  }, [inputText, profile, currentThreadId, messages, eagoh, session, edgeTotal, spend]);

  // Scroll on new messages
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const canSend = inputText.trim().length > 0 && !isSending;
  const estCost = inputText.trim() ? getSessionCost(session.id as AnalystSessionType, inputText) : 0;
  const canAfford = edgeTotal >= estCost || estCost === 0;

  if (isInitialising) {
    return (
      <View style={styles.chatWrap}>
        <Pressable onPress={onDone} style={styles.backBtn}>
          <ArrowLeft color={palette.muted} size={18} />
          <Text style={styles.backText}>Sessions</Text>
        </Pressable>
        <View style={styles.threadLoading}>
          <ActivityIndicator color={palette.cyan} />
          <Text style={styles.threadLoadingText}>Loading thread…</Text>
        </View>
      </View>
    );
  }

  // Error state (timeout, Supabase failure, etc.) with retry + back
  if (loadError) {
    return (
      <View style={styles.chatWrap}>
        <Pressable onPress={onDone} style={styles.backBtn}>
          <ArrowLeft color={palette.muted} size={18} />
          <Text style={styles.backText}>Sessions</Text>
        </Pressable>
        <View style={styles.threadErrorWrap}>
          <View style={styles.threadErrorIcon}>
            <Cpu color={palette.ember} size={32} />
          </View>
          <Text style={styles.threadErrorTitle}>Thread Error</Text>
          <Text style={styles.threadErrorText}>{loadError}</Text>
          <View style={styles.threadErrorButtons}>
            <Pressable
              onPress={() => {
                setLoadError(null);
                setIsInitialising(true);
                initialisedRef.current = false;
              }}
              style={({ pressed }) => [
                styles.threadErrorRetryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Sparkles color={palette.void} size={14} />
              <Text style={styles.threadErrorRetryText}>Retry</Text>
            </Pressable>
            <Pressable
              onPress={onDone}
              style={({ pressed }) => [
                styles.threadErrorBackBtn,
                pressed && styles.pressed,
              ]}
            >
              <ArrowLeft color={palette.muted} size={14} />
              <Text style={styles.threadErrorBackText}>Back</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.chatWrap}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {/* Back button */}
      <Pressable onPress={onDone} style={styles.backBtn}>
        <ArrowLeft color={palette.muted} size={18} />
        <Text style={styles.backText}>Sessions</Text>
      </Pressable>

      {/* Header */}
      <View style={styles.chatHeader}>
        <BrainCircuit color={toneColor(session.tone)} size={20} />
        <View style={{ flex: 1 }}>
          <Text style={styles.chatName} numberOfLines={1}>{eagoh.name}</Text>
          <Text style={styles.chatType}>{session.name} · {session.model}</Text>
        </View>
        <View style={[styles.threadBadge, { backgroundColor: toneBg(session.tone), borderColor: `${toneColor(session.tone)}44` }]}>
          <Text style={[styles.threadBadgeText, { color: toneColor(session.tone) }]}>{session.id === "quick-check" ? "QC" : session.id === "quick-analysis" ? "QA" : session.id === "oracle" ? "ODD" : session.id === "premium-event" ? "PE" : "SA"}</Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatMsgs}
        contentContainerStyle={styles.chatMsgsContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {messages.map((msg) => (
          <View key={msg.id} style={[styles.msgBubble, msg.sender === "analyst" ? styles.msgAnalyst : styles.msgUser]}>
            <Text style={msg.sender === "analyst" ? styles.msgAnalystText : styles.msgUserText}>{msg.text}</Text>
            {msg.confidence ? <Text style={styles.msgMeta}>Confidence {msg.confidence}%</Text> : null}
            {msg.cost ? <Text style={styles.msgCost}>{msg.cost} Edge</Text> : null}
          </View>
        ))}
        {isSending ? (
          <View style={styles.typing}>
            <View style={styles.typingDots}>
              <View style={[styles.dot, { backgroundColor: palette.cyan }]} />
              <View style={[styles.dot, styles.dotMid, { backgroundColor: palette.cyan }]} />
              <View style={[styles.dot, { backgroundColor: palette.cyan }]} />
            </View>
            <Text style={styles.typingText}>Processing…</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Input composer */}
      <View style={styles.composer}>
        {estCost > 0 ? (
          <View style={styles.composerCostRow}>
            <Zap color={canAfford ? palette.gold : palette.ember} size={12} />
            <Text style={[styles.composerCostText, !canAfford && { color: palette.ember }]}>
              {estCost} Edge{!canAfford ? " (insufficient)" : ""}
            </Text>
          </View>
        ) : null}
        <View style={styles.composerRow}>
          <TextInput
            ref={inputRef}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask a follow-up question…"
            placeholderTextColor={palette.muted}
            multiline
            style={styles.composerInput}
            editable={!isSending}
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend || !canAfford}
            style={({ pressed }) => [
              styles.composerSend,
              (canSend && canAfford) ? { backgroundColor: toneColor(session.tone) } : { backgroundColor: "rgba(255,255,255,0.08)" },
              pressed && styles.pressed,
            ]}
          >
            <Send color={canSend && canAfford ? palette.void : palette.muted} size={16} />
          </Pressable>
        </View>
        {!canAfford && inputText.trim() ? (
          <Text style={styles.composerEdgeHint}>Insufficient Edge — visit Edge Store</Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Open Intelligence Session ──
function OpenIntelSession({
  selectedEagohId,
  onBack,
  onChangeEagoh,
}: {
  selectedEagohId: string;
  onBack: () => void;
  onChangeEagoh: () => void;
}): JSX.Element {
  const h = useHaptics();
  const { eagohs } = useEagohs();
  const { profile } = useProfile();
  const { balances } = useEdge();
  const queryClient = useQueryClient();

  const [entryType, setEntryType] = useState<EntryType>("quick_observation");
  const [content, setContent] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [customTag, setCustomTag] = useState<string>("");
  const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>("moderate_confidence");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);
  const [openTagCat, setOpenTagCat] = useState<string | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const contentInputRef = useRef<TextInput | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollYRef = useRef<number>(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const selectedEagoh = useMemo(() => eagohs.find((e) => e.id === selectedEagohId), [eagohs, selectedEagohId]);
  const { effectiveSubscriptionTier: userTier } = useProfile();
  const rawDomain = selectedEagoh?.domain?.trim() || "sports";
  const currentDomain = normalizeDomainId(rawDomain);
  const domain = useMemo(() => INTELLIGENCE_DOMAINS.find((d) => d.id === currentDomain), [currentDomain]);
  const domainTone = domain ? toneColor(domain.tone) : palette.cyan;

  // Domain-aware tags — reload when EAGOH domain changes
  const domainTags = useMemo(() => getTagsForDomain(currentDomain), [currentDomain]);
  const domainAllTags = useMemo(() => getAllTagsForDomain(currentDomain), [currentDomain]);

  // Reset tag selections when the selected EAGOH changes
  useEffect(() => {
    setSelectedTag("");
    setCustomTag("");
    setOpenTagCat(null);
  }, [selectedEagohId]);

  const limit = ENTRY_TYPE_LIMITS[entryType];
  const edgeCost = ENTRY_TYPE_EDGE_COST[entryType];
  const charCountNoSpaces = content.trim().replace(/\s/g, "").length;
  const canSubmit = !!selectedEagohId && content.trim().length > 0 && charCountNoSpaces <= limit && balances.total >= edgeCost && !isSubmitting;

  const handleContentFocus = useCallback((): void => {
    setTimeout(() => {
      contentInputRef.current?.measureInWindow((_x, inputY, _w, inputHeight) => {
        const inputBottom = inputY + inputHeight;
        const safeBottom = windowHeight - keyboardHeight - 20;
        if (inputBottom > safeBottom) {
          scrollViewRef.current?.scrollTo({ y: scrollYRef.current + (inputBottom - safeBottom) + 12, animated: true });
        }
      });
    }, 180);
  }, [keyboardHeight, windowHeight]);

  const feedQuery = useQuery<OpenIntelligenceRow[]>({
    queryKey: ["oi", "feed", selectedEagohId],
    enabled: !!selectedEagohId,
    queryFn: () => listEntriesForEagoh(selectedEagohId, 20),
  });

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!selectedEagohId || !profile || !content.trim()) return;
    h.success();
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const result = await submitEntry({
      userId: profile.id,
      profile,
      eagohId: selectedEagohId,
      intelligenceDomain: selectedEagoh?.domain ?? "unknown",
      entryType,
      tag: selectedTag || "general",
      content: content.trim(),
      confidenceLevel,
    });

    if (result.ok) {
      setContent("");
      setSelectedTag("");
      setCustomTag("");
      setSubmitSuccess(`Entry saved. ${result.edgeCost} Edge deducted.`);
      queryClient.invalidateQueries({ queryKey: ["oi", "feed", selectedEagohId] });
    } else {
      setSubmitError(result.error ?? "Submit failed.");
    }
    setIsSubmitting(false);
  }, [selectedEagohId, profile, content, selectedEagoh, entryType, selectedTag, confidenceLevel, queryClient]);

  const toggleTagCat = useCallback((id: string): void => {
    setOpenTagCat((prev) => prev === id ? null : id);
  }, []);

  const score = useMemo(() => {
    if (!content.trim()) return null;
    return computeQualityScore({ content: content.trim(), entryType, confidenceLevel, tag: selectedTag });
  }, [content, entryType, confidenceLevel, selectedTag]);

  const infLabel = score ? influenceLabel(score.influenceScore) : "";
  const infColor = infLabel === "high" ? palette.success : infLabel === "medium" ? palette.gold : palette.muted;

  return (
    <KeyboardAvoidingView
      style={styles.setupWrap}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <Pressable onPress={onBack} style={styles.backBtn}>
        <ArrowLeft color={palette.muted} size={18} />
        <Text style={styles.backText}>Sessions</Text>
      </Pressable>

      <ScrollView
        ref={scrollViewRef}
        style={styles.setupScroll}
        contentContainerStyle={[styles.setupScrollContent, { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 40 : 80 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        {/* EAGOH Hero Card */}
        <SelectedEagohCard
          eagoh={selectedEagoh ?? null}
          onPress={onChangeEagoh}
          hasMultiple={eagohs.length > 1}
          userTier={userTier}
        />

        {/* Open Intelligence header */}
        <View style={styles.oiHeader}>
          <View style={[styles.setupIconRing, { borderColor: palette.gold }]}>
            <Eye color={palette.gold} size={28} />
          </View>
          <Text style={styles.setupTitle}>Open Intelligence</Text>
          <Text style={styles.oiSub}>Feed observations to your EAGOH</Text>
        </View>

        {/* Domain banner */}
        {selectedEagoh && domain ? (
          <View style={[styles.oiDomainBanner, { borderColor: `${domainTone}33`, backgroundColor: `${domainTone}0A` }]}>
            <BrainCircuit color={domainTone} size={14} />
            <View>
              <Text style={[styles.oiDomainTitle, { color: domainTone }]}>{domain.label}</Text>
              <Text style={styles.oiDomainDesc}>Entries are locked to this EAGOH's intelligence domain.</Text>
            </View>
          </View>
        ) : null}

        {/* Entry Type */}
        <View style={styles.oiBlock}>
          <Text style={styles.oiLabel}>ENTRY TYPE</Text>
          <View style={styles.oiEntryList}>
            {([
              { id: "quick_observation" as EntryType, label: "Quick", detail: "110 chars", tone: "cyan" as SessionTone },
              { id: "basic_deep_entry" as EntryType, label: "Basic Deep", detail: "200 chars", tone: "gold" as SessionTone },
              { id: "advanced_deep_entry" as EntryType, label: "Advanced", detail: "400 chars", tone: "violet" as SessionTone },
            ]).map((et) => {
              const isSel = entryType === et.id;
              const ac = toneColor(et.tone);
              return (
                <Pressable
                  key={et.id}
                  onPress={() => setEntryType(et.id)}
                  style={({ pressed }) => [
                    styles.oiEntryCard,
                    isSel && { borderColor: ac, backgroundColor: `${ac}12` },
                    pressed && styles.pressed,
                  ]}
                >
                  <Zap color={isSel ? ac : palette.muted} size={14} />
                  <Text style={[styles.oiEntryLabel, isSel && { color: ac }]}>{et.label}</Text>
                  <Text style={styles.oiEntryDetail}>{et.detail}</Text>
                  <Text style={[styles.oiEntryCost, { color: ac }]}>{ENTRY_TYPE_EDGE_COST[et.id]}E</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Content Input */}
        <View style={styles.oiBlock}>
          <Text style={styles.oiLabel}>OBSERVATION</Text>
          <TextInput
            ref={contentInputRef}
            value={content}
            onChangeText={(v) => setContent(v.slice(0, limit * 2))}
            onFocus={handleContentFocus}
            placeholder={`What did you observe? Max ${limit} chars excl. spaces…`}
            placeholderTextColor={palette.muted}
            multiline
            style={styles.oiInput}
            textAlignVertical="top"
          />
          <View style={styles.oiCharRow}>
            <Text style={styles.oiCharHint}>
              {entryType === "quick_observation" ? "Quick Observation" : entryType === "basic_deep_entry" ? "Basic Deep Entry" : "Advanced Deep Entry"}
            </Text>
            <Text style={[styles.oiCharCount, charCountNoSpaces > limit && { color: palette.ember }]}>
              {charCountNoSpaces}/{limit} chars
            </Text>
          </View>
        </View>

        {/* Tag Selection */}
        <View style={styles.oiBlock}>
          <Text style={styles.oiLabel}>TAG</Text>
          <View style={styles.oiTagList}>
            {domainTags.map((cat) => {
              const isOpen = openTagCat === cat.id;
              return (
                <View key={cat.id}>
                  <Pressable
                    onPress={() => toggleTagCat(cat.id)}
                    style={({ pressed }) => [styles.oiTagCat, pressed && styles.pressed]}
                  >
                    <Text style={styles.oiTagCatLabel}>{cat.label}</Text>
                    {isOpen ? <ChevronUp color={palette.muted} size={14} /> : <ChevronDown color={palette.muted} size={14} />}
                  </Pressable>
                  {isOpen ? (
                    <View style={styles.oiTagGrid}>
                      {cat.tags.map((tag) => {
                        const isTagSelected = selectedTag === tag.id;
                        return (
                          <Pressable
                            key={tag.id}
                            onPress={() => setSelectedTag(isTagSelected ? "" : tag.id)}
                            style={({ pressed }) => [
                              styles.oiTagChip,
                              isTagSelected && { borderColor: palette.cyan, backgroundColor: "rgba(108,230,255,0.12)" },
                              pressed && styles.pressed,
                            ]}
                          >
                            <Hash color={isTagSelected ? palette.cyan : palette.muted} size={10} />
                            <Text style={[styles.oiTagChipText, isTagSelected && { color: palette.cyan }]}>{tag.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {/* Custom tag */}
            <View>
              <Pressable
                onPress={() => {
                  if (openTagCat === "custom") { setOpenTagCat(null); setCustomTag(""); return; }
                  setOpenTagCat("custom");
                }}
                style={({ pressed }) => [styles.oiTagCat, pressed && styles.pressed]}
              >
                <Text style={[styles.oiTagCatLabel, { color: palette.gold }]}>Custom Tag</Text>
                <Plus color={palette.gold} size={14} />
              </Pressable>
              {openTagCat === "custom" ? (
                <View style={styles.oiCustomWrap}>
                  <TextInput
                    value={customTag}
                    onChangeText={(v) => {
                      const t = v.slice(0, 30);
                      setCustomTag(t);
                      setSelectedTag(t.trim() ? `custom:${t.trim()}` : "");
                    }}
                    placeholder="Enter custom tag…"
                    placeholderTextColor={palette.muted}
                    maxLength={30}
                    style={styles.oiCustomInput}
                  />
                  {customTag.trim() ? (
                    <View style={styles.oiCustomActive}>
                      <Tag color={palette.gold} size={12} />
                      <Text style={styles.oiCustomActiveText}>{customTag.trim()}</Text>
                      <Pressable onPress={() => { setCustomTag(""); setSelectedTag(""); }}>
                        <X color={palette.muted} size={14} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Confidence Level */}
        <View style={styles.oiBlock}>
          <Text style={styles.oiLabel}>CONFIDENCE</Text>
          <View style={styles.oiConfRow}>
            {([
              { id: "weak_suspicion" as ConfidenceLevel, label: "Weak" },
              { id: "moderate_confidence" as ConfidenceLevel, label: "Moderate" },
              { id: "strong_confidence" as ConfidenceLevel, label: "Strong" },
              { id: "verified_observation" as ConfidenceLevel, label: "Verified" },
            ]).map((level) => {
              const isSel = confidenceLevel === level.id;
              return (
                <Pressable
                  key={level.id}
                  onPress={() => setConfidenceLevel(level.id)}
                  style={({ pressed }) => [
                    styles.oiConfChip,
                    isSel && { borderColor: palette.cyan, backgroundColor: "rgba(108,230,255,0.10)" },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.oiConfDot, { backgroundColor: isSel ? palette.cyan : "rgba(255,255,255,0.18)" }]} />
                  <Text style={[styles.oiConfText, isSel && { color: palette.cyan }]}>{level.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Quality Score Preview */}
        <View style={styles.oiBlock}>
          <Text style={styles.oiLabel}>QUALITY PREVIEW</Text>
          <View style={styles.oiScorePanel}>
            {score ? (
              <>
                <View style={styles.oiScoreRow}>
                  <View style={styles.oiScoreItem}>
                    <Text style={styles.oiScoreLabel}>Quality</Text>
                    <View style={styles.oiProgressTrack}>
                      <View style={[styles.oiProgressFill, { width: `${score.qualityScore}%`, backgroundColor: palette.cyan }]} />
                    </View>
                    <Text style={[styles.oiScoreValue, { color: palette.cyan }]}>{score.qualityScore}</Text>
                  </View>
                  <View style={styles.oiScoreItem}>
                    <Text style={styles.oiScoreLabel}>Influence</Text>
                    <View style={styles.oiProgressTrack}>
                      <View style={[styles.oiProgressFill, { width: `${score.influenceScore}%`, backgroundColor: infColor }]} />
                    </View>
                    <Text style={[styles.oiScoreValue, { color: infColor }]}>{infLabel}</Text>
                  </View>
                </View>
                <View style={styles.oiScoreMeta}>
                  <Eye color={palette.muted} size={11} />
                  <Text style={styles.oiScoreMetaText}>Validation: Pending Review</Text>
                </View>
              </>
            ) : (
              <View style={styles.oiScoreEmpty}>
                <BarChart3 color={palette.muted} size={14} />
                <Text style={styles.oiScoreEmptyText}>Enter intelligence to see quality preview.</Text>
              </View>
            )}
          </View>
        </View>

        {/* Submit */}
        <View style={styles.oiSubmit}>
          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
          {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}
          <View style={styles.oiSubmitRow}>
            <View style={styles.oiSubmitCost}>
              <Zap color={balances.total >= edgeCost ? palette.gold : palette.ember} size={16} />
              <Text style={[styles.oiSubmitCostText, balances.total < edgeCost && { color: palette.ember }]}>
                {edgeCost} Edge
              </Text>
            </View>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.oiSubmitBtn,
                !canSubmit && styles.disabledButton,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={canSubmit ? [palette.cyan, "rgba(61,165,255,0.85)"] : ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.04)"]}
                style={StyleSheet.absoluteFill}
              />
              {isSubmitting ? (
                <ActivityIndicator color={palette.void} />
              ) : (
                <>
                  <Sparkles color={canSubmit ? palette.void : palette.muted} size={16} />
                  <Text style={[styles.oiSubmitBtnText, !canSubmit && { color: palette.muted }]}>Submit Entry</Text>
                </>
              )}
            </Pressable>
          </View>
          {balances.total < edgeCost ? (
            <Text style={styles.insufficientEdge}>
              Insufficient Edge. Need {edgeCost} Edge (have {balances.total}).
            </Text>
          ) : null}
        </View>

        {/* Learning Feed */}
        <View style={styles.oiFeed}>
          <View style={styles.oiFeedHeader}>
            <Activity color={palette.cyan} size={14} />
            <Text style={styles.oiFeedTitle}>Learning Feed</Text>
            <Text style={styles.oiFeedCount}>{feedQuery.data?.length ?? 0} entries</Text>
          </View>
          {feedQuery.isLoading ? (
            <ActivityIndicator color={palette.cyan} style={styles.oiFeedLoader} />
          ) : feedQuery.data && feedQuery.data.length > 0 ? (
            feedQuery.data.map((entry) => {
              const tagLabel = domainAllTags.find((t) => t.id === entry.tag)?.label ?? entry.tag.replace("custom:", "");
              const eInfLabel = influenceLabel(entry.influence_score);
              const eInfColor = eInfLabel === "high" ? palette.success : eInfLabel === "medium" ? palette.gold : palette.muted;
              const eTypeLabel = entry.entry_type === "quick_observation" ? "Quick" : entry.entry_type === "basic_deep_entry" ? "Basic" : "Advanced";
              return (
                <View key={entry.id} style={styles.oiFeedCard}>
                  <View style={styles.oiFeedTop}>
                    <View style={styles.oiFeedBadge}>
                      <Hash color={palette.cyan} size={10} />
                      <Text style={styles.oiFeedBadgeText}>{tagLabel}</Text>
                    </View>
                    <View style={styles.oiFeedMeta}>
                      <Text style={styles.oiFeedType}>{eTypeLabel}</Text>
                      <Text style={styles.oiFeedDot}>·</Text>
                      <Clock color={palette.muted} size={10} />
                      <Text style={styles.oiFeedTime}>{new Date(entry.created_at).toLocaleDateString()}</Text>
                    </View>
                  </View>
                  <Text style={styles.oiFeedContent} numberOfLines={3}>{entry.content}</Text>
                  <View style={styles.oiFeedScores}>
                    <View style={styles.oiFeedScoreItem}>
                      <Text style={styles.oiFeedScoreLabel}>Quality</Text>
                      <Text style={[styles.oiFeedScoreVal, { color: palette.cyan }]}>{entry.quality_score}</Text>
                    </View>
                    <View style={styles.oiFeedScoreDivider} />
                    <View style={styles.oiFeedScoreItem}>
                      <Text style={styles.oiFeedScoreLabel}>Influence</Text>
                      <Text style={[styles.oiFeedScoreVal, { color: eInfColor }]}>{eInfLabel}</Text>
                    </View>
                    <View style={styles.oiFeedScoreDivider} />
                    <View style={styles.oiFeedScoreItem}>
                      <Text style={styles.oiFeedScoreLabel}>Status</Text>
                      <Text style={[styles.oiFeedScoreVal, { color: palette.muted }]}>Pending</Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.oiFeedEmpty}>
              {selectedEagoh ? `No entries for ${selectedEagoh.name} yet. Submit your first observation above.` : "Select an EAGOH and submit an entry to populate the feed."}
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Faction Network Session ──
function FactionNetworkSession({
  selectedEagohId,
  onBack,
  onChangeEagoh,
}: {
  selectedEagohId: string;
  onBack: () => void;
  onChangeEagoh: () => void;
}): JSX.Element {
  const { eagohs } = useEagohs();
  const { profile } = useProfile();
  const { effectiveSubscriptionTier: tier } = useProfile();
  const canParticipate = canParticipateInFactions(tier);

  const selectedEagoh = useMemo(() => eagohs.find((e) => e.id === selectedEagohId), [eagohs, selectedEagohId]);
  const { effectiveSubscriptionTier: userTier } = useProfile();
  const domain = useMemo(() => INTELLIGENCE_DOMAINS.find((d) => d.id === selectedEagoh?.domain), [selectedEagoh]);
  const domainTone = domain ? toneColor(domain.tone) : palette.cyan;

  const userFactionsQuery = useQuery<FactionRow[]>({
    queryKey: ["factions", "user", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => profile?.id ? listUserFactions(profile.id) : Promise.resolve([]),
  });

  const allFactionsQuery = useQuery<FactionRow[]>({
    queryKey: ["factions", "all"],
    enabled: true,
    queryFn: () => listAllFactions(),
  });

  const invitesQuery = useQuery<FactionInviteRow[]>({
    queryKey: ["factions", "invites", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => profile?.id ? listPendingInvites(profile.id) : Promise.resolve([]),
  });

  const userFactions = userFactionsQuery.data ?? [];
  const allFactions = allFactionsQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const userFactionIds = new Set(userFactions.map((f) => f.id));
  const discoverable = allFactions.filter((f) => !userFactionIds.has(f.id));

  const limits = getFactionLimit(tier);

  return (
    <KeyboardAvoidingView
      style={styles.setupWrap}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <Pressable onPress={onBack} style={styles.backBtn}>
        <ArrowLeft color={palette.muted} size={18} />
        <Text style={styles.backText}>Sessions</Text>
      </Pressable>

      <ScrollView
        style={styles.setupScroll}
        contentContainerStyle={styles.setupScrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {/* EAGOH Hero Card */}
        <SelectedEagohCard
          eagoh={selectedEagoh ?? null}
          onPress={onChangeEagoh}
          hasMultiple={eagohs.length > 1}
          userTier={userTier}
        />

        {/* Faction Network header */}
        <View style={styles.oiHeader}>
          <View style={[styles.setupIconRing, { borderColor: palette.violet }]}>
            <Shield color={palette.violet} size={28} />
          </View>
          <Text style={styles.setupTitle}>Faction Network</Text>
          <Text style={styles.oiSub}>
            {canParticipate
              ? `${tier.replace("_", " ")} tier · ${limits.maxFactions} Faction${limits.maxFactions !== 1 ? "s" : ""}, ${limits.includedSlots} slots`
              : "Upgrade to Pro, Oracle Elite, or Syndicate to join Factions."}
          </Text>
        </View>

        {/* My Factions */}
        {userFactions.length > 0 ? (
          <View style={styles.oiBlock}>
            <Text style={styles.oiLabel}>MY FACTIONS</Text>
            <View style={styles.fnFactionList}>
              {userFactions.map((faction) => {
                const facColor = getDomainColor(faction.intelligence_domain);
                return (
                  <View key={faction.id} style={[styles.fnFactionCard, { borderColor: `${facColor}33`, backgroundColor: `${facColor}0A` }]}>
                    <View style={[styles.fnEmblem, { borderColor: facColor, backgroundColor: `${facColor}18` }]}>
                      <Text style={[styles.fnEmblemText, { color: facColor }]}>
                        {(faction.emblem ?? faction.name.slice(0, 2)).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.fnFactionInfo}>
                      <Text style={styles.fnFactionName} numberOfLines={1}>{faction.name}</Text>
                      {faction.motto ? (
                        <Text style={styles.fnFactionMotto} numberOfLines={1}>{faction.motto}</Text>
                      ) : null}
                      <View style={styles.fnFactionMeta}>
                        <Users color={palette.muted} size={10} />
                        <Text style={styles.fnFactionMetaText}>{faction.current_members}/{faction.max_members}</Text>
                        <View style={[styles.fnDomainBadge, { backgroundColor: `${facColor}18`, borderColor: `${facColor}33` }]}>
                          <Text style={[styles.fnDomainBadgeText, { color: facColor }]}>
                            {INTELLIGENCE_DOMAINS.find((d) => d.id === faction.intelligence_domain)?.label ?? faction.intelligence_domain}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.fnFactionScore}>
                      <Text style={[styles.fnFactionScoreValue, { color: facColor }]}>{faction.influence_score}</Text>
                      <Text style={styles.fnFactionScoreLabel}>Inf.</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.fnEmptyBanner}>
            <Globe color={palette.muted} size={18} />
            <Text style={styles.fnEmptyText}>
              {canParticipate
                ? "You haven't joined any Factions yet. Browse discoverable Factions below."
                : "Faction creation and membership require a paid subscription."}
            </Text>
          </View>
        )}

        {/* Invites */}
        {invites.length > 0 ? (
          <View style={styles.oiBlock}>
            <Text style={styles.oiLabel}>PENDING INVITES ({invites.length})</Text>
            <View style={styles.fnInviteList}>
              {invites.map((invite) => {
                const invRole = getRoleLabel(invite.role);
                return (
                  <View key={invite.id} style={styles.fnInviteCard}>
                    <Shield color={palette.violet} size={16} />
                    <View style={styles.fnInviteInfo}>
                      <Text style={styles.fnInviteTitle}>Faction Invitation</Text>
                      <Text style={styles.fnInviteRole}>{invRole}</Text>
                    </View>
                    <View style={styles.fnInviteStatus}>
                      <Clock color={palette.muted} size={12} />
                      <Text style={styles.fnInviteStatusText}>Pending</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Discoverable Factions */}
        {discoverable.length > 0 ? (
          <View style={styles.oiBlock}>
            <Text style={styles.oiLabel}>DISCOVER FACTIONS</Text>
            <View style={styles.fnFactionList}>
              {discoverable.map((faction) => {
                const facColor = getDomainColor(faction.intelligence_domain);
                return (
                  <View key={faction.id} style={[styles.fnDiscoverCard, { borderColor: `${facColor}22` }]}>
                    <View style={[styles.fnEmblem, { borderColor: facColor, backgroundColor: `${facColor}14` }]}>
                      <Text style={[styles.fnEmblemText, { color: facColor }]}>
                        {(faction.emblem ?? faction.name.slice(0, 2)).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.fnFactionInfo}>
                      <Text style={styles.fnFactionName} numberOfLines={1}>{faction.name}</Text>
                      <Text style={styles.fnFactionDesc} numberOfLines={2}>
                        {faction.description || "No description provided."}
                      </Text>
                      <View style={styles.fnFactionMeta}>
                        <Users color={palette.muted} size={10} />
                        <Text style={styles.fnFactionMetaText}>{faction.current_members}/{faction.max_members} members</Text>
                        {faction.fanatic_team_focus ? (
                          <>
                            <Swords color={palette.gold} size={10} />
                            <Text style={[styles.fnFactionMetaText, { color: palette.gold }]}>{faction.fanatic_team_focus}</Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.fnFactionScore}>
                      <Text style={[styles.fnFactionScoreValue, { color: facColor }]}>{faction.influence_score}</Text>
                      <Text style={styles.fnFactionScoreLabel}>Inf.</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Empty state */}
        {userFactions.length === 0 && discoverable.length === 0 ? (
          <View style={styles.fnEmptyBanner}>
            <Shield color={palette.violet} size={24} />
            <Text style={styles.fnEmptyText}>No Factions available yet. Check back later or create your own!</Text>
          </View>
        ) : null}

        <View style={{ height: 80 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── My Rankings Session ──
function MyRankingsSession({
  selectedEagohId,
  onBack,
  onChangeEagoh,
}: {
  selectedEagohId: string;
  onBack: () => void;
  onChangeEagoh: () => void;
}): JSX.Element {
  const { eagohs } = useEagohs();
  const { profile } = useProfile();
  const { user } = useAuth();

  const [reputation, setReputation] = useState<EagohReputationDisplay | null>(null);
  const [rankings, setRankings] = useState<{ eagohEntries: LeaderboardEntry[]; bestCategory: string; rankChanges: any[] } | null>(null);

  const selectedEagoh = useMemo(() => eagohs.find((e) => e.id === selectedEagohId), [eagohs, selectedEagohId]);
  const { effectiveSubscriptionTier: userTier } = useProfile();
  const domain = useMemo(() => INTELLIGENCE_DOMAINS.find((d) => d.id === selectedEagoh?.domain), [selectedEagoh]);
  const domainTone = domain ? toneColor(domain.tone) : palette.cyan;

  useEffect(() => {
    if (!selectedEagoh?.id || !user?.id) return;
    getEagohReputationDisplay(selectedEagoh.id, user.id)
      .then(setReputation)
      .catch(() => undefined);
  }, [selectedEagoh?.id, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    getUserRankings(user.id)
      .then(setRankings)
      .catch(() => undefined);
  }, [user?.id]);

  const currentRank = reputation?.rank ?? "—";
  const repScore = reputation?.reputationScore ?? 0;

  return (
    <KeyboardAvoidingView
      style={styles.setupWrap}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <Pressable onPress={onBack} style={styles.backBtn}>
        <ArrowLeft color={palette.muted} size={18} />
        <Text style={styles.backText}>Sessions</Text>
      </Pressable>

      <ScrollView
        style={styles.setupScroll}
        contentContainerStyle={styles.setupScrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {/* EAGOH Hero Card */}
        <SelectedEagohCard
          eagoh={selectedEagoh ?? null}
          onPress={onChangeEagoh}
          hasMultiple={eagohs.length > 1}
          userTier={userTier}
        />

        {/* My Rankings header */}
        <View style={styles.oiHeader}>
          <View style={[styles.setupIconRing, { borderColor: palette.gold }]}>
            <Trophy color={palette.gold} size={28} />
          </View>
          <Text style={styles.setupTitle}>My Rankings</Text>
          <Text style={styles.oiSub}>
            Rank: {currentRank} · Reputation: {repScore}
          </Text>
        </View>

        {/* Rank Progression */}
        {reputation ? (
          <View style={styles.oiBlock}>
            <Text style={styles.oiLabel}>RANK PROGRESSION</Text>
            <View style={styles.mrRankBar}>
              {RANK_TIERS.map((tier) => {
                const thresholds: Record<string, number> = {
                  Dormant: 0, Activated: 1, Bronze: 15, Silver: 30, Gold: 45,
                  Platinum: 60, Diamond: 75, Oracle: 88, "Syndicate Prime": 96,
                };
                const threshold = thresholds[tier] ?? 0;
                const achieved = repScore >= threshold;
                const tr = tier as RankTier;
                const rc = repRankColor(tr);
                return (
                  <View key={tier} style={[styles.mrRankStep, achieved && { backgroundColor: rc }]}>
                    <View style={[styles.mrRankStepDot, achieved && { backgroundColor: rc, borderColor: rc }]} />
                  </View>
                );
              })}
            </View>
            <View style={styles.mrRankLabels}>
              {RANK_TIERS.filter((_, i) => i % 2 === 0).map((tier) => (
                <Text key={tier} style={styles.mrRankLabel} numberOfLines={1}>{tier}</Text>
              ))}
            </View>
          </View>
        ) : null}

        {/* Leaderboard Rankings */}
        {rankings && rankings.eagohEntries.length > 0 ? (
          <View style={styles.oiBlock}>
            <Text style={styles.oiLabel}>LEADERBOARD POSITIONS</Text>
            <View style={styles.mrRankingList}>
              {rankings.eagohEntries.slice(0, 10).map((entry) => {
                const rc = repRankColor(entry.rank_tier as RankTier);
                return (
                  <View key={entry.eagoh_id} style={[styles.mrRankingCard, { borderColor: `${rc}22` }]}>
                    <View style={[styles.mrRankMedal, entry.rank <= 3 && { borderColor: `${rc}44`, backgroundColor: `${rc}16` }]}>
                      {entry.rank <= 3 ? (
                        <Award color={rc} size={16} />
                      ) : (
                        <Text style={styles.mrRankMedalText}>#{entry.rank}</Text>
                      )}
                    </View>
                    <View style={styles.mrRankingInfo}>
                      <Text style={styles.mrRankingName} numberOfLines={1}>{entry.eagoh_name}</Text>
                      <View style={styles.mrRankingMeta}>
                        <View style={[styles.mrRankBadge, { borderColor: `${rc}44`, backgroundColor: `${rc}16` }]}>
                          <Text style={[styles.mrRankBadgeText, { color: rc }]}>{entry.rank_tier}</Text>
                        </View>
                        <Text style={styles.mrRankingOwner}>by {entry.owner_username || "Anonymous"}</Text>
                      </View>
                    </View>
                    <View style={styles.mrRankingScore}>
                      <Text style={[styles.mrRankingScoreValue, { color: rc }]}>{entry.reputation_score}</Text>
                      <Text style={styles.mrRankingScoreLabel}>Rep</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Best Category */}
        {rankings?.bestCategory ? (
          <View style={styles.mrBestCat}>
            <Trophy color={palette.gold} size={16} />
            <Text style={styles.mrBestCatLabel}>Strongest Category:</Text>
            <Text style={styles.mrBestCatValue}>{rankings.bestCategory.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</Text>
          </View>
        ) : null}

        {/* Rank Changes */}
        {rankings && rankings.rankChanges.length > 0 ? (
          <View style={styles.oiBlock}>
            <Text style={styles.oiLabel}>RECENT RANK CHANGES</Text>
            <View style={styles.mrChangesList}>
              {rankings.rankChanges.slice(0, 5).map((change: any, i: number) => (
                <View key={i} style={styles.mrChangeRow}>
                  <TrendingUp
                    color={change.new_rank && change.previous_rank && change.new_rank !== change.previous_rank ? palette.success : palette.muted}
                    size={14}
                  />
                  <Text style={styles.mrChangeText}>
                    {change.previous_rank ?? "None"} → {change.new_rank}
                  </Text>
                  <Text style={styles.mrChangeDate}>{new Date(change.created_at).toLocaleDateString()}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Badges */}
        {reputation && reputation.badges.length > 0 ? (
          <View style={styles.oiBlock}>
            <Text style={styles.oiLabel}>EARNED BADGES</Text>
            <View style={styles.mrBadgesGrid}>
              {reputation.badges.map((badge) => (
                <View key={badge.id} style={styles.mrBadgeCard}>
                  <Award color={palette.gold} size={18} />
                  <View style={styles.mrBadgeInfo}>
                    <Text style={styles.mrBadgeName}>{badge.badge_name}</Text>
                    <Text style={styles.mrBadgeDesc} numberOfLines={2}>{badge.badge_description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* No data */}
        {!reputation && !rankings?.eagohEntries.length ? (
          <View style={styles.fnEmptyBanner}>
            <BarChart3 color={palette.muted} size={24} />
            <Text style={styles.fnEmptyText}>
              No ranking data available yet. Forge an EAGOH and start building reputation to appear on leaderboards.
            </Text>
          </View>
        ) : null}

        <View style={{ height: 80 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Main screen ──
export default function SessionsScreen(): JSX.Element {
  const h = useHaptics();
  const { eagohs } = useEagohs();
  const { profile } = useProfile();
  const { effectiveSubscriptionTier: userTier } = useProfile();
  const queryClient = useQueryClient();
  const [selectedEagohId, setSelectedEagohId] = useState<string>(eagohs[0]?.id ?? "");
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<SessionType | null>(null);

  // Thread state — replaces old isChatActive/activePrompt
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThreadSession, setActiveThreadSession] = useState<SessionType | null>(null);
  const [activeThreadInitialPrompt, setActiveThreadInitialPrompt] = useState<string>("");

  const selectedEagoh = useMemo(() => eagohs.find((e) => e.id === selectedEagohId), [eagohs, selectedEagohId]);

  // Recent threads query
  const threadsQuery = useQuery<ThreadWithMeta[]>({
    queryKey: ["analyst", "threads", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => profile?.id ? listThreads(profile.id, 10) : Promise.resolve([]),
  });

  // Keep selected in sync when eagohs load
  React.useEffect(() => {
    if (!selectedEagohId && eagohs.length > 0) {
      setSelectedEagohId(eagohs[0].id);
    }
  }, [eagohs, selectedEagohId]);

  const handleSessionPress = useCallback((session: SessionType): void => {
    h.selection();
    if (eagohs.length === 0) {
      Alert.alert("No EAGOH", "Forge an EAGOH first to run sessions.");
      return;
    }
    if (!session.active && session.id !== "open-intelligence" && session.id !== "faction-network" && session.id !== "my-rankings") {
      return;
    }
    setActiveSession(session);
  }, [eagohs.length, h]);

  const handleBack = useCallback((): void => {
    setActiveSession(null);
  }, []);

  const handleStart = useCallback((eagohId: string, prompt: string): void => {
    setActiveThreadInitialPrompt(prompt);
    setActiveThreadSession(activeSession);
    setActiveThreadId(null); // null = new thread, will be created on first analyst response
  }, [activeSession]);

  const handleDone = useCallback((): void => {
    setActiveThreadId(null);
    setActiveThreadSession(null);
    setActiveThreadInitialPrompt("");
    setActiveSession(null);
    // Refresh threads list
    queryClient.invalidateQueries({ queryKey: ["analyst", "threads", profile?.id] });
  }, [profile?.id, queryClient]);

  const handleReopenThread = useCallback((thread: ThreadWithMeta): void => {
    h.selection();
    setActiveThreadId(thread.id);
    // Find matching session type
    const st = sessionTypes.find((s) => s.id === thread.session_type);
    setActiveThreadSession(st ?? null);
    setSelectedEagohId(thread.eagoh_id);
    setActiveSession(null);
  }, [h]);

  const handleDeleteThread = useCallback((thread: ThreadWithMeta): void => {
    Alert.alert(
      "Delete Thread",
      `Delete "${thread.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteThread(thread.id, profile?.id ?? "");
              queryClient.invalidateQueries({ queryKey: ["analyst", "threads", profile?.id] });
            } catch {
              Alert.alert("Error", "Failed to delete thread.");
            }
          },
        },
      ],
    );
  }, [profile?.id, queryClient]);

  const handleChangeEagoh = useCallback((): void => {
    setShowPicker(true);
  }, []);

  const handleSelectEagoh = useCallback((id: string): void => {
    setSelectedEagohId(id);
  }, []);

  // Thread view
  if (activeThreadSession && selectedEagoh) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <AnalystChatThread
          threadId={activeThreadId ?? undefined}
          eagoh={selectedEagoh}
          session={activeThreadSession}
          initialPrompt={activeThreadId ? undefined : activeThreadInitialPrompt}
          onDone={handleDone}
        />
      </SafeAreaView>
    );
  }

  // Setup view — Open Intelligence has its own layout
  if (activeSession) {
    if (activeSession.id === "open-intelligence") {
      return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <OpenIntelSession
            selectedEagohId={selectedEagohId}
            onBack={handleBack}
            onChangeEagoh={handleChangeEagoh}
          />
          {showPicker ? (
            <EagohPicker
              eagohs={eagohs}
              selectedId={selectedEagohId}
              onSelect={handleSelectEagoh}
              onClose={() => setShowPicker(false)}
            />
          ) : null}
        </SafeAreaView>
      );
    }
    if (activeSession.id === "faction-network") {
      return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <FactionNetworkSession
            selectedEagohId={selectedEagohId}
            onBack={handleBack}
            onChangeEagoh={handleChangeEagoh}
          />
          {showPicker ? (
            <EagohPicker
              eagohs={eagohs}
              selectedId={selectedEagohId}
              onSelect={handleSelectEagoh}
              onClose={() => setShowPicker(false)}
            />
          ) : null}
        </SafeAreaView>
      );
    }
    if (activeSession.id === "my-rankings") {
      return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <MyRankingsSession
            selectedEagohId={selectedEagohId}
            onBack={handleBack}
            onChangeEagoh={handleChangeEagoh}
          />
          {showPicker ? (
            <EagohPicker
              eagohs={eagohs}
              selectedId={selectedEagohId}
              onSelect={handleSelectEagoh}
              onClose={() => setShowPicker(false)}
            />
          ) : null}
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <SessionSetup
          session={activeSession}
          selectedEagohId={selectedEagohId}
          onBack={handleBack}
          onStart={handleStart}
          onChangeEagoh={handleChangeEagoh}
        />
        {showPicker ? (
          <EagohPicker
            eagohs={eagohs}
            selectedId={selectedEagohId}
            onSelect={handleSelectEagoh}
            onClose={() => setShowPicker(false)}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  // Main listing
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.hero}>
            <Text style={styles.kicker}>INTELLIGENCE SESSIONS</Text>
            <Text style={styles.title}>Run your EAGOH</Text>
            {eagohs.length === 0 ? (
              <View style={styles.emptyBanner}>
                <Sparkles color={palette.gold} size={14} />
                <Text style={styles.emptyText}>Forge an EAGOH first to run sessions.</Text>
              </View>
            ) : null}
          </View>

          {/* Selected EAGOH card */}
          <SelectedEagohCard
            eagoh={selectedEagoh ?? null}
            onPress={() => setShowPicker(true)}
            hasMultiple={eagohs.length > 1}
            userTier={userTier}
          />

          {/* Recent Analyst Threads */}
          {threadsQuery.data && threadsQuery.data.length > 0 ? (
            <View style={styles.recentThreadsSection}>
              <Text style={styles.sectionLabel}>RECENT ANALYST THREADS</Text>
              <View style={styles.recentThreadsList}>
                {threadsQuery.data.slice(0, 5).map((thread) => {
                  const st = sessionTypes.find((s) => s.id === thread.session_type);
                  const ac = st ? toneColor(st.tone) : palette.cyan;
                  return (
                    <Pressable
                      key={thread.id}
                      onPress={() => handleReopenThread(thread)}
                      style={({ pressed }) => [
                        styles.recentThreadCard,
                        { borderColor: `${ac}22` },
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={[styles.recentThreadIcon, { backgroundColor: `${ac}14`, borderColor: `${ac}33` }]}>
                        <MessageSquare color={ac} size={16} />
                      </View>
                      <View style={styles.recentThreadInfo}>
                        <Text style={styles.recentThreadTitle} numberOfLines={1}>{thread.title}</Text>
                        <Text style={styles.recentThreadMeta}>
                          {thread.eagoh_name ?? "EAGOH"} · {st?.name ?? thread.session_type} · {thread.message_count} msgs · {new Date(thread.updated_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleDeleteThread(thread)}
                        hitSlop={8}
                        style={styles.recentThreadDelete}
                      >
                        <Trash2 color={palette.muted} size={14} />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Session type cards */}
          <Text style={styles.sectionLabel}>SESSION TYPES</Text>
          <View style={styles.sessionList}>
            {sessionTypes.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onPress={() => handleSessionPress(session)}
                disabled={eagohs.length === 0 && session.id !== "quick-check"}
              />
            ))}
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* EAGOH picker overlay */}
        {showPicker ? (
          <EagohPicker
            eagohs={eagohs}
            selectedId={selectedEagohId}
            onSelect={handleSelectEagoh}
            onClose={() => setShowPicker(false)}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.void },
  root: { flex: 1, backgroundColor: palette.void },
  scroll: { padding: 14, paddingBottom: 100 },

  // Hero
  hero: { marginBottom: 14 },
  kicker: { color: palette.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 2.2, marginBottom: 4 },
  title: { color: palette.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.6 },
  emptyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: palette.goldSoft,
    borderWidth: 1,
    borderColor: "rgba(255,181,71,0.20)",
  },
  emptyText: { color: palette.gold, fontSize: 12, fontWeight: "800" },

  // EAGOH hero card (featured image)
  eagohHero: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  eagohHeroImageWrap: {
    height: 260,
    width: "100%",
    backgroundColor: "rgba(8,16,30,0.92)",
    justifyContent: "space-between",
  },
  eagohHeroImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  eagohHeroPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  eagohHeroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  eagohHeroDomainTag: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    maxWidth: "60%",
  },
  eagohHeroDomainText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  eagohHeroStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
  },
  eagohHeroBottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  eagohHeroNameWrap: { flex: 1 },
  eagohHeroLabel: { color: palette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 3 },
  eagohHeroName: { color: palette.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  eagohStatusDot: { width: 6, height: 6, borderRadius: 3, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  eagohStatusText: { fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  eagohChangeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
  },
  eagohChangeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },

  // Section
  sectionLabel: { color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },

  // Session card list
  sessionList: { gap: 8 },

  // Session card (compact glass, max 140px)
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    maxHeight: 96,
    overflow: "hidden",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  cardAccent: {
    width: 3,
    alignSelf: "stretch",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 11,
    marginVertical: 11,
  },
  cardBody: { flex: 1, paddingHorizontal: 11, paddingVertical: 11, gap: 3 },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { color: palette.text, fontSize: 15, fontWeight: "900", flexShrink: 1, letterSpacing: -0.2 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(0,255,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,255,178,0.28)",
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.success },
  liveBadgeText: { color: palette.success, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  cardDesc: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  cardMetaText: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  costChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  cardCost: { fontSize: 11, fontWeight: "900" },
  cardRight: { paddingRight: 12, paddingLeft: 4 },
  cardArrow: {
    width: 30,
    height: 30,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardDisabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.88 },

  // Setup
  setupWrap: { flex: 1, backgroundColor: palette.void },
  setupScroll: { flex: 1 },
  setupScrollContent: { padding: 14, paddingBottom: 0 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 12 },
  backText: { color: palette.muted, fontSize: 13, fontWeight: "800" },
  setupHeader: { alignItems: "center", gap: 6, marginBottom: 18 },
  setupIconRing: {
    width: 64,
    height: 64,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  setupTitle: { color: palette.text, fontSize: 22, fontWeight: "900" },
  setupSub: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  setupBlock: { marginBottom: 14 },
  setupLabel: { color: palette.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginBottom: 6, textTransform: "uppercase" },
  setupEagohRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.55)",
  },
  setupEagohDot: { width: 9, height: 9, borderRadius: 5 },
  setupEagohName: { color: palette.text, fontSize: 14, fontWeight: "800" },
  setupEagohDomain: { color: palette.muted, fontSize: 11, marginLeft: 4 },
  setupEagohPlaceholder: { color: palette.muted, fontSize: 13, fontWeight: "700", flex: 1 },
  setupInput: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    minHeight: 90,
    borderRadius: 5,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.55)",
    textAlignVertical: "top",
  },
  domainBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 14,
  },
  domainBannerText: { flex: 1 },
  domainBannerTitle: { fontSize: 12, fontWeight: "900" },
  domainBannerDesc: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  setupFooter: { gap: 10, paddingHorizontal: 14, paddingBottom: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.void },
  setupCostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: palette.line,
  },
  setupCostLabel: { color: palette.gold, fontSize: 16, fontWeight: "900" },
  setupStartBtn: {
    minHeight: 50,
    borderRadius: 5,
    backgroundColor: palette.cyan,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: palette.cyan,
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  setupStartText: { color: palette.void, fontSize: 14, fontWeight: "900" },
  disabledButton: { opacity: 0.45 },
  errorText: { color: palette.ember, fontSize: 11, fontWeight: "800", textAlign: "center" },

  // Picker
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,4,10,0.85)",
    justifyContent: "flex-end",
    zIndex: 100,
  },
  pickerSheet: {
    maxHeight: "55%",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderTopWidth: 1,
    borderColor: palette.line,
    padding: 18,
    overflow: "hidden",
  },
  pickerTitle: { color: palette.text, fontSize: 16, fontWeight: "900", marginBottom: 12 },
  pickerEmpty: { color: palette.muted, fontSize: 13, fontWeight: "700", textAlign: "center", paddingVertical: 20 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  pickerDot: { width: 9, height: 9, borderRadius: 5 },
  pickerItemInfo: { flex: 1 },
  pickerItemName: { color: palette.text, fontSize: 13, fontWeight: "800" },
  pickerItemDomain: { color: palette.muted, fontSize: 10, marginTop: 1 },

  // Chat
  chatWrap: { flex: 1, backgroundColor: palette.void },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    marginBottom: 6,
  },
  chatName: { color: palette.text, fontSize: 15, fontWeight: "900" },
  chatType: { color: palette.muted, fontSize: 10, fontWeight: "700", marginTop: 1 },
  chatMsgs: { flex: 1 },
  chatMsgsContent: { padding: 14, gap: 10 },
  msgBubble: { maxWidth: "82%", borderRadius: 5, padding: 12 },
  msgUser: { alignSelf: "flex-end", backgroundColor: "rgba(108,230,255,0.12)", borderWidth: 1, borderColor: "rgba(108,230,255,0.24)" },
  msgAnalyst: { alignSelf: "flex-start", backgroundColor: "rgba(14,24,37,0.78)", borderWidth: 1, borderColor: palette.line },
  msgUserText: { color: palette.text, fontSize: 13, fontWeight: "700" },
  msgAnalystText: { color: palette.text, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  msgMeta: { color: palette.muted, fontSize: 10, fontWeight: "800", marginTop: 6 },
  msgCost: { color: palette.gold, fontSize: 10, fontWeight: "800", marginTop: 3 },
  typing: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  typingText: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  typingDots: { flexDirection: "row", gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotMid: { opacity: 0.55 },

  bottomSpacer: { height: 40 },

  // Thread chat additions
  threadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  threadBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  threadLoading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  threadLoadingText: { color: palette.muted, fontSize: 13, fontWeight: "700" },
  // Error state (timeout, Supabase failure, etc.)
  threadErrorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  threadErrorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,77,109,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,77,109,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  threadErrorTitle: { color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  threadErrorText: { color: palette.muted, fontSize: 12, fontWeight: "600", textAlign: "center", lineHeight: 18 },
  threadErrorButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  threadErrorRetryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.cyan,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 7,
  },
  threadErrorRetryText: { color: palette.void, fontSize: 12, fontWeight: "900" },
  threadErrorBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 7,
  },
  threadErrorBackText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  composer: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.void,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  composerCostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  composerCostText: { color: palette.gold, fontSize: 10, fontWeight: "800" },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  composerInput: {
    flex: 1,
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    maxHeight: 90,
    minHeight: 40,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(14,24,37,0.65)",
    textAlignVertical: "center",
  },
  composerSend: {
    width: 40,
    height: 40,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  composerEdgeHint: {
    color: palette.ember,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    paddingBottom: 4,
  },

  // Recent threads section
  recentThreadsSection: { marginBottom: 18 },
  recentThreadsList: { gap: 6 },
  recentThreadCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    backgroundColor: "rgba(10,18,30,0.40)",
  },
  recentThreadIcon: {
    width: 38,
    height: 38,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  recentThreadInfo: { flex: 1, gap: 2 },
  recentThreadTitle: { color: palette.text, fontSize: 13, fontWeight: "800" },
  recentThreadMeta: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  recentThreadDelete: { padding: 4 },

  // Open Intelligence
  oiHeader: { alignItems: "center", gap: 6, marginBottom: 18 },
  oiSub: { color: palette.muted, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 2 },
  oiDomainBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 14,
  },
  oiDomainTitle: { fontSize: 12, fontWeight: "900" },
  oiDomainDesc: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  oiBlock: { marginBottom: 14 },
  oiLabel: { color: palette.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginBottom: 6, textTransform: "uppercase" as const },
  oiEntryList: { flexDirection: "row", gap: 5 },
  oiEntryCard: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 10,
    paddingHorizontal: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  oiEntryLabel: { color: palette.text, fontSize: 12, fontWeight: "900" },
  oiEntryDetail: { color: palette.muted, fontSize: 9, fontWeight: "700" },
  oiEntryCost: { fontSize: 10, fontWeight: "900" },
  oiInput: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    minHeight: 100,
    borderRadius: 5,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.50)",
    textAlignVertical: "top",
  },
  oiCharRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  oiCharHint: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  oiCharCount: { fontSize: 11, fontWeight: "900", color: palette.text },
  oiTagList: { gap: 2 },
  oiTagCat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  oiTagCatLabel: { color: palette.text, fontSize: 12, fontWeight: "900", flex: 1 },
  oiTagGrid: { flexDirection: "row", flexWrap: "wrap" as const, gap: 5, paddingLeft: 4, paddingBottom: 6 },
  oiTagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  oiTagChipText: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  oiCustomWrap: { paddingHorizontal: 4, marginTop: 4 },
  oiCustomInput: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    minHeight: 40,
    borderRadius: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(255,181,71,0.3)",
    backgroundColor: "rgba(255,181,71,0.06)",
  },
  oiCustomActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,181,71,0.30)",
    backgroundColor: "rgba(255,181,71,0.08)",
    marginTop: 6,
    alignSelf: "flex-start" as const,
  },
  oiCustomActiveText: { color: palette.gold, fontSize: 12, fontWeight: "800" },
  oiConfRow: { flexDirection: "row", flexWrap: "wrap" as const, gap: 5 },
  oiConfChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.03)",
    flexGrow: 1,
  },
  oiConfDot: { width: 7, height: 7, borderRadius: 4 },
  oiConfText: { color: palette.text, fontSize: 11, fontWeight: "800" },
  oiScorePanel: {
    borderRadius: 5,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.50)",
    gap: 8,
  },
  oiScoreEmpty: { flexDirection: "row", alignItems: "center", gap: 8 },
  oiScoreEmptyText: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  oiScoreRow: { flexDirection: "row", gap: 10 },
  oiScoreItem: { flex: 1, gap: 6 },
  oiScoreLabel: { color: palette.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" as const },
  oiProgressTrack: { height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" as const },
  oiProgressFill: { height: 5, borderRadius: 3 },
  oiScoreValue: { fontSize: 16, fontWeight: "900" },
  oiScoreMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  oiScoreMetaText: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  oiSubmit: { gap: 8, marginTop: 4 },
  oiSubmitRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  oiSubmitCost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    minHeight: 48,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  oiSubmitCostText: { color: palette.gold, fontSize: 15, fontWeight: "900" },
  oiSubmitBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 5,
    overflow: "hidden" as const,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: palette.cyan,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  oiSubmitBtnText: { color: palette.void, fontSize: 14, fontWeight: "900" },
  insufficientEdge: { color: palette.ember, fontSize: 11, fontWeight: "800", textAlign: "center" as const },
  successText: { color: palette.success, fontSize: 11, fontWeight: "800", textAlign: "center" as const },
  oiFeed: { marginTop: 16, gap: 8, paddingBottom: 24 },
  oiFeedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  oiFeedTitle: { color: palette.text, fontSize: 16, fontWeight: "900", flex: 1 },
  oiFeedCount: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  oiFeedLoader: { paddingVertical: 20 },
  oiFeedEmpty: { color: palette.muted, fontSize: 12, fontWeight: "700", textAlign: "center" as const, paddingVertical: 18 },
  oiFeedCard: {
    borderRadius: 5,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.45)",
    gap: 6,
  },
  oiFeedTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  oiFeedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "rgba(108,230,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(108,230,255,0.20)",
  },
  oiFeedBadgeText: { color: palette.cyan, fontSize: 9, fontWeight: "900" },
  oiFeedMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  oiFeedType: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  oiFeedDot: { color: palette.muted, fontSize: 8 },
  oiFeedTime: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  oiFeedContent: { color: palette.text, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  oiFeedScores: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  oiFeedScoreItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  oiFeedScoreLabel: { color: palette.muted, fontSize: 9, fontWeight: "700", textTransform: "uppercase" as const },
  oiFeedScoreVal: { fontSize: 11, fontWeight: "900" },
  oiFeedScoreDivider: { width: 1, height: 12, backgroundColor: palette.line },

  // ── Faction Network ──────────────────────────────────────────────────
  fnFactionList: { gap: 8 },
  fnFactionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 5,
    padding: 12,
    borderWidth: 1,
  },
  fnEmblem: {
    width: 44,
    height: 44,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fnEmblemText: { fontSize: 14, fontWeight: "900" },
  fnFactionInfo: { flex: 1, gap: 2 },
  fnFactionName: { color: palette.text, fontSize: 14, fontWeight: "900" },
  fnFactionMotto: { color: palette.muted, fontSize: 11, fontWeight: "700", fontStyle: "italic" },
  fnFactionMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  fnFactionMetaText: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  fnDomainBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  fnDomainBadgeText: { fontSize: 9, fontWeight: "900" },
  fnFactionScore: { alignItems: "center", minWidth: 40 },
  fnFactionScoreValue: { fontSize: 18, fontWeight: "900" },
  fnFactionScoreLabel: { color: palette.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  fnDiscoverCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 5,
    padding: 12,
    borderWidth: 1,
    backgroundColor: "rgba(10,18,30,0.40)",
  },
  fnFactionDesc: { color: palette.muted, fontSize: 10, fontWeight: "700", lineHeight: 14 },
  fnEmptyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.35)",
    marginBottom: 14,
  },
  fnEmptyText: { color: palette.muted, fontSize: 12, fontWeight: "700", flex: 1, lineHeight: 17 },
  fnInviteList: { gap: 6 },
  fnInviteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 5,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(138,92,255,0.28)",
    backgroundColor: "rgba(138,92,255,0.06)",
  },
  fnInviteInfo: { flex: 1 },
  fnInviteTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
  fnInviteRole: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  fnInviteStatus: { flexDirection: "row", alignItems: "center", gap: 4 },
  fnInviteStatusText: { color: palette.muted, fontSize: 10, fontWeight: "700" },

  // ── My Rankings ──────────────────────────────────────────────────────
  mrRankBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  mrRankStep: { flex: 1 },
  mrRankStepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignSelf: "center",
    marginTop: -1,
  },
  mrRankLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 2,
  },
  mrRankLabel: { color: palette.muted, fontSize: 9, fontWeight: "800", flex: 1, textAlign: "center" },
  mrRankingList: { gap: 6 },
  mrRankingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    backgroundColor: "rgba(10,18,30,0.40)",
  },
  mrRankMedal: {
    width: 36,
    height: 36,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3,6,11,0.5)",
  },
  mrRankMedalText: { color: palette.muted, fontSize: 13, fontWeight: "900" },
  mrRankingInfo: { flex: 1, gap: 3 },
  mrRankingName: { color: palette.text, fontSize: 14, fontWeight: "900" },
  mrRankingMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  mrRankBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  mrRankBadgeText: { fontSize: 9, fontWeight: "900" },
  mrRankingOwner: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  mrRankingScore: { alignItems: "center", minWidth: 44 },
  mrRankingScoreValue: { fontSize: 18, fontWeight: "900" },
  mrRankingScoreLabel: { color: palette.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  mrBestCat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,184,77,0.28)",
    backgroundColor: "rgba(255,184,77,0.08)",
    marginBottom: 14,
  },
  mrBestCatLabel: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  mrBestCatValue: { color: palette.gold, fontSize: 13, fontWeight: "900", flex: 1 },
  mrChangesList: { gap: 4 },
  mrChangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  mrChangeText: { color: palette.text, fontSize: 12, fontWeight: "700", flex: 1 },
  mrChangeDate: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  mrBadgesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mrBadgeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.40)",
    flexBasis: "47%",
    flexGrow: 1,
  },
  mrBadgeInfo: { flex: 1, gap: 2 },
  mrBadgeName: { color: palette.text, fontSize: 12, fontWeight: "900" },
  mrBadgeDesc: { color: palette.muted, fontSize: 10, fontWeight: "700", lineHeight: 14 },
});
