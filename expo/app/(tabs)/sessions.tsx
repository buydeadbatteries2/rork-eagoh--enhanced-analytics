/**
 * EAGOH Sessions — dedicated screen for running intelligence sessions with your EAGOHs.
 *
 * Session types:
 *   - Quick Check: 1-3 Edge, connected to OpenAI via secure server
 *   - Quick Analysis: 10-15 Edge
 *   - Standard Analysis: 40-75 Edge
 *   - Oracle Deep Dive: 150-300 Edge
 *   - Premium Event Analysis: 75-150 Edge
 *
 * Setup flow when tapping a session:
 *   1. Select an EAGOH from your collection
 *   2. Enter a topic/prompt
 *   3. See domain reminder for the selected EAGOH
 *   4. View estimated Edge cost
 *   5. Confirm to run
 */

import { palette } from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
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
  MessageCircle,
  Orbit,
  Search,
  Send,
  Sparkles,
  Star,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { INTELLIGENCE_DOMAINS, isPromptInDomain, getDomainRejection } from "@/services/domains";
import { getQuickCheckCost, runQuickCheck, type AnalystRequestKind } from "@/services/analyst";
import type { EagohRecord } from "@/services/eagohs";

type SessionType = {
  id: string;
  name: string;
  costRange: string;
  minCost: number;
  maxCost: number;
  model: string;
  duration: string;
  mood: string;
  tone: "cyan" | "gold" | "violet" | "ember" | "success";
  active: boolean;
};

const sessionTypes: SessionType[] = [
  { id: "quick-check", name: "Quick Check", costRange: "1-3 Edge", minCost: 1, maxCost: 3, model: "Pulse-Lite", duration: "~2 min", mood: "Alert + concise", tone: "cyan", active: true },
  { id: "quick-analysis", name: "Quick Analysis", costRange: "10-15 Edge", minCost: 10, maxCost: 15, model: "Tactic-Core", duration: "~5 min", mood: "Tactical + calm", tone: "gold", active: false },
  { id: "standard", name: "Standard Analysis", costRange: "40-75 Edge", minCost: 40, maxCost: 75, model: "EAGOH Analyst", duration: "~8 min", mood: "Deep strategic", tone: "success", active: false },
  { id: "oracle", name: "Oracle Deep Dive", costRange: "150-300 Edge", minCost: 150, maxCost: 300, model: "Oracle-Synapse", duration: "~15 min", mood: "Oracle class", tone: "violet", active: false },
  { id: "premium-event", name: "Premium Event Analysis", costRange: "75-150 Edge", minCost: 75, maxCost: 150, model: "Event-Lens Pro", duration: "~10 min", mood: "Event-focused", tone: "ember", active: false },
];

type ChatMessage = { id: string; sender: "user" | "analyst"; text: string; confidence?: number; cost?: number };

function toneColor(tone: SessionType["tone"]): string {
  if (tone === "gold") return palette.gold;
  if (tone === "violet") return palette.violet;
  if (tone === "ember") return palette.ember;
  if (tone === "success") return palette.success;
  return palette.cyan;
}

function detectQuickCheckKind(prompt: string): AnalystRequestKind {
  const lower = prompt.toLowerCase();
  if (/(vs\.?|against|matchup|face off|faceoff)/.test(lower)) return "matchup";
  if (/(player|starter|qb|guard|forward|striker|pitcher|rb|wr|confidence|fatigue)/.test(lower)) return "player_confidence";
  if (/(team|roster|lineup|squad|franchise|defense|offense)/.test(lower)) return "team_analysis";
  return "general";
}

