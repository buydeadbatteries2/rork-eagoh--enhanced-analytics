/**
 * EAGOH Forge — dedicated screen for creating and re-forging EAGOH identities.
 *
 * Layout (per product direction):
 *   - Preview render at top (brain-in-glass-dome, full-body, same chassis)
 *   - Collapsible dropdown sections below for each customization input
 *   - Confirmation flow: preview summary + Edge cost → confirm/cancel
 *
 * Connected to the ForgeProvider + EdgeProvider for live image gen and Edge deduction.
 * Free tier EAGOHs render as battered/dormant; paid tiers as activated and premium.
 */

import { palette } from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cpu,
  Crown,
  Eye,
  Footprints,
  Gem,
  Heart,
  ScanFace,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-react-native";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useEdge } from "@/providers/EdgeProvider";
import { useForge, type ForgePending } from "@/providers/ForgeProvider";
import { useEagohs } from "@/providers/EagohProvider";
import { INTELLIGENCE_DOMAINS, type IntelligenceDomain } from "@/services/domains";
import { TIER_MULTIPLIER, TIER_MAX_EAGOHS } from "@/services/edge";
import type { EagohDraft } from "@/services/eagohs";

type SectionId =
  | "name"
  | "domain"
  | "gender"
  | "bodyType"
  | "face"
  | "headwear"
  | "body"
  | "footwear"
  | "accessories"
  | "styleNotes"
  | "cybernetic"
  | "pose";

type OptionTone = "cyan" | "gold" | "violet" | "ember" | "success";
type ForgeOption = { id: string; label: string; detail?: string; tone: OptionTone };

const genders: ForgeOption[] = [
  { id: "male", label: "Male", tone: "cyan" },
  { id: "female", label: "Female", tone: "gold" },
  { id: "neutral", label: "Neutral", tone: "violet" },
];

const bodyTypes: ForgeOption[] = [
  { id: "slim", label: "Slim", tone: "cyan" },
  { id: "average", label: "Average", tone: "gold" },
  { id: "muscular", label: "Muscular", detail: "powerful build", tone: "ember" },
  { id: "heavy-husky", label: "Heavy / Husky", tone: "violet" },
];

const headwearOptions: ForgeOption[] = [
  { id: "cowboy-hat", label: "Cowboy hat", tone: "gold" },
  { id: "tactical-hood", label: "Tactical hood", tone: "ember" },
  { id: "cyber-helmet", label: "Cyber helmet", tone: "cyan" },
  { id: "sports-visor", label: "Sports visor", tone: "success" },
];

const bodyGearOptions: ForgeOption[] = [
  { id: "football-pads", label: "Football pads", tone: "gold" },
  { id: "tactical-jacket", label: "Tactical jacket", tone: "ember" },
  { id: "cyber-armor", label: "Cyber armor", tone: "cyan" },
  { id: "sports-gear", label: "Sports gear", tone: "success" },
];

const footwearOptions: ForgeOption[] = [
  { id: "running-shoes", label: "Running shoes", tone: "success" },
  { id: "tactical-boots", label: "Tactical boots", tone: "ember" },
  { id: "futuristic-cleats", label: "Futuristic cleats", tone: "cyan" },
];

const accessoryOptions: ForgeOption[] = [
  { id: "diamond-chains", label: "Diamond chains", tone: "gold" },
  { id: "watches", label: "Watches", tone: "cyan" },
  { id: "rings", label: "Rings", tone: "violet" },
  { id: "pendants", label: "Pendants", tone: "success" },
  { id: "visors", label: "Visors", tone: "ember" },
];

const intensities: ForgeOption[] = [
  { id: "minimal", label: "Minimal", detail: "subtle neural seams", tone: "success" },
  { id: "moderate", label: "Moderate", detail: "visible optic glow", tone: "cyan" },
  { id: "heavy", label: "Heavy", detail: "reinforced limbs", tone: "gold" },
  { id: "assimilated", label: "Assimilated", detail: "full machine myth", tone: "violet" },
];

