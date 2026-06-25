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
  BarChart3,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Dna,
  FileText,
  Gem,
  Info,
  PieChart,
  Plus,
  Search,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useProfile } from "@/providers/ProfileProvider";
import { useEdge } from "@/providers/EdgeProvider";
import { useEagohs } from "@/providers/EagohProvider";
import { INTELLIGENCE_DOMAINS } from "@/services/domains";
import { guardDomainRequest } from "@/services/domainGuard";
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
  { id: "quick-check", name: "Quick Check", description: "Get a fast AI pulse on your question. Perfect for quick decisions.", costRange: "5 EDGE", minCost: 5, maxCost: 5, model: "Pulse-Lite", duration: "1–2 min", tone: "cyan", active: true },
  { id: "quick-analysis", name: "Quick Analysis", description: "Deeper look with key factors and probabilities.", costRange: "15 EDGE", minCost: 15, maxCost: 15, model: "Tactic-Core", duration: "3–5 min", tone: "cyan", active: false },
  { id: "standard", name: "Standard Analysis", description: "Comprehensive breakdown with insights and recommended angles.", costRange: "35 EDGE", minCost: 35, maxCost: 35, model: "EAGOH Analyst", duration: "8–12 min", tone: "success", active: false },
  { id: "detailed", name: "Detailed Analysis", description: "In-depth analysis with advanced metrics, trends, and scenario projections.", costRange: "75 EDGE", minCost: 75, maxCost: 75, model: "Scenario-Core", duration: "15–25 min", tone: "violet", active: false },
  { id: "oracle", name: "Deep Dive Analysis", description: "Full-spectrum AI analysis with maximum depth and strategic recommendations.", costRange: "125 EDGE", minCost: 125, maxCost: 125, model: "Oracle-Synapse", duration: "30–45 min", tone: "violet", active: false },
  { id: "premium-event", name: "Elite Strategy Session", description: "Elite-level analysis with custom modeling, matchup simulation & expert AI strategies.", costRange: "250 EDGE", minCost: 250, maxCost: 250, model: "Event-Lens Pro", duration: "45–60 min", tone: "gold", active: false },
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
  if (id === "quick-check") return <Zap color={color} size={size} fill={color} fillOpacity={0.85} />;
  if (id === "quick-analysis") return <Search color={color} size={size} />;
  if (id === "standard") return <TrendingUp color={color} size={size} />;
  if (id === "detailed") return <PieChart color={color} size={size} fill={color} fillOpacity={0.35} />;
  if (id === "oracle") return <Target color={color} size={size} />;
  if (id === "premium-event") return <Star color={color} size={size} />;
  return <BrainCircuit color={color} size={size} />;
}

