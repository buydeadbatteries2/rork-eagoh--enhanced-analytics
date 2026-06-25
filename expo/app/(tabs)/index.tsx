import { LinearGradient } from "expo-linear-gradient";
import { useHaptics } from "@/hooks/useHaptics";
import {
  Award,
  BarChart3,
  BrainCircuit,
  Calendar,
  ChevronRight,
  Coins,
  Cpu,
  Eye,
  FlaskConical,
  Gauge,
  Hexagon,
  Megaphone,
  RadioTower,
  ScanLine,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Sword,
  Trophy,
  WalletCards,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { palette } from "@/constants/colors";
import { HORIZONTAL_LIST_PERFORMANCE_PROPS, LIST_PERFORMANCE_PROPS, OptimizedEagohImage } from "@/app/components/PerformancePrimitives";
import { useAuth } from "@/providers/AuthProvider";
import { useEdge } from "@/providers/EdgeProvider";
import { useEagohs } from "@/providers/EagohProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { INTELLIGENCE_DOMAINS, getDomainColor } from "@/services/domains";
import {
  computeBannerCost,
  getActiveBanners,
  purchaseBanner,
  recordBannerImpression,
  recordBannerTap,
  recordBannerTapHold,
  type EnrichedBanner,
} from "@/services/sponsoredBanners";
import { canTransact } from "@/services/marketplace";
import type { EagohRecord } from "@/services/eagohs";
import { getBulkReputations, rankColor as repRankColor, rankEmoji, RANK_TIERS, type RankTier } from "@/services/reputation";
import type { ReputationRow } from "@/services/reputation";

type Phase = "loading" | "onboarding" | "auth" | "app";
type CardTone = "cyan" | "gold" | "violet" | "ember" | "success";
type HomeSection = { id: string; kind: "hero" | "sponsored" | "trending" | "feed" | "analyst" | "quickcheck" | "recent" | "favorites" | "labs" | "factions" | "leaderboards" | "domains" };
type CardProps = { title: string; subtitle: string; meta?: string; tone?: "cyan" | "gold" | "violet"; icon?: React.ReactNode };

type EagohItem = { id: string; name: string; metric: string; trend: string; accent: CardTone };
type ActivityItem = { id: string; faction: string; event: string; time: string; accent: CardTone };
type TeamItem = { id: string; team: string; status: string; heat: string; accent: CardTone };

const onboarding = [
  { kicker: "01 / TRUST", title: "Your signal enters the grid.", body: "EAGOH maps reputation, identity, and opportunity into one command layer.", icon: <Eye color={palette.cyan} size={34} /> },
  { kicker: "02 / FACTIONS", title: "Align with crews that move markets.", body: "Discover factions, ranks, missions, and shared momentum with mock intelligence.", icon: <ShieldCheck color={palette.gold} size={34} /> },
  { kicker: "03 / LABS", title: "Prototype the next advantage.", body: "Labs previews experimental tools, drops, and analysis in a safe mock-only space.", icon: <Zap color={palette.success} size={34} /> },
];

const stats = [
  { label: "Edge", value: "12,480" },
  { label: "Trust", value: "94%" },
  { label: "Signals", value: "128" },
];

const homeSections: HomeSection[] = [
  { id: "hero", kind: "hero" },
  { id: "sponsored", kind: "sponsored" },
  { id: "domains", kind: "domains" },
  { id: "leaderboards", kind: "leaderboards" },
  { id: "labs", kind: "labs" },
  { id: "trending", kind: "trending" },
  { id: "feed", kind: "feed" },
  { id: "factions", kind: "factions" },
  { id: "analyst", kind: "analyst" },
  { id: "quickcheck", kind: "quickcheck" },
  { id: "recent", kind: "recent" },
  { id: "favorites", kind: "favorites" },
];


const trendingEagohs: EagohItem[] = [
  { id: "t1", name: "Ghost Falcon", metric: "Trust 96", trend: "+18%", accent: "cyan" },
  { id: "t2", name: "Iron Pulse", metric: "Edge 8.9K", trend: "+12%", accent: "ember" },
  { id: "t3", name: "Cinder Halo", metric: "Heat 72", trend: "+31%", accent: "gold" },
];

const recentlyViewed: EagohItem[] = [
  { id: "r1", name: "Night Oracle", metric: "Viewed 2h ago", trend: "A-", accent: "violet" },
  { id: "r2", name: "Blue Talon", metric: "Viewed today", trend: "B+", accent: "cyan" },
  { id: "r3", name: "Vanta Crown", metric: "Viewed yesterday", trend: "A", accent: "success" },
];

const factionActivity: ActivityItem[] = [
  { id: "a1", faction: "Obsidian Syndicate", event: "validated 18 EAGOH trust shifts", time: "4m", accent: "cyan" },
  { id: "a2", faction: "Gold Circuit", event: "boosted sponsored discovery lanes", time: "17m", accent: "gold" },
  { id: "a3", faction: "Violet Lab", event: "opened analyst simulations", time: "31m", accent: "violet" },
];

const favoriteTeams: TeamItem[] = [
  { id: "f1", team: "Austin Fanatics", status: "3 EAGOHs surging", heat: "92", accent: "cyan" },
  { id: "f2", team: "Metro Ultras", status: "new faction thread", heat: "86", accent: "gold" },
  { id: "f3", team: "North End Loyal", status: "sentiment steady", heat: "74", accent: "success" },
];

const quickChecks = ["Trust Scan", "Fraud Pulse", "Team Fit", "Value Edge"];

function toneColor(tone: CardTone): string {
  if (tone === "gold") return palette.gold;
  if (tone === "violet") return palette.violet;
  if (tone === "ember") return palette.ember;
  if (tone === "success") return palette.success;
  return palette.cyan;
}

function LogoMark({ size = 96 }: { size?: number }): JSX.Element {
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: size / 2 }]}> 
      <LinearGradient colors={["rgba(54,245,255,0.28)", "rgba(255,184,77,0.08)"]} style={StyleSheet.absoluteFill} />
      <Hexagon color={palette.cyan} size={size * 0.54} strokeWidth={1.6} />
      <Text style={[styles.logoText, { fontSize: size * 0.18 }]}>E</Text>
    </View>
  );
}