// ---- Session setup (EAGOH selection, topic, confirm) ----
function SessionSetup({
  session,
  onBack,
  onStart,
}: {
  session: SessionType;
  onBack: () => void;
  onStart: (eagohId: string, prompt: string) => void;
}): JSX.Element {
  const { eagohs } = useEagohs();
  const [selectedEagohId, setSelectedEagohId] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [showEagohList, setShowEagohList] = useState<boolean>(false);

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
      {/* Back button */}
      <Pressable onPress={onBack} style={styles.backButton}>
        <ArrowLeft color={palette.muted} size={20} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      {/* Session header */}
      <View style={styles.setupHeader}>
        <View style={[styles.setupIcon, { borderColor: toneColor(session.tone) }]}>
          {session.id === "quick-check" ? <Zap color={toneColor(session.tone)} size={24} /> : session.id === "oracle" ? <Orbit color={toneColor(session.tone)} size={24} /> : <BrainCircuit color={toneColor(session.tone)} size={24} />}
        </View>
        <Text style={styles.setupTitle}>{session.name}</Text>
        <Text style={styles.setupMeta}>{session.model} · {session.mood}</Text>
      </View>

      {/* Select EAGOH */}
      <View style={styles.setupSection}>
        <Text style={styles.setupLabel}>Select EAGOH</Text>
        <Pressable
          onPress={() => setShowEagohList((v) => !v)}
          style={({ pressed }) => [styles.eagohSelector, pressed && styles.pressed]}
        >
          {selectedEagoh ? (
            <View style={styles.eagohSelected}>
              <View style={[styles.eagohDot, { backgroundColor: toneColor("cyan") }]} />
              <View style={styles.eagohSelectedInfo}>
                <Text style={styles.eagohSelectedName}>{selectedEagoh.name}</Text>
                <Text style={styles.eagohSelectedDomain}>
                  {domain?.label ?? selectedEagoh.domain ?? "No domain"}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.eagohPlaceholder}>Choose an EAGOH…</Text>
          )}
          {showEagohList ? <ChevronUp color={palette.muted} size={16} /> : <ChevronDown color={palette.muted} size={16} />}
        </Pressable>
        {showEagohList ? (
          <View style={styles.eagohList}>
            {eagohs.length === 0 ? (
              <Text style={styles.emptyText}>No EAGOHs forged yet. Visit the Forge to create one.</Text>
            ) : (
              eagohs.map((eagoh) => {
                const eDomain = INTELLIGENCE_DOMAINS.find((d) => d.id === eagoh.domain);
                return (
                  <Pressable
                    key={eagoh.id}
                    onPress={() => { setSelectedEagohId(eagoh.id); setShowEagohList(false); }}
                    style={({ pressed }) => [
                      styles.eagohListItem,
                      selectedEagohId === eagoh.id && { borderColor: palette.cyan, backgroundColor: "rgba(54,245,255,0.08)" },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.eagohDot, { backgroundColor: eDomain ? toneColor(eDomain.tone) : palette.muted }]} />
                    <View style={styles.eagohItemInfo}>
                      <Text style={styles.eagohItemName}>{eagoh.name || "Unnamed"}</Text>
                      <Text style={styles.eagohItemDomain}>{eDomain?.label ?? eagoh.domain ?? "No domain"}</Text>
                    </View>
                    {selectedEagohId === eagoh.id ? <Check color={palette.cyan} size={16} /> : null}
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}
      </View>

      {/* Topic / prompt */}
      <View style={styles.setupSection}>
        <Text style={styles.setupLabel}>Topic or Question</Text>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="What intelligence do you need…"
          placeholderTextColor={palette.muted}
          multiline
          style={styles.promptInput}
        />
      </View>

      {/* Domain reminder */}
      {selectedEagoh && domain ? (
        <View style={[styles.domainReminder, { borderColor: `${toneColor(domain.tone)}44`, backgroundColor: `${toneColor(domain.tone)}0F` }]}>
          <BrainCircuit color={toneColor(domain.tone)} size={16} />
          <View style={styles.domainTextWrap}>
            <Text style={[styles.domainTitle, { color: toneColor(domain.tone) }]}>{domain.label} Intelligence</Text>
            <Text style={styles.domainDesc}>{isDomainMatch ? "Your question is within this domain." : getDomainRejection(selectedEagoh.domain ?? "")}</Text>
          </View>
        </View>
      ) : null}

      {/* Cost */}
      <View style={styles.costRow}>
        <Zap color={palette.gold} size={18} />
        <Text style={styles.costLabel}>Estimated cost</Text>
        <Text style={styles.costValue}>{cost} Edge</Text>
      </View>

      {!canAfford ? <Text style={styles.errorText}>Insufficient Edge balance.</Text> : null}

      {/* Start button */}
      <Pressable
        onPress={handleStart}
        disabled={!selectedEagohId || !prompt.trim() || !canAfford || !isDomainMatch}
        style={({ pressed }) => [
          styles.startButton,
          (!selectedEagohId || !prompt.trim() || !canAfford) && styles.disabledButton,
          pressed && styles.pressed,
        ]}
      >
        <Sparkles color={palette.void} size={16} />
        <Text style={styles.startButtonText}>Start Session</Text>
      </Pressable>
    </View>
  );
}

// ---- Active chat ----
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

    // Quick Check: live OpenAI
    if (session.id === "quick-check") {
      const cost = getQuickCheckCost(prompt);
      if (edgeTotal < cost) {
        setError(`Insufficient Edge. Need ${cost} Edge.`);
        setIsTyping(false);
        return;
      }

      // Check domain match
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
        await deductQuickCheck(prompt, `Quick Check session · ${cost} Edge`);
      } catch (err) {
        setError("Edge deduction failed. Try again.");
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

    // Other sessions: UI-ready fallback (not yet activated)
    setMessages((prev) => [...prev, {
      id: `a-fallback-${Date.now()}`,
      sender: "analyst",
      text: `${session.name} is UI-ready but not yet fully activated. Quick Check is live. Use the Forge to create more EAGOHs across different domains.`,
      confidence: 85,
    }]);
    setIsTyping(false);
  }, []);

  // Trigger on mount
  React.useEffect(() => { runSession(); }, [runSession]);

  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={styles.chatWrap}>
      <Pressable onPress={onDone} style={styles.backButton}>
        <ArrowLeft color={palette.muted} size={20} />
        <Text style={styles.backText}>Sessions</Text>
      </Pressable>

      {/* Chat header */}
      <View style={styles.chatHeader}>
        <View style={styles.chatEagohInfo}>
          <BrainCircuit color={toneColor(session.tone)} size={22} />
          <View>
            <Text style={styles.chatEagohName}>{eagoh.name}</Text>
            <Text style={styles.chatSessionType}>{session.name} · {session.model}</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatMessages}
        contentContainerStyle={styles.chatMessagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => (
          <View key={msg.id} style={[styles.messageBubble, msg.sender === "analyst" ? styles.analystBubble : styles.userBubble]}>
            <Text style={msg.sender === "analyst" ? styles.analystText : styles.userText}>{msg.text}</Text>
            {msg.confidence ? <Text style={styles.messageConfidence}>Confidence {msg.confidence}%</Text> : null}
            {msg.cost ? <Text style={styles.messageCost}>{msg.cost} Edge</Text> : null}
          </View>
        ))}
        {isTyping ? (
          <View style={styles.typingRow}>
            <View style={styles.typingDots}>
              <View style={[styles.dot, { backgroundColor: palette.cyan }]} />
              <View style={[styles.dot, styles.dotMid, { backgroundColor: palette.cyan }]} />
              <View style={[styles.dot, { backgroundColor: palette.cyan }]} />
            </View>
            <Text style={styles.typingText}>Analyst is processing…</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

// ---- Main screen ----
export default function SessionsScreen(): JSX.Element {
  const [activeSession, setActiveSession] = useState<SessionType | null>(null);
  const [setupPrompt, setSetupPrompt] = useState<string>("");
  const { eagohs } = useEagohs();

  const handleSessionSelect = useCallback((session: SessionType): void => {
    Haptics.selectionAsync().catch(() => undefined);
    if (eagohs.length === 0) return;
    setActiveSession(session);
    setSetupPrompt("");
  }, [eagohs.length]);

  const handleBack = useCallback((): void => {
    setActiveSession(null);
    setSetupPrompt("");
  }, []);

  // When starting a session from setup
  const [activeEagohId, setActiveEagohId] = useState<string>("");
  const [activePrompt, setActivePrompt] = useState<string>("");
  const [isChatActive, setIsChatActive] = useState<boolean>(false);

  const handleStart = useCallback((eagohId: string, prompt: string): void => {
    setActiveEagohId(eagohId);
    setActivePrompt(prompt);
    setIsChatActive(true);
  }, []);

  const handleDone = useCallback((): void => {
    setIsChatActive(false);
    setActiveSession(null);
  }, []);

  const activeEagoh = useMemo(() => eagohs.find((e) => e.id === activeEagohId), [eagohs, activeEagohId]);

  // Active chat view
  if (isChatActive && activeSession && activeEagoh) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ActiveChat session={activeSession} eagoh={activeEagoh} prompt={activePrompt} onDone={handleDone} />
      </SafeAreaView>
    );
  }

  // Session setup view
  if (activeSession) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <SessionSetup session={activeSession} onBack={handleBack} onStart={handleStart} />
      </SafeAreaView>
    );
  }

  // Session type listing
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={["#03060B", "#0A1420", "#03060B"]} style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.hero}>
            <View style={styles.heroGlow} />
            <Text style={styles.kicker}>INTELLIGENCE SESSIONS</Text>
            <Text style={styles.title}>Run your EAGOH.</Text>
            <Text style={styles.subtitle}>
              Select a session type, choose an EAGOH from your collection, and let it analyze within its intelligence domain.
            </Text>
            {eagohs.length === 0 ? (
              <View style={styles.noEagohBanner}>
                <Sparkles color={palette.gold} size={18} />
                <Text style={styles.noEagohText}>Forge an EAGOH first to run sessions.</Text>
              </View>
            ) : (
              <Text style={styles.eagohCount}>{eagohs.length} EAGOH{eagohs.length === 1 ? "" : "s"} available</Text>
            )}
          </View>

          {/* Session type cards */}
          <Text style={styles.sectionLabel}>SESSION TYPES</Text>
          <View style={styles.sessionGrid}>
            {sessionTypes.map((session) => {
              const accent = toneColor(session.tone);
              const hasEagohs = eagohs.length > 0;
              return (
                <Pressable
                  key={session.id}
                  onPress={() => handleSessionSelect(session)}
                  disabled={!hasEagohs && session.id !== "quick-check"}
                  style={({ pressed }) => [
                    styles.sessionCard,
                    { borderColor: session.active ? `${accent}66` : palette.line },
                    pressed && styles.pressed,
                    !hasEagohs && styles.disabledCard,
                  ]}
                >
                  <View style={[styles.sessionTopRow, { backgroundColor: `${accent}14` }]} />
                  <View style={styles.sessionContent}>
                    <View style={styles.sessionIconRow}>
                      <View style={[styles.sessionIcon, { backgroundColor: `${accent}1F`, borderColor: `${accent}44` }]}>
                        {session.id === "quick-check" ? (
                          <Zap color={accent} size={20} />
                        ) : session.id === "oracle" ? (
                          <Orbit color={accent} size={20} />
                        ) : session.id === "premium-event" ? (
                          <Flame color={accent} size={20} />
                        ) : (
                          <BrainCircuit color={accent} size={20} />
                        )}
                      </View>
                      {session.active ? (
                        <View style={styles.activePill}>
                          <Sparkles color={palette.success} size={10} />
                          <Text style={styles.activePillText}>LIVE</Text>
                        </View>
                      ) : (
                        <View style={styles.inactivePill}>
                          <Clock color={palette.muted} size={10} />
                          <Text style={styles.inactivePillText}>UI READY</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.sessionName}>{session.name}</Text>
                    <View style={styles.sessionMetaRow}>
                      <Cpu color={palette.muted} size={12} />
                      <Text style={styles.sessionModel}>{session.model}</Text>
                    </View>
                    <View style={styles.sessionMetaRow}>
                      <Clock color={palette.muted} size={12} />
                      <Text style={styles.sessionDuration}>{session.duration}</Text>
                    </View>
                    <Text style={styles.sessionMood}>{session.mood}</Text>
                    <View style={styles.sessionCostRow}>
                      <Zap color={accent} size={14} />
                      <Text style={[styles.sessionCost, { color: accent }]}>{session.costRange}</Text>
                    </View>
                  </View>
                  <View style={styles.sessionArrow}>
                    <ChevronRight color={accent} size={18} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.void },
  root: { flex: 1 },
  scroll: { padding: 18, paddingBottom: 120 },

  // Hero
  hero: {
    borderRadius: 5,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(54,245,255,0.2)",
    backgroundColor: "rgba(8,15,26,0.85)",
    marginBottom: 22,
    overflow: "hidden",
  },
  heroGlow: { position: "absolute", right: -50, top: -50, width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: "rgba(54,245,255,0.18)" },
  kicker: { color: palette.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2.4 },
  title: { color: palette.text, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 6 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 10, fontWeight: "700" },
  noEagohBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: palette.goldSoft,
    borderWidth: 1,
    borderColor: "rgba(255,181,71,0.25)",
  },
  noEagohText: { color: palette.gold, fontSize: 13, fontWeight: "800" },
  eagohCount: { color: palette.text, fontSize: 13, fontWeight: "900", marginTop: 14 },

  // Section
  sectionLabel: { color: palette.gold, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 10 },

  // Session grid
  sessionGrid: { gap: 10 },
  sessionCard: {
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: "rgba(14,24,37,0.82)",
    overflow: "hidden",
    flexDirection: "row",
  },
  sessionTopRow: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
  sessionContent: { flex: 1, padding: 16 },
  sessionIconRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sessionIcon: { width: 40, height: 40, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  activePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, backgroundColor: "rgba(0,255,178,0.12)", borderWidth: 1, borderColor: "rgba(0,255,178,0.28)" },
  activePillText: { color: palette.success, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  inactivePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, backgroundColor: "rgba(141,162,181,0.08)", borderWidth: 1, borderColor: palette.line },
  inactivePillText: { color: palette.muted, fontSize: 9, fontWeight: "700" },
  sessionName: { color: palette.text, fontSize: 18, fontWeight: "900" },
  sessionMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  sessionModel: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  sessionDuration: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  sessionMood: { color: palette.text, fontSize: 12, fontWeight: "800", marginTop: 8 },
  sessionCostRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  sessionCost: { fontSize: 14, fontWeight: "900" },
  sessionArrow: { justifyContent: "center", paddingRight: 14 },
  disabledCard: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.88 },

  // Setup
  setupWrap: { flex: 1, backgroundColor: palette.void, padding: 18 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  backText: { color: palette.muted, fontSize: 13, fontWeight: "800" },
  setupHeader: { alignItems: "center", gap: 8, marginBottom: 22 },
  setupIcon: { width: 60, height: 60, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  setupTitle: { color: palette.text, fontSize: 24, fontWeight: "900" },
  setupMeta: { color: palette.muted, fontSize: 13, fontWeight: "700" },
  setupSection: { marginBottom: 16 },
  setupLabel: { color: palette.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 1.8, marginBottom: 8, textTransform: "uppercase" },
  eagohSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
    borderRadius: 5,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.6)",
  },
  eagohSelected: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  eagohDot: { width: 10, height: 10, borderRadius: 5 },
  eagohSelectedInfo: { flex: 1 },
  eagohSelectedName: { color: palette.text, fontSize: 14, fontWeight: "900" },
  eagohSelectedDomain: { color: palette.muted, fontSize: 11, marginTop: 2 },
  eagohPlaceholder: { color: palette.muted, fontSize: 14, fontWeight: "700", flex: 1 },
  eagohList: {
    marginTop: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(2,4,10,0.92)",
    overflow: "hidden",
  },
  eagohListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  eagohItemInfo: { flex: 1 },
  eagohItemName: { color: palette.text, fontSize: 13, fontWeight: "800" },
  eagohItemDomain: { color: palette.muted, fontSize: 11, marginTop: 1 },
  emptyText: { color: palette.muted, padding: 14, fontSize: 13, fontWeight: "700", textAlign: "center" },
  promptInput: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
    minHeight: 100,
    borderRadius: 5,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.6)",
    textAlignVertical: "top",
  },
  domainReminder: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 16,
  },
  domainTextWrap: { flex: 1 },
  domainTitle: { fontSize: 13, fontWeight: "900" },
  domainDesc: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  costRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.line,
  },
  costLabel: { color: palette.muted, fontSize: 13, fontWeight: "800", flex: 1 },
  costValue: { color: palette.gold, fontSize: 18, fontWeight: "900" },
  errorText: { color: palette.ember, fontSize: 12, fontWeight: "800", marginTop: 8 },
  startButton: {
    minHeight: 54,
    borderRadius: 5,
    backgroundColor: palette.cyan,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
    shadowColor: palette.cyan,
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  startButtonText: { color: palette.void, fontSize: 15, fontWeight: "900" },
  disabledButton: { opacity: 0.5 },

  // Chat
  chatWrap: { flex: 1, backgroundColor: palette.void },
  chatHeader: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    marginBottom: 8,
  },
  chatEagohInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  chatEagohName: { color: palette.text, fontSize: 16, fontWeight: "900" },
  chatSessionType: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  chatMessages: { flex: 1 },
  chatMessagesContent: { padding: 18, gap: 12 },
  messageBubble: { maxWidth: "85%", borderRadius: 5, padding: 14 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "rgba(54,245,255,0.14)", borderWidth: 1, borderColor: "rgba(54,245,255,0.28)" },
  analystBubble: { alignSelf: "flex-start", backgroundColor: "rgba(16,27,42,0.82)", borderWidth: 1, borderColor: palette.line },
  userText: { color: palette.text, fontSize: 14, fontWeight: "700" },
  analystText: { color: palette.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  messageConfidence: { color: palette.muted, fontSize: 10, fontWeight: "900", marginTop: 8 },
  messageCost: { color: palette.gold, fontSize: 10, fontWeight: "900", marginTop: 4 },
  typingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  typingText: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  typingDots: { flexDirection: "row", gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 5 },
  dotMid: { opacity: 0.6 },

  bottomSpacer: { height: 60 },
});
