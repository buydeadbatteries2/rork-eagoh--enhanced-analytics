import { palette } from "@/constants/colors";
import { LIST_PERFORMANCE_PROPS } from "@/app/components/PerformancePrimitives";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Award, ChevronRight, RadioTower, Shield } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type FactionTone = "cyan" | "gold" | "violet" | "ember" | "success";
type SectionItem =
  | { id: string; kind: "hero" }
  | { id: string; kind: "invites" }
  | { id: string; kind: "factions" }
  | { id: string; kind: "shared" }
  | { id: string; kind: "rankings" }
  | { id: string; kind: "feed" }
  | { id: string; kind: "badges" };

type Faction = {
  id: string;
  name: string;
  emblem: string;
  members: string;
  dominantSport: string;
  influenceScore: number;
  recentActivity: string;
  reputation: string;
  syncInfluence: string;
  tone: FactionTone;
};

type Invite = { id: string; faction: string; role: string; expires: string; tone: FactionTone };
type FeedItem = { id: string; faction: string; event: string; time: string; tone: FactionTone };
type IntelItem = { id: string; title: string; source: string; confidence: string; tone: FactionTone };
type Badge = { id: string; label: string; detail: string; tone: FactionTone };

const sections: SectionItem[] = [
  { id: "hero", kind: "hero" },
  { id: "invites", kind: "invites" },
  { id: "factions", kind: "factions" },
  { id: "shared", kind: "shared" },
  { id: "rankings", kind: "rankings" },
  { id: "feed", kind: "feed" },
  { id: "badges", kind: "badges" },
];

const factions: Faction[] = [
  { id: "f1", name: "Neon Guard", emblem: "NG", members: "1,284", dominantSport: "Basketball", influenceScore: 94, recentActivity: "Validated 42 rivalry pressure signals", reputation: "Elite Scout", syncInfluence: "+18%", tone: "cyan" },
  { id: "f2", name: "Aurelian Wing", emblem: "AW", members: "862", dominantSport: "Football", influenceScore: 91, recentActivity: "Boosted premium EAGOH trust lanes", reputation: "Gold Rank", syncInfluence: "+14%", tone: "gold" },
  { id: "f3", name: "Obsidian Syndicate", emblem: "OS", members: "2,117", dominantSport: "MMA", influenceScore: 88, recentActivity: "Mapped underground fight lab momentum", reputation: "Shadow Verified", syncInfluence: "+21%", tone: "violet" },
  { id: "f4", name: "Ember Cell", emblem: "EC", members: "604", dominantSport: "Soccer", influenceScore: 82, recentActivity: "Flagged emotional instability patterns", reputation: "Volatile Alpha", syncInfluence: "+11%", tone: "ember" },
];

const invites: Invite[] = [
  { id: "i1", faction: "Syndicate Command", role: "Tactical Analyst", expires: "12h", tone: "violet" },
  { id: "i2", faction: "Gold Circuit", role: "Reputation Scout", expires: "1d", tone: "gold" },
];

const sharedIntel: IntelItem[] = [
  { id: "s1", title: "Lineup chemistry disruption", source: "Neon Guard pool", confidence: "92%", tone: "cyan" },
  { id: "s2", title: "Media pressure rising", source: "Aurelian Wing desk", confidence: "87%", tone: "gold" },
  { id: "s3", title: "Defensive weakness window", source: "Obsidian Syndicate", confidence: "89%", tone: "violet" },
];

const feed: FeedItem[] = [
  { id: "a1", faction: "Neon Guard", event: "shared 8 Quick Check results with alliance members", time: "4m", tone: "cyan" },
  { id: "a2", faction: "Ember Cell", event: "earned a volatility badge for rivalry reads", time: "19m", tone: "ember" },
  { id: "a3", faction: "Aurelian Wing", event: "moved to Rank II after reputation sync", time: "46m", tone: "gold" },
];

const badges: Badge[] = [
  { id: "b1", label: "Signal Broker", detail: "Shared 50 validated observations", tone: "cyan" },
  { id: "b2", label: "Trust Architect", detail: "Reputation above 90 for 7 days", tone: "gold" },
  { id: "b3", label: "War Room Eye", detail: "Top 10 tactical reads this week", tone: "violet" },
];

function toneColor(tone: FactionTone): string {
  if (tone === "gold") return palette.gold;
  if (tone === "violet") return palette.violet;
  if (tone === "ember") return palette.ember;
  if (tone === "success") return palette.success;
  return palette.cyan;
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }): JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function FactionCard({ faction, active, onPress }: { faction: Faction; active: boolean; onPress: () => void }): JSX.Element {
  const accent = toneColor(faction.tone);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.factionCard, active && { borderColor: accent }, pressed && styles.pressed]}>
      <View style={[styles.cardGlow, { backgroundColor: accent }]} />
      <View style={styles.factionTop}>
        <View style={[styles.emblem, { borderColor: accent, backgroundColor: `${accent}18` }]}><Text style={[styles.emblemText, { color: accent }]}>{faction.emblem}</Text></View>
        <View style={styles.factionTitleWrap}>
          <Text style={styles.factionName}>{faction.name}</Text>
          <Text style={styles.factionMeta}>{faction.reputation} · {faction.dominantSport}</Text>
        </View>
        <ChevronRight color={accent} size={18} />
      </View>
      <View style={styles.metricRow}>
        <Metric label="Members" value={faction.members} />
        <Metric label="Influence" value={`${faction.influenceScore}`} />
        <Metric label="Sync" value={faction.syncInfluence} />
      </View>
      <Text style={styles.activityText}>{faction.recentActivity}</Text>
      {active ? <Text style={[styles.activeText, { color: accent }]}>ACTIVE ALLIANCE CHANNEL OPEN</Text> : null}
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

