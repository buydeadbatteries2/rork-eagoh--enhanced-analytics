/**
 * Arena Mode Setup — Phase 11A
 *
 * Lets the user select an eligible EAGOH, a domain-specific comparison type,
 * Subject A and Subject B, an optional focus, and an optional custom
 * question, then validates the matchup through the secure worker endpoint
 * POST /arena/validate.
 *
 * Phase 11A stops before generating the final AI comparison. No Neurons
 * are deducted. On a valid matchup, the user sees:
 *   "Matchup confirmed. Arena analysis will be enabled in the next phase."
 *
 * Security:
 *   - Only EAGOHs owned by the authenticated user are selectable (client filter
 *     mirrors server ownership check; the worker is authoritative).
 *   - The domain is read from the EAGOH record — never trusted from the client.
 *   - Validation is performed server-side via the secure worker.
 */

import { palette } from "@/constants/colors";
import { DEFAULT_EAGOH_IMAGE } from "@/constants/defaultEagoh";
import { useAppTheme } from "@/providers/ThemeProvider";
import { useHaptics } from "@/hooks/useHaptics";
import { useSafeBack } from "@/hooks/useSafeBack";
import { useEagohs } from "@/providers/EagohProvider";
import { INTELLIGENCE_DOMAINS, getDomainColor } from "@/services/domains";
import {
  ARENA_DOMAIN_RULES,
  getArenaDomainRule,
  normalizeSubject,
  validateArenaMatchup,
  type ArenaComparisonTypeId,
  type ArenaComparisonFocus,
  type ArenaSubject,
  type ArenaValidationResult,
} from "@/services/arena";
import type { EagohRecord } from "@/services/eagohs";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Scale,
  Sparkles,
  Swords,
  Trophy,
  X,
} from "lucide-react-native";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

// ── Eligibility ──────────────────────────────────────────────────────────────

/** Only user-forged, active EAGOHs are eligible for Arena Mode. */
function isArenaEligible(e: EagohRecord): boolean {
  if (e.is_default_shell || !e.is_user_forged) return false;
  if (e.status && e.status !== "active") return false;
  if (!e.domain) return false;
  return true;
}

// ── Subject input card ───────────────────────────────────────────────────────

const SubjectCard = memo(function SubjectCard({
  label,
  subject,
  onChange,
  contextLabel,
  contextPlaceholder,
  accent,
}: {
  label: string;
  subject: ArenaSubject;
  onChange: (s: ArenaSubject) => void;
  contextLabel: string;
  contextPlaceholder: string;
  accent: string;
}): JSX.Element {
  return (
    <View style={[arStyles.subjectCard, { borderColor: `${accent}33` }]}>
      <LinearGradient
        colors={[`${accent}0E`, "rgba(8,15,26,0.7)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={arStyles.subjectHeader}>
        <View style={[arStyles.subjectBadge, { backgroundColor: `${accent}1A`, borderColor: `${accent}44` }]}>
          <Swords color={accent} size={13} />
        </View>
        <Text style={[arStyles.subjectLabel, { color: accent }]}>{label}</Text>
      </View>
      <TextInput
        style={arStyles.subjectNameInput}
        placeholder="Primary name"
        placeholderTextColor={palette.placeholderText}
        value={subject.name}
        onChangeText={(v) => onChange({ ...subject, name: v })}
        maxLength={120}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <TextInput
        style={arStyles.subjectContextInput}
        placeholder={contextPlaceholder ? `${contextLabel}: ${contextPlaceholder}` : contextLabel}
        placeholderTextColor={palette.placeholderText}
        value={subject.context ?? ""}
        onChangeText={(v) => onChange({ ...subject, context: v })}
        maxLength={80}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <View style={arStyles.subjectRow}>
        <TextInput
          style={[arStyles.subjectYearInput, { borderColor: `${accent}22` }]}
          placeholder="Year / Season"
          placeholderTextColor={palette.placeholderText}
          value={subject.year ?? ""}
          onChangeText={(v) => onChange({ ...subject, year: v })}
          maxLength={30}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={[arStyles.subjectNotesInput, { borderColor: `${accent}22` }]}
          placeholder="Notes (optional)"
          placeholderTextColor={palette.placeholderText}
          value={subject.notes ?? ""}
          onChangeText={(v) => onChange({ ...subject, notes: v })}
          maxLength={300}
          autoCapitalize="sentences"
          autoCorrect={false}
        />
      </View>
    </View>
  );
});

// ── Comparison type picker ───────────────────────────────────────────────────

function ComparisonTypeOption({
  id,
  label,
  description,
  selected,
  onSelect,
  accent,
}: {
  id: ArenaComparisonTypeId;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  accent: string;
}): JSX.Element {
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        arStyles.cmpOption,
        selected && { borderColor: accent, backgroundColor: `${accent}12` },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[arStyles.cmpRadio, { borderColor: selected ? accent : palette.line }]}>
        {selected ? <View style={[arStyles.cmpRadioFill, { backgroundColor: accent }]} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={arStyles.cmpLabel}>{label}</Text>
        <Text style={arStyles.cmpDesc}>{description}</Text>
      </View>
    </Pressable>
  );
}

// ── Focus chip ───────────────────────────────────────────────────────────────

function FocusChip({
  focus,
  selected,
  onSelect,
}: {
  focus: ArenaComparisonFocus;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        arStyles.focusChip,
        selected && { borderColor: palette.violet, backgroundColor: "rgba(138,92,255,0.16)" },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[arStyles.focusChipText, selected && { color: palette.violet }]}>
        {focus.label}
      </Text>
    </Pressable>
  );
}