function FuturisticCard({ title, subtitle, meta, tone = "cyan", icon }: CardProps): JSX.Element {
  const accent = toneColor(tone);
  return (
    <View style={styles.card}>
      <View style={[styles.cardGlow, { backgroundColor: accent }]} />
      <View style={styles.cardHeader}>
        <View style={[styles.iconPod, { borderColor: accent }]}>{icon ?? <Sparkles color={accent} size={18} />}</View>
        {meta ? <Text style={[styles.meta, { color: accent }]}>{meta}</Text> : null}
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </View>
  );
}

function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }): JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

const MiniImage = React.memo(function MiniImage({ accent, label }: { accent: CardTone; label: string }): JSX.Element {
  return <OptimizedEagohImage tone={accent} label={label} size="compact" />;
});

const SponsoredBanner = React.memo(function SponsoredBanner({ item, userId, reputation }: { item: EnrichedBanner; userId: string | null; reputation: ReputationRow | undefined }): JSX.Element {
  const h = useHaptics();
  const [expanded, setExpanded] = useState<boolean>(false);
  const eagohRank: RankTier = (reputation?.rank as RankTier) ?? "Dormant";
  const repScore = reputation?.reputation_score ?? 0;
  const accent = repScore > 0 ? repRankColor(eagohRank) : (item.vendor_rank === "S-TIER" ? palette.gold : item.vendor_rank === "ELITE" ? palette.cyan : palette.violet);
  const domainLabel: string = item.eagoh_domain.charAt(0).toUpperCase() + item.eagoh_domain.slice(1).replace(/_/g, " ");

  // Record impression on mount
  useEffect(() => {
    if (userId) recordBannerImpression(item.id, userId).catch(() => undefined);
  }, [item.id, userId]);

  const onPress = (): void => {
    if (userId) recordBannerTap(item.id, userId).catch(() => undefined);
  };

  const onLongPress = (): void => {
    h.medium();
    if (userId) recordBannerTapHold(item.id, userId).catch(() => undefined);
    setExpanded(true);
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressOut={() => setExpanded(false)}
      delayLongPress={280}
      style={({ pressed }) => [
        styles.sponsoredCard,
        pressed && styles.pressed,
        item.colored_border && { borderColor: accent, borderWidth: 1.5 },
        item.hot_badge && styles.sponsoredCardHot,
      ]}
    >
      <MiniImage accent={item.vendor_rank === "S-TIER" ? "gold" : item.vendor_rank === "ELITE" ? "cyan" : "violet"} label={item.eagoh_name.slice(0, 8).toUpperCase()} />
      {item.hot_badge && (
        <View style={styles.hotBadge}>
          <Text style={styles.hotBadgeText}>HOT</Text>
        </View>
      )}
      <View style={styles.sponsoredContent}>
        <View style={styles.sponsoredTopline}>
          <Text style={[styles.meta, { color: accent }]}>SPONSORED</Text>
          {repScore > 0 && (
            <View style={[styles.sponsoredRankRow, { borderColor: `${accent}33`, backgroundColor: `${accent}10` }]}>
              <Award color={accent} size={10} />
              <Text style={[styles.sponsoredRankText, { color: accent }]}>{rankEmoji(eagohRank)} {eagohRank} · {repScore}</Text>
            </View>
          )}
          <Text style={styles.score}>{item.quality_score}</Text>
        </View>
        <Text style={styles.sponsoredTitle}>{item.eagoh_name}</Text>
        <Text style={styles.sponsoredAnalytics}>{domainLabel} · Sync Score: {item.sync_score}</Text>
        <Text numberOfLines={expanded ? 3 : 1} style={styles.sponsoredDetail}>
          {expanded
            ? `Vendor: ${item.vendor_username ?? "Anonymous"} · Rank: ${eagohRank} · Quality: ${item.quality_score} · Sync: ${item.sync_score}`
            : "Hold to view full details"}
        </Text>
      </View>
    </Pressable>
  );
});