const poses: ForgeOption[] = [
  { id: "arms-crossed", label: "Arms crossed", detail: "unshaken authority", tone: "gold" },
  { id: "strategist-stance", label: "Strategist stance", detail: "mid-call calculation", tone: "violet" },
  { id: "relaxed-confidence", label: "Relaxed confidence", detail: "premium calm", tone: "success" },
  { id: "tactical-stance", label: "Tactical stance", detail: "ready to deploy", tone: "cyan" },
];

const archetypes: ForgeOption[] = [
  { id: "oracle", label: "Oracle", detail: "predictive reads", tone: "cyan" },
  { id: "enforcer", label: "Enforcer", detail: "dominance signals", tone: "ember" },
  { id: "strategist", label: "Strategist", detail: "decision trees", tone: "violet" },
  { id: "icon", label: "Icon", detail: "fan magnetism", tone: "gold" },
  { id: "phantom", label: "Phantom", detail: "stealth edge", tone: "success" },
];

const sports: ForgeOption[] = [
  { id: "football", label: "Football", detail: "power reads + field command", tone: "gold" },
  { id: "basketball", label: "Basketball", detail: "tempo vision + clutch heat", tone: "cyan" },
  { id: "soccer", label: "Soccer", detail: "space mapping + pressure IQ", tone: "success" },
  { id: "baseball", label: "Baseball", detail: "pattern patience + precision", tone: "violet" },
];

const labs: ForgeOption[] = [
  { id: "neon-vault", label: "Neon Vault", detail: "identity calibration", tone: "cyan" },
  { id: "obsidian-bay", label: "Obsidian Bay", detail: "armor diagnostics", tone: "violet" },
  { id: "gold-ring", label: "Gold Ring", detail: "fanatic resonance", tone: "gold" },
];

const fanaticTeams: ForgeOption[] = [
  { id: "austin", label: "Austin Fanatics", detail: "loyalty heat 92", tone: "cyan" },
  { id: "metro", label: "Metro Ultras", detail: "chant network active", tone: "gold" },
  { id: "north", label: "North End Loyal", detail: "heritage faction", tone: "success" },
  { id: "coastal", label: "Coastal Signal", detail: "rivalry pulse high", tone: "violet" },
];

function toneColor(tone: OptionTone): string {
  if (tone === "gold") return palette.gold;
  if (tone === "violet") return palette.violet;
  if (tone === "ember") return palette.ember;
  if (tone === "success") return palette.success;
  return palette.cyan;
}

function domainTone(domain: IntelligenceDomain): string {
  return toneColor(domain.tone);
}

