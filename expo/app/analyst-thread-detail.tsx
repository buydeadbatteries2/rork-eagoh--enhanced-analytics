/**
 * Analyst Thread Detail — shows a single analyst thread with all messages.
 *
 * Reached from the Analyst Archive when a user taps a thread.
 * Loads the thread metadata and all messages, displaying them in a
 * read-only conversation view with session type, EAGOH info, and sources.
 */

import { palette } from "@/constants/colors";
import { useHaptics } from "@/hooks/useHaptics";
import { useSafeBack } from "@/hooks/useSafeBack";
import { useProfile } from "@/providers/ProfileProvider";
import {
  getThread,
  listMessages,
  type AnalystThread,
  type AnalystMessage,
} from "@/services/analystThreads";
import type { AnalystSessionType } from "@/services/analyst";
import { AnalysisVisualBlocks, AnalyticsDisclaimer } from "@/components/analysis/AnalysisVisualBlock";
import { parseVisualBlocks } from "@/components/analysis/visualBlockTypes";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Globe,
  MessageSquare,
  Search,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

// ── Session type metadata ─────────────────────────────────────────────────

type SessionMeta = {
  id: AnalystSessionType;
  name: string;
  tone: "cyan" | "gold" | "violet" | "ember" | "success";
};

const SESSION_META: Record<string, SessionMeta> = {
  "quick-check": { id: "quick-check", name: "Quick Check", tone: "cyan" },
  "quick-analytics": { id: "quick-analytics", name: "Quick Analysis", tone: "gold" },
  "standard": { id: "standard", name: "Standard Analysis", tone: "success" },
  "oracle": { id: "oracle", name: "Oracle Deep Dive", tone: "violet" },
  "premium-event": { id: "premium-event", name: "Premium Event", tone: "ember" },
};

