/**
 * Shared EAGOH hero banner — matches the Sessions page hero card layout exactly.
 *
 * Used by both Sessions (SelectedEagohCard) and Forge (preview area replacement).
 * The "mode" prop controls which labels and badges are shown; the visual structure
 * (image, gradient, shadow, border, typography) is identical for both.
 */

import { palette } from "@/constants/colors";
import { INTELLIGENCE_DOMAINS } from "@/services/domains";
import type { EagohRecord } from "@/services/eagohs";
import {
  BrainCircuit,
  ChevronDown,
  Sparkles,
} from "lucide-react-native";
import React from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type BannerMode = "sessions" | "forge";

type TopBadgeConfig = {
  text: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  dotColor?: string;
};

interface EagohHeroBannerProps {
  /** Visual + data context */
  mode: BannerMode;

  /** Domain info */
  domainId?: string | null;
  domainTone: string;

  /** Image */
  imageUrl?: string | null;

  /** Top-left domain tag text (e.g. "SPORTS") */
  domainLabel: string;

  /** Top-right badge */
  topRightBadge?: TopBadgeConfig;

  /** Bottom-left label (e.g. "ACTIVE EAGOH", "FORGING") */
  bottomLabel: string;

  /** Bottom-left name text */
  bottomName: string;

  /** Bottom-right button text */
  changeBtnText: string;

  /** Press handler */
  onPress: () => void;

  /** Is the tier free? */
  isFree?: boolean;

  /** Editing badge (Forge mode) */
  isEditing?: boolean;
}

function toneHex(tone: string): string {
  if (tone === "gold") return palette.gold;
  if (tone === "violet") return palette.violet;
  if (tone === "ember") return palette.ember;
  if (tone === "success") return palette.success;
  return palette.cyan;
}

const EagohHeroBanner = React.memo(function EagohHeroBanner({
  mode,
  domainId,
  domainTone,
  imageUrl,
  domainLabel,
  topRightBadge,
  bottomLabel,
  bottomName,
  changeBtnText,
  onPress,
  isFree = false,
  isEditing = false,
}: EagohHeroBannerProps): JSX.Element {
  const accent = isFree ? "#6B7280" : toneHex(domainTone);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { shadowColor: accent, borderColor: `${accent}55` },
        pressed && styles.pressed,
      ]}
    >
      {/* Featured image area */}
      <View style={styles.imageWrap}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.placeholder}>
            <BrainCircuit
              color={mode === "forge" && !isFree ? accent : palette.muted}
              size={64}
            />
          </View>
        )}

        {/* Atmospheric gradient overlay */}
        <LinearGradient
          colors={[`${accent}22`, "transparent", "rgba(5,9,16,0.96)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Top badges row */}
        <View style={styles.topRow}>
          {/* Domain tag (left) */}
          <View
            style={[
              styles.domainTag,
              { borderColor: `${accent}55`, backgroundColor: `${accent}1F` },
            ]}
          >
            <Text
              style={[styles.domainText, { color: accent }]}
              numberOfLines={1}
            >
              {domainLabel.toUpperCase()}
            </Text>
          </View>

          {/* Top-right badge */}
          {topRightBadge ? (
            <View
              style={[
                styles.statusBadge,
                {
                  borderColor: topRightBadge.borderColor,
                  backgroundColor: topRightBadge.backgroundColor,
                },
              ]}
            >
              {topRightBadge.dotColor ? (
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: topRightBadge.dotColor,
                      shadowColor: topRightBadge.dotColor,
                    },
                  ]}
                />
              ) : null}
              <Text
                style={[styles.statusText, { color: topRightBadge.color }]}
              >
                {topRightBadge.text}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Editing badge (Forge mode only, top-left) */}
        {mode === "forge" && isEditing ? (
          <View style={styles.editingBadge}>
            <Sparkles color={palette.gold} size={10} />
            <Text style={styles.editingBadgeText}>EDITING</Text>
          </View>
        ) : null}

        {/* Bottom row */}
        <View style={styles.bottom}>
          <View style={styles.nameWrap}>
            <Text style={styles.label}>{bottomLabel}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {bottomName}
            </Text>
          </View>
          <View
            style={[
              styles.changeBtn,
              {
                borderColor: `${accent}55`,
                backgroundColor: `${accent}22`,
              },
            ]}
          >
            <Text style={[styles.changeText, { color: accent }]}>
              {changeBtnText}
            </Text>
            <ChevronDown color={accent} size={13} />
          </View>
        </View>
      </View>
    </Pressable>
  );
});

export default EagohHeroBanner;

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  imageWrap: {
    height: 260,
    width: "100%",
    backgroundColor: "rgba(8,16,30,0.92)",
    justifyContent: "space-between",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  domainTag: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    maxWidth: "60%",
  },
  domainText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  statusText: { fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  bottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  nameWrap: { flex: 1 },
  label: {
    color: palette.cyan,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 3,
  },
  name: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
  },
  changeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
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
  editingBadgeText: {
    color: palette.gold,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.88 },
});