// ── Mockup-style session row ──
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
      style={({ pressed }) => [styles.sessionCard, disabled && styles.cardDisabled, pressed && styles.pressed]}
    >
      <View style={[styles.cardIcon, { backgroundColor: toneBg(session.tone), borderColor: `${accent}AA` }]}>
        {sessionIcon(session.id, accent, 34)}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{session.name}</Text>
        <Text style={styles.cardDesc}>{session.description}</Text>
      </View>
      <View style={styles.cardMetaBlock}>
        <View style={styles.cardTimeRow}>
          <Clock color="rgba(108,230,255,0.72)" size={15} />
          <Text style={styles.cardMetaText}>{session.duration.toUpperCase()}</Text>
        </View>
        <View style={[styles.cardCostPill, { borderColor: `${accent}88` }]}> 
          <Gem color={palette.cyan} size={14} fill={palette.cyan} fillOpacity={0.25} />
          <Text style={[styles.cardCost, { color: accent }]}>{session.costRange}</Text>
        </View>
      </View>
      <ChevronRight color={palette.text} size={28} strokeWidth={2.4} />
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
  const domainGuardResult = !prompt || !selectedEagoh?.domain ? null : guardDomainRequest(selectedEagoh.domain, prompt);
  const isDomainMatch = !domainGuardResult || domainGuardResult.ok;

  const handleStart = useCallback((): void => {
    if (!selectedEagohId || !prompt.trim()) return;
    Haptics.selectionAsync().catch(() => undefined);
    onStart(selectedEagohId, prompt);
  }, [selectedEagohId, prompt, onStart]);

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

      const domainCheck = guardDomainRequest(eagoh.domain, prompt);
      if (!domainCheck.ok) {
        setMessages((prev) => [...prev, {
          id: `a-domain-${Date.now()}`,
          sender: "analyst",
          text: domainCheck.rejectionMessage,
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

    // Domain guard check for non-Quick-Check sessions too
    if (eagoh.domain) {
      const domainCheck = guardDomainRequest(eagoh.domain, prompt);
      if (!domainCheck.ok) {
        setMessages((prev) => [...prev, {
          id: `a-domain-${Date.now()}`,
          sender: "analyst",
          text: domainCheck.rejectionMessage,
          confidence: 0,
        }]);
        setIsTyping(false);
        return;
      }
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
  const { total: edgeTotal } = useEdge();
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
          <View style={styles.topBar}>
            <Pressable style={({ pressed }) => [styles.backGlyph, pressed && styles.pressed]}>
              <ArrowLeft color={palette.cyan} size={34} strokeWidth={2.2} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>AI SESSIONS</Text>
              <Text style={styles.kicker}>CHOOSE YOUR ANALYSIS DEPTH</Text>
            </View>
            <View style={styles.edgeBox}>
              <Text style={styles.edgeLabel}>EDGE BALANCE</Text>
              <View style={styles.edgeAmountRow}>
                <Gem color={palette.cyan} size={20} fill={palette.cyan} fillOpacity={0.32} />
                <Text style={styles.edgeAmount}>{edgeTotal.toLocaleString()}</Text>
                <View style={styles.edgePlus}><Plus color={palette.void} size={16} strokeWidth={3} /></View>
              </View>
            </View>
          </View>

          <View style={styles.mockHero}>
            <LinearGradient colors={["rgba(0,20,42,0.10)", "rgba(0,126,255,0.22)", "rgba(2,4,10,0.04)"]} style={StyleSheet.absoluteFill} />
            <View style={styles.scanArc} />
            <View style={[styles.sidePanel, styles.leftPanel]} />
            <View style={[styles.sidePanel, styles.rightPanel]} />
            <Pressable onPress={() => setShowPicker(true)} style={({ pressed }) => [styles.statusCard, pressed && styles.pressed]}>
              <Text style={styles.statusLabel}>EAGOH STATUS</Text>
              <Text style={styles.statusValue}>{selectedEagoh ? (userTier === "free" ? "DORMANT" : "ACTIVATED") : "NONE"}</Text>
              <Text style={styles.statusSub}>{userTier === "free" ? "FREE CHASSIS" : "PREMIUM CHASSIS"}</Text>
            </Pressable>
            <Pressable onPress={() => setShowPicker(true)} style={({ pressed }) => [styles.dnaCard, pressed && styles.pressed]}>
              <Dna color={palette.cyan} size={27} />
              <Text style={styles.dnaText}>VIEW DNA{"\n"}SUMMARY</Text>
            </Pressable>
            <View style={styles.eagohFigure}>
              <View style={styles.brainDome}>
                {selectedEagoh?.image_url ? (
                  <Image source={{ uri: selectedEagoh.image_url }} style={styles.eagohImage} contentFit="cover" />
                ) : (
                  <BrainCircuit color={palette.cyan} size={78} strokeWidth={1.7} />
                )}
              </View>
              <View style={styles.neckChain} />
              <View style={styles.armorTorso}>
                <Text style={styles.chestMark}>{selectedEagoh?.name?.charAt(0)?.toUpperCase() ?? "N"}</Text>
              </View>
              <View style={[styles.shoulder, styles.leftShoulder]} />
              <View style={[styles.shoulder, styles.rightShoulder]} />
            </View>
          </View>

          {eagohs.length === 0 ? (
            <View style={styles.emptyBanner}>
              <Sparkles color={palette.gold} size={14} />
              <Text style={styles.emptyText}>Forge an EAGOH first to run sessions.</Text>
            </View>
          ) : null}

          <View style={styles.selectorPanel}>
            <Text style={styles.sectionLabel}>SELECT AI SESSION TYPE</Text>
            <Text style={styles.sectionSub}>Different depths. Different insights. Choose what you need.</Text>
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
            <View style={styles.infoPanel}>
              <View style={styles.infoIcon}><Info color={palette.cyan} size={22} /></View>
              <Text style={styles.infoText}>Higher depth provides more data, better accuracy, and stronger insights.{"\n"}Choose the session that matches your goal.</Text>
            </View>
          </View>

          <View style={styles.mockTabs}>
            <View style={[styles.mockTabItem, styles.mockTabActive]}>
              <BrainCircuit color={palette.cyan} size={29} />
              <Text style={styles.mockTabActiveText}>AI SESSIONS</Text>
            </View>
            <View style={styles.mockTabItem}>
              <FileText color={palette.muted} size={28} />
              <Text style={styles.mockTabText}>MY SESSIONS</Text>
            </View>
            <View style={styles.mockTabItem}>
              <BarChart3 color={palette.muted} size={28} />
              <Text style={styles.mockTabText}>INSIGHTS</Text>
            </View>
            <View style={styles.mockTabItem}>
              <Clock color={palette.muted} size={29} />
              <Text style={styles.mockTabText}>HISTORY</Text>
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>

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
  scroll: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 104 },

  topBar: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  backGlyph: { width: 34, height: 44, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  kicker: { color: palette.cyan, fontSize: 18, fontWeight: "800", letterSpacing: 2.1, marginTop: 1 },
  title: { color: palette.text, fontSize: 31, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" },
  edgeBox: {
    minWidth: 118,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(0,216,255,0.42)",
    backgroundColor: "rgba(0,14,28,0.72)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  edgeLabel: { color: palette.cyan, fontSize: 12, fontWeight: "900", letterSpacing: 0.6, textAlign: "center", marginBottom: 7 },
  edgeAmountRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  edgeAmount: { color: palette.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.8 },
  edgePlus: { width: 24, height: 24, borderRadius: 5, backgroundColor: palette.cyan, alignItems: "center", justifyContent: "center" },

  mockHero: { height: 357, marginHorizontal: -14, marginBottom: -2, overflow: "hidden", backgroundColor: "#030914" },
  scanArc: {
    position: "absolute",
    alignSelf: "center",
    top: 18,
    width: 285,
    height: 285,
    borderRadius: 143,
    borderWidth: 1,
    borderColor: "rgba(0,118,255,0.34)",
    shadowColor: palette.blue,
    shadowOpacity: 0.55,
    shadowRadius: 22,
  },
  sidePanel: { position: "absolute", width: 72, height: 108, borderRadius: 5, borderWidth: 1, borderColor: "rgba(0,140,255,0.18)", backgroundColor: "rgba(0,38,84,0.18)" },
  leftPanel: { left: 14, top: 128 },
  rightPanel: { right: 14, top: 118 },
  statusCard: { position: "absolute", left: 14, top: 48, width: 126, borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,216,255,0.30)", backgroundColor: "rgba(0,12,24,0.78)", padding: 12 },
  statusLabel: { color: palette.text, fontSize: 12, fontWeight: "900" },
  statusValue: { color: palette.cyan, fontSize: 18, fontWeight: "900", marginTop: 8, letterSpacing: 0.7 },
  statusSub: { color: "#9FEBFF", fontSize: 11, fontWeight: "800", marginTop: 8 },
  dnaCard: { position: "absolute", right: 14, top: 48, width: 124, minHeight: 78, borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,216,255,0.26)", backgroundColor: "rgba(0,12,24,0.80)", padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  dnaText: { color: palette.cyan, fontSize: 13, fontWeight: "900", lineHeight: 20 },
  eagohFigure: { position: "absolute", alignSelf: "center", bottom: -18, width: 246, height: 330, alignItems: "center" },
  brainDome: { width: 112, height: 126, borderRadius: 55, borderWidth: 2, borderColor: palette.cyan, backgroundColor: "rgba(0,126,255,0.20)", alignItems: "center", justifyContent: "center", overflow: "hidden", shadowColor: palette.cyan, shadowOpacity: 0.8, shadowRadius: 18 },
  eagohImage: { width: "100%", height: "100%" },
  neckChain: { width: 76, height: 11, borderRadius: 6, backgroundColor: "rgba(220,240,255,0.42)", marginTop: -4, transform: [{ rotate: "-9deg" }] },
  armorTorso: { width: 158, height: 178, marginTop: -2, borderTopLeftRadius: 42, borderTopRightRadius: 42, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, borderWidth: 1, borderColor: "rgba(132,190,255,0.44)", backgroundColor: "rgba(17,22,32,0.96)", alignItems: "center", paddingTop: 50, shadowColor: palette.blue, shadowOpacity: 0.4, shadowRadius: 14 },
  chestMark: { color: palette.text, fontSize: 52, fontWeight: "900", textShadowColor: palette.cyan, textShadowRadius: 12 },
  shoulder: { position: "absolute", top: 142, width: 72, height: 94, borderRadius: 28, borderWidth: 1, borderColor: "rgba(132,190,255,0.34)", backgroundColor: "rgba(18,24,34,0.96)" },
  leftShoulder: { left: 0, transform: [{ rotate: "18deg" }] },
  rightShoulder: { right: 0, transform: [{ rotate: "-18deg" }] },

  emptyBanner: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: palette.goldSoft, borderWidth: 1, borderColor: "rgba(255,181,71,0.24)" },
  emptyText: { color: palette.gold, fontSize: 12, fontWeight: "800" },

  eagohCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(10,20,35,0.60)", paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  eagohCardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  eagohCardAvatar: { width: 42, height: 42, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  eagohCardInfo: { flex: 1 },
  eagohCardName: { color: palette.text, fontSize: 14, fontWeight: "900" },
  eagohCardDomain: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  eagohCardRight: { alignItems: "flex-end", gap: 4 },
  eagohShellBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1 },
  eagohShellText: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  eagohCardChange: { color: palette.cyan, fontSize: 11, fontWeight: "800" },

  selectorPanel: { borderRadius: 10, borderWidth: 1, borderColor: "rgba(0,216,255,0.43)", backgroundColor: "rgba(0,13,25,0.88)", padding: 16, shadowColor: palette.blue, shadowOpacity: 0.2, shadowRadius: 18 },
  sectionLabel: { color: palette.cyan, fontSize: 18, fontWeight: "900", letterSpacing: 1.8, marginBottom: 8 },
  sectionSub: { color: "rgba(220,232,245,0.68)", fontSize: 14, fontWeight: "700", marginBottom: 16 },
  sessionList: { gap: 10 },

  sessionCard: { flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,216,255,0.20)", backgroundColor: "rgba(0,21,38,0.58)", minHeight: 106, paddingHorizontal: 14, paddingVertical: 14, gap: 14, overflow: "hidden" },
  cardIcon: { width: 74, height: 74, borderRadius: 10, borderWidth: 1.2, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 7 },
  cardName: { color: palette.text, fontSize: 18, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
  cardDesc: { color: "rgba(220,232,245,0.70)", fontSize: 13.5, fontWeight: "700", lineHeight: 20 },
  cardMetaBlock: { alignItems: "flex-end", gap: 14, minWidth: 96 },
  cardTimeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardMetaText: { color: "rgba(220,232,245,0.70)", fontSize: 13, fontWeight: "800" },
  cardCostPill: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 7, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 8, backgroundColor: "rgba(0,19,35,0.72)" },
  cardCost: { fontSize: 12.5, fontWeight: "900", letterSpacing: 0.4 },
  cardDisabled: { opacity: 0.45 },
  infoPanel: { marginTop: 18, borderRadius: 9, borderWidth: 1, borderColor: "rgba(0,216,255,0.50)", backgroundColor: "rgba(0,91,125,0.16)", padding: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  infoIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: palette.cyan, alignItems: "center", justifyContent: "center" },
  infoText: { flex: 1, color: palette.cyan, fontSize: 14, fontWeight: "800", lineHeight: 22 },
  mockTabs: { flexDirection: "row", alignItems: "center", marginTop: 18, borderRadius: 8, borderWidth: 1, borderColor: "rgba(120,180,255,0.36)", backgroundColor: "rgba(0,17,31,0.82)", overflow: "hidden" },
  mockTabItem: { flex: 1, minHeight: 86, alignItems: "center", justifyContent: "center", gap: 8, borderRightWidth: 1, borderRightColor: "rgba(120,180,255,0.12)" },
  mockTabActive: { backgroundColor: "rgba(0,216,255,0.08)" },
  mockTabActiveText: { color: palette.cyan, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  mockTabText: { color: "rgba(220,232,245,0.62)", fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
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
});
