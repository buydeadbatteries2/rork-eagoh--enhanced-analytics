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
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Cpu,
  Flame,
  Orbit,
  Search,
  Sparkles,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useProfile } from "@/providers/ProfileProvider";
import { useEdge } from "@/providers/EdgeProvider";
import { useEagohs } from "@/providers/EagohProvider";
import { INTELLIGENCE_DOMAINS, isPromptInDomain, getDomainRejection } from "@/services/domains";
import { getQuickCheckCost, runQuickCheck, type AnalystRequestKind } from "@/services/analyst";
import type { EagohRecord } from "@/services/eagohs";

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
  { id: "quick-analysis", name: "Quick Analysis", description: "Tactical strategic read", costRange: "10-15 Edge", minCost: 10, maxCost: 15, model: "Tactic-Core", duration: "~5 min", tone: "gold", active: false },
  { id: "standard", name: "Standard Analysis", description: "Deep strategic assessment", costRange: "40-75 Edge", minCost: 40, maxCost: 75, model: "EAGOH Analyst", duration: "~8 min", tone: "success", active: false },
  { id: "oracle", name: "Oracle Deep Dive", description: "Elite predictive modeling", costRange: "150-300 Edge", minCost: 150, maxCost: 300, model: "Oracle-Synapse", duration: "~15 min", tone: "violet", active: false },
  { id: "premium-event", name: "Premium Event", description: "Event-focused intelligence", costRange: "75-150 Edge", minCost: 75, maxCost: 150, model: "Event-Lens Pro", duration: "~10 min", tone: "ember", active: false },
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
  return <BrainCircuit color={color} size={size} />;
}

// ── Compact session card (max 140px) ──
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
        { borderColor: session.active ? `${accent}44` : palette.line },
        disabled && styles.cardDisabled,
        pressed && styles.pressed,
      ]}
    >
      {/* Left accent bar */}
      <View style={[styles.cardAccent, { backgroundColor: accent }]} />
      {/* Icon */}
      <View style={[styles.cardIcon, { backgroundColor: toneBg(session.tone), borderColor: `${accent}33` }]}>
        {sessionIcon(session.id, accent, 20)}
      </View>
      {/* Body */}
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardName}>{session.name}</Text>
          {session.active ? (
            <View style={styles.liveBadge}>
              <Sparkles color={palette.success} size={8} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardDesc} numberOfLines={1}>{session.description}</Text>
        <View style={styles.cardMeta}>
          <Clock color={palette.muted} size={10} />
          <Text style={styles.cardMetaText}>{session.duration}</Text>
          <Cpu color={palette.muted} size={10} />
          <Text style={styles.cardMetaText}>{session.model}</Text>
        </View>
      </View>
      {/* Cost + arrow */}
      <View style={styles.cardRight}>
        <View style={styles.cardCostRow}>
          <Zap color={accent} size={12} />
          <Text style={[styles.cardCost, { color: accent }]}>{session.costRange}</Text>
        </View>
        <ChevronRight color={accent} size={16} />
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
  const domainTone = domain ? toneColor(domain.tone) : palette.muted;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.eagohCard, pressed && styles.pressed]}>
      <View style={styles.eagohCardLeft}>
        <View style={[styles.eagohCardAvatar, { borderColor: eagoh ? domainTone : palette.line }]}>
          <BrainCircuit color={eagoh ? domainTone : palette.muted} size={22} />
        </View>
        <View style={styles.eagohCardInfo}>
          <Text style={styles.eagohCardName} numberOfLines={1}>
            {eagoh?.name || "No EAGOH selected"}
          </Text>
          <Text style={styles.eagohCardDomain}>
            {eagoh ? (domain?.label ?? eagoh.domain ?? "No domain") : "Tap to select an EAGOH"}
          </Text>
        </View>
      </View>
      <View style={styles.eagohCardRight}>
        {eagoh ? (
          <View style={[styles.eagohShellBadge, { backgroundColor: toneBg(domainTone as SessionTone), borderColor: `${domainTone}33` }]}>
            <Text style={[styles.eagohShellText, { color: domainTone }]}>
              {userTier === "free" ? "DORMANT" : "ACTIVE"}
            </Text>
          </View>
        ) : null}
        <Text style={styles.eagohCardChange}>{hasMultiple ? "Change" : "Select"}</Text>
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
  const { eagohs } = useEagohs();
  const [prompt, setPrompt] = useState<string>("");

  const selectedEagoh = useMemo(() => eagohs.find((e) => e.id === selectedEagohId), [eagohs, selectedEagohId]);
  const domain = useMemo(() => INTELLIGENCE_DOMAINS.find((d) => d.id === selectedEagoh?.domain), [selectedEagoh]);

  const cost = session.id === "quick-check" && prompt ? getQuickCheckCost(prompt) : session.minCost;
  const { total: edgeTotal } = useEdge();
  const canAfford = edgeTotal >= cost;
  const isDomainMatch = !prompt || !selectedEagoh?.domain || isPromptInDomain(prompt, selectedEagoh.domain);

  const handleStart = useCallback((): void => {
    if (!selectedEagohId || !prompt.trim()) return;
    Haptics.selectionAsync().catch(() => undefined);
    onStart(selectedEagohId, prompt);
  }, [selectedEagohId, prompt, onStart]);

  return (
    <View style={styles.setupWrap}>
      {/* Back */}
      <Pressable onPress={onBack} style={styles.backBtn}>
        <ArrowLeft color={palette.muted} size={18} />
        <Text style={styles.backText}>Sessions</Text>
      </Pressable>

      {/* Session header */}
      <View style={styles.setupHeader}>
        <View style={[styles.setupIconRing, { borderColor: toneColor(session.tone) }]}>
          {sessionIcon(session.id, toneColor(session.tone), 28)}
        </View>
        <Text style={styles.setupTitle}>{session.name}</Text>
        <Text style={styles.setupSub}>{session.model} · {session.duration}</Text>
      </View>

      {/* Selected EAGOH */}
      <View style={styles.setupBlock}>
        <Text style={styles.setupLabel}>EAGOH</Text>
        <Pressable onPress={onChangeEagoh} style={({ pressed }) => [styles.setupEagohRow, pressed && styles.pressed]}>
          {selectedEagoh ? (
            <>
              <View style={[styles.setupEagohDot, { backgroundColor: domain ? toneColor(domain.tone) : palette.muted }]} />
              <Text style={styles.setupEagohName}>{selectedEagoh.name}</Text>
              <Text style={styles.setupEagohDomain}>{domain?.label ?? selectedEagoh.domain}</Text>
            </>
          ) : (
            <Text style={styles.setupEagohPlaceholder}>Select an EAGOH…</Text>
          )}
          <ChevronDown color={palette.muted} size={16} />
        </Pressable>
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
        />
      </View>

      {/* Domain check */}
      {selectedEagoh && domain ? (
        <View style={[styles.domainBanner, { borderColor: `${toneColor(domain.tone)}33`, backgroundColor: `${toneColor(domain.tone)}0A` }]}>
          <BrainCircuit color={toneColor(domain.tone)} size={14} />
          <View style={styles.domainBannerText}>
            <Text style={[styles.domainBannerTitle, { color: toneColor(domain.tone) }]}>{domain.label}</Text>
            <Text style={styles.domainBannerDesc}>
              {isDomainMatch ? "Within domain." : getDomainRejection(selectedEagoh.domain ?? "")}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Cost + Start */}
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
    </View>
  );
}