function toneColor(tone: string): string {
  if (tone === "gold") return palette.gold;
  if (tone === "violet") return palette.violet;
  if (tone === "ember") return palette.ember;
  if (tone === "success") return palette.success;
  return palette.cyan;
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function AnalystThreadDetailScreen(): JSX.Element {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const h = useHaptics();
  const safeBack = useSafeBack();
  const { profile } = useProfile();

  const [thread, setThread] = useState<AnalystThread | null>(null);
  const [messages, setMessages] = useState<AnalystMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!threadId || !profile?.id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Load thread metadata — getThread uses RLS so only the owner can see it
        const t = await getThread(threadId);
        if (cancelled) return;
        if (!t) {
          setError("This analyst thread could not be opened.");
          setLoading(false);
          return;
        }
        // Verify ownership (RLS already enforces this, but double-check)
        if (t.user_id !== profile.id) {
          setError("This analyst thread could not be opened.");
          setLoading(false);
          return;
        }
        setThread(t);

        // Load messages
        const msgs = await listMessages(threadId);
        if (cancelled) return;
        setMessages(msgs);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load thread.";
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId, profile?.id]);

  const handleBack = useCallback((): void => {
    h.selection();
    safeBack();
  }, [safeBack, h]);

  const toggleSources = useCallback((msgId: string): void => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }, []);

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <ArrowLeft color={palette.text} size={18} />
          </Pressable>
          <Text style={styles.headerTitle}>Thread</Text>
        </View>
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.cyan} size="large" />
          <Text style={styles.centerText}>Loading thread…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────

  if (error || !thread) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <ArrowLeft color={palette.text} size={18} />
          </Pressable>
          <Text style={styles.headerTitle}>Thread</Text>
        </View>
        <View style={styles.centerState}>
          <MessageSquare color={palette.muted} size={36} />
          <Text style={styles.centerTitle}>Unable to Open</Text>
          <Text style={styles.centerText}>
            {error ?? "This analyst thread could not be opened."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Thread detail ──────────────────────────────────────────────────────

  const meta = SESSION_META[thread.session_type] ?? SESSION_META["standard"];
  const ac = toneColor(meta.tone);
  const createdDate = new Date(thread.created_at).toLocaleString();

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <ArrowLeft color={palette.text} size={18} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{thread.title}</Text>
          <Text style={styles.headerSub}>{meta.name} · {createdDate}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Thread metadata banner */}
        <View style={[styles.metaBanner, { borderColor: `${ac}22` }]}>
          <LinearGradient
            colors={[`${ac}08`, "rgba(8,15,26,0.85)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.metaIcon, { backgroundColor: `${ac}14`, borderColor: `${ac}33` }]}>
            <MessageSquare color={ac} size={16} />
          </View>
          <View style={styles.metaInfo}>
            <Text style={styles.metaType}>{meta.name}</Text>
            <Text style={styles.metaDetails}>
              {thread.domain ? `Domain: ${thread.domain}` : "No domain"} · {messages.length} message{messages.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.emptyMsgs}>
            <Text style={styles.emptyMsgsText}>No messages in this thread.</Text>
          </View>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            const vblocks = !isUser && msg.visual_blocks ? parseVisualBlocks(msg.visual_blocks) : null;
            return (
              <View key={msg.id} style={[styles.msgBubble, isUser ? styles.userBubble : styles.analystBubble]}>
                <View style={[styles.msgRoleTag, { backgroundColor: isUser ? `${palette.gold}14` : `${ac}14` }]}>
                  <Text style={[styles.msgRoleText, { color: isUser ? palette.gold : ac }]}>
                    {isUser ? "You" : "Analyst"}
                  </Text>
                </View>
                {vblocks && vblocks.length > 0 ? (
                  <View style={{ marginBottom: 8 }}>
                    <AnalysisVisualBlocks blocks={vblocks} />
                    <View style={{ marginTop: 6 }}>
                      <AnalyticsDisclaimer />
                    </View>
                  </View>
                ) : null}
                <Text style={styles.msgContent}>{msg.content}</Text>
                <Text style={styles.msgTime}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {msg.edge_cost > 0 ? ` · ${msg.edge_cost} Neurons` : ""}
                </Text>
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

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
  headerInfo: { flex: 1, gap: 2 },
  headerTitle: { color: palette.text, fontSize: 16, fontWeight: "900" as const },
  headerSub: { color: palette.muted, fontSize: 11, fontWeight: "600" as const },

  scroll: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 40, gap: 10 },

  metaBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    overflow: "hidden" as const,
    marginBottom: 6,
  },
  metaIcon: {
    width: 38,
    height: 38,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  metaInfo: { flex: 1, gap: 2 },
  metaType: { color: palette.text, fontSize: 15, fontWeight: "800" as const },
  metaDetails: { color: palette.muted, fontSize: 11, fontWeight: "600" as const },

  msgBubble: {
    borderRadius: 10,
    padding: 14,
    gap: 8,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: "rgba(255,204,68,0.04)" as const,
    borderColor: "rgba(255,204,68,0.15)" as const,
    alignSelf: "flex-end" as const,
    maxWidth: "88%" as const,
  },
  analystBubble: {
    backgroundColor: "rgba(108,230,255,0.04)" as const,
    borderColor: "rgba(108,230,255,0.15)" as const,
    alignSelf: "flex-start" as const,
    maxWidth: "88%" as const,
  },
  msgRoleTag: {
    alignSelf: "flex-start" as const,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  msgRoleText: { fontSize: 10, fontWeight: "800" as const, letterSpacing: 0.5 },
  msgContent: { color: palette.text, fontSize: 14, fontWeight: "500" as const, lineHeight: 20 },
  msgTime: { color: palette.muted, fontSize: 10, fontWeight: "600" as const },

  emptyMsgs: { alignItems: "center" as const, paddingVertical: 40, gap: 10 },
  emptyMsgsText: { color: palette.muted, fontSize: 13, fontWeight: "600" as const },

  centerState: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, padding: 40, gap: 14 },
  centerTitle: { color: palette.text, fontSize: 17, fontWeight: "900" as const, textAlign: "center" as const },
  centerText: { color: palette.muted, fontSize: 13, fontWeight: "600" as const, textAlign: "center" as const, lineHeight: 19 },
});
