/**
 * EagohShareCard — a polished vertical social-sharing card rendered at
 * 1080×1350 aspect ratio (4:5). Designed to be captured via react-native-view-shot
 * and shared as a PNG image through the native share sheet.
 *
 * The card visibly contains the public EAGOH URL, verification code, and QR code
 * so that verification information survives even when platforms (e.g. Facebook)
 * strip accompanying caption text.
 */

import { palette } from "@/constants/colors";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BadgeCheck, QrCode as QrCodeIcon, Sparkles, Trophy } from "lucide-react-native";
import React, { memo, useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export type ShareCardData = {
  eagohName: string;
  eagohImageUrl: string | null;
  specialty: string;
  creatorName: string;
  currentBadgeName: string | null;
  publicEagohUrl: string;
  verificationCode: string;
  qrCodeUrl: string;
};

/**
 * Card aspect ratio 1080:1350 = 4:5.
 * The card is rendered at a scale that fits the screen width; capture uses
 * PixelRatio to produce a full-resolution 1080×1350 PNG.
 */
export const CARD_ASPECT = 1080 / 1350;

const EagohShareCard = memo(function EagohShareCard({
  data,
  onImagesLoaded,
}: {
  data: ShareCardData;
  /** Called once both the EAGOH image and QR code have finished loading. */
  onImagesLoaded?: () => void;
}): JSX.Element {
  const [eagohLoaded, setEagohLoaded] = useState(!data.eagohImageUrl);
  const [qrLoaded, setQrLoaded] = useState(false);

  const handleEagohLoad = useCallback(() => {
    setEagohLoaded(true);
  }, []);

  const handleQrLoad = useCallback(() => {
    setQrLoaded(true);
  }, []);

  // Fire onImagesLoaded once both images have loaded.
  React.useEffect(() => {
    if (eagohLoaded && qrLoaded && onImagesLoaded) {
      onImagesLoaded();
    }
  }, [eagohLoaded, qrLoaded, onImagesLoaded]);

  const s = useStyles();

  return (
    <View style={s.card}>
      <LinearGradient
        colors={["#03060B", "#07111F", "#0A1426"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative top glow */}
      <View style={s.topGlow} />

      {/* EAGOH Image — top portion (≈55% of card height) */}
      <View style={s.imageSection}>
        {data.eagohImageUrl ? (
          <Image
            source={{ uri: data.eagohImageUrl }}
            style={s.eagohImage}
            contentFit="cover"
            transition={0}
            onLoad={handleEagohLoad}
          />
        ) : (
          <View style={[s.eagohImage, s.eagohPlaceholder]} onLayout={handleEagohLoad}>
            <Sparkles color={palette.cyan} size={48} />
          </View>
        )}
        <LinearGradient
          colors={["rgba(3,6,11,0)", "rgba(3,6,11,0.85)"]}
          style={s.imageGradient}
        />
      </View>

      {/* Content section */}
      <View style={s.contentSection}>
        {/* EAGOH name + specialty */}
        <Text style={s.eagohName} numberOfLines={1}>{data.eagohName}</Text>
        <Text style={s.specialty} numberOfLines={1}>{data.specialty}</Text>

        {/* Creator + badge row */}
        <View style={s.metaRow}>
          <View style={s.creatorChip}>
            <Text style={s.creatorLabel}>Creator</Text>
            <Text style={s.creatorName} numberOfLines={1}>{data.creatorName}</Text>
          </View>
          {data.currentBadgeName ? (
            <View style={s.badgeChip}>
              <Trophy color={palette.violet} size={13} />
              <Text style={s.badgeText} numberOfLines={1}>{data.currentBadgeName}</Text>
            </View>
          ) : null}
        </View>

        {/* Verification code — large, prominent */}
        <View style={s.codeSection}>
          <Text style={s.codeLabel}>VERIFICATION CODE</Text>
          <Text style={s.codeText}>{data.verificationCode}</Text>
        </View>

        {/* QR code + URL row */}
        <View style={s.qrRow}>
          <View style={s.qrBox}>
            <Image
              source={{ uri: data.qrCodeUrl }}
              style={s.qrImage}
              contentFit="contain"
              transition={0}
              onLoad={handleQrLoad}
            />
          </View>
          <View style={s.urlSection}>
            <View style={s.urlHeader}>
              <QrCodeIcon color={palette.cyan} size={14} />
              <Text style={s.urlHeaderText}>Scan to view EAGOH</Text>
            </View>
            <Text style={s.urlText} numberOfLines={2}>{data.publicEagohUrl}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.footerLeft}>
            <BadgeCheck color={palette.cyan} size={16} />
            <Text style={s.footerBrand}>EAGOH</Text>
          </View>
          <Text style={s.footerTagline}>Powered by Human Experience + AI</Text>
        </View>
      </View>
    </View>
  );
});

export default EagohShareCard;

// ── Styles ───────────────────────────────────────────────────────────────
// The card uses fixed dimensions so the captured PNG has a consistent
// 1080×1350 layout. On screen it is scaled down via a wrapper transform.
// We use "logical" points here; captureRef with width/height in options
// scales up to physical pixels via PixelRatio.

function useStyles() {
  return React.useMemo(() => StyleSheet.create({
    card: {
      width: 360,
      height: 360 / CARD_ASPECT, // 450
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: "#03060B",
      borderWidth: 1,
      borderColor: "rgba(108,230,255,0.25)",
    },
    topGlow: {
      position: "absolute",
      top: -40,
      left: -40,
      width: 200,
      height: 200,
      borderRadius: 100,
      backgroundColor: "rgba(108,230,255,0.12)",
      blurRadius: 40,
    },
    imageSection: {
      width: "100%",
      height: 248, // ≈55% of 450
      position: "relative",
    },
    eagohImage: {
      width: "100%",
      height: "100%",
      backgroundColor: "#07111F",
    },
    eagohPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
    },
    imageGradient: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 60,
    },
    contentSection: {
      flex: 1,
      paddingHorizontal: 18,
      paddingVertical: 14,
      gap: 8,
    },
    eagohName: {
      color: palette.text,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.3,
    },
    specialty: {
      color: palette.cyan,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 2,
    },
    creatorChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 5,
      backgroundColor: "rgba(61,165,255,0.12)",
      borderWidth: 1,
      borderColor: "rgba(61,165,255,0.3)",
    },
    creatorLabel: {
      color: palette.muted,
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    creatorName: {
      color: palette.blue,
      fontSize: 10,
      fontWeight: "800",
      maxWidth: 120,
    },
    badgeChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 5,
      backgroundColor: "rgba(138,92,255,0.14)",
      borderWidth: 1,
      borderColor: "rgba(138,92,255,0.35)",
    },
    badgeText: {
      color: palette.violet,
      fontSize: 9,
      fontWeight: "800",
      maxWidth: 90,
    },
    codeSection: {
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      backgroundColor: "rgba(3,6,11,0.6)",
      borderWidth: 1,
      borderColor: "rgba(108,230,255,0.3)",
      marginTop: 4,
    },
    codeLabel: {
      color: palette.muted,
      fontSize: 8,
      fontWeight: "800",
      letterSpacing: 2,
    },
    codeText: {
      color: palette.cyan,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: 3,
      marginTop: 2,
    },
    qrRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
      marginTop: 2,
    },
    qrBox: {
      width: 64,
      height: 64,
      borderRadius: 8,
      backgroundColor: "#F4FAFF",
      padding: 4,
      alignItems: "center",
      justifyContent: "center",
    },
    qrImage: {
      width: 56,
      height: 56,
    },
    urlSection: {
      flex: 1,
      gap: 3,
    },
    urlHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    urlHeaderText: {
      color: palette.cyan,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.3,
    },
    urlText: {
      color: palette.muted,
      fontSize: 10,
      fontWeight: "600",
      lineHeight: 13,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: "rgba(120,180,255,0.12)",
    },
    footerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    footerBrand: {
      color: palette.cyan,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.5,
    },
    footerTagline: {
      color: palette.muted,
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.3,
    },
  }), []);
}