// ── Active chat ──
function ActiveChat({
  session,
  eagoh,
  prompt,
  onDone,
}: {
  session: SessionType;
  eagoh: EagohRecord;
  prompt: string;
  onDone: () => void;
}): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "u-init", sender: "user", text: prompt },
  ]);
  const [isTyping, setIsTyping] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { deductQuickCheck, total: edgeTotal } = useEdge();
  const started = useRef(false);

  const runSession = useCallback(async (): Promise<void> => {
    if (started.current) return;
    started.current = true;

    if (session.id === "quick-check") {
      const cost = getQuickCheckCost(prompt);
      if (edgeTotal < cost) {
        setError(`Insufficient Edge. Need ${cost} Edge.`);
        setIsTyping(false);
        return;
      }

      if (eagoh.domain && !isPromptInDomain(prompt, eagoh.domain)) {
        setMessages((prev) => [...prev, {
          id: `a-domain-${Date.now()}`,
          sender: "analyst",
          text: getDomainRejection(eagoh.domain ?? ""),
          confidence: 0,
        }]);
        setIsTyping(false);
        return;
      }

      try {
        await deductQuickCheck(prompt, `Quick Check · ${cost} Edge`);
      } catch (err) {
        setError("Edge deduction failed.");
        setIsTyping(false);
        return;
      }

      const kind = detectQuickCheckKind(prompt);
      try {
        const result = await runQuickCheck({ prompt, kind, personality: "tactical", context: [] });
        if (result.ok) {
          setMessages((prev) => [...prev, {
            id: `a-${Date.now()}`,
            sender: "analyst",
            text: result.reply,
            confidence: result.confidence,
            cost,
          }]);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError("Analyst is temporarily unavailable.");
      }
      setIsTyping(false);
      return;
    }

    setMessages((prev) => [...prev, {
      id: `a-fallback-${Date.now()}`,
      sender: "analyst",
      text: `${session.name} is UI-ready but not yet activated. Quick Check is live. Forge more EAGOHs across different domains.`,
      confidence: 85,
    }]);
    setIsTyping(false);
  }, []);

  React.useEffect(() => { runSession(); }, [runSession]);

  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={styles.chatWrap}>
      <Pressable onPress={onDone} style={styles.backBtn}>
        <ArrowLeft color={palette.muted} size={18} />
        <Text style={styles.backText}>Sessions</Text>
      </Pressable>

      <View style={styles.chatHeader}>
        <BrainCircuit color={toneColor(session.tone)} size={20} />
        <View>
          <Text style={styles.chatName}>{eagoh.name}</Text>
          <Text style={styles.chatType}>{session.name} · {session.model}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chatMsgs}
        contentContainerStyle={styles.chatMsgsContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => (
          <View key={msg.id} style={[styles.msgBubble, msg.sender === "analyst" ? styles.msgAnalyst : styles.msgUser]}>
            <Text style={msg.sender === "analyst" ? styles.msgAnalystText : styles.msgUserText}>{msg.text}</Text>
            {msg.confidence ? <Text style={styles.msgMeta}>Confidence {msg.confidence}%</Text> : null}
            {msg.cost ? <Text style={styles.msgCost}>{msg.cost} Edge</Text> : null}
          </View>
        ))}
        {isTyping ? (
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
      </ScrollView>
    </View>
  );
}

