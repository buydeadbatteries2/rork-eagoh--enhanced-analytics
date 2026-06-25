/**
 * Canonical team selector for Sports-domain EAGOHs.
 *
 * Replaces free-form text input with a searchable autocomplete that
 * enforces canonical team IDs. Used in the Forge wizard (multi-select)
 * and Faction creation (single-select).
 *
 * No logos, league marks, or official artwork. Color families are
 * provided as inspired palette hints only.
 */

import { palette } from "@/constants/colors";
import { searchTeams, getTeamById, type TeamData } from "@/data/teams";
import { Search, X, Check, AlertTriangle, MapPin } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from "react-native";

// ── Props ──────────────────────────────────────────────────────────────

type TeamSelectorProps = {
  /** Currently selected canonical team IDs. */
  selectedIds: string[];
  /** Called when a team is toggled (selected/deselected). */
  onToggle: (id: string) => void;
  /** "multi" for Forge (many teams), "single" for Factions (one focus). */
  mode?: "multi" | "single";
  /** Placeholder text for the search input. */
  placeholder?: string;
  /** Maximum number of suggestions to show. */
  maxSuggestions?: number;
};

// ── Helpers ────────────────────────────────────────────────────────────

function leagueBadgeColor(league: string): string {
  switch (league) {
    case "NFL": return palette.ember;
    case "NBA": return palette.cyan;
    case "MLB": return palette.success;
    case "NHL": return palette.violet;
    case "WNBA": return palette.gold;
    case "NCAAF": return "#FF6B35";
    case "NCAAB": return "#FF8C42";
    default: return palette.muted;
  }
}

// ── Component ──────────────────────────────────────────────────────────

