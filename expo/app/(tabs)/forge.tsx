/**
 * EAGOH Forge — stepped wizard creation flow.
 *
 * Keeps the existing Forge generation pipeline intact while replacing the
 * collapsible customization panels with a guided step-by-step builder.
 */

import { palette } from "@/constants/colors";
import { useEdge } from "@/providers/EdgeProvider";
import { useEagohs } from "@/providers/EagohProvider";
import { useForge, type ForgePending } from "@/providers/ForgeProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { INTELLIGENCE_DOMAINS } from "@/services/domains";
import { TIER_MAX_EAGOHS, TIER_MULTIPLIER, getForgeCost } from "@/services/edge";
import type { EagohDraft } from "@/services/eagohs";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  BrainCircuit,
  Check,
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

type OptionTone = "cyan" | "gold" | "violet" | "ember" | "success";
type ForgeOption = { id: string; label: string; detail?: string; tone: OptionTone };
type WizardStepId =
  | "name"
  | "domain"
  | "gender"
  | "bodyType"
  | "face"
  | "headwear"
  | "bodyGear"
  | "footwear"
  | "accessories"
  | "notes"
  | "cybernetic"
  | "pose"
  | "dna"
  | "teams"
  | "sportLab";

type WizardStep = {
  id: WizardStepId;
  title: string;
  eyebrow: string;
  hint: string;
  icon: React.ReactNode;
};

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

