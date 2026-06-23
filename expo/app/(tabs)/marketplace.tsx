import { palette } from "@/constants/colors";
import { HORIZONTAL_LIST_PERFORMANCE_PROPS, LIST_PERFORMANCE_PROPS, OptimizedEagohImage } from "@/app/components/PerformancePrimitives";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { BarChart3, ChevronRight, Crown, Flame, Search, Shield, Signal, SlidersHorizontal, Star, Store, Timer, WalletCards } from "lucide-react-native";
import React, { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Accent = "cyan" | "gold" | "violet" | "ember" | "success";
type SyncLevel = "25%" | "50%" | "75%" | "100%";
type Listing = {
  id: string;
  name: string;
  sport: string;
  teams: string[];
  syncRating: string;
  confidence: number;
  specialization: string;
  vendor: string;
  vendorRep: string;
  rank: string;
  accent: Accent;
  influence: string;
};
type Vendor = { id: string; name: string; reputation: string; verified: string; specialty: string; volume: string; faction: string; accent: Accent };

type SectionItem = { id: string; kind: "hero" | "sponsored" | "filters" | "featured" | "sync" | "influence" | "vendors" | "profiles" };

const sections: SectionItem[] = [
  { id: "hero", kind: "hero" },
  { id: "sponsored", kind: "sponsored" },
  { id: "filters", kind: "filters" },
  { id: "featured", kind: "featured" },
  { id: "sync", kind: "sync" },
  { id: "influence", kind: "influence" },
  { id: "vendors", kind: "vendors" },
  { id: "profiles", kind: "profiles" },
];

const listings: Listing[] = [
  { id: "e1", name: "Apex Raven", sport: "Football", teams: ["Austin Fanatics", "Metro Ultras"], syncRating: "98.4", confidence: 96, specialization: "Fourth-quarter pressure reads", vendor: "Obsidian Desk", vendorRep: "A+ / 12.8K", rank: "S-TIER", accent: "cyan", influence: "+32% faction lift" },
  { id: "e2", name: "Solar Warden", sport: "Basketball", teams: ["Bay Loyal", "Gold Circuit"], syncRating: "94.1", confidence: 91, specialization: "Momentum swing detection", vendor: "Crown Signal Co.", vendorRep: "A / 8.1K", rank: "ELITE", accent: "gold", influence: "+19% vendor heat" },
  { id: "e3", name: "Night Oracle", sport: "Soccer", teams: ["North End Loyal"], syncRating: "92.7", confidence: 89, specialization: "Fan sentiment anomalies", vendor: "Violet Market", vendorRep: "A- / 6.4K", rank: "PRO", accent: "violet", influence: "+44% team chatter" },
  { id: "e4", name: "Iron Pulse", sport: "MMA", teams: ["Underground Bloc"], syncRating: "89.5", confidence: 87, specialization: "Fight camp volatility", vendor: "Redline Exchange", vendorRep: "B+ / 4.9K", rank: "RISING", accent: "ember", influence: "+27% risk demand" },
];

const vendors: Vendor[] = [
  { id: "v1", name: "Obsidian Desk", reputation: "99.1 trust", verified: "Verified analyst vault", specialty: "Football pressure models", volume: "12.8K mock syncs", faction: "Obsidian Syndicate", accent: "cyan" },
  { id: "v2", name: "Crown Signal Co.", reputation: "96.8 trust", verified: "Premium vendor lane", specialty: "Basketball trend calls", volume: "8.1K mock syncs", faction: "Gold Circuit", accent: "gold" },
  { id: "v3", name: "Violet Market", reputation: "94.6 trust", verified: "Sentiment lab certified", specialty: "Soccer fan currents", volume: "6.4K mock syncs", faction: "Violet Lab", accent: "violet" },
];

const sports: string[] = ["All", "Football", "Basketball", "Soccer", "MMA"];
const teams: string[] = ["All Teams", "Austin", "Metro", "Bay", "North", "Underground"];
const ranks: string[] = ["Any Rank", "S-TIER", "ELITE", "PRO", "RISING"];
const syncOptions: SyncLevel[] = ["25%", "50%", "75%", "100%"];

function accentColor(accent: Accent): string {
  if (accent === "gold") return palette.gold;
  if (accent === "violet") return palette.violet;
  if (accent === "ember") return palette.ember;
  if (accent === "success") return palette.success;
  return palette.cyan;
}

function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }): JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </View>
  );
}

