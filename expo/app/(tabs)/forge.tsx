/**
 * EAGOH Forge — stepped wizard creation flow.
 *
 * Removed Face & Features step. Customization fields (headwear, body gear,
 * footwear, accessories, notes) are now free-text descriptions. Sport and
 * Fanatic Teams only appear when the selected domain is Sports. Forge Lab
 * is its own separate step.
 *
 * Keyboard handling: preview/header are fixed outside KeyboardAvoidingView.
 * Only the wizard ScrollView is wrapped in KAV so keyboard avoidance resizes
 * just the scrollable area. Focused inputs are scrolled into view via
 * measureInWindow.
 */

import { palette } from "@/constants/colors";
import { useEdge } from "@/providers/EdgeProvider";
import { useEagohs, useEagohFull } from "@/providers/EagohProvider";
import { useForge, type ForgePending } from "@/providers/ForgeProvider";
import { useProfile } from "@/providers/ProfileProvider";
import type { EagohFull, EagohRecord, TeamFocusMode } from "@/services/eagohs";
import { renameEagohName } from "@/services/eagohs";
import { INTELLIGENCE_DOMAINS } from "@/services/domains";
import {
  calculateReforgeCost,
  canRenameEAGOH,
  getRenameCooldownRemaining,
  RENAME_EDGE_COST,
} from "@/services/eagohIdentity";
import { TIER_MAX_EAGOHS, TIER_MULTIPLIER, getForgeCost } from "@/services/edge";
import type { EagohDraft } from "@/services/eagohs";
import { useHaptics } from "@/hooks/useHaptics";
import TeamSelector from "@/app/_components/TeamSelector";
import EagohHeroBanner from "@/app/_components/EagohHeroBanner";
import { getTeamById, getSportCanonical } from "@/data/teams";
import { MUSIC_GENRES, MUSIC_ROLES, getMusicGenre, getMusicRole } from "@/data/music";
import { FILM_TV_CATEGORIES, FILM_TV_GENRES, FILM_TV_ROLES, getFilmTvCategory, getFilmTvGenre, getFilmTvRole } from "@/data/filmTv";
import { FASHION_STYLE_CATEGORIES, FASHION_ROLES, getFashionStyleCategory, getFashionRole } from "@/data/fashion";
import { EDUCATION_SUBJECTS, EDUCATION_ROLES, getEducationSubject, getEducationRole } from "@/data/education";
import { GAMING_GENRES, GAMING_ROLES, getGamingGenre, getGamingRole } from "@/data/gaming";
import { BUSINESS_INDUSTRIES, BUSINESS_ROLES, getBusinessIndustry, getBusinessRole } from "@/data/business";
import { FINANCE_FOCUSES, FINANCE_ROLES, getFinanceFocus, getFinanceRole } from "@/data/finance";
import { TECHNOLOGY_AREAS, TECHNOLOGY_ROLES, getTechnologyArea, getTechnologyRole } from "@/data/technology";
import { HEALTH_FITNESS_AREAS, HEALTH_FITNESS_ROLES, getHealthFitnessArea, getHealthFitnessRole } from "@/data/healthFitness";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  ChevronDown,
  Cpu,
  Crown,
  Footprints,
  Gem,
  Heart,
  Pencil,
  Plus,
  ScanFace,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useRouter } from "expo-router";

const GENERIC_EAGOH_URI = "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/pl6p26j6a1qg1xdfjloo1.png";

type OptionTone = "cyan" | "gold" | "violet" | "ember" | "success";
type ForgeOption = { id: string; label: string; detail?: string; tone: OptionTone };
type WizardStepId =
  | "name"
  | "domain"
  | "gender"
  | "bodyType"
  | "headwear"
  | "bodyGear"
  | "footwear"
  | "accessories"
  | "notes"
  | "cybernetic"
  | "pose"
  | "dna"
  | "sport"
  | "teams"
  | "music_genre"
  | "music_role"
  | "film_tv_category"
  | "film_tv_genre"
  | "film_tv_role"
  | "fashion_style_category"
  | "fashion_role"
  | "education_subject"
  | "education_role"
  | "gaming_genre"
  | "gaming_role"
  | "business_industry"
  | "business_role"
  | "finance_focus"
  | "finance_role"
  | "technology_area"
  | "technology_role"
  | "health_fitness_area"
  | "health_fitness_role"
  | "lab";

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

const intensities: ForgeOption[] = [
  { id: "minimal", label: "Minimal", detail: "subtle neural seams", tone: "success" },
  { id: "moderate", label: "Moderate", detail: "visible optic glow", tone: "cyan" },
  { id: "heavy", label: "Heavy", detail: "reinforced limbs", tone: "gold" },
  { id: "assimilated", label: "Assimilated", detail: "full machine myth", tone: "violet" },
];