// ── EAGOH selector sheet ─────────────────────────────────────────────────────

function EagohSelectorSheet({
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
    <View style={arStyles.sheetOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={arStyles.sheet}>
        <LinearGradient
          colors={["rgba(14,24,37,0.98)", "rgba(8,15,26,0.98)"]}
          style={StyleSheet.absoluteFill}
        />
        <Text style={arStyles.sheetTitle}>Select Arena EAGOH</Text>
        {eagohs.length === 0 ? (
          <Text style={arStyles.sheetEmpty}>No eligible EAGOHs. Forge one to enter Arena Mode.</Text>
        ) : (
          eagohs.map((e) => {
            const domain = INTELLIGENCE_DOMAINS.find((d) => d.id === e.domain);
            const dc = getDomainColor(e.domain ?? "");
            const isSelected = selectedId === e.id;
            return (
              <Pressable
                key={e.id}
                onPress={() => { onSelect(e.id); onClose(); }}
                style={({ pressed }) => [
                  arStyles.sheetItem,
                  isSelected && { borderColor: palette.violet, backgroundColor: "rgba(138,92,255,0.08)" },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[arStyles.sheetDot, { backgroundColor: dc }]} />
                <View style={{ flex: 1 }}>
                  <Text style={arStyles.sheetItemName}>{e.name || "Unnamed"}</Text>
                  <Text style={arStyles.sheetItemDomain}>{domain?.label ?? e.domain ?? "No domain"}</Text>
                </View>
                {isSelected ? <Check color={palette.violet} size={16} /> : null}
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ArenaSetupScreen(): JSX.Element {
  const { palette: pal } = useAppTheme();
  const h = useHaptics();
  const goBack = useSafeBack("/(tabs)/sessions");
  const router = useRouter();
  const { eagohs } = useEagohs();

  const eligibleEagohs = useMemo(() => eagohs.filter(isArenaEligible), [eagohs]);
  const [selectedEagohId, setSelectedEagohId] = useState<string>("");

  // Pick first eligible EAGOH once available
  React.useEffect(() => {
    if (!selectedEagohId && eligibleEagohs.length > 0) {
      setSelectedEagohId(eligibleEagohs[0].id);
    }
  }, [eligibleEagohs, selectedEagohId]);

  const selectedEagoh = useMemo(
    () => eligibleEagohs.find((e) => e.id === selectedEagohId) ?? null,
    [eligibleEagohs, selectedEagohId],
  );

  const domainRule = useMemo(
    () => (selectedEagoh?.domain ? getArenaDomainRule(selectedEagoh.domain) : null),
    [selectedEagoh],
  );

  const [comparisonType, setComparisonType] = useState<ArenaComparisonTypeId | null>(null);
  const [subjectA, setSubjectA] = useState<ArenaSubject>({ name: "" });
  const [subjectB, setSubjectB] = useState<ArenaSubject>({ name: "" });
  const [focusId, setFocusId] = useState<string>("overall");
  const [customFocus, setCustomFocus] = useState<string>("");
  const [customQuestion, setCustomQuestion] = useState<string>("");
  const [showEagohSheet, setShowEagohSheet] = useState<boolean>(false);

  const [validating, setValidating] = useState<boolean>(false);
  const [result, setResult] = useState<ArenaValidationResult | null>(null);

  const accent = palette.violet;

  const handleSelectEagoh = useCallback((id: string) => {
    setSelectedEagohId(id);
    setComparisonType(null);
    setResult(null);
  }, []);

  const handleSelectComparison = useCallback((id: ArenaComparisonTypeId) => {
    h.selection();
    setComparisonType(id);
    setResult(null);
  }, [h]);

  const canSubmit = useMemo(() => {
    if (!selectedEagoh || !domainRule || !comparisonType) return false;
    if (!subjectA.name.trim() || !subjectB.name.trim()) return false;
    return true;
  }, [selectedEagoh, domainRule, comparisonType, subjectA, subjectB]);

  const handleEnterArena = useCallback(async () => {
    if (!selectedEagoh || !comparisonType) return;
    h.selection();
    setValidating(true);
    setResult(null);
    try {
      const res = await validateArenaMatchup({
        eagohId: selectedEagoh.id,
        comparisonType,
        subjectA: normalizeSubject(subjectA),
        subjectB: normalizeSubject(subjectB),
      });
      setResult(res);
      if (res.valid) h.success();
    } finally {
      setValidating(false);
    }
  }, [selectedEagoh, comparisonType, subjectA, subjectB, h]);

  // ── No eligible EAGOH empty state ──
  if (eligibleEagohs.length === 0) {
    return (
      <SafeAreaView style={arStyles.safe} edges={["top"]}>
        <View style={arStyles.header}>
          <Pressable onPress={goBack} hitSlop={12} style={arStyles.backBtn}>
            <ArrowLeft color={palette.text} size={20} />
          </Pressable>
          <Text style={arStyles.headerTitle}>Arena Mode</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={arStyles.emptyWrap}>
          <View style={arStyles.emptyIconWrap}>
            <LinearGradient
              colors={["rgba(138,92,255,0.16)", "rgba(8,15,26,0.7)"]}
              style={StyleSheet.absoluteFill}
            />
            <Swords color={palette.violet} size={36} />
          </View>
          <Text style={arStyles.emptyTitle}>No Eligible EAGOH</Text>
          <Text style={arStyles.emptyText}>
            Create an EAGOH in the Forge before entering Arena Mode.
          </Text>
          <Pressable
            onPress={() => { h.selection(); router.push("/(tabs)/forge" as never); }}
            style={({ pressed }) => [arStyles.forgeCta, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[palette.violet, "rgba(138,92,255,0.6)"]}
              style={StyleSheet.absoluteFill}
            />
            <Text style={arStyles.forgeCtaText}>Open the Forge</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={arStyles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={arStyles.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Header */}
        <View style={arStyles.header}>
          <Pressable onPress={goBack} hitSlop={12} style={arStyles.backBtn}>
            <ArrowLeft color={palette.text} size={20} />
          </Pressable>
          <View style={arStyles.headerCenter}>
            <Swords color={palette.violet} size={16} />
            <Text style={arStyles.headerTitle}>Arena Mode</Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          style={arStyles.scroll}
          contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Phase notice */}
          <View style={arStyles.phaseNotice}>
            <LinearGradient
              colors={["rgba(138,92,255,0.08)", "rgba(10,18,30,0.6)"]}
              style={StyleSheet.absoluteFill}
            />
            <Sparkles color={palette.violet} size={14} />
            <Text style={arStyles.phaseNoticeText}>
              Phase 11A — Setup & validation. Full Arena analysis arrives in the next phase.
            </Text>
          </View>

          {/* Selected EAGOH card */}
          <Pressable
            onPress={() => { h.selection(); setShowEagohSheet(true); }}
            style={({ pressed }) => [arStyles.eagohCard, pressed && { opacity: 0.9 }]}
          >
            <LinearGradient
              colors={["rgba(138,92,255,0.08)", "rgba(8,15,26,0.9)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {selectedEagoh?.image_thumb_url || selectedEagoh?.image_url ? (
              <Image
                source={{ uri: selectedEagoh.image_thumb_url ?? selectedEagoh.image_url ?? "" }}
                style={arStyles.eagohThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={[arStyles.eagohThumb, { alignItems: "center", justifyContent: "center" }]}>
                <Swords color={palette.violet} size={20} />
              </View>
            )}
            <View style={arStyles.eagohInfo}>
              <Text style={arStyles.eagohName} numberOfLines={1}>{selectedEagoh?.name ?? "Select EAGOH"}</Text>
              <Text style={arStyles.eagohDomain}>
                {INTELLIGENCE_DOMAINS.find((d) => d.id === selectedEagoh?.domain)?.label ?? selectedEagoh?.domain ?? "No domain"}
                {selectedEagoh?.sport ? ` · ${selectedEagoh.sport}` : ""}
              </Text>
              {domainRule ? (
                <Text style={arStyles.eagohSpec}>
                  {domainRule.comparisonTypes.length} comparison types available
                </Text>
              ) : null}
            </View>
            <View style={arStyles.eagohChevron}>
              <ChevronDown color={palette.muted} size={18} />
            </View>
          </Pressable>

          {/* Comparison type selection */}
          {domainRule ? (
            <View style={arStyles.section}>
              <Text style={arStyles.sectionLabel}>COMPARISON TYPE</Text>
              {domainRule.comparisonTypes.map((ct) => (
                <ComparisonTypeOption
                  key={ct.id}
                  id={ct.id}
                  label={ct.label}
                  description={ct.description}
                  selected={comparisonType === ct.id}
                  onSelect={() => handleSelectComparison(ct.id)}
                  accent={accent}
                />
              ))}
            </View>
          ) : null}

          {/* Subject entry */}
          {domainRule ? (
            <View style={arStyles.section}>
              <Text style={arStyles.sectionLabel}>THE MATCHUP</Text>
              <SubjectCard
                label="Subject A"
                subject={subjectA}
                onChange={(s) => { setSubjectA(s); setResult(null); }}
                contextLabel={domainRule.labels.context}
                contextPlaceholder={domainRule.labels.contextPlaceholder}
                accent={palette.cyan}
              />
              <View style={arStyles.vsRow}>
                <View style={arStyles.vsLine} />
                <View style={arStyles.vsBadge}>
                  <Text style={arStyles.vsText}>VS</Text>
                </View>
                <View style={arStyles.vsLine} />
              </View>
              <SubjectCard
                label="Subject B"
                subject={subjectB}
                onChange={(s) => { setSubjectB(s); setResult(null); }}
                contextLabel={domainRule.labels.context}
                contextPlaceholder={domainRule.labels.contextPlaceholder}
                accent={palette.gold}
              />
            </View>
          ) : null}

          {/* Comparison focus */}
          {domainRule ? (
            <View style={arStyles.section}>
              <Text style={arStyles.sectionLabel}>COMPARISON FOCUS (OPTIONAL)</Text>
              <View style={arStyles.focusWrap}>
                {domainRule.focusOptions.map((f) => (
                  <FocusChip
                    key={f.id}
                    focus={f}
                    selected={focusId === f.id}
                    onSelect={() => { h.selection(); setFocusId(f.id); }}
                  />
                ))}
                <FocusChip
                  focus={{ id: "custom", label: "Custom Focus" }}
                  selected={focusId === "custom"}
                  onSelect={() => { h.selection(); setFocusId("custom"); }}
                />
              </View>
              {focusId === "custom" ? (
                <TextInput
                  style={arStyles.customFocusInput}
                  placeholder="Describe your custom focus"
                  placeholderTextColor={palette.placeholderText}
                  value={customFocus}
                  onChangeText={setCustomFocus}
                  maxLength={120}
                  autoCapitalize="sentences"
                />
              ) : null}
            </View>
          ) : null}

          {/* Custom question */}
          {domainRule ? (
            <View style={arStyles.section}>
              <Text style={arStyles.sectionLabel}>CUSTOM QUESTION (OPTIONAL)</Text>
              <TextInput
                style={arStyles.customQuestionInput}
                placeholder="Ask a specific question for the Arena analysis"
                placeholderTextColor={palette.placeholderText}
                value={customQuestion}
                onChangeText={setCustomQuestion}
                maxLength={240}
                autoCapitalize="sentences"
                multiline
                numberOfLines={2}
              />
            </View>
          ) : null}

          {/* Compatibility rules */}
          {domainRule ? (
            <View style={arStyles.rulesCard}>
              <LinearGradient
                colors={["rgba(108,230,255,0.06)", "rgba(8,15,26,0.7)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={arStyles.rulesHeader}>
                <Scale color={palette.cyan} size={14} />
                <Text style={arStyles.rulesTitle}>Compatibility Rules</Text>
              </View>
              {domainRule.compatibilityRules.map((r, i) => (
                <View key={i} style={arStyles.ruleRow}>
                  <View style={arStyles.ruleDot} />
                  <Text style={arStyles.ruleText}>{r}</Text>
                </View>
              ))}
              {domainRule.examples.length > 0 ? (
                <View style={arStyles.examplesWrap}>
                  <Text style={arStyles.examplesLabel}>EXAMPLES</Text>
                  {domainRule.examples.map((ex, i) => (
                    <Text key={i} style={arStyles.exampleText}>• {ex}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Validation result */}
          {result ? (
            <View
              style={[
                arStyles.resultCard,
                result.valid
                  ? { borderColor: "rgba(0,255,178,0.40)" }
                  : { borderColor: "rgba(255,77,109,0.40)" },
              ]}
            >
              <LinearGradient
                colors={
                  result.valid
                    ? ["rgba(0,255,178,0.08)", "rgba(8,15,26,0.7)"]
                    : ["rgba(255,77,109,0.08)", "rgba(8,15,26,0.7)"]
                }
                style={StyleSheet.absoluteFill}
              />
              <View style={arStyles.resultHeader}>
                {result.valid ? (
                  <Check color={palette.success} size={18} />
                ) : (
                  <CircleAlert color={palette.ember} size={18} />
                )}
                <Text
                  style={[
                    arStyles.resultTitle,
                    { color: result.valid ? palette.success : palette.ember },
                  ]}
                >
                  {result.valid ? "Matchup Valid" : "Matchup Not Valid"}
                </Text>
              </View>
              <Text style={arStyles.resultExplanation}>{result.explanation}</Text>
              {result.detectedCategory ? (
                <Text style={arStyles.resultMeta}>Detected: {result.detectedCategory}</Text>
              ) : null}
              {result.valid ? (
                <View style={arStyles.confirmedBanner}>
                  <Trophy color={palette.violet} size={14} />
                  <Text style={arStyles.confirmedText}>
                    Matchup confirmed. Arena analysis will be enabled in the next phase.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/* Sticky Enter Arena button */}
        <View style={arStyles.stickyBar}>
          <Pressable
            onPress={handleEnterArena}
            disabled={!canSubmit || validating}
            style={({ pressed }) => [
              arStyles.enterBtn,
              (!canSubmit || validating) && arStyles.enterBtnDisabled,
              pressed && { opacity: 0.9 },
            ]}
          >
            <LinearGradient
              colors={canSubmit ? [palette.violet, "rgba(138,92,255,0.7)"] : ["rgba(60,70,90,0.5)", "rgba(40,50,70,0.5)"]}
              style={StyleSheet.absoluteFill}
            />
            {validating ? (
              <ActivityIndicator color={palette.void} size="small" />
            ) : (
              <>
                <Swords color={canSubmit ? palette.void : palette.muted} size={17} />
                <Text style={[arStyles.enterBtnText, !canSubmit && { color: palette.muted }]}>
                  Enter Arena
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {showEagohSheet ? (
          <EagohSelectorSheet
            eagohs={eligibleEagohs}
            selectedId={selectedEagohId}
            onSelect={handleSelectEagoh}
            onClose={() => setShowEagohSheet(false)}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const arStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.void },
  root: { flex: 1, backgroundColor: palette.void },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  backBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { color: palette.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },

  scroll: { flex: 1 },

  // Phase notice
  phaseNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(138,92,255,0.22)",
    overflow: "hidden",
    marginBottom: 14,
  },
  phaseNoticeText: { color: palette.muted, fontSize: 11, fontWeight: "700", flex: 1, lineHeight: 16 },

  // EAGOH card
  eagohCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "rgba(138,92,255,0.28)",
    padding: 12,
    marginBottom: 16,
    overflow: "hidden",
  },
  eagohThumb: {
    width: 52,
    height: 52,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(138,92,255,0.35)",
    backgroundColor: "rgba(138,92,255,0.10)",
  },
  eagohInfo: { flex: 1, paddingHorizontal: 12 },
  eagohName: { color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  eagohDomain: { color: palette.violet, fontSize: 11, fontWeight: "800", marginTop: 2 },
  eagohSpec: { color: palette.muted, fontSize: 10, fontWeight: "700", marginTop: 1 },
  eagohChevron: { paddingLeft: 8 },

  // Section
  section: { marginBottom: 18 },
  sectionLabel: {
    color: palette.gold,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 8,
  },

  // Comparison type options
  cmpOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,20,40,0.4)",
    marginBottom: 7,
  },
  cmpRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  cmpRadioFill: { width: 8, height: 8, borderRadius: 4 },
  cmpLabel: { color: palette.text, fontSize: 14, fontWeight: "900" },
  cmpDesc: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  // Subject card
  subjectCard: {
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 14,
    gap: 9,
    overflow: "hidden",
  },
  subjectHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  subjectBadge: {
    width: 26,
    height: 26,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  subjectLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  subjectNameInput: {
    color: palette.inputText,
    fontSize: 16,
    fontWeight: "900",
    backgroundColor: "rgba(10,20,40,0.6)",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  subjectContextInput: {
    color: palette.inputText,
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(10,20,40,0.6)",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  subjectRow: { flexDirection: "row", gap: 8 },
  subjectYearInput: {
    flex: 1,
    color: palette.inputText,
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(10,20,40,0.6)",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  subjectNotesInput: {
    flex: 1.6,
    color: palette.inputText,
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(10,20,40,0.6)",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },

  // VS divider
  vsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  vsLine: { flex: 1, height: 1, backgroundColor: "rgba(138,92,255,0.25)" },
  vsBadge: {
    width: 38,
    height: 26,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(138,92,255,0.40)",
    backgroundColor: "rgba(138,92,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  vsText: { color: palette.violet, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },

  // Focus chips
  focusWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  focusChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,20,40,0.4)",
  },
  focusChipText: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  customFocusInput: {
    marginTop: 8,
    color: palette.inputText,
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(10,20,40,0.6)",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // Custom question
  customQuestionInput: {
    color: palette.inputText,
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(10,20,40,0.6)",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 56,
    textAlignVertical: "top",
  },

  // Rules card
  rulesCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(108,230,255,0.22)",
    padding: 14,
    overflow: "hidden",
    marginBottom: 16,
  },
  rulesHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 9 },
  rulesTitle: { color: palette.cyan, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  ruleRow: { flexDirection: "row", gap: 8, marginBottom: 5 },
  ruleDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.cyan,
    marginTop: 6,
  },
  ruleText: { color: palette.muted, fontSize: 11, fontWeight: "700", flex: 1, lineHeight: 16 },
  examplesWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(108,230,255,0.14)",
  },
  examplesLabel: {
    color: palette.gold,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginBottom: 5,
  },
  exampleText: { color: palette.muted, fontSize: 11, fontWeight: "700", marginBottom: 3 },

  // Result card
  resultCard: {
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 14,
    overflow: "hidden",
    marginBottom: 16,
  },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  resultTitle: { fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  resultExplanation: { color: palette.text, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  resultMeta: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 6 },
  confirmedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "rgba(138,92,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(138,92,255,0.30)",
  },
  confirmedText: { color: palette.violet, fontSize: 11, fontWeight: "800", flex: 1, lineHeight: 16 },

  // Sticky bar
  stickyBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.void,
  },
  enterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 15,
    borderRadius: 8,
    overflow: "hidden",
  },
  enterBtnDisabled: { opacity: 0.7 },
  enterBtnText: { color: palette.void, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

  // EAGOH selector sheet
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 18,
    paddingBottom: 30,
    maxHeight: "70%",
    overflow: "hidden",
  },
  sheetTitle: { color: palette.text, fontSize: 17, fontWeight: "900", marginBottom: 14 },
  sheetEmpty: { color: palette.muted, fontSize: 13, fontWeight: "700" },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.line,
    marginBottom: 7,
  },
  sheetDot: { width: 8, height: 8, borderRadius: 4 },
  sheetItemName: { color: palette.text, fontSize: 14, fontWeight: "900" },
  sheetItemDomain: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },

  // Empty state
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  emptyIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(138,92,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    overflow: "hidden",
  },
  emptyTitle: { color: palette.text, fontSize: 20, fontWeight: "900", marginBottom: 8 },
  emptyText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 22,
  },
  forgeCta: {
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderRadius: 8,
    overflow: "hidden",
  },
  forgeCtaText: { color: palette.void, fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
});