const EagohAvatar = memo(function EagohAvatar({ accent, label }: { accent: Accent; label: string }): JSX.Element {
  return <OptimizedEagohImage tone={accent} label={label} size="banner" />;
});

function Hero(): JSX.Element {
  return (
    <View style={styles.hero}>
      <LinearGradient colors={["rgba(54,245,255,0.22)", "rgba(124,92,255,0.14)", "rgba(255,184,77,0.09)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.radarDisc} />
      <Text style={styles.kicker}>EAGOH MARKETPLACE</Text>
      <Text style={styles.title}>Intelligence exchange online.</Text>
      <Text style={styles.subtitle}>Browse premium analyst entities, inspect vendor trust, and simulate sync access with mock Edge deduction states only.</Text>
      <View style={styles.heroStats}>
        {["12,480 Edge", "426 Listings", "98% Safe Sync"].map((item) => <View key={item} style={styles.heroStat}><Signal color={palette.cyan} size={15} /><Text style={styles.heroStatText}>{item}</Text></View>)}
      </View>
    </View>
  );
}

const SponsoredCard = memo(function SponsoredCard({ item }: { item: Listing }): JSX.Element {
  const color = accentColor(item.accent);
  return (
    <View style={styles.sponsoredCard}>
      <LinearGradient colors={[`${color}30`, "rgba(14,24,37,0.88)"]} style={StyleSheet.absoluteFill} />
      <Text style={[styles.sponsoredTag, { color }]}>SPONSORED</Text>
      <Text style={styles.sponsoredTitle}>{item.name}</Text>
      <Text style={styles.sponsoredBody}>{item.specialization}</Text>
      <View style={styles.sponsoredFoot}><Flame color={color} size={15} /><Text style={styles.sponsoredMeta}>{item.influence}</Text></View>
    </View>
  );
});

const Sponsored = memo(function Sponsored(): JSX.Element {
  const sponsoredListings = useMemo<Listing[]>(() => listings.slice(0, 3), []);
  const renderSponsored = useCallback(({ item }: { item: Listing }): JSX.Element => <SponsoredCard item={item} />, []);
  return (
    <View>
      <SectionHeader eyebrow="SPONSORED SIGNALS" title="Vendor boost lanes" action="Mock ads" />
      <FlatList horizontal data={sponsoredListings} keyExtractor={(item) => item.id} renderItem={renderSponsored} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList} {...HORIZONTAL_LIST_PERFORMANCE_PROPS} />
    </View>
  );
});

function FilterPanel({ sport, setSport, team, setTeam, rank, setRank, search, setSearch }: { sport: string; setSport: (value: string) => void; team: string; setTeam: (value: string) => void; rank: string; setRank: (value: string) => void; search: string; setSearch: (value: string) => void }): JSX.Element {
  const renderChips = (items: string[], selected: string, onSelect: (value: string) => void): JSX.Element => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>{items.map((item) => <Pressable key={item} onPress={() => onSelect(item)} style={[styles.chip, selected === item && styles.activeChip]}><Text style={[styles.chipText, selected === item && styles.activeChipText]}>{item}</Text></Pressable>)}</ScrollView>
  );
  return (
    <View style={styles.filterPanel}>
      <View style={styles.searchBox}><Search color={palette.muted} size={18} /><TextInput value={search} onChangeText={setSearch} placeholder="Search EAGOH, sport, vendor" placeholderTextColor={palette.muted} style={styles.searchInput} /></View>
      <View style={styles.filterHeader}><SlidersHorizontal color={palette.gold} size={17} /><Text style={styles.filterTitle}>Tactical filters</Text></View>
      {renderChips(sports, sport, setSport)}
      {renderChips(teams, team, setTeam)}
      {renderChips(ranks, rank, setRank)}
    </View>
  );
}