const poses: ForgeOption[] = [
  { id: "arms-crossed", label: "Arms Crossed", detail: "unshaken authority", tone: "gold" },
  { id: "strategist-stance", label: "Strategist Stance", detail: "mid-call calculation", tone: "violet" },
  { id: "tactical-ready", label: "Tactical Ready", detail: "ready to deploy", tone: "cyan" },
  { id: "confident-walk", label: "Confident Walk", detail: "powerful stride", tone: "ember" },
  { id: "power-stance", label: "Power Stance", detail: "commanding presence", tone: "gold" },
  { id: "hands-behind-back", label: "Hands Behind Back", detail: "calm composure", tone: "success" },
  { id: "one-hand-forward", label: "One Hand Forward", detail: "directive gesture", tone: "cyan" },
  { id: "champion-pose", label: "Champion Pose", detail: "victory stance", tone: "gold" },
  { id: "leaning-forward", label: "Leaning Forward", detail: "intense focus", tone: "violet" },
  { id: "calm-sentinel", label: "Calm Sentinel", detail: "serene guardian", tone: "success" },
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

function toneColor(tone: OptionTone): string {
  if (tone === "gold") return palette.gold;
  if (tone === "violet") return palette.violet;
  if (tone === "ember") return palette.ember;
  if (tone === "success") return palette.success;
  return palette.cyan;
}

const ForgePreview = memo(function ForgePreview({
  name,
  sport,
  gender,
  domain,
  cyberneticIntensity,
  pose,
  tier,
  imageUrl,
  isEditing: editing,
}: {
  name: string;
  sport: string;
  gender: string;
  domain: string;
  cyberneticIntensity: string;
  pose: string;
  tier: string;
  imageUrl?: string | null;
  isEditing?: boolean;
}): JSX.Element {
  const isFree = tier === "free";
  const intensity = intensities.find((i) => i.id === cyberneticIntensity);
  const accent = isFree ? "#6B7280" : toneColor(intensity?.tone ?? "cyan");
  const brainGlow = isFree ? "rgba(75,85,99,0.4)" : `${accent}88`;
  const showEagohImage = !!imageUrl;

  return (
    <View style={styles.previewStage}>
      <LinearGradient
        colors={isFree
          ? ["#1A1A1E", "#0D0D10", "#1A1A1E"]
          : ["rgba(54,245,255,0.10)", "rgba(3,6,11,0.92)", "rgba(124,92,255,0.10)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.stageRing, { borderColor: isFree ? "rgba(107,114,128,0.15)" : `${accent}22` }]} />
      <View style={[styles.eagohGlow, { backgroundColor: brainGlow }]} />
      <Image
        source={{ uri: showEagohImage ? (imageUrl as string) : GENERIC_EAGOH_URI }}
        style={styles.eagohImage}
        resizeMode="contain"
      />
      {editing ? (
        <View style={styles.editingBadge}>
          <Sparkles color={palette.gold} size={10} />
          <Text style={styles.editingBadgeText}>EDITING</Text>
        </View>
      ) : null}
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
  const h = useHaptics();
  const accent = toneColor(option.tone);
  const handlePress = useCallback((): void => {
    h.selection();
    onPress(option.id);
  }, [onPress, option.id, h]);

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
  onGetEdge,
  isGenerating,
  canAfford,
}: {
  pending: ForgePending;
  onConfirm: () => void;
  onCancel: () => void;
  onGetEdge: () => void;
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
        {!canAfford ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.confirmError}>Insufficient Edge balance.</Text>
            <Pressable onPress={onGetEdge} style={({ pressed }) => [styles.getEdgeBtn, pressed && { opacity: 0.8 }]}>
              <Text style={styles.getEdgeBtnText}>Get Edge</Text>
            </Pressable>
          </View>
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
            {isGenerating ? <ActivityIndicator color={palette.void} /> : <Text style={styles.confirmForgeText}>Generate EAGOH</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function ForgeScreen(): JSX.Element {
  const h = useHaptics();
  const router = useRouter();
  const { profile } = useProfile();
  const { total: edgeTotal } = useEdge();
  const { pending, prepareForge, confirmForge, cancelForge, isGenerating } = useForge();
  const { eagohs, remaining, canCreate, tier, deleteEagoh, isDeleting } = useEagohs();
  const { height: windowHeight } = useWindowDimensions();

  const [name, setName] = useState<string>("");
  const [sport, setSport] = useState<string>("football");
  const [gender, setGender] = useState<string>("neutral");
  const [domain, setDomain] = useState<string>("sports");
  const [bodyType, setBodyType] = useState<string>("average");
  const [styleNotes, setStyleNotes] = useState<string>("");
  const [dna, setDna] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [teamFocusMode, setTeamFocusMode] = useState<TeamFocusMode>("none");
  const [proTeamFocusId, setProTeamFocusId] = useState<string>("");
  const [proTeamFocusName, setProTeamFocusName] = useState<string>("");
  const [collegeTeamFocusId, setCollegeTeamFocusId] = useState<string>("");
  const [collegeTeamFocusName, setCollegeTeamFocusName] = useState<string>("");
  const [musicGenre, setMusicGenre] = useState<string>("");
  const [musicRole, setMusicRole] = useState<string>("");
  const [filmTvCategory, setFilmTvCategory] = useState<string>("");
  const [filmTvGenre, setFilmTvGenre] = useState<string>("");
  const [filmTvRole, setFilmTvRole] = useState<string>("");
  const [fashionStyleCategory, setFashionStyleCategory] = useState<string>("");
  const [fashionRole, setFashionRole] = useState<string>("");
  const [educationSubject, setEducationSubject] = useState<string>("");
  const [educationRole, setEducationRole] = useState<string>("");
  const [gamingGenre, setGamingGenre] = useState<string>("");
  const [gamingRole, setGamingRole] = useState<string>("");
  const [businessIndustry, setBusinessIndustry] = useState<string>("");
  const [businessRole, setBusinessRole] = useState<string>("");
  const [financeFocus, setFinanceFocus] = useState<string>("");
  const [financeRole, setFinanceRole] = useState<string>("");
  const [technologyArea, setTechnologyArea] = useState<string>("");
  const [technologyRole, setTechnologyRole] = useState<string>("");
  const [healthFitnessArea, setHealthFitnessArea] = useState<string>("");
  const [healthFitnessRole, setHealthFitnessRole] = useState<string>("");
  const [appearance, setAppearance] = useState<Record<string, string>>({});
  const [cyberneticIntensity, setCyberneticIntensity] = useState<string>("moderate");
  const [pose, setPose] = useState<string>("calm-sentinel");
  const [lab, setLab] = useState<string>("neon-vault");
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);

  // ── EAGOH selection for editing ──────────────────────────────────
  const [selectedEagohId, setSelectedEagohId] = useState<string>("");
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const { data: editingEagoh, isLoading: isLoadingEagoh } = useEagohFull(selectedEagohId || null);
  const hasLoadedRef = useRef<string | null>(null);
  const isEditing = selectedEagohId.length > 0;

  // ── Rename state ──────────────────────────────────────────────────
  const [showRenameModal, setShowRenameModal] = useState<boolean>(false);
  const [renameNameInput, setRenameNameInput] = useState<string>("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const { spend } = useEdge();

  /** When user picks an EAGOH, load its full data into the wizard form. */
  useEffect(() => {
    if (!editingEagoh || !selectedEagohId) return;
    if (hasLoadedRef.current === selectedEagohId) return;
    hasLoadedRef.current = selectedEagohId;

    setForgeError(null);
    setName(editingEagoh.name ?? "");
    setSport(editingEagoh.sport ?? "football");
    setGender(editingEagoh.gender ?? "neutral");
    setDomain(editingEagoh.domain ?? "sports");
    setBodyType(editingEagoh.body_type ?? "average");
    setStyleNotes(editingEagoh.style_notes ?? "");
    setDna(editingEagoh.dna ?? []);
    setTeams(editingEagoh.teams ?? []);
    setTeamFocusMode(editingEagoh.team_focus_mode ?? "none");
    setProTeamFocusId(editingEagoh.pro_team_focus_id ?? "");
    setProTeamFocusName(editingEagoh.pro_team_focus_name ?? "");
    setCollegeTeamFocusId(editingEagoh.college_team_focus_id ?? "");
    setCollegeTeamFocusName(editingEagoh.college_team_focus_name ?? "");
    setMusicGenre(editingEagoh.music_genre ?? "");
    setMusicRole(editingEagoh.music_role ?? "");
    setFilmTvCategory(editingEagoh.film_tv_category ?? "");
    setFilmTvGenre(editingEagoh.film_tv_genre ?? "");
    setFilmTvRole(editingEagoh.film_tv_role ?? "");
    setFashionStyleCategory(editingEagoh.fashion_style_category ?? "");
    setFashionRole(editingEagoh.fashion_role ?? "");
    setEducationSubject(editingEagoh.education_subject ?? "");
    setEducationRole(editingEagoh.education_role ?? "");
    setGamingGenre(editingEagoh.gaming_genre ?? "");
    setGamingRole(editingEagoh.gaming_role ?? "");
    setBusinessIndustry(editingEagoh.business_industry ?? "");
    setBusinessRole(editingEagoh.business_role ?? "");
    setFinanceFocus(editingEagoh.finance_focus ?? "");
    setFinanceRole(editingEagoh.finance_role ?? "");
    setTechnologyArea(editingEagoh.technology_area ?? "");
    setTechnologyRole(editingEagoh.technology_role ?? "");
    setHealthFitnessArea(editingEagoh.health_fitness_area ?? "");
    setHealthFitnessRole(editingEagoh.health_fitness_role ?? "");
    setAppearance(editingEagoh.appearance ?? {});
    setCyberneticIntensity(editingEagoh.cybernetic_intensity ?? "moderate");
    setPose(editingEagoh.pose ?? "calm-sentinel");
    setLab(editingEagoh.lab ?? editingEagoh.labs?.[0] ?? "neon-vault");
    setCurrentStepIndex(0);
  }, [editingEagoh, selectedEagohId]);

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollYRef = useRef<number>(0);
  /** Stores native TextInput refs keyed by the step id they belong to. */
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  /** Track keyboard height so we know how much screen real estate is lost. */
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const { effectiveSubscriptionTier } = useProfile();
  const currentTier = effectiveSubscriptionTier;
  const multiplier = TIER_MULTIPLIER[currentTier] ?? 0;
  const maxEagohs = TIER_MAX_EAGOHS[currentTier] ?? 0;
  const forgeCost = getForgeCost(isEditing ? "full_reforge" : "initial");
  const domainLabel = INTELLIGENCE_DOMAINS.find((d) => d.id === domain)?.label ?? domain;
  const isSportsDomain = domain === "sports";
  const isMusicDomain = domain === "music";
  const isFilmTvDomain = domain === "film-tv";
  const isFashionDomain = domain === "fashion";
  const isEducationDomain = domain === "education";
  const isGamingDomain = domain === "gaming";
  const isBusinessDomain = domain === "business";
  const isFinanceDomain = domain === "finance";
  const isTechnologyDomain = domain === "technology";
  const isHealthFitnessDomain = domain === "health-fitness";

  const wizardSteps: WizardStep[] = useMemo(() => {
    const base: WizardStep[] = [
      { id: "name", title: "EAGOH Name", eyebrow: "Step 01", hint: "Give your intelligence unit a memorable identity.", icon: <Crown color={palette.gold} size={15} /> },
      { id: "domain", title: "Intelligence Domain", eyebrow: "Step 02", hint: "This controls what your EAGOH is allowed to answer.", icon: <BrainCircuit color={palette.violet} size={15} /> },
      { id: "gender", title: "Gender", eyebrow: "Step 03", hint: "Choose the presentation direction for the chassis.", icon: <ScanFace color={palette.cyan} size={15} /> },
      { id: "bodyType", title: "Body Type", eyebrow: "Step 04", hint: "Tune the physical silhouette without changing the core EAGOH chassis.", icon: <Shirt color={palette.ember} size={15} /> },
      { id: "headwear", title: "Headwear", eyebrow: "Step 05", hint: "Describe the headwear — a helmet, hood, visor, or other head gear.", icon: <Crown color={palette.gold} size={15} /> },
      { id: "bodyGear", title: "Body Gear", eyebrow: "Step 06", hint: "Describe armor, jackets, pads, or other body gear.", icon: <Shirt color={palette.cyan} size={15} /> },
      { id: "footwear", title: "Footwear", eyebrow: "Step 07", hint: "Describe how the lower chassis is finished — boots, shoes, cleats.", icon: <Footprints color={palette.success} size={15} /> },
      { id: "accessories", title: "Accessories", eyebrow: "Step 08", hint: "Describe premium details — chains, watches, rings, visors.", icon: <Gem color={palette.violet} size={15} /> },
      { id: "notes", title: "Additional Notes", eyebrow: "Step 09", hint: "Optional style, material, and attitude notes.", icon: <SlidersHorizontal color={palette.gold} size={15} /> },
      { id: "cybernetic", title: "Cybernetic Intensity", eyebrow: "Step 10", hint: "Set how mechanical and activated the EAGOH feels.", icon: <Cpu color={palette.ember} size={15} /> },
      { id: "pose", title: "Fixed Pose", eyebrow: "Step 11", hint: "Pick the final full-body stance used for generation.", icon: <ScanFace color={palette.cyan} size={15} /> },
      { id: "dna", title: "DNA Archetypes", eyebrow: "Step 12", hint: "Optional personality signals layered into the chassis.", icon: <Sparkles color={palette.violet} size={15} /> },
    ];

    if (isSportsDomain) {
      base.push({ id: "sport", title: "Sport Type", eyebrow: "Step 13", hint: "Select the primary sport this EAGOH analyzes.", icon: <Zap color={palette.gold} size={15} /> });
      base.push({ id: "teams", title: "Team / College Focus", eyebrow: "Step 14", hint: "Search and select real pro or college teams as canonical references for filtering and rankings.", icon: <Heart color={palette.ember} size={15} /> });
    }

    if (isMusicDomain) {
      base.push({ id: "music_genre", title: "Music Genre", eyebrow: "Step 13", hint: "Select the primary genre this EAGOH specializes in.", icon: <Zap color={palette.violet} size={15} /> });
      base.push({ id: "music_role", title: "Music Role", eyebrow: "Step 14", hint: "Choose the role or perspective this EAGOH embodies in the music industry.", icon: <Sparkles color={palette.violet} size={15} /> });
    }

    if (isFilmTvDomain) {
      base.push({ id: "film_tv_category", title: "Film & TV Category", eyebrow: "Step 13", hint: "Select the primary category this EAGOH specializes in.", icon: <Zap color={palette.ember} size={15} /> });
      base.push({ id: "film_tv_genre", title: "Film & TV Genre", eyebrow: "Step 14", hint: "Select the genre this EAGOH focuses on.", icon: <Sparkles color={palette.ember} size={15} /> });
      base.push({ id: "film_tv_role", title: "Film & TV Role", eyebrow: "Step 15", hint: "Choose the role or perspective this EAGOH embodies in the film and television industry.", icon: <Heart color={palette.ember} size={15} /> });
    }

    if (isFashionDomain) {
      base.push({ id: "fashion_style_category", title: "Fashion Style Category", eyebrow: "Step 13", hint: "Select the style category this EAGOH specializes in — Streetwear, Luxury, Casual, or more.", icon: <Zap color={palette.cyan} size={15} /> });
      base.push({ id: "fashion_role", title: "Fashion Role", eyebrow: "Step 14", hint: "Choose the role or perspective this EAGOH embodies in the fashion world.", icon: <Sparkles color={palette.cyan} size={15} /> });
    }

    if (isEducationDomain) {
      base.push({ id: "education_subject", title: "Education Subject", eyebrow: "Step 13", hint: "Select the primary subject this EAGOH specializes in — Mathematics, Science, History, or more.", icon: <Zap color={palette.success} size={15} /> });
      base.push({ id: "education_role", title: "Education Role", eyebrow: "Step 14", hint: "Choose the role or perspective this EAGOH embodies in education.", icon: <Sparkles color={palette.success} size={15} /> });
    }

    if (isGamingDomain) {
      base.push({ id: "gaming_genre", title: "Gaming Genre", eyebrow: "Step 13", hint: "Select the primary game genre this EAGOH specializes in — FPS, RPG, MOBA, or more.", icon: <Zap color={palette.cyan} size={15} /> });
      base.push({ id: "gaming_role", title: "Gaming Role", eyebrow: "Step 14", hint: "Choose the role or perspective this EAGOH embodies in gaming.", icon: <Sparkles color={palette.cyan} size={15} /> });
    }

    if (isBusinessDomain) {
      base.push({ id: "business_industry", title: "Business Industry", eyebrow: "Step 13", hint: "Select the primary industry this EAGOH specializes in — Marketing, SaaS, Startups, or more.", icon: <Zap color={palette.gold} size={15} /> });
      base.push({ id: "business_role", title: "Business Role", eyebrow: "Step 14", hint: "Choose the role or perspective this EAGOH embodies in business.", icon: <Sparkles color={palette.gold} size={15} /> });
    }

    if (isFinanceDomain) {
      base.push({ id: "finance_focus", title: "Finance Focus", eyebrow: "Step 13", hint: "Select the primary financial focus this EAGOH specializes in — Stocks, Crypto, Retirement, or more.", icon: <Zap color={palette.success} size={15} /> });
      base.push({ id: "finance_role", title: "Finance Role", eyebrow: "Step 14", hint: "Choose the role or perspective this EAGOH embodies in the financial world.", icon: <Sparkles color={palette.success} size={15} /> });
    }

    if (isTechnologyDomain) {
      base.push({ id: "technology_area", title: "Technology Area", eyebrow: "Step 13", hint: "Select the primary technology area this EAGOH specializes in — AI, Cybersecurity, Robotics, or more.", icon: <Zap color={palette.cyan} size={15} /> });
      base.push({ id: "technology_role", title: "Technology Role", eyebrow: "Step 14", hint: "Choose the role or perspective this EAGOH embodies in technology.", icon: <Sparkles color={palette.cyan} size={15} /> });
    }

    if (isHealthFitnessDomain) {
      base.push({ id: "health_fitness_area", title: "Health & Fitness Area", eyebrow: "Step 13", hint: "Select the primary fitness area this EAGOH specializes in — Strength Training, Nutrition, CrossFit, or more.", icon: <Zap color={palette.ember} size={15} /> });
      base.push({ id: "health_fitness_role", title: "Health & Fitness Role", eyebrow: "Step 14", hint: "Choose the role or perspective this EAGOH embodies in health and fitness.", icon: <Sparkles color={palette.ember} size={15} /> });
    }

    const hasSpecialization = isSportsDomain || isMusicDomain || isFilmTvDomain || isFashionDomain || isEducationDomain || isGamingDomain || isBusinessDomain || isFinanceDomain || isTechnologyDomain || isHealthFitnessDomain;
    const labEyebrowNum = hasSpecialization ? (isFilmTvDomain ? "Step 16" : (isFashionDomain || isEducationDomain || isGamingDomain || isBusinessDomain || isFinanceDomain || isTechnologyDomain || isHealthFitnessDomain) ? "Step 15" : "Step 15") : "Step 13";
    base.push({ id: "lab", title: "Forge Lab", eyebrow: labEyebrowNum, hint: "Select the lab environment for this EAGOH.", icon: <Cpu color={palette.cyan} size={15} /> });
    return base;
  }, [isSportsDomain, isMusicDomain, isFilmTvDomain, isFashionDomain, isEducationDomain, isGamingDomain, isBusinessDomain, isFinanceDomain, isTechnologyDomain, isHealthFitnessDomain]);

  const currentStep = wizardSteps[currentStepIndex];
  const isLastStep = currentStepIndex === wizardSteps.length - 1;
  const progressPercent = ((currentStepIndex + 1) / wizardSteps.length) * 100;

  const draft: EagohDraft = useMemo(() => ({
    name,
    sport,
    gender,
    domain,
    bodyType,
    styleNotes,
    dna,
    teams,
    teamFocusMode,
    proTeamFocusId,
    proTeamFocusName,
    collegeTeamFocusId,
    collegeTeamFocusName,
    musicGenre,
    musicRole,
    filmTvCategory,
    filmTvGenre,
    filmTvRole,
    fashionStyleCategory,
    fashionRole,
    educationSubject,
    educationRole,
    gamingGenre,
    gamingRole,
    businessIndustry,
    businessRole,
    financeFocus,
    financeRole,
    technologyArea,
    technologyRole,
    healthFitnessArea,
    healthFitnessRole,
    appearance,
    cyberneticIntensity,
    pose,
    lab,
  }), [name, sport, gender, domain, bodyType, styleNotes, dna, teams, teamFocusMode, proTeamFocusId, proTeamFocusName, collegeTeamFocusId, collegeTeamFocusName, musicGenre, musicRole, filmTvCategory, filmTvGenre, filmTvRole, fashionStyleCategory, fashionRole, educationSubject, educationRole, gamingGenre, gamingRole, businessIndustry, businessRole, financeFocus, financeRole, technologyArea, technologyRole, healthFitnessArea, healthFitnessRole, appearance, cyberneticIntensity, pose, lab]);

  /** Dynamic reforge cost when editing — compares current form vs EAGOH's saved state. */
  const reforgeCost = useMemo(() => {
    if (!isEditing || !editingEagoh) return { changedSections: [] as string[], edgeCost: getForgeCost("full_reforge") };
    const oldState = {
      appearance: editingEagoh.appearance,
      styleNotes: editingEagoh.style_notes ?? "",
      pose: editingEagoh.pose ?? "",
      musicGenre: editingEagoh.music_genre ?? "",
      musicRole: editingEagoh.music_role ?? "",
      filmTvCategory: editingEagoh.film_tv_category ?? "",
      filmTvGenre: editingEagoh.film_tv_genre ?? "",
      filmTvRole: editingEagoh.film_tv_role ?? "",
      fashionStyleCategory: editingEagoh.fashion_style_category ?? "",
      fashionRole: editingEagoh.fashion_role ?? "",
      educationSubject: editingEagoh.education_subject ?? "",
      educationRole: editingEagoh.education_role ?? "",
      gamingGenre: editingEagoh.gaming_genre ?? "",
      gamingRole: editingEagoh.gaming_role ?? "",
      healthFitnessArea: editingEagoh.health_fitness_area ?? "",
      healthFitnessRole: editingEagoh.health_fitness_role ?? "",
    };
    const newState = {
      appearance,
      styleNotes,
      pose,
      musicGenre,
      musicRole,
      filmTvCategory,
      filmTvGenre,
      filmTvRole,
      fashionStyleCategory,
      fashionRole,
      educationSubject,
      educationRole,
      gamingGenre,
      gamingRole,
      healthFitnessArea,
      healthFitnessRole,
    };
    return calculateReforgeCost(oldState, newState);
  }, [isEditing, editingEagoh, appearance, styleNotes, pose, musicGenre, musicRole, filmTvCategory, filmTvGenre, filmTvRole, fashionStyleCategory, fashionRole, educationSubject, educationRole, gamingGenre, gamingRole, healthFitnessArea, healthFitnessRole]);

  const setAppearanceField = useCallback((category: string, text: string): void => {
    setAppearance((prev) => ({ ...prev, [category]: text }));
  }, []);

  const toggleDna = useCallback((id: string): void => {
    setDna((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }, []);

  const toggleTeams = useCallback((id: string): void => {
    setTeams((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }, []);

  // ── Sport-aware team handlers ──────────────────────────────────────

  /** Clear team selections that are incompatible with the new sport. */
  const clearIncompatibleTeams = useCallback((newSport: string): void => {
    const canonical = getSportCanonical(newSport);
    if (!canonical) {
      // Sport has no team mapping — clear everything
      if (teamFocusMode !== "none" || proTeamFocusId || collegeTeamFocusId) {
        setTeamFocusMode("none");
        setProTeamFocusId("");
        setProTeamFocusName("");
        setCollegeTeamFocusId("");
        setCollegeTeamFocusName("");
        setForgeError("Team focus reset because sport type changed.");
      }
      return;
    }

    // Check if existing pro team belongs to new sport
    let needsClear = false;
    if (proTeamFocusId) {
      const proTeam = getTeamById(proTeamFocusId);
      if (!proTeam || proTeam.sport.toLowerCase() !== canonical.toLowerCase()) {
        needsClear = true;
      }
    }
    if (collegeTeamFocusId) {
      const colTeam = getTeamById(collegeTeamFocusId);
      if (!colTeam || colTeam.sport.toLowerCase() !== canonical.toLowerCase()) {
        needsClear = true;
      }
    }

    if (needsClear) {
      setTeamFocusMode("none");
      setProTeamFocusId("");
      setProTeamFocusName("");
      setCollegeTeamFocusId("");
      setCollegeTeamFocusName("");
      setForgeError("Team focus reset because sport type changed.");
    }
  }, [teamFocusMode, proTeamFocusId, collegeTeamFocusId]);

  const handleSportChange = useCallback((newSport: string): void => {
    clearIncompatibleTeams(newSport);
    setSport(newSport);
  }, [clearIncompatibleTeams]);

  const handleProTeamToggle = useCallback((id: string): void => {
    setProTeamFocusId((prev) => {
      if (prev === id) {
        setProTeamFocusName("");
        return "";
      }
      const team = getTeamById(id);
      setProTeamFocusName(team?.display_name ?? "");
      return id;
    });
  }, []);

  const handleCollegeTeamToggle = useCallback((id: string): void => {
    setCollegeTeamFocusId((prev) => {
      if (prev === id) {
        setCollegeTeamFocusName("");
        return "";
      }
      const team = getTeamById(id);
      setCollegeTeamFocusName(team?.display_name ?? "");
      return id;
    });
  }, []);

  const handleTeamFocusModeChange = useCallback((mode: TeamFocusMode): void => {
    setTeamFocusMode(mode);
    // Clear incompatible slots when mode restricts
    if (mode === "none" || mode === "college_only") {
      setProTeamFocusId("");
      setProTeamFocusName("");
    }
    if (mode === "none" || mode === "pro_only") {
      setCollegeTeamFocusId("");
      setCollegeTeamFocusName("");
    }
    h.selection();
  }, [h]);

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
    h.selection();
    setCurrentStepIndex((prev) => Math.min(prev + 1, wizardSteps.length - 1));
  }, [validateCurrentStep, wizardSteps.length, h]);

  const goBack = useCallback((): void => {
    h.selection();
    setForgeError(null);
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, [h]);

  const goToStep = useCallback((index: number): void => {
    h.selection();
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
    if (isEditing) {
      // Free users cannot reforge
      if (currentTier === "free") {
        setForgeError("Custom Reforging requires an active subscription.");
        return;
      }
      // If no changes detected, don't charge or generate
      if (reforgeCost.changedSections.length === 0) {
        setForgeError("No modifications detected. No Edge charged.");
        return;
      }
      prepareForge(draft, "full_reforge", { eagohId: selectedEagohId, edgeCost: reforgeCost.edgeCost });
    } else {
      prepareForge(draft, "initial");
    }
  }, [domain.length, draft, name, prepareForge, isEditing, selectedEagohId, currentTier, reforgeCost]);

  // ── Keyboard-aware scroll helpers ──────────────────────────────────

  /** Callback ref factory — stores a native TextInput ref keyed by step id. */
  const registerInputRef = useCallback(
    (key: string) => (ref: TextInput | null): void => {
      inputRefs.current[key] = ref;
    },
    [],
  );

  /** Track current scroll offset so we can add relative deltas. */
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }): void => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  /**
   * When a TextInput gains focus, measure its absolute screen position
   * and scroll the wizard ScrollView so the input stays visible above
   * the soft keyboard.
   */
  const scrollInputIntoView = useCallback(
    (inputKey: string): void => {
      const ref = inputRefs.current[inputKey];
      if (!ref) return;

      // Wait for the keyboard-avoidance layout to settle.
      setTimeout(() => {
        ref.measureInWindow((_x, inputY, _w, inputHeight) => {
          // inputY is the absolute Y of the TextInput on-screen.
          const inputBottom = inputY + inputHeight;

          // CTA bar is ~66 px tall. Leave 12 px breathing room above it.
          const ctaPad = 66 + 12;
          const safeBottom = windowHeight - keyboardHeight - ctaPad;

          if (inputBottom > safeBottom) {
            const overflow = inputBottom - safeBottom;
            scrollViewRef.current?.scrollTo({
              y: scrollYRef.current + overflow + 16,
              animated: true,
            });
          }
        });
      }, 180);
    },
    [keyboardHeight, windowHeight],
  );

  /** Convenience — store ref AND scroll into view on focus. */
  const handleInputFocus = useCallback(
    (inputKey: string): void => {
      scrollInputIntoView(inputKey);
    },
    [scrollInputIntoView],
  );

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

  const handleGetEdge = useCallback((): void => {
    h.selection();
    router.push("/edge-store" as never);
  }, [h, router]);

  // ── Step content renderers ─────────────────────────────────────────

  /** Shared multiline TextInput for description fields (headwear, body gear, etc.). */
  const renderTextInput = useCallback(
    (inputKey: string, value: string, onChange: (text: string) => void, placeholder: string): JSX.Element => (
      <TextInput
        ref={registerInputRef(inputKey)}
        value={value}
        onChangeText={onChange}
        onFocus={(): void => handleInputFocus(inputKey)}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={[styles.input, styles.textArea]}
        multiline
        blurOnSubmit={false}
        returnKeyType="done"
      />
    ),
    [handleInputFocus, registerInputRef],
  );

  const renderStepContent = useCallback((): JSX.Element => {
    if (currentStep.id === "name") {
      return (
        <>
          <TextInput
            ref={registerInputRef("name")}
            value={name}
            onChangeText={setName}
            onFocus={(): void => handleInputFocus("name")}
            placeholder="Enter EAGOH name…"
            placeholderTextColor={palette.muted}
            style={styles.input}
            returnKeyType="next"
            onSubmitEditing={goNext}
          />
          {isEditing ? (
            <Pressable
              onPress={(): void => {
                if (currentTier === "free") {
                  setRenameError("EAGOH renaming requires a Pro, Oracle Elite, or Syndicate subscription.");
                  setShowRenameModal(true);
                  return;
                }
                const cooldown = getRenameCooldownRemaining(editingEagoh?.last_name_change);
                if (cooldown > 0) {
                  setRenameError("Identity recalibration unavailable. EAGOH names may only be changed once every 30 days.");
                  setShowRenameModal(true);
                  return;
                }
                setRenameError(null);
                setRenameNameInput(name);
                setShowRenameModal(true);
              }}
              style={({ pressed }) => [
                styles.renameButton,
                pressed && styles.pressed,
              ]}
            >
              <Pencil color={palette.gold} size={12} />
              <Text style={styles.renameButtonText}>Rename EAGOH</Text>
            </Pressable>
          ) : null}
        </>
      );
    }

    if (currentStep.id === "domain") {
      return (
        <>
          <Text style={styles.sectionHint}>Each EAGOH is a domain specialist. This choice is permanent after Forge — you cannot change it later. To cover another domain, forge a new EAGOH.</Text>
          <View style={styles.permanenceNote}>
            <Text style={styles.permanenceIcon}>!</Text>
            <Text style={styles.permanenceText}>Domain Lock: Permanent after Forge. One EAGOH = One Domain.</Text>
          </View>
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

    if (currentStep.id === "headwear") {
      return renderTextInput("headwear", appearance.headwear ?? "", (text) => setAppearanceField("headwear", text), "e.g. a sleek futuristic helmet with neon visor, tactical hood with optic glow…");
    }

    if (currentStep.id === "bodyGear") {
      return renderTextInput("bodyGear", appearance.body ?? "", (text) => setAppearanceField("body", text), "e.g. form-fitting cyber armor with layered alloy plates, tactical jacket with utility seams…");
    }

    if (currentStep.id === "footwear") {
      return renderTextInput("footwear", appearance.footwear ?? "", (text) => setAppearanceField("footwear", text), "e.g. reinforced tactical boots with carbon plating, futuristic cleats with neon soles…");
    }

    if (currentStep.id === "accessories") {
      return renderTextInput("accessories", appearance.accessories ?? "", (text) => setAppearanceField("accessories", text), "e.g. premium diamond chains, oversized cybernetic wrist module, stacked metallic rings…");
    }

    if (currentStep.id === "notes") {
      return (
        <TextInput
          ref={registerInputRef("notes")}
          value={styleNotes}
          onChangeText={setStyleNotes}
          onFocus={(): void => handleInputFocus("notes")}
          placeholder="e.g. matte black finish, gold trim, holographic accents…"
          placeholderTextColor={palette.muted}
          style={[styles.input, styles.textArea]}
          multiline
          blurOnSubmit={false}
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

    if (currentStep.id === "sport") {
      return (
        <>
          <Text style={styles.sectionHint}>Primary sport focus for this EAGOH.</Text>
          {sports.map((opt) => <OptionChip key={opt.id} option={opt} selected={sport === opt.id} onPress={handleSportChange} />)}
        </>
      );
    }

    if (currentStep.id === "music_genre") {
      return (
        <>
          <Text style={styles.sectionHint}>Select the primary music genre this EAGOH specializes in. This is used for filtering, Marketplace searches, and genre-specific intelligence.</Text>
          {MUSIC_GENRES.map((g) => (
            <OptionChip
              key={g.id}
              option={{ id: g.id, label: g.label, tone: "violet" }}
              selected={musicGenre === g.id}
              onPress={setMusicGenre}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "music_role") {
      return (
        <>
          <Text style={styles.sectionHint}>Choose the role or perspective this EAGOH embodies in the music industry. This shapes its analysis style and marketplace discoverability.</Text>
          {MUSIC_ROLES.map((r) => (
            <OptionChip
              key={r.id}
              option={{ id: r.id, label: r.label, tone: "violet" }}
              selected={musicRole === r.id}
              onPress={setMusicRole}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "film_tv_category") {
      return (
        <>
          <Text style={styles.sectionHint}>Select the film and television category this EAGOH specializes in. This is used for filtering, Marketplace searches, and category-specific intelligence.</Text>
          {FILM_TV_CATEGORIES.map((c) => (
            <OptionChip
              key={c.id}
              option={{ id: c.id, label: c.label, tone: "ember" }}
              selected={filmTvCategory === c.id}
              onPress={setFilmTvCategory}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "film_tv_genre") {
      return (
        <>
          <Text style={styles.sectionHint}>Select the genre this EAGOH focuses on. Genre determines the tone and style of analysis.</Text>
          {FILM_TV_GENRES.map((g) => (
            <OptionChip
              key={g.id}
              option={{ id: g.id, label: g.label, tone: "ember" }}
              selected={filmTvGenre === g.id}
              onPress={setFilmTvGenre}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "film_tv_role") {
      return (
        <>
          <Text style={styles.sectionHint}>Choose the role or perspective this EAGOH embodies in the film and television industry. This shapes its analysis style and marketplace discoverability.</Text>
          {FILM_TV_ROLES.map((r) => (
            <OptionChip
              key={r.id}
              option={{ id: r.id, label: r.label, tone: "ember" }}
              selected={filmTvRole === r.id}
              onPress={setFilmTvRole}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "fashion_style_category") {
      return (
        <>
          <Text style={styles.sectionHint}>Select the style category this EAGOH specializes in. This is used for filtering, Marketplace searches, and style-specific intelligence.</Text>
          {FASHION_STYLE_CATEGORIES.map((c) => (
            <OptionChip
              key={c.id}
              option={{ id: c.id, label: c.label, tone: "cyan" }}
              selected={fashionStyleCategory === c.id}
              onPress={setFashionStyleCategory}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "fashion_role") {
      return (
        <>
          <Text style={styles.sectionHint}>Choose the role or perspective this EAGOH embodies in the fashion world. This shapes its analysis style and marketplace discoverability.</Text>
          {FASHION_ROLES.map((r) => (
            <OptionChip
              key={r.id}
              option={{ id: r.id, label: r.label, tone: "cyan" }}
              selected={fashionRole === r.id}
              onPress={setFashionRole}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "education_subject") {
      return (
        <>
          <Text style={styles.sectionHint}>Select the primary subject this EAGOH specializes in. This is used for filtering, Marketplace searches, and subject-specific intelligence.</Text>
          {EDUCATION_SUBJECTS.map((s) => (
            <OptionChip
              key={s.id}
              option={{ id: s.id, label: s.label, tone: "success" }}
              selected={educationSubject === s.id}
              onPress={setEducationSubject}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "education_role") {
      return (
        <>
          <Text style={styles.sectionHint}>Choose the role or perspective this EAGOH embodies in education. This shapes its analysis style and marketplace discoverability.</Text>
          {EDUCATION_ROLES.map((r) => (
            <OptionChip
              key={r.id}
              option={{ id: r.id, label: r.label, tone: "success" }}
              selected={educationRole === r.id}
              onPress={setEducationRole}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "gaming_genre") {
      return (
        <>
          <Text style={styles.sectionHint}>Select the primary game genre this EAGOH specializes in. This is used for filtering, Marketplace searches, and genre-specific intelligence.</Text>
          {GAMING_GENRES.map((g) => (
            <OptionChip
              key={g.id}
              option={{ id: g.id, label: g.label, tone: "cyan" }}
              selected={gamingGenre === g.id}
              onPress={setGamingGenre}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "gaming_role") {
      return (
        <>
          <Text style={styles.sectionHint}>Choose the role or perspective this EAGOH embodies in gaming. This shapes its analysis style and marketplace discoverability.</Text>
          {GAMING_ROLES.map((r) => (
            <OptionChip
              key={r.id}
              option={{ id: r.id, label: r.label, tone: "cyan" }}
              selected={gamingRole === r.id}
              onPress={setGamingRole}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "business_industry") {
      return (
        <>
          <Text style={styles.sectionHint}>Select the primary industry this EAGOH specializes in. This is used for filtering, Marketplace searches, and industry-specific intelligence.</Text>
          {BUSINESS_INDUSTRIES.map((ind) => (
            <OptionChip
              key={ind.id}
              option={{ id: ind.id, label: ind.label, tone: "gold" }}
              selected={businessIndustry === ind.id}
              onPress={setBusinessIndustry}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "business_role") {
      return (
        <>
          <Text style={styles.sectionHint}>Choose the role or perspective this EAGOH embodies in business. This shapes its analysis style and marketplace discoverability.</Text>
          {BUSINESS_ROLES.map((r) => (
            <OptionChip
              key={r.id}
              option={{ id: r.id, label: r.label, tone: "gold" }}
              selected={businessRole === r.id}
              onPress={setBusinessRole}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "finance_focus") {
      return (
        <>
          <Text style={styles.sectionHint}>Select the primary financial focus this EAGOH specializes in. This is used for filtering, Marketplace searches, and finance-specific intelligence.</Text>
          {FINANCE_FOCUSES.map((focus) => (
            <OptionChip
              key={focus.id}
              option={{ id: focus.id, label: focus.label, tone: "success" }}
              selected={financeFocus === focus.id}
              onPress={setFinanceFocus}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "finance_role") {
      return (
        <>
          <Text style={styles.sectionHint}>Choose the role or perspective this EAGOH embodies in finance. This shapes its analysis style and marketplace discoverability.</Text>
          {FINANCE_ROLES.map((r) => (
            <OptionChip
              key={r.id}
              option={{ id: r.id, label: r.label, tone: "success" }}
              selected={financeRole === r.id}
              onPress={setFinanceRole}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "technology_area") {
      return (
        <>
          <Text style={styles.sectionHint}>Select the primary technology area this EAGOH specializes in. This is used for filtering, Marketplace searches, and technology-specific intelligence.</Text>
          {TECHNOLOGY_AREAS.map((area) => (
            <OptionChip
              key={area.id}
              option={{ id: area.id, label: area.label, tone: "cyan" }}
              selected={technologyArea === area.id}
              onPress={setTechnologyArea}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "technology_role") {
      return (
        <>
          <Text style={styles.sectionHint}>Choose the role or perspective this EAGOH embodies in technology. This shapes its analysis style and marketplace discoverability.</Text>
          {TECHNOLOGY_ROLES.map((r) => (
            <OptionChip
              key={r.id}
              option={{ id: r.id, label: r.label, tone: "cyan" }}
              selected={technologyRole === r.id}
              onPress={setTechnologyRole}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "health_fitness_area") {
      return (
        <>
          <Text style={styles.sectionHint}>Select the primary fitness area this EAGOH specializes in. This is used for filtering, Marketplace searches, and fitness-specific intelligence.</Text>
          {HEALTH_FITNESS_AREAS.map((area) => (
            <OptionChip
              key={area.id}
              option={{ id: area.id, label: area.label, tone: "ember" }}
              selected={healthFitnessArea === area.id}
              onPress={setHealthFitnessArea}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "health_fitness_role") {
      return (
        <>
          <Text style={styles.sectionHint}>Choose the role or perspective this EAGOH embodies in health and fitness. This shapes its analysis style and marketplace discoverability.</Text>
          {HEALTH_FITNESS_ROLES.map((r) => (
            <OptionChip
              key={r.id}
              option={{ id: r.id, label: r.label, tone: "ember" }}
              selected={healthFitnessRole === r.id}
              onPress={setHealthFitnessRole}
            />
          ))}
        </>
      );
    }

    if (currentStep.id === "teams") {
      const sportCanonical = getSportCanonical(sport);
      const hasTeams = sportCanonical !== undefined;
      const focusModes: { id: TeamFocusMode; label: string; detail: string; tone: OptionTone }[] = [
        { id: "none", label: "No Team Focus", detail: "Generalist — no specific team allegiance.", tone: "success" },
        { id: "pro_only", label: "Pro Team Only", detail: "Focus on one professional team.", tone: "cyan" },
        { id: "college_only", label: "College Team Only", detail: "Focus on one college program.", tone: "gold" },
        { id: "pro_college", label: "Pro + College Team", detail: "One pro and one college team.", tone: "violet" },
      ];

      const showProSlot = teamFocusMode === "pro_only" || teamFocusMode === "pro_college";
      const showCollegeSlot = teamFocusMode === "college_only" || teamFocusMode === "pro_college";

      if (!hasTeams) {
        return (
          <>
            <Text style={styles.sectionHint}>No teams available for this sport yet.</Text>
          </>
        );
      }

      const selectedProTeam = proTeamFocusId ? getTeamById(proTeamFocusId) : undefined;
      const selectedColTeam = collegeTeamFocusId ? getTeamById(collegeTeamFocusId) : undefined;

      return (
        <>
          <Text style={styles.sectionHint}>Select your team focus. Team names are factual references only. Color families may inspire the visual chassis.</Text>

          {/* Team Focus Mode */}
          <Text style={styles.subsectionLabel}>TEAM FOCUS MODE</Text>
          {focusModes.map((opt) => (
            <OptionChip
              key={opt.id}
              option={opt}
              selected={teamFocusMode === opt.id}
              onPress={(id: string) => handleTeamFocusModeChange(id as TeamFocusMode)}
            />
          ))}

          {/* Pro Team slot */}
          {showProSlot ? (
            <View style={styles.teamSlotSection}>
              {selectedProTeam ? (
                <View style={styles.selectedTeamCard}>
                  <View style={styles.selectedTeamLeft}>
                    <View style={[styles.teamLevelBadge, { backgroundColor: `${palette.cyan}18`, borderColor: `${palette.cyan}40` }]}>
                      <Text style={[styles.teamLevelBadgeText, { color: palette.cyan }]}>PRO</Text>
                    </View>
                    <Text style={styles.selectedTeamName}>{selectedProTeam.display_name}</Text>
                    <Text style={styles.selectedTeamLeague}>{selectedProTeam.league}</Text>
                  </View>
                  <Pressable
                    onPress={() => handleProTeamToggle(proTeamFocusId)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.removeTeamBtn, pressed && styles.pressed]}
                  >
                    <X color={palette.muted} size={14} />
                  </Pressable>
                </View>
              ) : (
                <TeamSelector
                  selectedIds={proTeamFocusId ? [proTeamFocusId] : []}
                  onToggle={handleProTeamToggle}
                  mode="single"
                  sportFilter={sport}
                  levelFilter="Pro"
                  label="PRO TEAM FOCUS"
                  placeholder={`Search ${sportCanonical} pro teams…`}
                  maxSuggestions={12}
                />
              )}
            </View>
          ) : null}

          {/* College Team slot */}
          {showCollegeSlot ? (
            <View style={styles.teamSlotSection}>
              {selectedColTeam ? (
                <View style={styles.selectedTeamCard}>
                  <View style={styles.selectedTeamLeft}>
                    <View style={[styles.teamLevelBadge, { backgroundColor: `${palette.gold}18`, borderColor: `${palette.gold}40` }]}>
                      <Text style={[styles.teamLevelBadgeText, { color: palette.gold }]}>COLLEGE</Text>
                    </View>
                    <Text style={styles.selectedTeamName}>{selectedColTeam.display_name}</Text>
                    <Text style={styles.selectedTeamLeague}>{selectedColTeam.league}</Text>
                  </View>
                  <Pressable
                    onPress={() => handleCollegeTeamToggle(collegeTeamFocusId)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.removeTeamBtn, pressed && styles.pressed]}
                  >
                    <X color={palette.muted} size={14} />
                  </Pressable>
                </View>
              ) : (
                <TeamSelector
                  selectedIds={collegeTeamFocusId ? [collegeTeamFocusId] : []}
                  onToggle={handleCollegeTeamToggle}
                  mode="single"
                  sportFilter={sport}
                  levelFilter="College"
                  label="COLLEGE TEAM FOCUS"
                  placeholder={`Search ${sportCanonical} college teams…`}
                  maxSuggestions={12}
                />
              )}
            </View>
          ) : null}

          {teamFocusMode === "none" ? (
            <Text style={styles.generalistLabel}>[{sport.charAt(0).toUpperCase() + sport.slice(1)} Generalist]</Text>
          ) : null}
        </>
      );
    }

    return (
      <>
        <Text style={styles.sectionHint}>Select the forge lab environment for image generation.</Text>
        {labs.map((opt) => <OptionChip key={opt.id} option={opt} selected={lab === opt.id} onPress={setLab} />)}
      </>
    );
  }, [
    appearance,
    bodyType,
    currentStep.id,
    cyberneticIntensity,
    dna,
    domain,
    gender,
    goNext,
    handleInputFocus,
    lab,
    name,
    pose,
    registerInputRef,
    renderTextInput,
    setAppearanceField,
    sport,
    styleNotes,
    teams,
    toggleDna,
    toggleTeams,
    musicGenre,
    musicRole,
    setMusicGenre,
    setMusicRole,
    filmTvCategory,
    filmTvGenre,
    filmTvRole,
    setFilmTvCategory,
    setFilmTvGenre,
    setFilmTvRole,
    educationSubject,
    educationRole,
    setEducationSubject,
    setEducationRole,
    gamingGenre,
    gamingRole,
    setGamingGenre,
    setGamingRole,
    businessIndustry,
    businessRole,
    setBusinessIndustry,
    setBusinessRole,
    financeFocus,
    financeRole,
    setFinanceFocus,
    setFinanceRole,
    technologyArea,
    technologyRole,
    setTechnologyArea,
    setTechnologyRole,
    healthFitnessArea,
    healthFitnessRole,
    setHealthFitnessArea,
    setHealthFitnessRole,
  ]);

  const previewHeight = Math.min(windowHeight * 0.27, 248);

  // ══════════════════════════════════════════════════════════════════
  //  LAYOUT
  //
  //  Everything scrolls together inside KeyboardAvoidingView so the
  //  preview, info strip, stepper, and wizard steps all move up when
  //  the soft keyboard appears. Only the bottom CTA bar and overlays
  //  remain fixed.
  // ══════════════════════════════════════════════════════════════════

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {/* ── Hero banner (matching Sessions) ──────────────────── */}
          <View style={{ paddingHorizontal: 2, paddingTop: 2 }}>
            <EagohHeroBanner
              mode="forge"
              domainId={domain}
              domainTone={INTELLIGENCE_DOMAINS.find((d) => d.id === domain)?.tone ?? "cyan"}
              imageUrl={isEditing ? editingEagoh?.image_url ?? editingEagoh?.image_thumb_url ?? null : null}
              domainLabel={domainLabel}
              topRightBadge={{
                text: `${currentStepIndex + 1}/${wizardSteps.length}`,
                color: palette.cyan,
                backgroundColor: "rgba(108,230,255,0.10)",
                borderColor: "rgba(108,230,255,0.25)",
                dotColor: undefined,
              }}
              bottomLabel={isEditing ? "REFORGING" : "FORGING"}
              bottomName={name || "New EAGOH"}
              changeBtnText={isEditing ? (editingEagoh?.name ?? "Change") : "Select EAGOH"}
              onPress={(): void => setShowPicker(true)}
              isFree={currentTier === "free"}
              isEditing={isEditing}
            />
          </View>

          {/* ── Stepper bar ─────────────────────────────────────── */}
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

          {/* ── Wizard card ─────────────────────────────────────── */}
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

          {isEditing ? (
            <View style={styles.reforgeCostCard}>
              <View style={styles.reforgeCostRow}>
                <Text style={styles.reforgeCostLabel}>Detected Changes</Text>
                <Text style={styles.reforgeCostValue}>{reforgeCost.changedSections.length}</Text>
              </View>
              {reforgeCost.changedSections.length > 0 ? (
                <>
                  <View style={styles.reforgeDivider} />
                  <View style={styles.reforgeCostRow}>
                    <Text style={styles.reforgeCostLabel}>Reforge Cost</Text>
                    <View style={styles.reforgeCostValueRow}>
                      <Zap color={palette.gold} size={14} />
                      <Text style={styles.reforgeCostValueGold}>{reforgeCost.edgeCost} Edge</Text>
                    </View>
                  </View>
                </>
              ) : (
                <Text style={styles.reforgeNoChanges}>No modifications detected. No Edge charged.</Text>
              )}
            </View>
          ) : (
            <View style={styles.costPreview}>
              <Zap color={palette.gold} size={16} />
              <Text style={styles.costPreviewLabel}>{isLastStep ? "Forge Cost" : "Final Forge Cost"}</Text>
              <Text style={styles.costPreviewValue}>{forgeCost} Edge</Text>
            </View>
          )}

          {/* Bottom padding so content ends comfortably above the CTA */}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Fixed bottom CTA bar ──────────────────────────────────── */}
      <View style={styles.ctaContainer}>
        <LinearGradient colors={["rgba(2,4,10,0.0)", "rgba(2,4,10,0.92)", palette.void]} style={styles.ctaFade} pointerEvents="none" />
        <View style={styles.ctaRow}>
          <Pressable onPress={goBack} disabled={currentStepIndex === 0 || isGenerating} style={({ pressed }) => [styles.backButton, (currentStepIndex === 0 || isGenerating) && styles.disabledButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Pressable
            onPress={handlePrimaryAction}
            disabled={isGenerating || (!canCreate && !isEditing)}
            style={({ pressed }) => [styles.ctaButton, ((!canCreate && !isEditing) || isGenerating) && styles.disabledButton, pressed && styles.pressed]}
          >
            <LinearGradient colors={[palette.cyan, "rgba(61,165,255,0.85)"]} style={StyleSheet.absoluteFill} />
            {isGenerating ? (
              <ActivityIndicator color={palette.void} />
            ) : (
              <>
                <Sparkles color={palette.void} size={18} />
                <Text style={styles.ctaButtonText}>{!canCreate && !isEditing ? `Tier limit (${maxEagohs} max)` : isLastStep ? (isEditing ? "REVIEW & REFORGE" : "REVIEW & CONFIRM") : "NEXT"}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── Confirmation overlay (sits above everything) ──────────── */}
      {pending ? (
        <ConfirmationSheet
          pending={pending}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onGetEdge={handleGetEdge}
          isGenerating={isGenerating}
          canAfford={edgeTotal >= pending.edgeCost}
        />
      ) : null}

      {/* --- EAGOH Picker Overlay --- */}
      {showPicker ? (
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={(): void => setShowPicker(false)} />
          <View style={styles.pickerSheet}>
            <LinearGradient colors={["rgba(14,24,37,0.98)", "rgba(8,15,26,0.98)"]} style={StyleSheet.absoluteFill} />
            <Text style={styles.pickerTitle}>Select EAGOH to Edit</Text>
            {eagohs.length === 0 ? (
              <Text style={styles.pickerEmpty}>No EAGOHs forged yet. Create your first one below.</Text>
            ) : (
              <>
                {/* Create New option */}
                <Pressable
                  onPress={(): void => {
                    setSelectedEagohId("");
                    setName("");
                    setGender("neutral");
                    setDomain("sports");
                    setBodyType("average");
                    setStyleNotes("");
                    setDna([]);
                    setTeams([]);
                    setTeamFocusMode("none");
                    setProTeamFocusId("");
                    setProTeamFocusName("");
                    setCollegeTeamFocusId("");
                    setCollegeTeamFocusName("");
                    setMusicGenre("");
                    setMusicRole("");
                    setFilmTvCategory("");
                    setFilmTvGenre("");
                    setFilmTvRole("");
                    setFashionStyleCategory("");
                    setFashionRole("");
                    setEducationSubject("");
                    setEducationRole("");
                    setBusinessIndustry("");
                    setBusinessRole("");
                    setFinanceFocus("");
                    setFinanceRole("");
                    setTechnologyArea("");
                    setTechnologyRole("");
                    setHealthFitnessArea("");
                    setHealthFitnessRole("");
                    setAppearance({});
                    setCyberneticIntensity("moderate");
                    setPose("calm-sentinel");
                    setLab("neon-vault");
                    setCurrentStepIndex(0);
                    setForgeError(null);
                    hasLoadedRef.current = null;
                    setShowPicker(false);
                  }}
                  style={({ pressed }) => [styles.pickerItem, !isEditing && styles.pickerItemActive, pressed && styles.pressed]}
                >
                  <View style={[styles.pickerDot, { backgroundColor: palette.cyan }]} />
                  <View style={styles.pickerItemInfo}>
                    <Text style={styles.pickerItemName}>Create New EAGOH</Text>
                    <Text style={styles.pickerItemDomain}>Start from scratch</Text>
                  </View>
                  {!isEditing ? <Check color={palette.cyan} size={16} /> : null}
                </Pressable>
                {/* Existing EAGOHs */}
                {eagohs.map((eagoh: EagohRecord) => {
                  const domainObj = INTELLIGENCE_DOMAINS.find((d) => d.id === eagoh.domain);
                  const dt = domainObj ? toneColor(domainObj.tone) : palette.muted;
                  const isSelected = selectedEagohId === eagoh.id;
                  const handleDelete = (): void => {
                    Alert.alert(
                      "Delete EAGOH",
                      `Permanently delete "${eagoh.name || "Unnamed"}"? This action cannot be undone.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => {
                            deleteEagoh(eagoh.id).catch((err) => console.warn("[forge] deleteEagoh failed", err));
                          },
                        },
                      ],
                    );
                  };
                  return (
                    <View key={eagoh.id} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Pressable
                        onPress={(): void => {
                          setSelectedEagohId(eagoh.id);
                          setShowPicker(false);
                        }}
                        style={({ pressed }) => [
                          styles.pickerItem,
                          { flex: 1, marginBottom: 0 },
                          isSelected && styles.pickerItemActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.pickerDot, { backgroundColor: dt }]} />
                        <View style={styles.pickerItemInfo}>
                          <Text style={styles.pickerItemName}>{eagoh.name || "Unnamed"}</Text>
                          <Text style={styles.pickerItemDomain}>{domainObj?.label ?? eagoh.domain ?? "No domain"}</Text>
                        </View>
                        {isSelected ? <Check color={palette.cyan} size={16} /> : null}
                      </Pressable>
                      <Pressable
                        onPress={handleDelete}
                        disabled={isDeleting}
                        style={({ pressed }) => [
                          styles.deleteEagohBtn,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Trash2 color={palette.ember} size={14} />
                      </Pressable>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        </View>
      ) : null}

      {/* --- Rename Confirmation Modal --- */}
      {showRenameModal ? (
        <View style={styles.confirmOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={(): void => { setShowRenameModal(false); setRenameError(null); }} />
          <View style={styles.confirmCard}>
            <LinearGradient colors={["rgba(16,27,42,0.98)", "rgba(8,15,26,0.98)"]} style={StyleSheet.absoluteFill} />
            <Text style={styles.confirmHeader}>RENAME EAGOH</Text>
            {renameError ? (
              <View style={styles.renameErrorCard}>
                <AlertTriangle color={palette.ember} size={16} />
                <Text style={styles.renameErrorText}>{renameError}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.renameMessage}>
                  Renaming an EAGOH costs {RENAME_EDGE_COST} Edge and can only be performed once every 30 days. Marketplace listings, rankings, and faction records will automatically update.
                </Text>
                <TextInput
                  value={renameNameInput}
                  onChangeText={setRenameNameInput}
                  placeholder="New EAGOH name…"
                  placeholderTextColor={palette.muted}
                  style={styles.input}
                  returnKeyType="done"
                />
              </>
            )}
            <View style={styles.confirmActions}>
              <Pressable
                onPress={(): void => { setShowRenameModal(false); setRenameError(null); }}
                style={({ pressed }) => [styles.confirmCancel, pressed && styles.pressed]}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              {!renameError ? (
                <Pressable
                  onPress={async (): Promise<void> => {
                    if (!renameNameInput.trim() || !selectedEagohId) return;
                    setIsRenaming(true);
                    try {
                      await spend(RENAME_EDGE_COST, "rename_eagoh", `Rename EAGOH to ${renameNameInput.trim()}`);
                      const result = await renameEagohName(selectedEagohId, renameNameInput.trim(), currentTier, editingEagoh?.last_name_change);
                      if (!result.ok) {
                        setRenameError(result.message);
                      } else {
                        setName(renameNameInput.trim());
                        setShowRenameModal(false);
                        setRenameError(null);
                        // Refresh EAGOH data
                        hasLoadedRef.current = null;
                      }
                    } catch (err: unknown) {
                      setRenameError(err instanceof Error ? err.message : "Rename failed.");
                    } finally {
                      setIsRenaming(false);
                    }
                  }}
                  disabled={!renameNameInput.trim() || isRenaming}
                  style={({ pressed }) => [styles.confirmForge, (!renameNameInput.trim() || isRenaming) && styles.disabledButton, pressed && styles.pressed]}
                >
                  {isRenaming ? <ActivityIndicator color={palette.void} /> : <Text style={styles.confirmForgeText}>Confirm Rename</Text>}
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.void },
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
  eagohGlow: { position: "absolute", width: 140, height: 140, borderRadius: 70, opacity: 0.35 },
  eagohImage: { width: "76%", height: "76%", zIndex: 2 },

  // ── Custom rendered EAGOH figure ─────────────────────────────────
  eagohFigure: { alignItems: "center", justifyContent: "flex-end" },

  // Glass dome (head)
  glassDome: {
    width: 80,
    height: 88,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 2,
  },
  glassDomeInner: {
    width: 62,
    height: 66,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  domeHighlight: {
    position: "absolute",
    top: 4,
    left: 6,
    width: 28,
    height: 12,
    borderRadius: 3,
    transform: [{ rotate: "-15deg" }],
  },
  brainCore: {
    width: 46,
    height: 48,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sulcus: { position: "absolute", height: 2, borderRadius: 1, opacity: 0.5 },
  sulcus1: { top: 12, left: 6, width: 20, transform: [{ rotate: "8deg" }] },
  sulcus2: { top: 24, left: 10, width: 26, transform: [{ rotate: "-5deg" }] },
  sulcus3: { top: 36, left: 6, width: 16, transform: [{ rotate: "12deg" }] },
  brainCenter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  brainPulse: { width: 6, height: 6, borderRadius: 3, opacity: 0.8 },
  crack: { position: "absolute", top: 8, left: 8, width: 20, height: 1.5, transform: [{ rotate: "-28deg" }] },
  crack2: { position: "absolute", bottom: 12, right: 8, width: 16, height: 1.5, transform: [{ rotate: "15deg" }] },

  // Neck
  neckConnector: {
    width: 16,
    height: 8,
    borderRadius: 3,
    borderWidth: 1,
    marginBottom: -1,
  },

  // Body
  bodyFrame: {
    width: 130,
    height: 110,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  shoulderLeft: {
    position: "absolute",
    top: 8,
    left: -22,
    width: 24,
    height: 52,
    borderRadius: 5,
  },
  shoulderRight: {
    position: "absolute",
    top: 8,
    right: -22,
    width: 24,
    height: 52,
    borderRadius: 5,
  },
  torsoCore: {
    width: 78,
    height: 72,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  chestLine: { position: "absolute", width: 2, borderRadius: 1 },
  chestLineCenter: { top: 8, height: 48, left: 37 },
  chestLineLeft: { top: 16, left: 18, height: 28 },
  chestLineRight: { top: 16, right: 18, height: 28 },
  reactor: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  reactorGlow: { width: 6, height: 6, borderRadius: 3, opacity: 0.7 },

  // Legs
  legLeft: {
    position: "absolute",
    bottom: -24,
    left: 32,
    width: 20,
    height: 36,
    borderRadius: 5,
  },
  legRight: {
    position: "absolute",
    bottom: -24,
    right: 32,
    width: 20,
    height: 36,
    borderRadius: 5,
  },

  // Wires
  exposedWire: { position: "absolute", bottom: 22, left: 12, width: 12, height: 1.5, transform: [{ rotate: "35deg" }] },
  exposedWire2: { position: "absolute", top: 32, right: 8, width: 10, height: 1.5, transform: [{ rotate: "-20deg" }] },
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

  // ── EAGOH select button (bottom-left of preview) ────────────────
  eagohSelectBtn: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: 1,
    borderColor: "rgba(108,230,255,0.25)",
    zIndex: 5,
  },
  eagohSelectBtnEditing: { borderColor: "rgba(255,181,71,0.35)", backgroundColor: "rgba(20,14,2,0.75)" },
  eagohSelectBtnText: { color: palette.cyan, fontSize: 10, fontWeight: "800", maxWidth: 100 },

  // ── Editing badge on preview ────────────────────────────────────
  editingBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "rgba(255,181,71,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,181,71,0.30)",
  },
  editingBadgeText: { color: palette.gold, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },

  // ── Editing chip in info strip ──────────────────────────────────
  editingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: "rgba(255,181,71,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,181,71,0.25)",
  },
  editingChipText: { color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
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

  // ── Unified scrollable content (preview + info + stepper + wizard) ─
  scrollContent: { paddingBottom: 24, gap: 0 },
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
  permanenceNote: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 5, backgroundColor: "rgba(255,184,77,0.12)", borderWidth: 1, borderColor: "rgba(255,184,77,0.30)", marginBottom: 4 },
  permanenceIcon: { color: palette.gold, fontSize: 16, fontWeight: "900" },
  permanenceText: { color: palette.gold, fontSize: 10, fontWeight: "800", flex: 1 },
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

  // ── Fixed bottom CTA ────────────────────────────────────────────
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
  bottomSpacer: { height: 24 },

  // ── Confirmation overlay ─────────────────────────────────────────
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
  getEdgeBtn: {
    alignSelf: "flex-start" as const,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.gold,
    backgroundColor: "rgba(255,181,71,0.12)",
  },
  getEdgeBtnText: { color: palette.gold, fontSize: 13, fontWeight: "800" as const },
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

  // ── EAGOH Picker overlay ────────────────────────────────────────
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,4,10,0.88)",
    justifyContent: "flex-end",
    zIndex: 90,
  },
  pickerSheet: {
    maxHeight: "60%",
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(54,245,255,0.20)",
    overflow: "hidden",
    padding: 16,
    gap: 5,
  },
  pickerTitle: { color: palette.text, fontSize: 16, fontWeight: "900", marginBottom: 6, letterSpacing: 0.5 },
  pickerEmpty: { color: palette.muted, fontSize: 12, fontWeight: "700", textAlign: "center", paddingVertical: 16 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginBottom: 2,
  },
  pickerItemActive: { borderColor: palette.cyan, backgroundColor: "rgba(108,230,255,0.08)" },
  pickerDot: { width: 8, height: 8, borderRadius: 4 },
  pickerItemInfo: { flex: 1 },
  pickerItemName: { color: palette.text, fontSize: 12, fontWeight: "800" },
  pickerItemDomain: { color: palette.muted, fontSize: 10, marginTop: 1 },

  // ── Rename button on name step ──────────────────────────────────
  renameButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,181,71,0.30)",
    backgroundColor: "rgba(255,181,71,0.08)",
  },
  renameButtonText: { color: palette.gold, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },

  // ── Rename modal ────────────────────────────────────────────────
  renameErrorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 5,
    backgroundColor: "rgba(234,88,12,0.12)",
    borderWidth: 1,
    borderColor: "rgba(234,88,12,0.30)",
  },
  renameErrorText: { color: palette.ember, fontSize: 11, fontWeight: "700", flex: 1 },
  renameMessage: { color: palette.muted, fontSize: 12, fontWeight: "700", lineHeight: 18 },

  // ── Team Focus UI ────────────────────────────────────────────────
  subsectionLabel: { color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginTop: 6, marginBottom: 2 },
  teamSlotSection: { marginTop: 6, gap: 4 },
  selectedTeamCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 46,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: `${palette.cyan}30`,
    backgroundColor: `${palette.cyan}08`,
    gap: 8,
  },
  selectedTeamLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  teamLevelBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
  },
  teamLevelBadgeText: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  selectedTeamName: { color: palette.text, fontSize: 13, fontWeight: "800", flex: 1 },
  selectedTeamLeague: { color: palette.muted, fontSize: 9, fontWeight: "600" },
  removeTeamBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  generalistLabel: { color: palette.success, fontSize: 11, fontWeight: "800", textAlign: "center", marginTop: 8, fontStyle: "italic" },

  // ── Dynamic reforge cost card ────────────────────────────────────
  reforgeCostCard: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,181,71,0.22)",
    backgroundColor: "rgba(255,181,71,0.06)",
    padding: 12,
    gap: 8,
  },
  reforgeCostRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reforgeDivider: { height: 1, backgroundColor: "rgba(255,181,71,0.14)" },
  reforgeCostLabel: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  reforgeCostValue: { color: palette.text, fontSize: 14, fontWeight: "900" },
  reforgeCostValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  reforgeCostValueGold: { color: palette.gold, fontSize: 16, fontWeight: "900" },
  reforgeNoChanges: { color: palette.success, fontSize: 11, fontWeight: "700", textAlign: "center" },

  // ── Delete EAGOH button in picker ───────────────────────────────
  deleteEagohBtn: {
    width: 36,
    height: 46,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(234,88,12,0.18)",
    backgroundColor: "rgba(234,88,12,0.06)",
    marginBottom: 2,
  },
});