const ForgePreview = memo(function ForgePreview({
  cyberneticIntensity,
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
  const chassisBorder = isFree ? "rgba(107,114,128,0.4)" : `${accent}66`;
  const chassisBg = isFree ? "rgba(45,45,50,0.6)" : `${accent}15`;
  const brainGlow = isFree ? "rgba(75,85,99,0.4)" : `${accent}88`;

  return (
    <View style={styles.previewStage}>
      <LinearGradient
        colors={isFree
          ? ["#1A1A1E", "#0D0D10", "#1A1A1E"]
          : ["rgba(54,245,255,0.10)", "rgba(3,6,11,0.92)", "rgba(124,92,255,0.10)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.stageRing, { borderColor: isFree ? "rgba(107,114,128,0.15)" : `${accent}22` }]} />
      <View style={[styles.glassDome, { borderColor: `rgba(255,255,255,${isFree ? "0.14" : "0.32"})` }]}>
        <View style={[styles.glassDomeInner, { backgroundColor: `rgba(255,255,255,${isFree ? "0.04" : "0.10"})` }]}>
          <View style={[styles.brainCore, { backgroundColor: brainGlow }]}>
            <BrainCircuit color={isFree ? "#6B7280" : accent} size={32} />
          </View>
          {isFree ? <View style={styles.crack} /> : null}
          {isFree ? <View style={styles.crack2} /> : null}
        </View>
      </View>
      <View style={[styles.bodyFrame, { borderColor: chassisBorder, backgroundColor: chassisBg }]}>
        <View style={styles.neckConnector} />
        <View style={[styles.shoulderLeft, { backgroundColor: isFree ? "rgba(75,85,99,0.4)" : `${accent}44` }]} />
        <View style={[styles.shoulderRight, { backgroundColor: isFree ? "rgba(75,85,99,0.4)" : `${accent}44` }]} />
        <View style={styles.torsoCore}>
          <LinearGradient
            colors={isFree ? ["rgba(55,55,60,0.5)", "rgba(30,30,35,0.7)"] : [`${accent}30`, "rgba(10,15,26,0.8)"]}
            style={StyleSheet.absoluteFill}
          />
          <Cpu color={isFree ? "#6B7280" : accent} size={28} />
        </View>
        <View style={[styles.legLeft, { backgroundColor: isFree ? "rgba(75,85,99,0.3)" : `${accent}33` }]} />
        <View style={[styles.legRight, { backgroundColor: isFree ? "rgba(75,85,99,0.3)" : `${accent}33` }]} />
        {isFree ? (
          <>
            <View style={styles.exposedWire} />
            <View style={styles.exposedWire2} />
          </>
        ) : null}
      </View>
    </View>
  );
});

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
      <View style={[styles.optionDot, { backgroundColor: selected ? accent : "rgba(255,255,255,0.14)" }]} />
      <View style={styles.optionCopy}>
        <Text style={[styles.optionLabel, selected && { color: accent }]}>{option.label}</Text>
        {option.detail ? <Text style={styles.optionDetail}>{option.detail}</Text> : null}
      </View>
      {selected ? <Check color={accent} size={14} /> : null}
    </Pressable>
  );
});

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
        <Text style={styles.confirmHeader}>CONFIRM FORGE</Text>
        <Text style={styles.confirmName}>{pending.draft.name || "Unnamed EAGOH"}</Text>
        <View style={styles.confirmDetails}>
          {pending.summary.map((line, i) => (
            <Text key={`${line}-${i}`} style={styles.confirmLine}>{line}</Text>
          ))}
        </View>
        <View style={styles.confirmEdgeRow}>
          <Zap color={palette.gold} size={18} />
          <Text style={styles.confirmEdgeCost}>{pending.edgeCost} Edge</Text>
        </View>
        {!canAfford ? <Text style={styles.confirmError}>Insufficient Edge balance. Purchase Edge or upgrade your tier.</Text> : null}
        <View style={styles.confirmActions}>
          <Pressable onPress={onCancel} disabled={isGenerating} style={({ pressed }) => [styles.confirmCancel, pressed && styles.pressed]}>
            <Text style={styles.confirmCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={isGenerating || !canAfford}
            style={({ pressed }) => [styles.confirmForge, !canAfford && styles.disabledButton, pressed && styles.pressed]}
          >
            {isGenerating ? <ActivityIndicator color={palette.void} /> : <Text style={styles.confirmForgeText}>Generate EAGOH</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function ForgeScreen(): JSX.Element {
  const { profile } = useProfile();
  const { total: edgeTotal } = useEdge();
  const { pending, prepareForge, confirmForge, cancelForge, isGenerating } = useForge();
  const { remaining, canCreate, tier } = useEagohs();
  const { height: windowHeight } = useWindowDimensions();

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
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [forgeError, setForgeError] = useState<string | null>(null);

  const currentTier = profile?.subscription_tier ?? tier ?? "free";
  const multiplier = TIER_MULTIPLIER[currentTier] ?? 0;
  const maxEagohs = TIER_MAX_EAGOHS[currentTier] ?? 0;
  const forgeCost = getForgeCost("initial");
  const domainLabel = INTELLIGENCE_DOMAINS.find((d) => d.id === domain)?.label ?? domain;

  const wizardSteps: WizardStep[] = useMemo(() => [
    { id: "name", title: "EAGOH Name", eyebrow: "Step 01", hint: "Give your intelligence unit a memorable identity.", icon: <Crown color={palette.gold} size={15} /> },
    { id: "domain", title: "Intelligence Domain", eyebrow: "Step 02", hint: "This controls what your EAGOH is allowed to answer.", icon: <BrainCircuit color={palette.violet} size={15} /> },
    { id: "gender", title: "Gender", eyebrow: "Step 03", hint: "Choose the presentation direction for the chassis.", icon: <ScanFace color={palette.cyan} size={15} /> },
    { id: "bodyType", title: "Body Type", eyebrow: "Step 04", hint: "Tune the physical silhouette without changing the core EAGOH chassis.", icon: <Shirt color={palette.ember} size={15} /> },
    { id: "face", title: "Face & Features", eyebrow: "Step 05", hint: "Describe facial details, optics, dome features, or expression.", icon: <Eye color={palette.success} size={15} /> },
    { id: "headwear", title: "Headwear", eyebrow: "Step 06", hint: "Add headwear that modifies the glass-dome chassis.", icon: <Crown color={palette.gold} size={15} /> },
    { id: "bodyGear", title: "Body Gear", eyebrow: "Step 07", hint: "Select armor, jackets, pads, or other body gear.", icon: <Shirt color={palette.cyan} size={15} /> },
    { id: "footwear", title: "Footwear", eyebrow: "Step 08", hint: "Choose how the lower chassis is finished.", icon: <Footprints color={palette.success} size={15} /> },
    { id: "accessories", title: "Accessories", eyebrow: "Step 09", hint: "Add premium details that do not replace the EAGOH frame.", icon: <Gem color={palette.violet} size={15} /> },
    { id: "notes", title: "Additional Notes", eyebrow: "Step 10", hint: "Optional style, material, and attitude notes.", icon: <SlidersHorizontal color={palette.gold} size={15} /> },
    { id: "cybernetic", title: "Cybernetic Intensity", eyebrow: "Step 11", hint: "Set how mechanical and activated the EAGOH feels.", icon: <Cpu color={palette.ember} size={15} /> },
    { id: "pose", title: "Fixed Pose", eyebrow: "Step 12", hint: "Pick the final full-body stance used for generation.", icon: <ScanFace color={palette.cyan} size={15} /> },
    { id: "dna", title: "DNA Archetypes", eyebrow: "Step 13", hint: "Optional personality signals layered into the chassis.", icon: <Sparkles color={palette.violet} size={15} /> },
    { id: "teams", title: "Fanatic Teams", eyebrow: "Step 14", hint: "Optional mock faction affinity — no real logos or marks.", icon: <Heart color={palette.ember} size={15} /> },
    { id: "sportLab", title: "Sport & Lab", eyebrow: "Step 15", hint: "Finalize the sport signal and forge lab environment.", icon: <Zap color={palette.gold} size={15} /> },
  ], []);

  const currentStep = wizardSteps[currentStepIndex];
  const isLastStep = currentStepIndex === wizardSteps.length - 1;
  const progressPercent = ((currentStepIndex + 1) / wizardSteps.length) * 100;

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

  const setAppearanceField = useCallback((category: string, optionId: string): void => {
    setAppearance((prev) => ({ ...prev, [category]: optionId }));
  }, []);

  const toggleDna = useCallback((id: string): void => {
    setDna((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }, []);

  const toggleTeams = useCallback((id: string): void => {
    setTeams((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }, []);

  const validateCurrentStep = useCallback((): boolean => {
    if (currentStep.id === "name" && !name.trim()) {
      setForgeError("Name your EAGOH first.");
      return false;
    }
    if (currentStep.id === "domain" && domain.length === 0) {
      setForgeError("Select an intelligence domain.");
      return false;
    }
    setForgeError(null);
    return true;
  }, [currentStep.id, domain.length, name]);

  const goNext = useCallback((): void => {
    if (!validateCurrentStep()) return;
    Haptics.selectionAsync().catch(() => undefined);
    setCurrentStepIndex((prev) => Math.min(prev + 1, wizardSteps.length - 1));
  }, [validateCurrentStep, wizardSteps.length]);

  const goBack = useCallback((): void => {
    Haptics.selectionAsync().catch(() => undefined);
    setForgeError(null);
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((index: number): void => {
    Haptics.selectionAsync().catch(() => undefined);
    setForgeError(null);
    setCurrentStepIndex(index);
  }, []);

  const handleForge = useCallback((): void => {
    if (!name.trim()) {
      setForgeError("Name your EAGOH first.");
      setCurrentStepIndex(0);
      return;
    }
    if (domain.length === 0) {
      setForgeError("Select an intelligence domain.");
      setCurrentStepIndex(1);
      return;
    }
    setForgeError(null);
    prepareForge(draft, "initial");
  }, [domain.length, draft, name, prepareForge]);

  const handlePrimaryAction = useCallback((): void => {
    if (isLastStep) handleForge();
    else goNext();
  }, [goNext, handleForge, isLastStep]);

  const handleConfirm = useCallback((): void => {
    confirmForge().then((result) => {
      if (!result.ok) setForgeError(result.error);
    }).catch((err: Error) => {
      setForgeError(err?.message ?? "Forge failed.");
    });
  }, [confirmForge]);

  const handleCancel = useCallback((): void => {
    cancelForge();
  }, [cancelForge]);

  const renderStepContent = useCallback((): JSX.Element => {
    if (currentStep.id === "name") {
      return (
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Enter EAGOH name…"
          placeholderTextColor={palette.muted}
          style={styles.input}
          returnKeyType="next"
          onSubmitEditing={goNext}
        />
      );
    }

    if (currentStep.id === "domain") {
      return (
        <>
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
        </>
      );
    }

    if (currentStep.id === "gender") {
      return <>{genders.map((opt) => <OptionChip key={opt.id} option={opt} selected={gender === opt.id} onPress={setGender} />)}</>;
    }

    if (currentStep.id === "bodyType") {
      return <>{bodyTypes.map((opt) => <OptionChip key={opt.id} option={opt} selected={bodyType === opt.id} onPress={setBodyType} />)}</>;
    }

    if (currentStep.id === "face") {
      return (
        <TextInput
          value={faceFeatures}
          onChangeText={setFaceFeatures}
          placeholder="e.g. angular jaw, neon optic visor…"
          placeholderTextColor={palette.muted}
          style={[styles.input, styles.textArea]}
          multiline
        />
      );
    }

    if (currentStep.id === "headwear") {
      return <>{headwearOptions.map((opt) => <OptionChip key={opt.id} option={opt} selected={appearance.headwear === opt.id} onPress={(id) => setAppearanceField("headwear", id)} />)}</>;
    }

    if (currentStep.id === "bodyGear") {
      return <>{bodyGearOptions.map((opt) => <OptionChip key={opt.id} option={opt} selected={appearance.body === opt.id} onPress={(id) => setAppearanceField("body", id)} />)}</>;
    }

    if (currentStep.id === "footwear") {
      return <>{footwearOptions.map((opt) => <OptionChip key={opt.id} option={opt} selected={appearance.footwear === opt.id} onPress={(id) => setAppearanceField("footwear", id)} />)}</>;
    }

    if (currentStep.id === "accessories") {
      return <>{accessoryOptions.map((opt) => <OptionChip key={opt.id} option={opt} selected={appearance.accessories === opt.id} onPress={(id) => setAppearanceField("accessories", id)} />)}</>;
    }

    if (currentStep.id === "notes") {
      return (
        <TextInput
          value={styleNotes}
          onChangeText={setStyleNotes}
          placeholder="e.g. matte black finish, gold trim…"
          placeholderTextColor={palette.muted}
          style={[styles.input, styles.textArea]}
          multiline
        />
      );
    }

    if (currentStep.id === "cybernetic") {
      return <>{intensities.map((opt) => <OptionChip key={opt.id} option={opt} selected={cyberneticIntensity === opt.id} onPress={setCyberneticIntensity} />)}</>;
    }

    if (currentStep.id === "pose") {
      return <>{poses.map((opt) => <OptionChip key={opt.id} option={opt} selected={pose === opt.id} onPress={setPose} />)}</>;
    }

    if (currentStep.id === "dna") {
      return <>{archetypes.map((opt) => <OptionChip key={opt.id} option={opt} selected={dna.includes(opt.id)} onPress={toggleDna} />)}</>;
    }

    if (currentStep.id === "teams") {
      return (
        <>
          <Text style={styles.sectionHint}>Mock faction affinity only — no real team logos or marks.</Text>
          {fanaticTeams.map((opt) => <OptionChip key={opt.id} option={opt} selected={teams.includes(opt.id)} onPress={toggleTeams} />)}
        </>
      );
    }

    return (
      <>
        <Text style={styles.sectionHint}>Primary sport</Text>
        {sports.map((opt) => <OptionChip key={opt.id} option={opt} selected={sport === opt.id} onPress={setSport} />)}
        <Text style={[styles.sectionHint, styles.labHint]}>Forge lab</Text>
        {labs.map((opt) => <OptionChip key={opt.id} option={opt} selected={lab === opt.id} onPress={setLab} />)}
      </>
    );
  }, [
    appearance.accessories,
    appearance.body,
    appearance.footwear,
    appearance.headwear,
    bodyType,
    currentStep.id,
    cyberneticIntensity,
    dna,
    domain,
    faceFeatures,
    gender,
    goNext,
    lab,
    name,
    pose,
    setAppearanceField,
    sport,
    styleNotes,
    teams,
    toggleDna,
    toggleTeams,
  ]);

  const previewHeight = Math.min(windowHeight * 0.36, 330);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.previewArea, { height: previewHeight }]}> 
          <ForgePreview
            name={name}
            sport={sport}
            gender={gender}
            domain={domain}
            cyberneticIntensity={cyberneticIntensity}
            pose={pose}
            tier={currentTier}
          />
          <View style={[styles.tierChipFloat, currentTier !== "free" && styles.tierChipFloatPaid]}>
            <Zap color={currentTier !== "free" ? palette.cyan : palette.muted} size={11} />
            <Text style={[styles.tierChipFloatText, currentTier !== "free" && { color: palette.cyan }]}> 
              {currentTier.replace("_", " ").toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.infoStrip}>
          <Text style={styles.infoName} numberOfLines={1}>{name || "Unnamed EAGOH"}</Text>
          <View style={styles.infoMeta}>
            <Text style={styles.infoDomain}>{domainLabel}</Text>
            <View style={styles.infoDot} />
            <Text style={styles.infoShell}>{currentTier === "free" ? "DORMANT SHELL" : "ACTIVATED CHASSIS"}</Text>
            <View style={styles.infoDot} />
            <Text style={styles.infoSlots}>{remaining}/{maxEagohs} slots</Text>
            {multiplier > 0 ? <Text style={styles.multiplier}>{multiplier.toFixed(1)}x</Text> : null}
          </View>
        </View>

        <View style={styles.stepperBar}>
          <View style={styles.stepperTopRow}>
            <Text style={styles.stepCounter}>{currentStepIndex + 1}/{wizardSteps.length}</Text>
            <Text style={styles.stepMiniTitle} numberOfLines={1}>{currentStep.title}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepDotsContent}>
            {wizardSteps.map((step, index) => {
              const isActive = index === currentStepIndex;
              const isComplete = index < currentStepIndex;
              return (
                <Pressable key={step.id} onPress={() => goToStep(index)} style={[styles.stepDot, isActive && styles.stepDotActive, isComplete && styles.stepDotComplete]}>
                  <Text style={[styles.stepDotText, (isActive || isComplete) && styles.stepDotTextActive]}>{index + 1}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          style={styles.wizardScroll}
          contentContainerStyle={styles.wizardContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.wizardCard}>
            <LinearGradient colors={["rgba(54,245,255,0.08)", "rgba(10,18,30,0.78)"]} style={StyleSheet.absoluteFill} />
            <View style={styles.wizardHeader}>
              <View style={styles.wizardIcon}>{currentStep.icon}</View>
              <View style={styles.wizardHeaderCopy}>
                <Text style={styles.wizardEyebrow}>{currentStep.eyebrow}</Text>
                <Text style={styles.wizardTitle}>{currentStep.title}</Text>
              </View>
            </View>
            <Text style={styles.wizardHint}>{currentStep.hint}</Text>
            <View style={styles.stepContent}>{renderStepContent()}</View>
          </View>

          {forgeError ? <Text style={styles.errorText}>{forgeError}</Text> : null}

          <View style={styles.costPreview}>
            <Zap color={palette.gold} size={16} />
            <Text style={styles.costPreviewLabel}>{isLastStep ? "Forge Cost" : "Final Forge Cost"}</Text>
            <Text style={styles.costPreviewValue}>{forgeCost} Edge</Text>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <View style={styles.ctaContainer}>
          <LinearGradient colors={["rgba(2,4,10,0.0)", "rgba(2,4,10,0.92)", palette.void]} style={styles.ctaFade} pointerEvents="none" />
          <View style={styles.ctaRow}>
            <Pressable onPress={goBack} disabled={currentStepIndex === 0 || isGenerating} style={({ pressed }) => [styles.backButton, (currentStepIndex === 0 || isGenerating) && styles.disabledButton, pressed && styles.pressed]}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
            <Pressable
              onPress={handlePrimaryAction}
              disabled={isGenerating || !canCreate}
              style={({ pressed }) => [styles.ctaButton, (!canCreate || isGenerating) && styles.disabledButton, pressed && styles.pressed]}
            >
              <LinearGradient colors={[palette.cyan, "rgba(61,165,255,0.85)"]} style={StyleSheet.absoluteFill} />
              {isGenerating ? (
                <ActivityIndicator color={palette.void} />
              ) : (
                <>
                  <Sparkles color={palette.void} size={18} />
                  <Text style={styles.ctaButtonText}>{!canCreate ? `Tier limit (${maxEagohs} max)` : isLastStep ? "REVIEW & CONFIRM" : "NEXT"}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        {pending ? (
          <ConfirmationSheet
            pending={pending}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            isGenerating={isGenerating}
            canAfford={edgeTotal >= pending.edgeCost}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.void },
  root: { flex: 1, backgroundColor: palette.void },
  previewArea: { position: "relative", marginHorizontal: 12, marginTop: 6 },
  previewStage: {
    flex: 1,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(54,245,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3,6,11,0.6)",
  },
  stageRing: { position: "absolute", width: "92%", height: "88%", borderRadius: 5, borderWidth: 1 },
  glassDome: {
    width: 110,
    height: 120,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  glassDomeInner: { width: 84, height: 90, borderRadius: 5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  brainCore: { width: 54, height: 54, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  crack: { position: "absolute", top: 10, left: 12, width: 28, height: 2, backgroundColor: "#4B5563", transform: [{ rotate: "-28deg" }] },
  crack2: { position: "absolute", bottom: 16, right: 10, width: 22, height: 2, backgroundColor: "#4B5563", transform: [{ rotate: "15deg" }] },
  bodyFrame: { width: 150, height: 160, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  neckConnector: { position: "absolute", top: -5, width: 20, height: 12, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 5 },
  shoulderLeft: { position: "absolute", top: 12, left: -16, width: 32, height: 68, borderRadius: 5 },
  shoulderRight: { position: "absolute", top: 12, right: -16, width: 32, height: 68, borderRadius: 5 },
  torsoCore: { width: 96, height: 100, borderRadius: 5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  legLeft: { position: "absolute", bottom: -32, left: 32, width: 26, height: 56, borderRadius: 5 },
  legRight: { position: "absolute", bottom: -32, right: 32, width: 26, height: 56, borderRadius: 5 },
  exposedWire: { position: "absolute", bottom: 34, left: 10, width: 16, height: 2, backgroundColor: "#4B5563", transform: [{ rotate: "35deg" }] },
  exposedWire2: { position: "absolute", top: 44, right: 8, width: 12, height: 1.5, backgroundColor: "#4B5563", transform: [{ rotate: "-20deg" }] },
  tierChipFloat: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  tierChipFloatPaid: { borderColor: "rgba(108,230,255,0.28)", backgroundColor: "rgba(8,20,35,0.75)" },
  tierChipFloatText: { color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  infoStrip: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.line },
  infoName: { color: palette.text, fontSize: 18, fontWeight: "900", letterSpacing: 0.6 },
  infoMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  infoDomain: { color: palette.cyan, fontSize: 11, fontWeight: "800" },
  infoDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: palette.muted },
  infoShell: { color: palette.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  infoSlots: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  multiplier: { color: palette.gold, fontSize: 10, fontWeight: "900" },
  stepperBar: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  stepperTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7 },
  stepCounter: { color: palette.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  stepMiniTitle: { color: palette.text, fontSize: 12, fontWeight: "800", flex: 1 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.cyan },
  stepDotsContent: { gap: 6, paddingTop: 8, paddingRight: 12 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  stepDotActive: { borderColor: palette.cyan, backgroundColor: "rgba(54,245,255,0.16)" },
  stepDotComplete: { borderColor: "rgba(43,214,127,0.45)", backgroundColor: "rgba(43,214,127,0.10)" },
  stepDotText: { color: palette.muted, fontSize: 10, fontWeight: "900" },
  stepDotTextActive: { color: palette.text },
  wizardScroll: { flex: 1 },
  wizardContent: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  wizardCard: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(54,245,255,0.18)",
    backgroundColor: "rgba(10,18,30,0.62)",
    overflow: "hidden",
    padding: 12,
  },
  wizardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  wizardIcon: {
    width: 34,
    height: 34,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  wizardHeaderCopy: { flex: 1 },
  wizardEyebrow: { color: palette.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  wizardTitle: { color: palette.text, fontSize: 18, fontWeight: "900", letterSpacing: 0.4, marginTop: 1 },
  wizardHint: { color: palette.muted, fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 8 },
  stepContent: { marginTop: 10, gap: 5 },
  optionsGrid: { gap: 4 },
  optionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 42,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginBottom: 2,
  },
  optionDot: { width: 8, height: 8, borderRadius: 4 },
  optionCopy: { flex: 1 },
  optionLabel: { color: palette.text, fontSize: 12, fontWeight: "800" },
  optionDetail: { color: palette.muted, fontSize: 9, marginTop: 1 },
  sectionHint: { color: palette.muted, fontSize: 10, fontWeight: "700", marginBottom: 2 },
  labHint: { marginTop: 10 },
  input: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "rgba(3,6,11,0.35)",
    minHeight: 44,
  },
  textArea: { minHeight: 92, textAlignVertical: "top" },
  errorText: { color: palette.ember, fontSize: 11, fontWeight: "800", textAlign: "center", paddingVertical: 4 },
  costPreview: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 4, marginTop: 2 },
  costPreviewLabel: { color: palette.muted, fontSize: 12, fontWeight: "800", flex: 1 },
  costPreviewValue: { color: palette.gold, fontSize: 16, fontWeight: "900" },
  ctaContainer: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 0 },
  ctaFade: { position: "absolute", top: -20, left: 0, right: 0, height: 20 },
  ctaRow: { flexDirection: "row", gap: 10 },
  backButton: {
    width: 88,
    minHeight: 54,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: { color: palette.muted, fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
  ctaButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    shadowColor: palette.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  ctaButtonText: { color: palette.void, fontSize: 15, fontWeight: "900", letterSpacing: 1.2 },
  disabledButton: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.88 },
  bottomSpacer: { height: 8 },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,4,10,0.90)",
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
    borderColor: "rgba(54,245,255,0.30)",
    overflow: "hidden",
    gap: 12,
  },
  confirmHeader: { color: palette.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2.2 },
  confirmName: { color: palette.text, fontSize: 20, fontWeight: "900", letterSpacing: 0.8 },
  confirmDetails: { gap: 3 },
  confirmLine: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  confirmEdgeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line },
  confirmEdgeCost: { color: palette.gold, fontSize: 20, fontWeight: "900" },
  confirmError: { color: palette.ember, fontSize: 11, fontWeight: "800" },
  confirmActions: { flexDirection: "row", gap: 10 },
  confirmCancel: {
    flex: 1,
    minHeight: 44,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  confirmCancelText: { color: palette.muted, fontWeight: "800", fontSize: 14 },
  confirmForge: {
    flex: 2,
    minHeight: 44,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.cyan,
    shadowColor: palette.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  confirmForgeText: { color: palette.void, fontWeight: "900", fontSize: 14 },
});