export default function FactionsScreen(): JSX.Element {
  const [activeFactionId, setActiveFactionId] = useState<string>(factions[0]?.id ?? "");
  const activeFaction = useMemo<Faction>(() => factions.find((item) => item.id === activeFactionId) ?? factions[0]!, [activeFactionId]);

  const selectFaction = useCallback((id: string): void => {
    setActiveFactionId(id);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const renderSection = useCallback(({ item }: { item: SectionItem }): JSX.Element => {
    if (item.kind === "hero") {
      return (
        <View style={styles.hero}>
          <LinearGradient colors={["rgba(54,245,255,0.22)", "rgba(124,92,255,0.13)", "rgba(255,184,77,0.08)"]} style={StyleSheet.absoluteFill} />
          <View style={styles.heroGrid} />
          <Text style={styles.kicker}>FACTION NETWORK</Text>
          <Text style={styles.title}>Replace friends with intelligence alliances.</Text>
          <Text style={styles.subtitle}>Join elite sports syndicates, pool observations, and amplify your EAGOH sync influence with mock faction reputation.</Text>
          <View style={styles.heroStats}><Metric label="Alliance" value={activeFaction.name} /><Metric label="Rank" value="Scout IV" /><Metric label="Rep" value="91%" /></View>
        </View>
      );
    }

    if (item.kind === "invites") {
      return (
        <View>
          <SectionHeader eyebrow="INVITES" title="Pending syndicate access" />
          <View style={styles.inviteRow}>
            {invites.map((invite) => {
              const accent = toneColor(invite.tone);
              return <Pressable key={invite.id} style={({ pressed }) => [styles.inviteCard, pressed && styles.pressed]}><Shield color={accent} size={20} /><Text style={styles.inviteTitle}>{invite.faction}</Text><Text style={styles.inviteRole}>{invite.role}</Text><Text style={[styles.inviteExpiry, { color: accent }]}>Expires {invite.expires}</Text></Pressable>;
            })}
          </View>
        </View>
      );
    }

    if (item.kind === "factions") {
      return (
        <View>
          <SectionHeader eyebrow="ALLIANCES" title="Faction command cards" />
          {factions.map((faction) => <FactionCard key={faction.id} faction={faction} active={faction.id === activeFactionId} onPress={() => selectFaction(faction.id)} />)}
        </View>
      );
    }

    if (item.kind === "shared") {
      return (
        <View>
          <SectionHeader eyebrow="SHARED INTELLIGENCE" title="Alliance observation pool" />
          {sharedIntel.map((intel) => <IntelRow key={intel.id} item={intel} />)}
        </View>
      );
    }

    if (item.kind === "rankings") {
      return (
        <View>
          <SectionHeader eyebrow="RANKINGS" title="Faction influence ladder" />
          {factions.slice().sort((a, b) => b.influenceScore - a.influenceScore).map((faction, index) => <View key={faction.id} style={styles.rankingRow}><Text style={styles.rankNumber}>#{index + 1}</Text><Text style={styles.rankName}>{faction.name}</Text><View style={styles.rankBar}><View style={[styles.rankFill, { width: `${faction.influenceScore}%`, backgroundColor: toneColor(faction.tone) }]} /></View><Text style={styles.rankScore}>{faction.influenceScore}</Text></View>)}
        </View>
      );
    }

    if (item.kind === "feed") {
      return (
        <View>
          <SectionHeader eyebrow="ACTIVITY" title="Faction signal feed" />
          {feed.map((event) => <ActivityRow key={event.id} item={event} />)}
        </View>
      );
    }

    return (
      <View>
        <SectionHeader eyebrow="BADGES" title="Reputation achievements" />
        <View style={styles.badgeGrid}>{badges.map((badge) => <BadgeCard key={badge.id} badge={badge} />)}</View>
      </View>
    );
  }, [activeFaction, activeFactionId, selectFaction]);

  return (
    <LinearGradient colors={["#03060B", "#07101B", "#101420"]} style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <FlatList data={sections} keyExtractor={(item) => item.id} renderItem={renderSection} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} {...LIST_PERFORMANCE_PROPS} />
      </SafeAreaView>
    </LinearGradient>
  );
}

function IntelRow({ item }: { item: IntelItem }): JSX.Element {
  const accent = toneColor(item.tone);
  return <View style={styles.intelRow}><RadioTower color={accent} size={18} /><View style={styles.rowText}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowSub}>{item.source}</Text></View><Text style={[styles.confidence, { color: accent }]}>{item.confidence}</Text></View>;
}

function ActivityRow({ item }: { item: FeedItem }): JSX.Element {
  const accent = toneColor(item.tone);
  return <View style={styles.activityRow}><View style={[styles.dot, { backgroundColor: accent }]} /><View style={styles.rowText}><Text style={styles.rowTitle}>{item.faction}</Text><Text style={styles.rowSub}>{item.event}</Text></View><Text style={styles.time}>{item.time}</Text></View>;
}

function BadgeCard({ badge }: { badge: Badge }): JSX.Element {
  const accent = toneColor(badge.tone);
  return <View style={styles.badgeCard}><Award color={accent} size={20} /><Text style={styles.badgeTitle}>{badge.label}</Text><Text style={styles.badgeDetail}>{badge.detail}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 18, paddingBottom: 120, gap: 18 },
  hero: { borderRadius: 5, overflow: "hidden", padding: 20, borderWidth: 1, borderColor: "rgba(54,245,255,0.28)", backgroundColor: palette.panel },
  heroGrid: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", transform: [{ rotate: "-8deg" }, { scale: 1.18 }] },
  kicker: { color: palette.cyan, fontSize: 12, fontWeight: "900", letterSpacing: 2.4 },
  title: { color: palette.text, fontSize: 34, fontWeight: "900", letterSpacing: -1.2, marginTop: 8, lineHeight: 38 },
  subtitle: { color: palette.muted, fontSize: 14, fontWeight: "700", lineHeight: 21, marginTop: 12 },
  heroStats: { flexDirection: "row", gap: 10, marginTop: 18 },
  sectionHeader: { marginTop: 2, marginBottom: 10 },
  eyebrow: { color: palette.gold, fontSize: 11, fontWeight: "900", letterSpacing: 2, textTransform: "uppercase" },
  sectionTitle: { color: palette.text, fontSize: 21, fontWeight: "900", marginTop: 4 },
  inviteRow: { flexDirection: "row", gap: 12 },
  inviteCard: { flex: 1, minHeight: 128, borderRadius: 5, padding: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(14,24,37,0.74)" },
  inviteTitle: { color: palette.text, fontSize: 15, fontWeight: "900", marginTop: 10 },
  inviteRole: { color: palette.muted, fontSize: 12, fontWeight: "700", marginTop: 5 },
  inviteExpiry: { fontSize: 11, fontWeight: "900", marginTop: 12, letterSpacing: 1 },
  factionCard: { marginBottom: 12, borderRadius: 5, padding: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(8,15,26,0.92)", overflow: "hidden" },
  cardGlow: { position: "absolute", right: -28, top: -32, width: 96, height: 96, borderRadius: 5, opacity: 0.18 },
  factionTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  emblem: { width: 52, height: 52, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  emblemText: { fontSize: 17, fontWeight: "900", letterSpacing: 1 },
  factionTitleWrap: { flex: 1 },
  factionName: { color: palette.text, fontSize: 19, fontWeight: "900" },
  factionMeta: { color: palette.muted, fontSize: 12, fontWeight: "800", marginTop: 3 },
  metricRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  metric: { flex: 1, borderRadius: 5, padding: 10, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  metricValue: { color: palette.text, fontSize: 15, fontWeight: "900" },
  metricLabel: { color: palette.muted, fontSize: 10, fontWeight: "800", marginTop: 3, textTransform: "uppercase" },
  activityText: { color: palette.muted, fontSize: 13, fontWeight: "700", marginTop: 12, lineHeight: 19 },
  activeText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginTop: 12 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.86 },
  intelRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 5, padding: 13, marginBottom: 9, backgroundColor: "rgba(14,24,37,0.72)", borderWidth: 1, borderColor: palette.line },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 5, padding: 13, marginBottom: 9, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: palette.line },
  rowText: { flex: 1 },
  rowTitle: { color: palette.text, fontSize: 14, fontWeight: "900" },
  rowSub: { color: palette.muted, fontSize: 12, fontWeight: "700", marginTop: 3, lineHeight: 17 },
  confidence: { fontSize: 13, fontWeight: "900" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  time: { color: palette.muted, fontSize: 12, fontWeight: "900" },
  rankingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rankNumber: { color: palette.gold, width: 30, fontSize: 13, fontWeight: "900" },
  rankName: { color: palette.text, flex: 1, fontSize: 13, fontWeight: "900" },
  rankBar: { width: 78, height: 8, borderRadius: 5, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)" },
  rankFill: { height: "100%", borderRadius: 5 },
  rankScore: { color: palette.muted, width: 28, textAlign: "right", fontSize: 12, fontWeight: "900" },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badgeCard: { width: "31.5%", minHeight: 126, borderRadius: 5, padding: 12, backgroundColor: "rgba(14,24,37,0.78)", borderWidth: 1, borderColor: palette.line },
  badgeTitle: { color: palette.text, fontSize: 12, fontWeight: "900", marginTop: 9 },
  badgeDetail: { color: palette.muted, fontSize: 10, fontWeight: "700", marginTop: 5, lineHeight: 14 },
});