// ---- EAGOH Preview Render (brain-in-glass-dome, full-body) ----
const ForgePreview = memo(function ForgePreview({
  name,
  sport,
  gender,
  domain,
  cyberneticIntensity,
  pose,
  tier,
}: {
  name: string;
  sport: string;
  gender: string;
  domain: string;
  cyberneticIntensity: string;
  pose: string;
  tier: string;
}): JSX.Element {
  const isFree = tier === "free";
  const intensity = intensities.find((i) => i.id === cyberneticIntensity);
  const accent = isFree ? "#6B7280" : toneColor(intensity?.tone ?? "cyan");
  const displayName = name || "Unnamed EAGOH";
  const domainLabel = INTELLIGENCE_DOMAINS.find((d) => d.id === domain)?.label ?? domain;
  const chassisBorder = isFree ? "rgba(107,114,128,0.4)" : `${accent}66`;
  const chassisBg = isFree ? "rgba(45,45,50,0.6)" : `${accent}18`;
  const brainGlow = isFree ? "rgba(75,85,99,0.4)" : `${accent}88`;

  return (
    <View style={styles.previewStage}>
      <LinearGradient
        colors={isFree ? ["#1A1A1E", "#0D0D10", "#1A1A1E"] : ["rgba(54,245,255,0.08)", "rgba(3,6,11,0.95)", "rgba(124,92,255,0.08)"]}
        style={StyleSheet.absoluteFill}
      />
      {/* Glass dome head with brain */}
      <View style={[styles.glassDome, { borderColor: `rgba(255,255,255,${isFree ? "0.12" : "0.28"})` }]}>
        <View style={[styles.glassDomeInner, { backgroundColor: `rgba(255,255,255,${isFree ? "0.03" : "0.08"})` }]}>
          <View style={[styles.brainCore, { backgroundColor: brainGlow }]}>
            <BrainCircuit color={isFree ? "#6B7280" : accent} size={28} />
          </View>
          {isFree ? <View style={[styles.crack, { backgroundColor: "#4B5563" }]} /> : null}
          {isFree ? <View style={[styles.crack2, { backgroundColor: "#4B5563" }]} /> : null}
        </View>
      </View>
      {/* Cybernetic body / chassis */}
      <View style={[styles.bodyFrame, { borderColor: chassisBorder, backgroundColor: chassisBg }]}>
        <View style={styles.neckConnector} />
        <View style={[styles.shoulderLeft, { backgroundColor: isFree ? "rgba(75,85,99,0.4)" : `${accent}44` }]} />
        <View style={[styles.shoulderRight, { backgroundColor: isFree ? "rgba(75,85,99,0.4)" : `${accent}44` }]} />
        <View style={styles.torsoCore}>
          <LinearGradient
            colors={isFree ? ["rgba(55,55,60,0.5)", "rgba(30,30,35,0.7)"] : [`${accent}30`, "rgba(10,15,26,0.8)"]}
            style={StyleSheet.absoluteFill}
          />
          <Cpu color={isFree ? "#6B7280" : accent} size={24} />
        </View>
        <View style={[styles.legLeft, { backgroundColor: isFree ? "rgba(75,85,99,0.3)" : `${accent}33` }]} />
        <View style={[styles.legRight, { backgroundColor: isFree ? "rgba(75,85,99,0.3)" : `${accent}33` }]} />
        {isFree ? (
          <>
            <View style={[styles.exposedWire, { backgroundColor: "#4B5563" }]} />
            <View style={[styles.exposedWire2, { backgroundColor: "#4B5563" }]} />
          </>
        ) : null}
      </View>
      {/* Labels */}
      <View style={styles.previewLabels}>
        <Text style={[styles.previewName, isFree && { color: "#9CA3AF" }]}>{displayName}</Text>
        <Text style={styles.previewMeta}>
          {sport} · {domainLabel || "No domain"} · {pose.replace(/-/g, " ")}
        </Text>
        <View style={[styles.tierBadge, isFree ? styles.tierBadgeFree : styles.tierBadgePaid]}>
          <Sparkles color={isFree ? "#6B7280" : accent} size={10} />
          <Text style={[styles.tierBadgeText, { color: isFree ? "#9CA3AF" : accent }]}>
            {isFree ? "DORMANT SHELL" : "ACTIVATED CHASSIS"}
          </Text>
        </View>
      </View>
    </View>
  );
});

// ---- Collapsible section ----
const CollapsibleSection = memo(function CollapsibleSection({
  id,
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}): JSX.Element {
  const handlePress = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    onToggle(id);
  }, [id, onToggle]);

  return (
    <View style={styles.section}>
      <Pressable onPress={handlePress} style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}>
        <View style={styles.sectionHeaderLeft}>
          {icon}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {expanded ? <ChevronUp color={palette.cyan} size={18} /> : <ChevronDown color={palette.muted} size={18} />}
      </Pressable>
      {expanded ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
});