// ── Main screen ──
export default function SessionsScreen(): JSX.Element {
  const { eagohs } = useEagohs();
  const { profile } = useProfile();
  const userTier = profile?.subscription_tier ?? "free";
  const [selectedEagohId, setSelectedEagohId] = useState<string>(eagohs[0]?.id ?? "");
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<SessionType | null>(null);

  // Chat state
  const [activePrompt, setActivePrompt] = useState<string>("");
  const [isChatActive, setIsChatActive] = useState<boolean>(false);

  const selectedEagoh = useMemo(() => eagohs.find((e) => e.id === selectedEagohId), [eagohs, selectedEagohId]);

  // Keep selected in sync when eagohs load
  React.useEffect(() => {
    if (!selectedEagohId && eagohs.length > 0) {
      setSelectedEagohId(eagohs[0].id);
    }
  }, [eagohs, selectedEagohId]);

  const handleSessionPress = useCallback((session: SessionType): void => {
    Haptics.selectionAsync().catch(() => undefined);
    if (eagohs.length === 0) return;
    setActiveSession(session);
  }, [eagohs.length]);

  const handleBack = useCallback((): void => {
    setActiveSession(null);
  }, []);

  const handleStart = useCallback((eagohId: string, prompt: string): void => {
    setActivePrompt(prompt);
    setIsChatActive(true);
  }, []);

  const handleDone = useCallback((): void => {
    setIsChatActive(false);
    setActiveSession(null);
  }, []);

  const handleChangeEagoh = useCallback((): void => {
    setShowPicker(true);
  }, []);

  const handleSelectEagoh = useCallback((id: string): void => {
    setSelectedEagohId(id);
  }, []);

  // Chat view
  if (isChatActive && activeSession && selectedEagoh) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ActiveChat session={activeSession} eagoh={selectedEagoh} prompt={activePrompt} onDone={handleDone} />
      </SafeAreaView>
    );
  }

  // Setup view
  if (activeSession) {
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

  // EAGOH card
  eagohCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,20,35,0.60)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  eagohCardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  eagohCardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  eagohCardInfo: { flex: 1 },
  eagohCardName: { color: palette.text, fontSize: 14, fontWeight: "900" },
  eagohCardDomain: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  eagohCardRight: { alignItems: "flex-end", gap: 4 },
  eagohShellBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  eagohShellText: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  eagohCardChange: { color: palette.cyan, fontSize: 11, fontWeight: "800" },

  // Section
  sectionLabel: { color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },

  // Session card list
  sessionList: { gap: 6 },

  // Session card (compact, max 140px)
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: "rgba(10,20,35,0.55)",
    maxHeight: 88,
    overflow: "hidden",
  },
  cardAccent: { width: 3, alignSelf: "stretch" },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    marginVertical: 10,
  },
  cardBody: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, gap: 2 },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { color: palette.text, fontSize: 14, fontWeight: "900", flexShrink: 1 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(0,255,178,0.10)",
    borderWidth: 1,
    borderColor: "rgba(0,255,178,0.22)",
  },
  liveBadgeText: { color: palette.success, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  cardDesc: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  cardMetaText: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  cardRight: {
    alignItems: "center",
    gap: 4,
    paddingRight: 12,
    paddingVertical: 10,
  },
  cardCostRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  cardCost: { fontSize: 12, fontWeight: "900" },
  cardDisabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.88 },

  // Setup
  setupWrap: { flex: 1, backgroundColor: palette.void, padding: 14 },
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
  setupFooter: { marginTop: "auto", gap: 10 },
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
});