const HeroSection = React.memo(function HeroSection(): JSX.Element {
  return (
    <View style={styles.heroShell}>
      <LinearGradient colors={["rgba(54,245,255,0.20)", "rgba(124,92,255,0.12)", "rgba(255,184,77,0.08)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.heroOrbit} />
      <Text style={styles.kicker}>EAGOH HOME</Text>
      <Text style={styles.screenTitle}>Command your edge.</Text>
      <Text style={styles.heroHomeBody}>Featured banners, faction movement, sponsored discovery, and Quick Check tools are running in mock mode.</Text>
      <View style={styles.statRow}>{stats.map((stat) => <View key={stat.label} style={styles.stat}><Text style={styles.statValue}>{stat.value}</Text><Text style={styles.statLabel}>{stat.label}</Text></View>)}</View>
      <View style={styles.edgeBalance}><WalletCards color={palette.gold} size={20} /><Text style={styles.edgeText}>Edge Balance</Text><Text style={styles.edgeAmount}>12,480 EC</Text></View>
    </View>
  );
});

const SponsoredSection = React.memo(function SponsoredSection({ userId }: { userId: string | null }): JSX.Element {
  const [banners, setBanners] = useState<EnrichedBanner[]>([]);
  const [bannerRepMap, setBannerRepMap] = useState<Map<string, ReputationRow>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getActiveBanners("home")
      .then((b) => {
        setBanners(b);
        setLoading(false);
        const eagohIds = [...new Set(b.map((bb) => bb.eagoh_id))];
        if (eagohIds.length > 0) {
          getBulkReputations(eagohIds).then(setBannerRepMap).catch(() => undefined);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: EnrichedBanner }) => <SponsoredBanner item={item} userId={userId} reputation={bannerRepMap.get(item.eagoh_id)} />,
    [userId, bannerRepMap],
  );

  if (loading) {
    return (
      <View>
        <SectionHeader eyebrow="PROMOTED SIGNALS" title="Sponsored EAGOHs" action="Loading..." />
        <View style={styles.loadingRow}><ActivityIndicator color={palette.cyan} size="small" /></View>
      </View>
    );
  }

  if (banners.length === 0) {
    return (
      <View>
        <SectionHeader eyebrow="PROMOTED SIGNALS" title="Sponsored EAGOHs" action="Promote yours" />
        <View style={styles.emptyBannerCard}>
          <Megaphone color={palette.muted} size={28} />
          <Text style={styles.emptyBannerText}>No active sponsors. Purchase a banner spot to promote your EAGOH.</Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <SectionHeader eyebrow="PROMOTED SIGNALS" title="Sponsored EAGOHs" action="Hold cards" />
      <FlatList
        data={banners}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalList}
        {...HORIZONTAL_LIST_PERFORMANCE_PROPS}
      />
    </View>
  );
});

const EagohRail = React.memo(function EagohRail({ items }: { items: EagohItem[] }): JSX.Element {
  return (
    <View style={styles.tileGrid}>{items.map((item) => {
      const accent = toneColor(item.accent);
      return (
        <View key={item.id} style={styles.eagohTile}>
          <View style={[styles.tileGlow, { backgroundColor: accent }]} />
          <MiniImage accent={item.accent} label={item.trend} />
          <Text style={styles.tileTitle}>{item.name}</Text>
          <Text style={[styles.tileMetric, { color: accent }]}>{item.metric}</Text>
        </View>
      );
    })}</View>
  );
});

const ActivityFeed = React.memo(function ActivityFeed(): JSX.Element {
  return (
    <View>
      <SectionHeader eyebrow="FACTION GRID" title="Activity feed" />
      <View style={styles.feedCard}>{factionActivity.map((item) => {
        const accent = toneColor(item.accent);
        return (
          <View key={item.id} style={styles.feedRow}>
            <View style={[styles.feedDot, { backgroundColor: accent }]} />
            <View style={styles.feedTextWrap}><Text style={styles.feedFaction}>{item.faction}</Text><Text style={styles.feedEvent}>{item.event}</Text></View>
            <Text style={styles.feedTime}>{item.time}</Text>
          </View>
        );
      })}</View>
    </View>
  );
});

const AnalystAccess = React.memo(function AnalystAccess(): JSX.Element {
  return (
    <View>
      <SectionHeader eyebrow="ANALYST NODE" title="Quick analyst access" />
      <View style={styles.analystGrid}>
        <FuturisticCard title="Signal Brief" subtitle="One-tap mock analyst snapshot for EAGOH momentum." meta="LIVE" icon={<RadioTower color={palette.cyan} size={19} />} />
        <FuturisticCard title="Edge Model" subtitle="Preview projected trust, heat, and fan alignment." meta="MOCK" tone="gold" icon={<BarChart3 color={palette.gold} size={19} />} />
      </View>
    </View>
  );
});

const QuickCheckSection = React.memo(function QuickCheckSection(): JSX.Element {
  const h = useHaptics();
  return (
    <View>
      <SectionHeader eyebrow="FAST SCANS" title="Quick Check access" />
      <View style={styles.quickGrid}>{quickChecks.map((check, index) => {
        const accent = [palette.cyan, palette.gold, palette.violet, palette.success][index];
        return (
          <Pressable key={check} onPress={h.selection} style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}>
            {index % 2 === 0 ? <ScanLine color={accent} size={18} /> : <Gauge color={accent} size={18} />}
            <Text style={styles.quickText}>{check}</Text>
          </Pressable>
        );
      })}</View>
    </View>
  );
});

const LabsFeatureCard = React.memo(function LabsFeatureCard(): JSX.Element {
  return (
    <View>
      <SectionHeader eyebrow="FORGE & LABS" title="Prototype intelligence" action="Forge tab" />
      <View style={styles.featureCard}>
        <View style={[styles.featureIconWrap, { borderColor: "rgba(108,230,255,0.4)" }]}>
          <FlaskConical color={palette.cyan} size={24} />
        </View>
        <View style={styles.featureInfo}>
          <Text style={styles.featureTitle}>EAGOH Forge</Text>
          <Text style={styles.featureDesc}>Create your EAGOH with cybernetic body, glass-dome brain, and intelligence domain tuning. Forge tab.</Text>
        </View>
        <ChevronRight color={palette.cyan} size={18} />
      </View>
      <View style={[styles.featureCard, { marginTop: 8 }]}>
        <View style={[styles.featureIconWrap, { borderColor: "rgba(0,255,178,0.4)" }]}>
          <Cpu color={palette.success} size={24} />
        </View>
        <View style={styles.featureInfo}>
          <Text style={styles.featureTitle}>Open Intelligence Lab</Text>
          <Text style={styles.featureDesc}>Feed observations, classify signals, and score intelligence with edge detection tools.</Text>
        </View>
      </View>
    </View>
  );
});

const FactionsFeatureCard = React.memo(function FactionsFeatureCard(): JSX.Element {
  return (
    <View>
      <SectionHeader eyebrow="FACTIONS" title="Intelligence alliances" action="Mock" />
      <View style={styles.featureCard}>
        <View style={[styles.featureIconWrap, { borderColor: "rgba(138,92,255,0.4)" }]}>
          <Shield color={palette.violet} size={24} />
        </View>
        <View style={styles.featureInfo}>
          <Text style={styles.featureTitle}>Faction Network</Text>
          <Text style={styles.featureDesc}>Align with syndicates, pool observations, and climb the faction influence ladder.</Text>
        </View>
        <ChevronRight color={palette.violet} size={18} />
      </View>
      <View style={[styles.featureCard, { marginTop: 8 }]}>
        <View style={[styles.featureIconWrap, { borderColor: "rgba(255,181,71,0.4)" }]}>
          <Sword color={palette.gold} size={24} />
        </View>
        <View style={styles.featureInfo}>
          <Text style={styles.featureTitle}>Faction Activity</Text>
          <Text style={styles.featureDesc}>Track signal shares, reputation badges, and tactical rankings across mock syndicates.</Text>
        </View>
      </View>
    </View>
  );
});

const FavoritesSection = React.memo(function FavoritesSection(): JSX.Element {
  return (
    <View>
      <SectionHeader eyebrow="FANATIC TEAMS" title="Favorites" />
      <View style={styles.teamList}>{favoriteTeams.map((team) => {
        const accent = toneColor(team.accent);
        return (
          <View key={team.id} style={styles.teamRow}>
            <View style={[styles.teamBadge, { borderColor: accent }]}><Star color={accent} size={17} fill={accent} /></View>
            <View style={styles.feedTextWrap}><Text style={styles.feedFaction}>{team.team}</Text><Text style={styles.feedEvent}>{team.status}</Text></View>
            <Text style={[styles.teamHeat, { color: accent }]}>{team.heat}</Text>
          </View>
        );
      })}</View>
    </View>
  );
});

function LoadingScreen({ onDone }: { onDone: () => void }): JSX.Element {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1250, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1250, useNativeDriver: true }),
    ])).start();
    const timer = setTimeout(onDone, 2600);
    return () => clearTimeout(timer);
  }, [onDone, pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] });
  return (
    <LinearGradient colors={["#02040A", "#07111D", "#03060B"]} style={styles.full}>
      <Animated.View style={{ transform: [{ scale }], opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }}>
        <LogoMark />
      </Animated.View>
      <Text style={styles.brand}>EAGOH</Text>
      <Text style={styles.slogan}>Trust Your EAGOH.</Text>
      <View style={styles.loaderTrack}><Animated.View style={[styles.loaderFill, { opacity: pulse }]} /></View>
      <Text style={styles.boot}>INITIALIZING TRUST PROTOCOL</Text>
    </LinearGradient>
  );
}