// ---- Option chip ----
const OptionChip = memo(function OptionChip({
  option,
  selected,
  onPress,
}: {
  option: ForgeOption;
  selected: boolean;
  onPress: (id: string) => void;
}): JSX.Element {
  const accent = toneColor(option.tone);
  const handlePress = useCallback((): void => {
    Haptics.selectionAsync().catch(() => undefined);
    onPress(option.id);
  }, [onPress, option.id]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.optionChip,
        selected && { borderColor: accent, backgroundColor: `${accent}18` },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.optionDot, { backgroundColor: selected ? accent : "rgba(255,255,255,0.16)" }]} />
      <View style={styles.optionCopy}>
        <Text style={[styles.optionLabel, selected && { color: accent }]}>{option.label}</Text>
        {option.detail ? <Text style={styles.optionDetail}>{option.detail}</Text> : null}
      </View>
      {selected ? <Check color={accent} size={16} /> : null}
    </Pressable>
  );
});

// ---- Confirmation modal ----
function ConfirmationSheet({
  pending,
  onConfirm,
  onCancel,
  isGenerating,
  canAfford,
}: {
  pending: ForgePending;
  onConfirm: () => void;
  onCancel: () => void;
  isGenerating: boolean;
  canAfford: boolean;
}): JSX.Element {
  return (
    <View style={styles.confirmOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View style={styles.confirmCard}>
        <LinearGradient colors={["rgba(16,27,42,0.98)", "rgba(8,15,26,0.98)"]} style={StyleSheet.absoluteFill} />
        <View style={styles.confirmHeader}>
          <Sparkles color={palette.cyan} size={22} />
          <Text style={styles.confirmTitle}>Confirm Forge</Text>
        </View>
        <Text style={styles.confirmName}>{pending.draft.name || "Unnamed EAGOH"}</Text>
        <View style={styles.confirmDetails}>
          {pending.summary.map((line, i) => (
            <Text key={i} style={styles.confirmLine}>{line}</Text>
          ))}
        </View>
        <View style={styles.confirmEdgeRow}>
          <Zap color={palette.gold} size={18} />
          <Text style={styles.confirmEdgeCost}>{pending.edgeCost} Edge</Text>
        </View>
        {!canAfford ? (
          <Text style={styles.confirmError}>Insufficient Edge balance. Purchase Edge or upgrade your tier.</Text>
        ) : null}
        <View style={styles.confirmActions}>
          <Pressable onPress={onCancel} disabled={isGenerating} style={({ pressed }) => [styles.confirmCancel, pressed && styles.pressed]}>
            <Text style={styles.confirmCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={isGenerating || !canAfford}
            style={({ pressed }) => [styles.confirmForge, !canAfford && styles.disabledButton, pressed && styles.pressed]}
          >
            {isGenerating ? (
              <ActivityIndicator color={palette.void} />
            ) : (
              <Text style={styles.confirmForgeText}>Generate EAGOH</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ---- Main screen ----
export default function ForgeScreen(): JSX.Element {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { total: edgeTotal } = useEdge();
  const { pending, prepareForge, confirmForge, cancelForge, isGenerating, lastResult } = useForge();
  const { remaining, canCreate, tier } = useEagohs();

  const [name, setName] = useState<string>("");
  const [sport, setSport] = useState<string>("football");
  const [gender, setGender] = useState<string>("neutral");
  const [domain, setDomain] = useState<string>("sports");
  const [bodyType, setBodyType] = useState<string>("average");
  const [faceFeatures, setFaceFeatures] = useState<string>("");
  const [styleNotes, setStyleNotes] = useState<string>("");
  const [dna, setDna] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [appearance, setAppearance] = useState<Record<string, string>>({});
  const [cyberneticIntensity, setCyberneticIntensity] = useState<string>("moderate");
  const [pose, setPose] = useState<string>("relaxed-confidence");
  const [lab, setLab] = useState<string>("neon-vault");

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["name", "domain"]));
  const [forgeError, setForgeError] = useState<string | null>(null);

  const toggleSection = useCallback((id: string): void => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isExpanded = useCallback((id: string): boolean => expandedSections.has(id), [expandedSections]);

  const setAppearanceField = useCallback((category: string, optionId: string): void => {
    setAppearance((prev) => ({ ...prev, [category]: optionId }));
  }, []);

  const toggleDna = useCallback((id: string): void => {
    setDna((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }, []);

  const toggleTeams = useCallback((id: string): void => {
    setTeams((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }, []);

  const currentTier = profile?.subscription_tier ?? "free";
  const multiplier = TIER_MULTIPLIER[currentTier] ?? 0;
  const maxEagohs = TIER_MAX_EAGOHS[currentTier] ?? 0;

  const draft: EagohDraft = useMemo(() => ({
    name,
    sport,
    gender,
    domain,
    bodyType,
    faceFeatures,
    styleNotes,
    dna,
    teams,
    appearance,
    cyberneticIntensity,
    pose,
    lab,
  }), [name, sport, gender, domain, bodyType, faceFeatures, styleNotes, dna, teams, appearance, cyberneticIntensity, pose, lab]);

  const handleForge = useCallback((): void => {
    if (!name.trim()) {
      setForgeError("Name your EAGOH first.");
      return;
    }
    if (domain.length === 0) {
      setForgeError("Select an intelligence domain.");
      return;
    }
    setForgeError(null);
    prepareForge(draft, "initial");
  }, [draft, prepareForge, name, domain]);

  const handleConfirm = useCallback((): void => {
    confirmForge().then((result) => {
      if (!result.ok) {
        setForgeError(result.error);
      }
    }).catch((err: Error) => {
      setForgeError(err?.message ?? "Forge failed.");
    });
  }, [confirmForge]);

  const handleCancel = useCallback((): void => {
    cancelForge();
  }, [cancelForge]);

  // Reset after successful forge
  const lastWasOk = lastResult?.ok;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>FORGE CHAMBER</Text>
            <Text style={styles.title}>Forge your EAGOH</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.tierChip}>
              <Zap color={toneColor("gold")} size={12} />
              <Text style={styles.tierChipText}>{currentTier.replace("_", " ").toUpperCase()}</Text>
            </View>
            <Text style={styles.remainingText}>
              {remaining} of {maxEagohs} slots free
            </Text>
          </View>
        </View>

        {/* EAGOH Preview */}
        <ForgePreview
          name={name}
          sport={sport}
          gender={gender}
          domain={domain}
          cyberneticIntensity={cyberneticIntensity}
          pose={pose}
          tier={currentTier}
        />

        {/* Collapsible sections */}
        <ScrollView
          style={styles.sectionsScroll}
          contentContainerStyle={styles.sectionsContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Name */}
          <CollapsibleSection
            id="name"
            title="EAGOH Name"
            icon={<Crown color={palette.gold} size={16} />}
            expanded={isExpanded("name")}
            onToggle={toggleSection}
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter EAGOH name…"
              placeholderTextColor={palette.muted}
              style={styles.input}
            />
          </CollapsibleSection>

          {/* Intelligence Domain */}
          <CollapsibleSection
            id="domain"
            title="Intelligence Domain"
            icon={<BrainCircuit color={palette.violet} size={16} />}
            expanded={isExpanded("domain")}
            onToggle={toggleSection}
          >
            <Text style={styles.sectionHint}>Each EAGOH answers only within its chosen domain.</Text>
            <View style={styles.optionsGrid}>
              {INTELLIGENCE_DOMAINS.map((d) => (
                <OptionChip
                  key={d.id}
                  option={{ id: d.id, label: d.label, detail: d.description.slice(0, 48), tone: d.tone }}
                  selected={domain === d.id}
                  onPress={setDomain}
                />
              ))}
            </View>
          </CollapsibleSection>

          {/* Gender */}
          <CollapsibleSection
            id="gender"
            title="Gender"
            icon={<ScanFace color={palette.cyan} size={16} />}
            expanded={isExpanded("gender")}
            onToggle={toggleSection}
          >
            {genders.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={gender === opt.id} onPress={setGender} />
            ))}
          </CollapsibleSection>

          {/* Body Type */}
          <CollapsibleSection
            id="bodyType"
            title="Body Type"
            icon={<Shirt color={palette.ember} size={16} />}
            expanded={isExpanded("bodyType")}
            onToggle={toggleSection}
          >
            {bodyTypes.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={bodyType === opt.id} onPress={setBodyType} />
            ))}
          </CollapsibleSection>

          {/* Face & Features */}
          <CollapsibleSection
            id="face"
            title="Face & Features"
            icon={<Eye color={palette.success} size={16} />}
            expanded={isExpanded("face")}
            onToggle={toggleSection}
          >
            <Text style={styles.sectionHint}>Describe distinctive facial traits, expression, or visor configuration.</Text>
            <TextInput
              value={faceFeatures}
              onChangeText={setFaceFeatures}
              placeholder="e.g. angular jaw, neon optic visor, calm gaze…"
              placeholderTextColor={palette.muted}
              style={styles.input}
              multiline
            />
          </CollapsibleSection>

          {/* Headwear */}
          <CollapsibleSection
            id="headwear"
            title="Headwear"
            icon={<Crown color={palette.gold} size={16} />}
            expanded={isExpanded("headwear")}
            onToggle={toggleSection}
          >
            {headwearOptions.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={appearance.headwear === opt.id} onPress={(id) => setAppearanceField("headwear", id)} />
            ))}
          </CollapsibleSection>

          {/* Body Gear */}
          <CollapsibleSection
            id="body"
            title="Body Gear"
            icon={<Shirt color={palette.cyan} size={16} />}
            expanded={isExpanded("body")}
            onToggle={toggleSection}
          >
            {bodyGearOptions.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={appearance.body === opt.id} onPress={(id) => setAppearanceField("body", id)} />
            ))}
          </CollapsibleSection>

          {/* Footwear */}
          <CollapsibleSection
            id="footwear"
            title="Footwear"
            icon={<Footprints color={palette.success} size={16} />}
            expanded={isExpanded("footwear")}
            onToggle={toggleSection}
          >
            {footwearOptions.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={appearance.footwear === opt.id} onPress={(id) => setAppearanceField("footwear", id)} />
            ))}
          </CollapsibleSection>

          {/* Accessories */}
          <CollapsibleSection
            id="accessories"
            title="Accessories"
            icon={<Gem color={palette.violet} size={16} />}
            expanded={isExpanded("accessories")}
            onToggle={toggleSection}
          >
            {accessoryOptions.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={appearance.accessories === opt.id} onPress={(id) => setAppearanceField("accessories", id)} />
            ))}
          </CollapsibleSection>

          {/* Additional Style Notes */}
          <CollapsibleSection
            id="styleNotes"
            title="Additional Style Notes"
            icon={<SlidersHorizontal color={palette.gold} size={16} />}
            expanded={isExpanded("styleNotes")}
            onToggle={toggleSection}
          >
            <Text style={styles.sectionHint}>Any extra appearance cues — color hints, material notes, attitude.</Text>
            <TextInput
              value={styleNotes}
              onChangeText={setStyleNotes}
              placeholder="e.g. matte black finish, gold accent trim…"
              placeholderTextColor={palette.muted}
              style={styles.input}
              multiline
            />
          </CollapsibleSection>

          {/* Cybernetic Intensity */}
          <CollapsibleSection
            id="cybernetic"
            title="Cybernetic Intensity"
            icon={<Cpu color={palette.ember} size={16} />}
            expanded={isExpanded("cybernetic")}
            onToggle={toggleSection}
          >
            {intensities.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={cyberneticIntensity === opt.id} onPress={setCyberneticIntensity} />
            ))}
          </CollapsibleSection>

          {/* Fixed Pose */}
          <CollapsibleSection
            id="pose"
            title="Fixed Pose"
            icon={<ScanFace color={palette.cyan} size={16} />}
            expanded={isExpanded("pose")}
            onToggle={toggleSection}
          >
            {poses.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={pose === opt.id} onPress={setPose} />
            ))}
          </CollapsibleSection>

          {/* DNA Archetypes (compact) */}
          <CollapsibleSection
            id="dna"
            title="DNA Archetypes"
            icon={<Sparkles color={palette.violet} size={16} />}
            expanded={isExpanded("dna")}
            onToggle={toggleSection}
          >
            {archetypes.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={dna.includes(opt.id)} onPress={toggleDna} />
            ))}
          </CollapsibleSection>

          {/* Fanatic Teams (compact) */}
          <CollapsibleSection
            id="teams"
            title="Fanatic Teams"
            icon={<Heart color={palette.ember} size={16} />}
            expanded={isExpanded("teams")}
            onToggle={toggleSection}
          >
            <Text style={styles.sectionHint}>Mock faction affinity — no real team logos or marks are used.</Text>
            {fanaticTeams.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={teams.includes(opt.id)} onPress={toggleTeams} />
            ))}
          </CollapsibleSection>

          {/* Sport + Lab (compact) */}
          <CollapsibleSection
            id="sport"
            title="Sport & Lab"
            icon={<Zap color={palette.gold} size={16} />}
            expanded={isExpanded("sport")}
            onToggle={toggleSection}
          >
            <Text style={styles.sectionHint}>Primary sport</Text>
            {sports.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={sport === opt.id} onPress={setSport} />
            ))}
            <Text style={[styles.sectionHint, { marginTop: 12 }]}>Forge lab</Text>
            {labs.map((opt) => (
              <OptionChip key={opt.id} option={opt} selected={lab === opt.id} onPress={setLab} />
            ))}
          </CollapsibleSection>

          {/* Error */}
          {forgeError ? <Text style={styles.errorText}>{forgeError}</Text> : null}

          {/* Forge button */}
          <Pressable
            onPress={handleForge}
            disabled={isGenerating || !canCreate}
            style={({ pressed }) => [
              styles.forgeButton,
              (!canCreate || isGenerating) && styles.disabledButton,
              pressed && styles.pressed,
            ]}
          >
            <LinearGradient
              colors={[palette.cyan, "rgba(61,165,255,0.8)"]}
              style={StyleSheet.absoluteFill}
            />
            {isGenerating ? (
              <ActivityIndicator color={palette.void} />
            ) : (
              <>
                <Sparkles color={palette.void} size={18} />
                <Text style={styles.forgeButtonText}>
                  {canCreate ? "Review Forge" : `Tier limit reached (${maxEagohs} max)`}
                </Text>
              </>
            )}
          </Pressable>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Confirmation overlay */}
        {pending ? (
          <ConfirmationSheet
            pending={pending}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            isGenerating={isGenerating}
            canAfford={edgeTotal >= pending.edgeCost}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.void },
  root: { flex: 1, backgroundColor: palette.void },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
  },
  kicker: { color: palette.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2.2 },
  title: { color: palette.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.8, marginTop: 2 },
  headerRight: { alignItems: "flex-end", gap: 4 },
  tierChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: palette.goldSoft,
    borderWidth: 1,
    borderColor: "rgba(255,181,71,0.28)",
  },
  tierChipText: { color: palette.gold, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  remainingText: { color: palette.muted, fontSize: 11, fontWeight: "700" },

  // Preview
  previewStage: {
    height: 310,
    marginHorizontal: 18,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(54,245,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  glassDome: {
    width: 90,
    height: 100,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  glassDomeInner: { width: 70, height: 76, borderRadius: 5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  brainCore: { width: 44, height: 44, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  crack: { position: "absolute", top: 8, left: 10, width: 24, height: 2, transform: [{ rotate: "-28deg" }] },
  crack2: { position: "absolute", bottom: 14, right: 8, width: 18, height: 2, transform: [{ rotate: "15deg" }] },
  bodyFrame: {
    width: 130,
    height: 140,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  neckConnector: { position: "absolute", top: -4, width: 16, height: 10, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 5 },
  shoulderLeft: { position: "absolute", top: 10, left: -14, width: 28, height: 60, borderRadius: 5 },
  shoulderRight: { position: "absolute", top: 10, right: -14, width: 28, height: 60, borderRadius: 5 },
  torsoCore: { width: 84, height: 90, borderRadius: 5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  legLeft: { position: "absolute", bottom: -28, left: 28, width: 22, height: 50, borderRadius: 5 },
  legRight: { position: "absolute", bottom: -28, right: 28, width: 22, height: 50, borderRadius: 5 },
  exposedWire: { position: "absolute", bottom: 30, left: 8, width: 14, height: 2, transform: [{ rotate: "35deg" }] },
  exposedWire2: { position: "absolute", top: 40, right: 6, width: 10, height: 1.5, transform: [{ rotate: "-20deg" }] },
  previewLabels: { position: "absolute", bottom: 20, alignItems: "center" },
  previewName: { color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: 1.2 },
  previewMeta: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 3 },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
  },
  tierBadgeFree: { backgroundColor: "rgba(107,114,128,0.18)", borderWidth: 1, borderColor: "rgba(107,114,128,0.3)" },
  tierBadgePaid: { backgroundColor: "rgba(54,245,255,0.12)", borderWidth: 1, borderColor: "rgba(54,245,255,0.28)" },
  tierBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },

  // Sections
  sectionsScroll: { flex: 1 },
  sectionsContent: { paddingHorizontal: 18, paddingTop: 12, gap: 8 },
  section: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(10,18,30,0.62)",
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionTitle: { color: palette.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  sectionHint: { color: palette.muted, fontSize: 11, fontWeight: "700", marginBottom: 4 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.88 },

  // Options
  optionsGrid: { gap: 6 },
  optionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 46,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.035)",
    marginBottom: 4,
  },
  optionDot: { width: 9, height: 9, borderRadius: 5 },
  optionCopy: { flex: 1 },
  optionLabel: { color: palette.text, fontSize: 13, fontWeight: "800" },
  optionDetail: { color: palette.muted, fontSize: 10, marginTop: 1 },

  // Input
  input: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "rgba(3,6,11,0.4)",
    minHeight: 46,
  },

  // Error
  errorText: { color: palette.ember, fontSize: 12, fontWeight: "800", textAlign: "center" },

  // Forge button
  forgeButton: {
    minHeight: 56,
    borderRadius: 5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    shadowColor: palette.cyan,
    shadowOpacity: 0.3,
    shadowRadius: 14,
  },
  forgeButtonText: { color: palette.void, fontSize: 16, fontWeight: "900" },
  disabledButton: { opacity: 0.5 },

  bottomSpacer: { height: 120 },

  // Confirmation overlay
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,4,10,0.88)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    zIndex: 100,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 5,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(54,245,255,0.3)",
    overflow: "hidden",
    gap: 14,
  },
  confirmHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  confirmTitle: { color: palette.text, fontSize: 20, fontWeight: "900" },
  confirmName: { color: palette.cyan, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  confirmDetails: { gap: 4 },
  confirmLine: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  confirmEdgeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line },
  confirmEdgeCost: { color: palette.gold, fontSize: 20, fontWeight: "900" },
  confirmError: { color: palette.ember, fontSize: 12, fontWeight: "800" },
  confirmActions: { flexDirection: "row", gap: 10 },
  confirmCancel: {
    flex: 1,
    minHeight: 46,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  confirmCancelText: { color: palette.muted, fontWeight: "900" },
  confirmForge: {
    flex: 2,
    minHeight: 46,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.cyan,
    shadowColor: palette.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  confirmForgeText: { color: palette.void, fontWeight: "900", fontSize: 15 },
});