export default function TeamSelector({
  selectedIds,
  onToggle,
  mode = "multi",
  placeholder = "Search teams…",
  maxSuggestions = 18,
}: TeamSelectorProps): JSX.Element {
  const [query, setQuery] = useState<string>("");
  const [focused, setFocused] = useState<boolean>(false);

  const results = useMemo<TeamData[]>(() => {
    if (!query.trim()) return [];
    return searchTeams(query).slice(0, maxSuggestions);
  }, [query, maxSuggestions]);

  const handleToggle = useCallback(
    (id: string): void => {
      if (mode === "single") {
        // Single-select: replace entirely (or deselect if already selected)
        if (selectedIds.includes(id)) {
          onToggle(id); // deselect
        } else {
          // Deselect current, then select new
          if (selectedIds.length > 0) {
            onToggle(selectedIds[0]!);
          }
          onToggle(id);
        }
      } else {
        onToggle(id);
      }
    },
    [mode, onToggle, selectedIds],
  );

  const handleClearQuery = useCallback((): void => {
    setQuery("");
  }, []);

  const selectedTeams = useMemo<TeamData[]>(() => {
    return selectedIds
      .map((id) => getTeamById(id))
      .filter((t): t is TeamData => !!t);
  }, [selectedIds]);

  const showDropdown = focused && query.trim().length > 0;

  const renderTeamItem = useCallback(
    ({ item }: ListRenderItemInfo<TeamData>): JSX.Element => {
      const isSelected = selectedIds.includes(item.id);
      const badge = leagueBadgeColor(item.league);

      return (
        <Pressable
          onPress={() => handleToggle(item.id)}
          style={({ pressed }) => [
            styles.suggestionRow,
            isSelected && styles.suggestionRowSelected,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.suggestionLeft}>
            <View style={[styles.leagueBadge, { backgroundColor: `${badge}20`, borderColor: `${badge}50` }]}>
              <Text style={[styles.leagueBadgeText, { color: badge }]}>{item.league}</Text>
            </View>
            <View style={styles.suggestionCopy}>
              <Text style={styles.suggestionName} numberOfLines={1}>
                {item.display_name}
              </Text>
              <View style={styles.suggestionMeta}>
                <MapPin color={palette.muted} size={8} />
                <Text style={styles.suggestionLocation} numberOfLines={1}>
                  {item.city}, {item.state}
                </Text>
                <Text style={styles.suggestionLevel}>{item.level}</Text>
              </View>
            </View>
          </View>
          {isSelected && mode === "multi" ? (
            <View style={styles.selectedDot}>
              <Check color={palette.void} size={10} />
            </View>
          ) : isSelected && mode === "single" ? (
            <Check color={palette.cyan} size={16} />
          ) : null}
        </Pressable>
      );
    },
    [handleToggle, selectedIds, mode],
  );

  return (
    <View style={styles.container}>
      {/* ── Search input ────────────────────────────────────────── */}
      <View style={[styles.searchBar, focused && styles.searchBarFocused]}>
        <Search color={palette.muted} size={14} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={handleClearQuery} hitSlop={6} style={styles.clearBtn}>
            <X color={palette.muted} size={12} />
          </Pressable>
        ) : null}
      </View>

      {/* ── Selected chips (multi mode) ─────────────────────────── */}
      {mode === "multi" && selectedTeams.length > 0 ? (
        <View style={styles.chipRow}>
          {selectedTeams.map((team) => (
            <Pressable
              key={team.id}
              onPress={() => handleToggle(team.id)}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: `${leagueBadgeColor(team.league)}50`, backgroundColor: `${leagueBadgeColor(team.league)}14` },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.chipText} numberOfLines={1}>{team.display_name}</Text>
              <X color={palette.muted} size={10} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── "No Team Focus" option (single mode) ────────────────── */}
      {mode === "single" ? (
        <Pressable
          onPress={() => {
            if (selectedIds.length > 0) {
              onToggle(selectedIds[0]!);
            }
          }}
          style={({ pressed }) => [
            styles.noTeamBtn,
            selectedIds.length === 0 && styles.noTeamBtnActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.noTeamText, selectedIds.length === 0 && styles.noTeamTextActive]}>
            No Team Focus
          </Text>
          {selectedIds.length === 0 ? <Check color={palette.success} size={14} /> : null}
        </Pressable>
      ) : null}

      {/* ── Suggestions dropdown ────────────────────────────────── */}
      {showDropdown ? (
        <View style={styles.dropdown}>
          {results.length > 0 ? (
            <FlatList
              data={results}
              renderItem={renderTeamItem}
              keyExtractor={(item) => item.id}
              style={styles.suggestionList}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            />
          ) : (
            <View style={styles.notFound}>
              <AlertTriangle color={palette.muted} size={14} />
              <Text style={styles.notFoundText}>
                Team not found yet. Request this team to be added.
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: 6 },

  // Search bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    backgroundColor: "rgba(3,6,11,0.35)",
    paddingHorizontal: 8,
    minHeight: 44,
    gap: 6,
  },
  searchBarFocused: {
    borderColor: `${palette.cyan}66`,
    backgroundColor: "rgba(3,6,11,0.50)",
  },
  searchIcon: { marginLeft: 2 },
  searchInput: {
    flex: 1,
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
    paddingVertical: 10,
  },
  clearBtn: { padding: 4 },

  // Selected chips (multi)
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  chipText: { color: palette.text, fontSize: 10, fontWeight: "700", maxWidth: 130 },

  // No Team Focus (single)
  noTeamBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  noTeamBtnActive: {
    borderColor: `${palette.success}50`,
    backgroundColor: `${palette.success}10`,
  },
  noTeamText: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  noTeamTextActive: { color: palette.success },

  // Dropdown
  dropdown: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: `${palette.cyan}22`,
    backgroundColor: "rgba(3,8,16,0.95)",
    overflow: "hidden",
    maxHeight: 280,
  },
  suggestionList: { maxHeight: 280 },

  // Suggestion row
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
    gap: 8,
  },
  suggestionRowSelected: {
    backgroundColor: `${palette.cyan}0A`,
  },
  suggestionLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  leagueBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 40,
    alignItems: "center",
  },
  leagueBadgeText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  suggestionCopy: { flex: 1 },
  suggestionName: { color: palette.text, fontSize: 12, fontWeight: "800" },
  suggestionMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  suggestionLocation: { color: palette.muted, fontSize: 9, fontWeight: "600" },
  suggestionLevel: { color: palette.muted, fontSize: 9, fontWeight: "600", opacity: 0.6 },
  selectedDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.cyan,
    alignItems: "center",
    justifyContent: "center",
  },

  // Not found
  notFound: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  notFoundText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    flex: 1,
  },

  // Misc
  pressed: { opacity: 0.7 },
});