const ListingCard = memo(function ListingCard({ item }: { item: Listing }): JSX.Element {
  const [sync, setSync] = useState<SyncLevel>("25%");
  const [deducted, setDeducted] = useState<boolean>(false);
  const color = accentColor(item.accent);
  const edgeCost = sync === "100%" ? 900 : sync === "75%" ? 675 : sync === "50%" ? 450 : 225;
  const onSync = (): void => {
    Haptics.selectionAsync();
    setDeducted(true);
  };
  return (
    <View style={styles.listingCard}>
      <View style={[styles.cardGlow, { backgroundColor: color }]} />
      <View style={styles.listingTop}>
        <EagohAvatar accent={item.accent} label={item.rank} />
        <View style={styles.listingInfo}>
          <View style={styles.nameRow}><Text style={styles.listingName}>{item.name}</Text><Text style={[styles.rankPill, { color, borderColor: `${color}66` }]}>{item.rank}</Text></View>
          <Text style={styles.listingSub}>{item.sport} · {item.specialization}</Text>
          <Text style={styles.teamText}>{item.teams.join("  /  ")}</Text>
          <View style={styles.metricGrid}>
            <Text style={styles.metric}>Sync {item.syncRating}</Text>
            <Text style={styles.metric}>Confidence {item.confidence}%</Text>
            <Text style={styles.metric}>Vendor {item.vendorRep}</Text>
          </View>
        </View>
      </View>
      <View style={styles.vendorStrip}><Store color={color} size={16} /><Text style={styles.vendorText}>{item.vendor}</Text><Text style={styles.vendorInfluence}>{item.influence}</Text></View>
      <View style={styles.syncRail}>{syncOptions.map((option) => <Pressable key={option} onPress={() => setSync(option)} style={[styles.syncChip, sync === option && { borderColor: color, backgroundColor: `${color}1F` }]}><Text style={[styles.syncText, sync === option && { color }]}>{option}</Text></Pressable>)}</View>
      <View style={styles.durationRow}><Timer color={palette.muted} size={15} /><Text style={styles.durationText}>Max duration: 5 days · Mock Edge cost: {edgeCost} EC</Text></View>
      <Pressable onPress={onSync} style={({ pressed }) => [styles.syncButton, { borderColor: color }, pressed && styles.pressed]}><WalletCards color={color} size={17} /><Text style={[styles.syncButtonText, { color }]}>{deducted ? `Mock deducted ${edgeCost} EC` : "Simulate sync access"}</Text><ChevronRight color={color} size={17} /></Pressable>
    </View>
  );
});

function FactionInfluence(): JSX.Element {
  return (
    <View>
      <SectionHeader eyebrow="FACTION INFLUENCE" title="Market pressure map" />
      <View style={styles.influenceGrid}>
        {["Obsidian +32", "Gold Circuit +24", "Violet Lab +18", "Redline +15"].map((item, index) => <View key={item} style={styles.influenceCell}><Shield color={index === 1 ? palette.gold : palette.cyan} size={18} /><Text style={styles.influenceText}>{item}</Text></View>)}
      </View>
    </View>
  );
}

const VendorProfile = memo(function VendorProfile({ vendor }: { vendor: Vendor }): JSX.Element {
  const color = accentColor(vendor.accent);
  return (
    <View style={styles.vendorCard}>
      <View style={[styles.vendorOrb, { backgroundColor: `${color}22`, borderColor: color }]}><Crown color={color} size={24} /></View>
      <View style={styles.vendorBody}>
        <Text style={styles.vendorName}>{vendor.name}</Text>
        <Text style={styles.vendorDetail}>{vendor.verified}</Text>
        <Text style={styles.vendorDetail}>{vendor.specialty}</Text>
        <View style={styles.vendorStats}><Text style={[styles.vendorTrust, { color }]}>{vendor.reputation}</Text><Text style={styles.vendorVolume}>{vendor.volume}</Text></View>
        <Text style={styles.vendorFaction}>{vendor.faction}</Text>
      </View>
    </View>
  );
});