function OnboardingScreen({ onComplete }: { onComplete: () => void }): JSX.Element {
  const h = useHaptics();
  const [step, setStep] = useState<number>(0);
  const item = onboarding[step];
  const isLast = step === onboarding.length - 1;
  const advance = (): void => {
    h.selection();
    if (isLast) onComplete(); else setStep((value) => value + 1);
  };
  return (
    <LinearGradient colors={["#03060B", "#0B1826", "#03060B"]} style={styles.fullPadded}>
      <View style={styles.scanLine} />
      <View style={styles.onboardingHero}>{item.icon}<Text style={styles.kicker}>{item.kicker}</Text><Text style={styles.heroTitle}>{item.title}</Text><Text style={styles.heroBody}>{item.body}</Text></View>
      <View style={styles.dots}>{onboarding.map((_, index) => <View key={index} style={[styles.dot, index === step && styles.dotActive]} />)}</View>
      <Pressable onPress={advance} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>{isLast ? "Enter EAGOH" : "Continue"}</Text><ChevronRight color={palette.void} size={20} />
      </Pressable>
    </LinearGradient>
  );
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "Invalid email or password.";
  if (m.includes("already registered") || m.includes("already exists") || m.includes("duplicate")) return "An account with that email already exists.";
  if (m.includes("email not confirmed")) return "Please confirm your email before signing in.";
  if (m.includes("password") && m.includes("6")) return "Password must be at least 6 characters.";
  if (m.includes("network") || m.includes("fetch")) return "Network error. Check your connection and try again.";
  if (m.includes("rate")) return "Too many attempts. Please wait a moment and try again.";
  return message;
}

function AuthScreen(): JSX.Element {
  const h = useHaptics();
  const { signIn, signUp, signInState, signUpState } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);

  const isPending = signInState.isPending || signUpState.isPending;
  const remoteError = (signInState.error?.message ?? signUpState.error?.message) ?? null;
  const errorText = localError ?? (remoteError ? friendlyAuthError(remoteError) : null);

  const submit = useCallback(async (): Promise<void> => {
    setLocalError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError("Email and password are required.");
      return;
    }
    const emailOk = /.+@.+\..+/.test(trimmedEmail);
    if (!emailOk) {
      setLocalError("Enter a valid email address.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setLocalError("Password must be at least 6 characters.");
      return;
    }
    h.selection();
    try {
      if (mode === "signin") {
        await signIn({ email: trimmedEmail, password });
      } else {
        await signUp({ email: trimmedEmail, password, username: username.trim() || undefined });
      }
    } catch {
      // error surfaces via mutation state
    }
  }, [email, password, username, mode, signIn, signUp]);

  const toggleMode = useCallback((): void => {
    setLocalError(null);
    setMode((m) => (m === "signin" ? "signup" : "signin"));
  }, []);

  return (
    <LinearGradient colors={["#03060B", "#111B29"]} style={styles.fullPadded}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.authFlex}>
        <LogoMark size={72} />
        <Text style={styles.authTitle}>{mode === "signin" ? "Rejoin the grid" : "Create your signal"}</Text>
        <Text style={styles.authBody}>Sign {mode === "signin" ? "in" : "up"} to access factions, labs, and your EAGOH command layer.</Text>
        {mode === "signup" ? (
          <View style={styles.inputField}>
            <Text style={styles.fieldLabel}>Alias</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="nova.eagoh"
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.inputControl}
              editable={!isPending}
            />
          </View>
        ) : null}
        <View style={styles.inputField}>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@signal.net"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            style={styles.inputControl}
            editable={!isPending}
          />
        </View>
        <View style={styles.inputField}>
          <Text style={styles.fieldLabel}>Passcode</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={palette.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={mode === "signup" ? "newPassword" : "password"}
            style={styles.inputControl}
            editable={!isPending}
          />
        </View>
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
        <Pressable
          onPress={submit}
          disabled={isPending}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, isPending && styles.primaryButtonDisabled]}
        >
          {isPending ? (
            <ActivityIndicator color={palette.void} />
          ) : (
            <Text style={styles.primaryButtonText}>{mode === "signin" ? "Sign in" : "Create account"}</Text>
          )}
        </Pressable>
        <Pressable onPress={toggleMode} disabled={isPending} style={styles.ghostButton}>
          <Text style={styles.ghostText}>{mode === "signin" ? "Need an identity? Create one" : "Already verified? Sign in"}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const LeaderboardsFeatureCard = React.memo(function LeaderboardsFeatureCard(): JSX.Element {
  const h = useHaptics();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        h.selection();
        router.push("/leaderboards" as never);
      }}
      style={({ pressed }) => [styles.featureCard, pressed && styles.pressed]}
    >
      <View style={[styles.featureIconWrap, { borderColor: "rgba(255,215,0,0.4)" }]}>
        <Trophy color={palette.gold} size={24} />
      </View>
      <View style={styles.featureInfo}>
        <Text style={styles.featureTitle}>EAGOH Leaderboards</Text>
        <Text style={styles.featureDesc}>Top-ranked EAGOHs across all domains. See who leads in reputation, marketplace, factions, and intelligence.</Text>
      </View>
      <ChevronRight color={palette.gold} size={18} />
    </Pressable>
  );
});

function HomeDomainsSection(): JSX.Element {
  const { eagohs } = useEagohs();
  if (!eagohs || eagohs.length === 0) {
    return (
      <View>
        <SectionHeader eyebrow="MY DOMAINS" title="Domain Coverage" action="Forge first" />
        <View style={styles.emptyBannerCard}>
          <BrainCircuit color={palette.muted} size={28} />
          <Text style={styles.emptyBannerText}>Forge an EAGOH to unlock domain intelligence. Each EAGOH specializes in one domain.</Text>
        </View>
      </View>
    );
  }
  const domainCounts = new Map<string, number>();
  eagohs.forEach((e) => {
    const d = e.domain ?? "unknown";
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  });
  return (
    <View>
      <SectionHeader eyebrow="MY DOMAINS" title="Domain Coverage" action={`${eagohs.length} EAGOHs`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.domainRail} {...HORIZONTAL_LIST_PERFORMANCE_PROPS}>
        {Array.from(domainCounts.entries()).map(([domainId, count]) => {
          const info = INTELLIGENCE_DOMAINS.find((d) => d.id === domainId);
          const color = info?.color ?? palette.muted;
          return (
            <View key={domainId} style={[styles.domainCard, { borderColor: `${color}44` }]}>
              <View style={[styles.domainCardGlow, { backgroundColor: `${color}18` }]} />
              <View style={[styles.domainCardDot, { backgroundColor: color }]} />
              <Text style={[styles.domainCardLabel, { color }]}>{info?.label ?? domainId}</Text>
              <Text style={styles.domainCardCount}>{count}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function HomeApp({ userId, onPromote }: { userId: string | null; onPromote: () => void }): JSX.Element {
  const h = useHaptics();
  const renderSection = useCallback(({ item }: { item: HomeSection }) => {
    if (item.kind === "hero") return <HeroSection />;
    if (item.kind === "sponsored") return <SponsoredSection userId={userId} />;
    if (item.kind === "domains") return <HomeDomainsSection />;
    if (item.kind === "leaderboards") return <View><SectionHeader eyebrow="RANKINGS" title="EAGOH Leaderboards" action="View all" /><LeaderboardsFeatureCard /></View>;
    if (item.kind === "trending") return <View><SectionHeader eyebrow="MARKET HEAT" title="Trending EAGOHs" action="Mock" /><EagohRail items={trendingEagohs} /></View>;
    if (item.kind === "feed") return <ActivityFeed />;
    if (item.kind === "labs") return <LabsFeatureCard />;
    if (item.kind === "factions") return <FactionsFeatureCard />;
    if (item.kind === "analyst") return <AnalystAccess />;
    if (item.kind === "quickcheck") return <QuickCheckSection />;
    if (item.kind === "recent") return <View><SectionHeader eyebrow="RETURN PATH" title="Recently viewed EAGOHs" /><EagohRail items={recentlyViewed} /></View>;
    return <FavoritesSection />;
  }, [userId]);
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={homeSections}
        renderItem={renderSection}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        {...LIST_PERFORMANCE_PROPS}
        ListFooterComponent={
          <Pressable onPress={onPromote} style={styles.promoteBannerButton}>
            <Megaphone color={palette.cyan} size={18} />
            <Text style={styles.promoteBannerText}>Promote Your EAGOH · From 250 EC/day</Text>
          </Pressable>
        }
      />
    </SafeAreaView>
  );
}

function BannerPurchaseModal({
  visible,
  onClose,
  onPurchased,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchased: () => void;
  userId: string | null;
}): JSX.Element {
  const h = useHaptics();
  const { eagohs } = useEagohs();
  const { profile, effectiveSubscriptionTier: tier } = useProfile();
  const [selectedEagohId, setSelectedEagohId] = useState<string>("");
  const [location, setLocation] = useState<"home" | "marketplace">("home");
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [days, setDays] = useState<number>(1);
  const [coloredBorder, setColoredBorder] = useState<boolean>(false);
  const [hotBadge, setHotBadge] = useState<boolean>(false);
  const [purchasing, setPurchasing] = useState(false);

  const myEagohs = (eagohs ?? []).filter((e: EagohRecord) => e.user_id === userId);
  const totalCost = computeBannerCost(location, days, coloredBorder, hotBadge);

  const handlePurchase = async () => {
    if (!userId || !profile || !selectedEagohId) return;
    setPurchasing(true);
    try {
      const result = await purchaseBanner(
        { userId, eagohId: selectedEagohId, location, startDate, days, coloredBorder, hotBadge },
        profile,
      );
      if (result.ok) {
        h.success();
        Alert.alert("Banner Purchased", `Your EAGOH will be promoted for ${days} day(s) starting ${startDate}.`);
        onPurchased();
        onClose();
      } else {
        Alert.alert("Purchase Failed", result.error);
      }
    } catch (err: unknown) {
      Alert.alert("Error", (err as Error).message ?? "Failed to purchase banner.");
    } finally {
      setPurchasing(false);
    }
  };

  const reset = () => {
    setSelectedEagohId("");
    setLocation("home");
    setDays(1);
    setColoredBorder(false);
    setHotBadge(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <LinearGradient colors={["#0A1628", "#050D18"]} style={StyleSheet.absoluteFill} />
          <View style={styles.modalHandle} />
          <View style={styles.modalHeaderRow}>
            <Megaphone color={palette.cyan} size={20} />
            <Text style={styles.modalTitle}>Promote Your EAGOH</Text>
            <Pressable onPress={() => { reset(); onClose(); }} style={styles.modalClose}>
              <X color={palette.muted} size={20} />
            </Pressable>
          </View>

          {/* Select EAGOH */}
          <Text style={styles.modalSectionLabel}>Select EAGOH</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
            {myEagohs.map((e: EagohRecord) => (
              <Pressable
                key={e.id}
                onPress={() => setSelectedEagohId(e.id)}
                style={[styles.chip, selectedEagohId === e.id && styles.activeChip]}
              >
                <Text style={[styles.chipText, selectedEagohId === e.id && styles.activeChipText]}>{e.name}</Text>
              </Pressable>
            ))}
            {myEagohs.length === 0 && <Text style={styles.emptyHint}>No EAGOHs. Forge one first.</Text>}
          </ScrollView>

          {/* Location */}
          <Text style={styles.modalSectionLabel}>Banner Location</Text>
          <View style={styles.locationRow}>
            <Pressable
              onPress={() => setLocation("home")}
              style={[styles.locationChip, location === "home" && styles.locationChipActive]}
            >
              <Text style={[styles.locationChipText, location === "home" && styles.locationChipTextActive]}>Home Page</Text>
              <Text style={[styles.locationPrice, location === "home" && styles.locationPriceActive]}>250 EC/day</Text>
            </Pressable>
            <Pressable
              onPress={() => setLocation("marketplace")}
              style={[styles.locationChip, location === "marketplace" && styles.locationChipActive]}
            >
              <Text style={[styles.locationChipText, location === "marketplace" && styles.locationChipTextActive]}>Marketplace</Text>
              <Text style={[styles.locationPrice, location === "marketplace" && styles.locationPriceActive]}>150 EC/day</Text>
            </Pressable>
          </View>

          {/* Start Date */}
          <Text style={styles.modalSectionLabel}>Start Date (6 AM ET)</Text>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={palette.muted}
            style={styles.dateInput}
          />

          {/* Duration */}
          <Text style={styles.modalSectionLabel}>Duration (1-5 days)</Text>
          <View style={styles.daysRow}>
            {[1, 2, 3, 4, 5].map((d) => (
              <Pressable
                key={d}
                onPress={() => setDays(d)}
                style={[styles.dayChip, days === d && styles.dayChipActive]}
              >
                <Text style={[styles.dayChipText, days === d && styles.dayChipTextActive]}>{d}</Text>
              </Pressable>
            ))}
          </View>

          {/* Premium Effects */}
          <Text style={styles.modalSectionLabel}>Premium Effects</Text>
          <View style={styles.premiumRow}>
            <Pressable
              onPress={() => setColoredBorder(!coloredBorder)}
              style={[styles.premiumChip, coloredBorder && styles.premiumChipActive]}
            >
              <Text style={[styles.premiumChipText, coloredBorder && styles.premiumChipTextActive]}>Colored Border</Text>
              <Text style={[styles.premiumChipPrice, coloredBorder && styles.premiumChipPriceActive]}>+10 EC/day</Text>
            </Pressable>
            <Pressable
              onPress={() => setHotBadge(!hotBadge)}
              style={[styles.premiumChip, hotBadge && styles.premiumChipActive]}
            >
              <Text style={[styles.premiumChipText, hotBadge && styles.premiumChipTextActive]}>Hot Badge</Text>
              <Text style={[styles.premiumChipPrice, hotBadge && styles.premiumChipPriceActive]}>+15 EC/day</Text>
            </Pressable>
          </View>

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Cost</Text>
            <View style={styles.totalValueRow}>
              <Coins color={palette.gold} size={18} />
              <Text style={styles.totalValue}>{totalCost} EC</Text>
            </View>
          </View>
          <Text style={styles.totalBreakdown}>
            {location === "home" ? "Home" : "Marketplace"} · {days} day(s){coloredBorder ? " · Border" : ""}{hotBadge ? " · Hot Badge" : ""}
          </Text>

          {/* Confirm */}
          <Pressable
            onPress={handlePurchase}
            disabled={purchasing || !selectedEagohId}
            style={({ pressed }) => [
              styles.confirmButton,
              (purchasing || !selectedEagohId) && styles.confirmButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {purchasing ? (
              <ActivityIndicator color={palette.void} size="small" />
            ) : (
              <>
                <Calendar color={palette.void} size={17} />
                <Text style={styles.confirmButtonText}>Purchase Banner</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function HomeScreen(): JSX.Element {
  const h = useHaptics();
  const { isReady, isAuthenticated, user } = useAuth();
  const { profile, effectiveSubscriptionTier } = useProfile();
  const [phase, setPhase] = useState<Phase>("loading");
  const [bootDone, setBootDone] = useState<boolean>(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean>(false);
  const [purchaseModal, setPurchaseModal] = useState(false);
  const width = Dimensions.get("window").width;
  const compact = useMemo<boolean>(() => width < 380, [width]);

  const isPaid = canTransact(effectiveSubscriptionTier);

  useEffect(() => {
    if (!bootDone || !isReady) {
      setPhase("loading");
      return;
    }
    if (isAuthenticated) {
      setPhase("app");
      return;
    }
    setPhase(onboardingDone ? "auth" : "onboarding");
  }, [bootDone, isReady, isAuthenticated, onboardingDone]);

  if (phase === "loading") return <LoadingScreen onDone={() => setBootDone(true)} />;
  if (phase === "onboarding") return <OnboardingScreen onComplete={() => setOnboardingDone(true)} />;
  if (phase === "auth") return <AuthScreen />;
  return (
    <View style={[styles.appRoot, compact && styles.compact]}>
      <HomeApp
        userId={user?.id ?? null}
        onPromote={() => {
          if (isPaid) {
            h.selection();
            setPurchaseModal(true);
          } else {
            Alert.alert("Subscription Required", "Upgrade to Pro or higher to promote your EAGOH with sponsored banners.");
          }
        }}
      />
      <BannerPurchaseModal
        visible={purchaseModal}
        onClose={() => setPurchaseModal(false)}
        onPurchased={() => {}}
        userId={user?.id ?? null}
      />
    </View>
  );
}

export { FuturisticCard };

const styles = StyleSheet.create({
  full: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.void, padding: 24 },
  fullPadded: { flex: 1, backgroundColor: palette.void, paddingHorizontal: 24, paddingTop: 74, paddingBottom: 130 },
  safe: { flex: 1, backgroundColor: palette.void },
  appRoot: { flex: 1, backgroundColor: palette.void },
  compact: {},
  scroll: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 120, gap: 18 },
  logo: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: "rgba(54,245,255,0.45)", shadowColor: palette.cyan, shadowOpacity: 0.55, shadowRadius: 28 },
  logoText: { position: "absolute", color: palette.text, fontWeight: "900", letterSpacing: 2 },
  brand: { color: palette.text, fontSize: 42, fontWeight: "900", letterSpacing: 8, marginTop: 24 },
  slogan: { color: palette.gold, fontSize: 16, letterSpacing: 1.6, marginTop: 8 },
  loaderTrack: { width: 210, height: 3, backgroundColor: "rgba(255,255,255,0.10)", marginTop: 42, overflow: "hidden", borderRadius: 5 },
  loaderFill: { width: "78%", height: 3, backgroundColor: palette.cyan, borderRadius: 5 },
  boot: { color: palette.muted, fontSize: 11, letterSpacing: 2.8, marginTop: 14 },
  scanLine: { position: "absolute", left: 24, right: 24, top: 96, height: 1, backgroundColor: "rgba(54,245,255,0.42)" },
  onboardingHero: { flex: 1, justifyContent: "center", gap: 14 },
  kicker: { color: palette.cyan, fontSize: 12, fontWeight: "800", letterSpacing: 2.2 },
  heroTitle: { color: palette.text, fontSize: 38, lineHeight: 43, fontWeight: "900", letterSpacing: -1.1 },
  heroBody: { color: palette.muted, fontSize: 16, lineHeight: 24, maxWidth: 330 },
  dots: { flexDirection: "row", gap: 8, marginBottom: 18 },
  dot: { width: 28, height: 4, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.18)" },
  dotActive: { backgroundColor: palette.cyan, width: 46 },
  primaryButton: { minHeight: 56, borderRadius: 5, backgroundColor: palette.cyan, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, shadowColor: palette.cyan, shadowOpacity: 0.35, shadowRadius: 18 },
  primaryButtonText: { color: palette.void, fontSize: 16, fontWeight: "900" },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.88 },
  authTitle: { color: palette.text, fontSize: 36, lineHeight: 40, fontWeight: "900", marginTop: 34 },
  authBody: { color: palette.muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 26 },
  authFlex: { flex: 1 },
  inputField: { borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, borderRadius: 5, padding: 14, marginBottom: 12 },
  fieldLabel: { color: palette.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase" },
  inputControl: { color: palette.text, fontSize: 16, fontWeight: "700", marginTop: 8, padding: 0 },
  errorText: { color: palette.ember, fontSize: 13, marginBottom: 10, fontWeight: "700" },
  primaryButtonDisabled: { opacity: 0.6 },
  ghostButton: { alignItems: "center", padding: 18 },
  ghostText: { color: palette.gold, fontWeight: "800" },
  screenTitle: { color: palette.text, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginBottom: 4 },
  heroShell: { borderWidth: 1, borderColor: "rgba(54,245,255,0.22)", backgroundColor: "rgba(8,15,25,0.92)", borderRadius: 5, padding: 20, overflow: "hidden", gap: 14 },
  heroOrbit: { position: "absolute", right: -70, top: -65, width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  heroHomeBody: { color: palette.muted, fontSize: 14, lineHeight: 21, maxWidth: 315 },
  statRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderWidth: 1, borderColor: palette.line, borderRadius: 5, padding: 13, backgroundColor: "rgba(16,27,42,0.72)" },
  statValue: { color: palette.text, fontSize: 20, fontWeight: "900" },
  statLabel: { color: palette.muted, fontSize: 12, marginTop: 3 },
  edgeBalance: { minHeight: 52, borderRadius: 5, paddingHorizontal: 14, backgroundColor: "rgba(255,184,77,0.10)", borderWidth: 1, borderColor: "rgba(255,184,77,0.24)", flexDirection: "row", alignItems: "center", gap: 10 },
  edgeText: { color: palette.muted, fontSize: 13, fontWeight: "700", flex: 1 },
  edgeAmount: { color: palette.gold, fontSize: 15, fontWeight: "900" },
  card: { borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, borderRadius: 5, padding: 18, overflow: "hidden" },
  cardGlow: { position: "absolute", right: -28, top: -28, width: 86, height: 86, borderRadius: 5, opacity: 0.16 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  iconPod: { width: 38, height: 38, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  meta: { fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  cardTitle: { color: palette.text, fontSize: 20, fontWeight: "900", marginBottom: 7 },
  cardSubtitle: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 },
  sectionEyebrow: { color: palette.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.9, marginBottom: 4 },
  sectionTitle: { color: palette.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
  sectionAction: { color: palette.gold, fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  horizontalList: { gap: 12, paddingRight: 18 },
  sponsoredCard: { width: 318, minHeight: 166, borderRadius: 5, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(14,24,37,0.88)", padding: 12, flexDirection: "row", gap: 12, overflow: "hidden" },
  eagohImage: { width: 104, minHeight: 128, borderRadius: 5, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  imageLabel: { position: "absolute", bottom: 12, fontSize: 10, fontWeight: "900", letterSpacing: 1.7 },
  sponsoredContent: { flex: 1, paddingVertical: 4 },
  sponsoredTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  score: { color: palette.text, fontSize: 19, fontWeight: "900" },
  sponsoredTitle: { color: palette.text, fontSize: 21, fontWeight: "900", letterSpacing: -0.4 },
  sponsoredAnalytics: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  sponsoredDetail: { color: "rgba(244,250,255,0.72)", fontSize: 12, lineHeight: 17, marginTop: 11 },
  tileGrid: { flexDirection: "row", gap: 10 },
  eagohTile: { flex: 1, borderWidth: 1, borderColor: palette.line, borderRadius: 5, padding: 10, backgroundColor: palette.panel, overflow: "hidden" },
  tileGlow: { position: "absolute", right: -20, top: -20, width: 70, height: 70, borderRadius: 5, opacity: 0.12 },
  tileTitle: { color: palette.text, fontSize: 14, fontWeight: "900", marginTop: 10 },
  tileMetric: { fontSize: 11, fontWeight: "900", marginTop: 4 },
  feedCard: { borderWidth: 1, borderColor: palette.line, borderRadius: 5, backgroundColor: palette.panel, padding: 14, gap: 14 },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  feedDot: { width: 9, height: 9, borderRadius: 5 },
  feedTextWrap: { flex: 1 },
  feedFaction: { color: palette.text, fontSize: 14, fontWeight: "900" },
  feedEvent: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  feedTime: { color: palette.gold, fontSize: 12, fontWeight: "900" },
  analystGrid: { gap: 12 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickButton: { width: "48%", minHeight: 56, borderRadius: 5, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(16,27,42,0.78)", flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 9 },
  quickText: { color: palette.text, fontSize: 13, fontWeight: "900" },
  featureCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 5, padding: 14, backgroundColor: "rgba(14,24,37,0.72)", borderWidth: 1, borderColor: palette.line },
  featureIconWrap: { width: 46, height: 46, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  featureInfo: { flex: 1 },
  featureTitle: { color: palette.text, fontSize: 14, fontWeight: "900" },
  featureDesc: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  teamList: { borderWidth: 1, borderColor: palette.line, borderRadius: 5, backgroundColor: palette.panel, padding: 12, gap: 10 },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 50 },
  teamBadge: { width: 38, height: 38, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  teamHeat: { fontSize: 16, fontWeight: "900" },
  // Sponsored banner extras
  hotBadge: { position: "absolute", top: 8, right: 8, borderRadius: 5, backgroundColor: palette.ember, paddingHorizontal: 7, paddingVertical: 3 },
  hotBadgeText: { color: palette.text, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  sponsoredCardHot: { borderColor: "rgba(255,77,109,0.45)" },
  loadingRow: { minHeight: 80, alignItems: "center", justifyContent: "center" },
  emptyBannerCard: { minHeight: 88, borderRadius: 5, borderWidth: 1, borderColor: palette.line, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  emptyBannerText: { color: palette.muted, fontSize: 13, textAlign: "center", lineHeight: 18, fontWeight: "700" },
  // Domain cards
  domainRail: { gap: 10, paddingRight: 18, paddingVertical: 4 },
  domainCard: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "rgba(10,20,35,0.55)", alignItems: "center", gap: 4, minWidth: 72, overflow: "hidden" as const },
  domainCardGlow: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  domainCardDot: { width: 8, height: 8, borderRadius: 4 },
  domainCardLabel: { fontSize: 11, fontWeight: "900" as const },
  domainCardCount: { color: palette.muted, fontSize: 20, fontWeight: "900" as const },
  promoteBannerButton: {
    marginTop: 4,
    minHeight: 48,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(108,230,255,0.28)",
    backgroundColor: "rgba(108,230,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  promoteBannerText: { color: palette.cyan, fontSize: 13, fontWeight: "900" },
  // Modal (shared pattern with marketplace)
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.72)" },
  modalSheet: {
    maxHeight: "88%",
    borderRadius: 5,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 38,
    gap: 12,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  modalHandle: { width: 42, height: 4, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center", marginBottom: 6 },
  modalHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalTitle: { color: palette.text, fontSize: 18, fontWeight: "900", flex: 1 },
  modalClose: { padding: 6 },
  modalSectionLabel: { color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase" as const, marginBottom: 2 },
  chipRail: { gap: 7, paddingRight: 12 },
  chip: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  activeChip: { backgroundColor: palette.cyan, borderColor: palette.cyan },
  chipText: { color: palette.muted, fontSize: 11, fontWeight: "900" },
  activeChipText: { color: palette.void },
  emptyHint: { color: palette.muted, fontSize: 12, fontWeight: "700", paddingVertical: 8 },
  locationRow: { flexDirection: "row", gap: 10 },
  locationChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    padding: 12,
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  locationChipActive: { backgroundColor: palette.cyanSoft, borderColor: palette.cyan },
  locationChipText: { color: palette.muted, fontSize: 13, fontWeight: "900" },
  locationChipTextActive: { color: palette.cyan },
  locationPrice: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  locationPriceActive: { color: palette.cyan },
  dateInput: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    padding: 13,
    backgroundColor: "rgba(255,255,255,0.04)",
    color: palette.text,
    fontSize: 14,
    fontWeight: "800",
  },
  daysRow: { flexDirection: "row", gap: 10 },
  dayChip: {
    width: 48,
    height: 42,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  dayChipActive: { backgroundColor: palette.cyan, borderColor: palette.cyan },
  dayChipText: { color: palette.muted, fontSize: 15, fontWeight: "900" },
  dayChipTextActive: { color: palette.void },
  premiumRow: { flexDirection: "row", gap: 10 },
  premiumChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    padding: 10,
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  premiumChipActive: { backgroundColor: palette.goldSoft, borderColor: palette.gold },
  premiumChipText: { color: palette.muted, fontSize: 12, fontWeight: "900" },
  premiumChipTextActive: { color: palette.gold },
  premiumChipPrice: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  premiumChipPriceActive: { color: palette.gold },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,181,71,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,181,71,0.22)",
  },
  totalLabel: { color: palette.muted, fontSize: 13, fontWeight: "700" },
  totalValueRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  totalValue: { color: palette.gold, fontSize: 20, fontWeight: "900" },
  totalBreakdown: { color: palette.muted, fontSize: 11, textAlign: "center" as const, marginTop: -6 },
  confirmButton: {
    minHeight: 52,
    borderRadius: 5,
    backgroundColor: palette.cyan,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: palette.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  confirmButtonDisabled: { opacity: 0.5 },
  confirmButtonText: { color: palette.void, fontSize: 15, fontWeight: "900" },
  // Modal close
  modalCloseBtn: { width: 38, height: 38, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  // Sponsored banner reputation
  sponsoredRankRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3, borderRadius: 5, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  sponsoredRankText: { fontSize: 9, fontWeight: "900" as const },
});