export default function MarketplaceScreen(): JSX.Element {
  const [sport, setSport] = useState<string>("All");
  const [team, setTeam] = useState<string>("All Teams");
  const [rank, setRank] = useState<string>("Any Rank");
  const [search, setSearch] = useState<string>("");

  const filteredListings = useMemo<Listing[]>(() => {
    const query = search.trim().toLowerCase();
    return listings.filter((item) => {
      const matchesSport = sport === "All" || item.sport === sport;
      const matchesRank = rank === "Any Rank" || item.rank === rank;
      const matchesTeam = team === "All Teams" || item.teams.some((value) => value.toLowerCase().includes(team.toLowerCase()));
      const matchesSearch = query.length === 0 || [item.name, item.sport, item.vendor, item.specialization, ...item.teams].join(" ").toLowerCase().includes(query);
      return matchesSport && matchesRank && matchesTeam && matchesSearch;
    });
  }, [rank, search, sport, team]);

  const renderSection = useCallback(({ item }: { item: SectionItem }): JSX.Element => {
    if (item.kind === "hero") return <Hero />;
    if (item.kind === "sponsored") return <Sponsored />;
    if (item.kind === "filters") return <FilterPanel sport={sport} setSport={setSport} team={team} setTeam={setTeam} rank={rank} setRank={setRank} search={search} setSearch={setSearch} />;
    if (item.kind === "featured") return <View><SectionHeader eyebrow="FEATURED EAGOHS" title="Premium analyst listings" action={`${filteredListings.length} live mock`} /><FlatList data={filteredListings} keyExtractor={(listing) => listing.id} renderItem={({ item: listing }) => <ListingCard item={listing} />} scrollEnabled={false} {...LIST_PERFORMANCE_PROPS} /></View>;
    if (item.kind === "sync") return <View style={styles.syncInfo}><BarChart3 color={palette.cyan} size={20} /><View><Text style={styles.syncInfoTitle}>Sync listing rules</Text><Text style={styles.syncInfoBody}>Choose 25%, 50%, 75%, or 100% synchronization. All listings expire after a maximum of 5 days in this mock UI.</Text></View></View>;
    if (item.kind === "influence") return <FactionInfluence />;
    if (item.kind === "vendors") return <View><SectionHeader eyebrow="TRENDING VENDORS" title="Reputation leaders" />{vendors.map((vendor) => <VendorProfile key={vendor.id} vendor={vendor} />)}</View>;
    return <View><SectionHeader eyebrow="VENDOR PROFILE MOCKUPS" title="Detailed exchange identity" /><View style={styles.profileMock}><Star color={palette.gold} size={19} /><Text style={styles.profileMockTitle}>Vendor dossiers include verification status, trust score, specialization, faction alignment, sync volume, and reputation grade.</Text></View></View>;
  }, [filteredListings, rank, search, sport, team]);

  return (
    <LinearGradient colors={["#03060B", "#08111C", "#0B141F"]} style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <FlatList data={sections} renderItem={renderSection} keyExtractor={(item) => item.id} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} {...LIST_PERFORMANCE_PROPS} />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 18, paddingBottom: 122, gap: 20 },
  hero: { minHeight: 265, borderRadius: 5, overflow: "hidden", borderWidth: 1, borderColor: "rgba(54,245,255,0.22)", padding: 22, justifyContent: "flex-end", backgroundColor: palette.panelStrong },
  radarDisc: { position: "absolute", width: 210, height: 210, borderRadius: 105, borderWidth: 1, borderColor: "rgba(54,245,255,0.24)", right: -56, top: -48, backgroundColor: "rgba(54,245,255,0.05)" },
  kicker: { color: palette.cyan, fontSize: 12, fontWeight: "900", letterSpacing: 2.4, marginBottom: 8 },
  title: { color: palette.text, fontSize: 38, fontWeight: "900", letterSpacing: -1.2, lineHeight: 40 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 11, fontWeight: "700" },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 18 },
  heroStat: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: palette.line, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(3,6,11,0.45)" },
  heroStatText: { color: palette.text, fontSize: 12, fontWeight: "900" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  eyebrow: { color: palette.gold, fontSize: 11, fontWeight: "900", letterSpacing: 1.8 },
  sectionTitle: { color: palette.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
  action: { color: palette.cyan, fontSize: 12, fontWeight: "900" },
  horizontalList: { gap: 12, paddingRight: 18 },
  sponsoredCard: { width: 238, minHeight: 145, borderRadius: 5, overflow: "hidden", padding: 16, borderWidth: 1, borderColor: palette.line, justifyContent: "space-between" },
  sponsoredTag: { fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  sponsoredTitle: { color: palette.text, fontSize: 21, fontWeight: "900" },
  sponsoredBody: { color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  sponsoredFoot: { flexDirection: "row", alignItems: "center", gap: 6 },
  sponsoredMeta: { color: palette.text, fontSize: 12, fontWeight: "900" },
  filterPanel: { gap: 12, borderRadius: 5, padding: 14, backgroundColor: "rgba(14,24,37,0.72)", borderWidth: 1, borderColor: palette.line },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderRadius: 5, paddingHorizontal: 14, backgroundColor: "rgba(3,6,11,0.62)", borderWidth: 1, borderColor: palette.line },
  searchInput: { color: palette.text, flex: 1, fontSize: 14, fontWeight: "800" },
  filterHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterTitle: { color: palette.text, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  chipRail: { gap: 8, paddingRight: 10 },
  chip: { borderWidth: 1, borderColor: palette.line, borderRadius: 5, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  activeChip: { backgroundColor: palette.cyan, borderColor: palette.cyan },
  chipText: { color: palette.muted, fontSize: 12, fontWeight: "900" },
  activeChipText: { color: palette.void },
  listingCard: { marginBottom: 14, borderRadius: 5, padding: 14, backgroundColor: "rgba(14,24,37,0.84)", borderWidth: 1, borderColor: palette.line, overflow: "hidden" },
  cardGlow: { position: "absolute", width: 130, height: 130, borderRadius: 65, opacity: 0.12, right: -36, top: -40 },
  listingTop: { flexDirection: "row", gap: 13 },
  avatar: { width: 108, height: 142, borderRadius: 5, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: palette.line, backgroundColor: palette.void },
  avatarRing: { position: "absolute", width: 74, height: 74, borderRadius: 5, borderWidth: 1, opacity: 0.65 },
  avatarLabel: { position: "absolute", bottom: 12, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  listingInfo: { flex: 1, gap: 7 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  listingName: { color: palette.text, fontSize: 20, fontWeight: "900", flex: 1 },
  rankPill: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: "900", overflow: "hidden" },
  listingSub: { color: palette.muted, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  teamText: { color: palette.gold, fontSize: 12, fontWeight: "900" },
  metricGrid: { gap: 4 },
  metric: { color: palette.text, fontSize: 12, fontWeight: "800" },
  vendorStrip: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line },
  vendorText: { color: palette.text, fontSize: 13, fontWeight: "900", flex: 1 },
  vendorInfluence: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  syncRail: { flexDirection: "row", gap: 8, marginTop: 12 },
  syncChip: { flex: 1, borderWidth: 1, borderColor: palette.line, borderRadius: 5, paddingVertical: 9, alignItems: "center", backgroundColor: "rgba(255,255,255,0.035)" },
  syncText: { color: palette.muted, fontSize: 12, fontWeight: "900" },
  durationRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  durationText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  syncButton: { marginTop: 12, minHeight: 46, borderRadius: 5, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(3,6,11,0.42)" },
  syncButtonText: { fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  syncInfo: { flexDirection: "row", gap: 12, padding: 16, borderRadius: 5, backgroundColor: palette.cyanSoft, borderWidth: 1, borderColor: "rgba(54,245,255,0.24)" },
  syncInfoTitle: { color: palette.text, fontSize: 16, fontWeight: "900" },
  syncInfoBody: { color: palette.muted, fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 3, flexShrink: 1 },
  influenceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  influenceCell: { width: "48%", minHeight: 72, borderRadius: 5, padding: 13, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,0.045)", justifyContent: "space-between" },
  influenceText: { color: palette.text, fontSize: 13, fontWeight: "900" },
  vendorCard: { flexDirection: "row", gap: 13, marginBottom: 12, padding: 14, borderRadius: 5, backgroundColor: "rgba(14,24,37,0.76)", borderWidth: 1, borderColor: palette.line },
  vendorOrb: { width: 58, height: 58, borderRadius: 5, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  vendorBody: { flex: 1, gap: 4 },
  vendorName: { color: palette.text, fontSize: 18, fontWeight: "900" },
  vendorDetail: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  vendorStats: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 4 },
  vendorTrust: { fontSize: 12, fontWeight: "900" },
  vendorVolume: { color: palette.text, fontSize: 12, fontWeight: "900" },
  vendorFaction: { color: palette.gold, fontSize: 12, fontWeight: "900", marginTop: 3 },
  profileMock: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 5, borderWidth: 1, borderColor: "rgba(255,184,77,0.25)", backgroundColor: palette.goldSoft },
  profileMockTitle: { color: palette.text, flex: 1, fontSize: 13, fontWeight: "800", lineHeight: 19 },
});
