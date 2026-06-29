import { palette } from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useHaptics } from "@/hooks/useHaptics";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Camera,
  ChevronRight,
  Coins,
  Cpu,
  Crown,
  FileText,
  Hand,
  ImageIcon,
  Info,
  Layers3,
  Link2,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  RefreshCcw,
  Shield,
  Sliders,
  Star,
  Trash2,
  Upload,
  User,
  Vibrate,
  X,
  Zap,
} from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ProfilePreferences } from "@/services/profile";
import {
  getUserVerificationStatus,
  connectSocialAccountMock,
  disconnectSocialAccount,
  refreshSocialVerificationStatus,
  SOCIAL_PLATFORMS,
  PLATFORM_DISPLAY,
  type SocialPlatform,
  type SocialAccountRow,
  type UserVerificationStatus,
} from "@/services/socialVerification";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";

type P = typeof palette;

// ── Section types ──────────────────────────────────────────────────────────

type SectionRow =
  | { kind: "info"; label: string; value: string; icon: React.ReactNode }
  | { kind: "input"; label: string; value: string; placeholder: string; icon: React.ReactNode; onChangeText: (text: string) => void; onSave: () => void; saving: boolean }
  | { kind: "button"; label: string; variant: "primary" | "danger"; icon: React.ReactNode; onPress: () => void; loading?: boolean }
  | { kind: "toggle"; label: string; value: boolean; icon: React.ReactNode; onToggle: () => void }
  | { kind: "picker"; label: string; value: string; options: { id: string; label: string; icon: React.ReactNode }[]; icon: React.ReactNode; onSelect: (id: string) => void }
  | { kind: "link"; label: string; icon: React.ReactNode; onPress: () => void }
  | { kind: "adminOverride"; tier: string; expiresAt: string | null; note: string | null }
  | { kind: "custom"; render: () => React.ReactNode }
  | { kind: "imageUpload"; label: string; currentUrl: string | null; icon: React.ReactNode; onPress: () => void; uploading: boolean; helperText?: string; infoTitle?: string; infoBody?: string };

type SettingsSection = {
  id: string;
  title: string;
  titleIcon: React.ReactNode;
  rows: SectionRow[];
};

// ── Image Upload Row ─────────────────────────────────────────────────────

const ImageUploadRow = memo(function ImageUploadRow({
  label,
  currentUrl,
  icon,
  onPress,
  uploading,
  helperText,
  infoTitle,
  infoBody,
  s,
  pal,
}: Extract<SectionRow, { kind: "imageUpload" }> & { s: ReturnType<typeof createStyles>; pal: P }): JSX.Element {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <View style={s.row}>
        <View style={s.rowIcon}>{icon}</View>
        <View style={s.rowContent}>
          <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 6 }}>
            <Text style={s.rowLabel}>{label}</Text>
            {infoTitle || infoBody ? (
              <Pressable
                onPress={() => setShowInfo(true)}
                hitSlop={8}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
              >
                <Info color={pal.cyan} size={14} />
              </Pressable>
            ) : null}
          </View>
          {helperText ? (
            <Text style={s.rowHint}>{helperText}</Text>
          ) : null}
          <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 10, marginTop: 8 }}>
            {currentUrl ? (
              <View style={{ width: 48, height: 48, borderRadius: 5, backgroundColor: pal.graphite, overflow: "hidden" as const, borderWidth: 1, borderColor: pal.line }}>
                <ExpoImage source={{ uri: currentUrl }} style={{ width: "100%", height: "100%" }} />
              </View>
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 5, backgroundColor: pal.blueSoft, alignItems: "center" as const, justifyContent: "center" as const, borderWidth: 1, borderColor: pal.line }}>
                <Camera color={pal.muted} size={22} />
              </View>
            )}
            <Pressable
              onPress={onPress}
              disabled={uploading}
              style={({ pressed }) => [
                s.saveBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              {uploading ? (
                <ActivityIndicator color={pal.text} size="small" />
              ) : (
                <Text style={s.saveBtnText}>{currentUrl ? "Change" : "Upload"}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <Pressable
          onPress={() => setShowInfo(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{
              backgroundColor: pal.panel,
              borderRadius: 5,
              borderWidth: 1,
              borderColor: pal.line,
              padding: 18,
              maxWidth: 320,
              width: "100%" as const,
              gap: 12,
            }}>
              <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 8 }}>
                <Info color={pal.cyan} size={18} />
                <Text style={{ color: pal.text, fontSize: 15, fontWeight: "900" as const, flex: 1 }}>
                  {infoTitle ?? label}
                </Text>
                <Pressable
                  onPress={() => setShowInfo(false)}
                  hitSlop={8}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                >
                  <X color={pal.muted} size={18} />
                </Pressable>
              </View>
              {infoBody ? (
                <Text style={{ color: pal.muted, fontSize: 13, fontWeight: "600" as const, lineHeight: 20 }}>
                  {infoBody}
                </Text>
              ) : null}
              <Pressable
                onPress={() => setShowInfo(false)}
                style={({ pressed }) => [s.saveBtn, { alignSelf: "flex-end" as const }, pressed && { opacity: 0.7 }]}
              >
                <Text style={s.saveBtnText}>Got it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
});

// ── Social Verification Panel ─────────────────────────────────────────────

const SocialVerificationPanel = memo(function SocialVerificationPanel({
  pal,
}: {
  pal: P;
}): JSX.Element {
  const { user } = useAuth();
  const h = useHaptics();
  const [accounts, setAccounts] = useState<SocialAccountRow[]>([]);
  const [verification, setVerification] = useState<UserVerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [handleInput, setHandleInput] = useState("");
  const [connectPlatform, setConnectPlatform] = useState<SocialPlatform | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!user?.id) return;
    try {
      const status = await getUserVerificationStatus(user.id);
      setVerification(status);
      setAccounts(status.connectedAccounts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const handleConnect = useCallback(async (platform: SocialPlatform) => {
    setConnectPlatform(platform);
    setHandleInput("");
    setShowConnect(true);
  }, []);

  const handleSubmitConnect = useCallback(async () => {
    if (!user?.id || !connectPlatform || !handleInput.trim()) return;
    setConnecting(connectPlatform);
    try {
      await connectSocialAccountMock(user.id, connectPlatform, handleInput.trim());
      await refreshSocialVerificationStatus(user.id);
      await loadAccounts();
      h.success();
      setShowConnect(false);
      setHandleInput("");
      setConnectPlatform(null);
    } catch (err: unknown) {
      console.warn("[settings] connect social failed", err);
    } finally {
      setConnecting(null);
    }
  }, [user?.id, connectPlatform, handleInput, loadAccounts, h]);

  const handleDisconnect = useCallback(async (platform: SocialPlatform) => {
    if (!user?.id) return;
    try {
      await disconnectSocialAccount(user.id, platform);
      await loadAccounts();
      h.warning();
    } catch (err: unknown) {
      console.warn("[settings] disconnect social failed", err);
    }
  }, [user?.id, loadAccounts, h]);

  const inlineStyles = useMemo(
    () => ({
      container: { padding: 14, gap: 12 } as const,
      verifiedBanner: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        padding: 10,
        borderRadius: 5,
        backgroundColor: pal.cyanSoft,
        borderWidth: 1,
        borderColor: pal.cyan,
      },
      verifiedText: { color: pal.cyan, fontSize: 12, fontWeight: "800" as const, flex: 1 },
      platformRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 5,
        backgroundColor: "rgba(255,255,255,0.03)",
        borderWidth: 1,
        borderColor: pal.line,
      },
      platformLabel: { color: pal.text, fontSize: 13, fontWeight: "800" as const },
      platformHandle: { color: pal.muted, fontSize: 11, fontWeight: "600" as const },
      connectBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 5,
        backgroundColor: pal.blueSoft,
        borderWidth: 1,
        borderColor: pal.blue,
      },
      connectBtnText: { color: pal.blue, fontSize: 11, fontWeight: "800" as const },
      disconnectBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 5,
        backgroundColor: pal.emberSoft,
        borderWidth: 1,
        borderColor: pal.ember,
      },
      disconnectBtnText: { color: pal.ember, fontSize: 11, fontWeight: "800" as const },
      verifiedChip: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 5,
        backgroundColor: pal.cyanSoft,
        borderWidth: 1,
        borderColor: pal.cyan,
      },
      verifiedChipText: { color: pal.cyan, fontSize: 10, fontWeight: "800" as const },
      connectSheet: {
        padding: 14,
        gap: 10,
      },
      connectSheetTitle: { color: pal.text, fontSize: 15, fontWeight: "900" as const },
      textInput: {
        backgroundColor: "rgba(3,6,11,0.62)",
        borderWidth: 1,
        borderColor: pal.line,
        borderRadius: 5,
        paddingHorizontal: 12,
        paddingVertical: 9,
        color: pal.text,
        fontSize: 13,
        fontWeight: "700" as const,
      },
      helperText: {
        color: pal.muted,
        fontSize: 11,
        fontWeight: "600" as const,
        lineHeight: 16,
      },
      privacyHelper: {
        color: pal.ember,
        fontSize: 10,
        fontWeight: "700" as const,
        lineHeight: 15,
        backgroundColor: pal.emberSoft,
        padding: 8,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: `${pal.ember}30`,
      },
    }),
    [pal],
  );

  if (loading) {
    return (
      <View style={{ padding: 14, alignItems: "center" }}>
        <ActivityIndicator color={pal.cyan} size="small" />
      </View>
    );
  }

  return (
    <View style={inlineStyles.container}>
      {verification?.isVerified && (
        <View style={inlineStyles.verifiedBanner}>
          <BadgeCheck color={pal.cyan} size={18} />
          <Text style={inlineStyles.verifiedText}>
            Verified through connected social account
          </Text>
        </View>
      )}

      {!verification?.isVerified && (
        <Text style={inlineStyles.helperText}>
          Connect a social account to verify your identity and earn the verified badge.
        </Text>
      )}

      {SOCIAL_PLATFORMS.map((platform) => {
        const account = accounts.find((a) => a.platform === platform);
        const isConnected = account?.is_connected;

        return (
          <View key={platform} style={inlineStyles.platformRow}>
            <View style={{ gap: 2 }}>
              <Text style={inlineStyles.platformLabel}>{PLATFORM_DISPLAY[platform]}</Text>
              {isConnected && account?.handle ? (
                <Text style={inlineStyles.platformHandle}>@{account.handle}</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {isConnected && account?.is_platform_verified ? (
                <View style={inlineStyles.verifiedChip}>
                  <BadgeCheck color={pal.cyan} size={12} />
                  <Text style={inlineStyles.verifiedChipText}>Verified</Text>
                </View>
              ) : null}
              {isConnected ? (
                <Pressable
                  onPress={() => handleDisconnect(platform)}
                  style={({ pressed }) => [inlineStyles.disconnectBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={inlineStyles.disconnectBtnText}>Disconnect</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => handleConnect(platform)}
                  style={({ pressed }) => [inlineStyles.connectBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={inlineStyles.connectBtnText}>Connect</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}

      {/* Connect modal */}
      {showConnect && connectPlatform && (
        <View style={inlineStyles.connectSheet}>
          <Text style={inlineStyles.connectSheetTitle}>
            Connect {PLATFORM_DISPLAY[connectPlatform]}
          </Text>
          <Text style={inlineStyles.helperText}>
            Enter your {PLATFORM_DISPLAY[connectPlatform]} handle (v1: mock verification).
          </Text>
          <TextInput
            style={inlineStyles.textInput}
            value={handleInput}
            onChangeText={setHandleInput}
            placeholder={`Your ${PLATFORM_DISPLAY[connectPlatform]} handle`}
            placeholderTextColor={pal.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => { setShowConnect(false); setHandleInput(""); setConnectPlatform(null); }}
              style={({ pressed }) => [
                { flex: 1, minHeight: 40, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: pal.panel, borderWidth: 1, borderColor: pal.line },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={{ color: pal.muted, fontSize: 13, fontWeight: "800" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmitConnect}
              disabled={connecting === connectPlatform || !handleInput.trim()}
              style={({ pressed }) => [
                { flex: 1, minHeight: 40, borderRadius: 5, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: pal.cyan, opacity: handleInput.trim() ? 1 : 0.5 },
                pressed && { opacity: 0.7 },
              ]}
            >
              {connecting === connectPlatform ? (
                <ActivityIndicator color={pal.void} size="small" />
              ) : (
                <>
                  <Link2 color={pal.void} size={14} />
                  <Text style={{ color: pal.void, fontSize: 13, fontWeight: "900" }}>Connect</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <View style={inlineStyles.privacyHelper}>
        <Text style={{ color: pal.ember, fontSize: 10, fontWeight: "900" }}>
          Only public profile information is shown to other users. Email and private account details are never shown.
        </Text>
      </View>
    </View>
  );
});

// ── Styles factory (parametrised on palette so theme changes re-render) ────

function createStyles(pal: P) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: pal.void },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: pal.line,
      backgroundColor: pal.obsidian,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 5,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: pal.panel,
      borderWidth: 1,
      borderColor: pal.line,
    },
    headerTitle: {
      color: pal.text,
      fontSize: 18,
      fontWeight: "900" as const,
      flex: 1,
    },
    scroll: { flex: 1 },
    scrollContent: { padding: 18, paddingBottom: 120, gap: 14 },

    // Section
    section: {
      borderRadius: 5,
      backgroundColor: pal.panel,
      borderWidth: 1,
      borderColor: pal.line,
      overflow: "hidden" as const,
    },
    sectionHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: pal.line,
      backgroundColor: pal.cyanSoft,
    },
    sectionHeaderText: {
      color: pal.text,
      fontSize: 13,
      fontWeight: "900" as const,
      letterSpacing: 0.8,
      textTransform: "uppercase" as const,
    },
    sectionBody: { gap: 0 },

    // Row base
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: pal.line,
    },
    rowDanger: {
      backgroundColor: pal.emberSoft,
    },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 5,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: pal.blueSoft,
      borderWidth: 1,
      borderColor: pal.line,
    },
    rowContent: { flex: 1 },
    rowLabel: {
      color: pal.text,
      fontSize: 13,
      fontWeight: "800" as const,
    },
    rowValue: {
      color: pal.muted,
      fontSize: 12,
      fontWeight: "600" as const,
      marginTop: 2,
    },
    rowHint: {
      color: pal.muted,
      fontSize: 11,
      fontWeight: "600" as const,
      marginTop: 2,
    },

    // Input row
    inputRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      marginTop: 6,
    },
    textInput: {
      flex: 1,
      backgroundColor: pal.blueSoft,
      borderWidth: 1,
      borderColor: pal.line,
      borderRadius: 5,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: pal.text,
      fontSize: 13,
      fontWeight: "700" as const,
    },
    saveBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 5,
      backgroundColor: pal.cyan,
    },
    saveBtnText: {
      color: pal.void,
      fontSize: 12,
      fontWeight: "900" as const,
    },

    // Toggle
    toggleTrack: {
      width: 46,
      height: 26,
      borderRadius: 13,
      backgroundColor: pal.line,
      justifyContent: "center" as const,
      padding: 3,
    },
    toggleTrackActive: {
      backgroundColor: pal.successSoft,
    },
    toggleThumb: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: pal.muted,
    },
    toggleThumbActive: {
      backgroundColor: pal.success,
      alignSelf: "flex-end" as const,
    },

    // Picker
    pickerOptions: {
      flexDirection: "row" as const,
      gap: 8,
      marginTop: 8,
    },
    pickerChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 5,
      backgroundColor: pal.blueSoft,
      borderWidth: 1,
      borderColor: pal.line,
    },
    pickerChipActive: {
      backgroundColor: pal.cyanSoft,
      borderColor: pal.cyan,
    },
    pickerChipText: {
      color: pal.muted,
      fontSize: 12,
      fontWeight: "700" as const,
    },
    pickerChipTextActive: {
      color: pal.text,
    },

    // Admin override
    adminOverrideRow: {
      backgroundColor: pal.goldSoft,
      borderBottomColor: pal.gold,
    },
    adminOverrideHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      marginBottom: 6,
    },
    adminOverrideLabel: {
      color: pal.gold,
      fontSize: 12,
      fontWeight: "800" as const,
      letterSpacing: 0.5,
    },
    adminOverrideDetails: {
      gap: 2,
    },
    adminOverrideDetail: {
      color: pal.muted,
      fontSize: 11,
      fontWeight: "600" as const,
      lineHeight: 16,
    },
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────

const SectionHeader = memo(function SectionHeader({
  title,
  icon,
  s,
}: {
  title: string;
  icon: React.ReactNode;
  s: ReturnType<typeof createStyles>;
}): JSX.Element {
  return (
    <View style={s.sectionHeader}>
      {icon}
      <Text style={s.sectionHeaderText}>{title}</Text>
    </View>
  );
});

const InfoRow = memo(function InfoRow({ label, value, icon, s }: Extract<SectionRow, { kind: "info" }> & { s: ReturnType<typeof createStyles> }): JSX.Element {
  return (
    <View style={s.row}>
      <View style={s.rowIcon}>{icon}</View>
      <View style={s.rowContent}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowValue}>{value}</Text>
      </View>
    </View>
  );
});

const InputRow = memo(function InputRow({
  label,
  value,
  placeholder,
  icon,
  onChangeText,
  onSave,
  saving,
  s,
  pal,
}: Extract<SectionRow, { kind: "input" }> & { s: ReturnType<typeof createStyles>; pal: P }): JSX.Element {
  return (
    <View style={s.row}>
      <View style={s.rowIcon}>{icon}</View>
      <View style={s.rowContent}>
        <Text style={s.rowLabel}>{label}</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.textInput}
            value={value}
            placeholder={placeholder}
            placeholderTextColor={pal.muted}
            onChangeText={onChangeText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={({ pressed }) => [
              s.saveBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={pal.text} size="small" />
            ) : (
              <Text style={s.saveBtnText}>Save</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const ButtonRow = memo(function ButtonRow({
  label,
  variant,
  icon,
  onPress,
  loading,
  s,
  pal,
}: Extract<SectionRow, { kind: "button" }> & { s: ReturnType<typeof createStyles>; pal: P }): JSX.Element {
  const isDanger = variant === "danger";
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        s.row,
        isDanger && s.rowDanger,
        pressed && { opacity: 0.75 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isDanger ? pal.ember : pal.cyan} style={s.rowIcon} />
      ) : (
        <View style={s.rowIcon}>{icon}</View>
      )}
      <View style={s.rowContent}>
        <Text style={[s.rowLabel, isDanger && { color: pal.ember }]}>
          {label}
        </Text>
      </View>
      {loading && <ActivityIndicator color={isDanger ? pal.ember : pal.cyan} size="small" />}
    </Pressable>
  );
});

const ToggleRow = memo(function ToggleRow({
  label,
  value,
  icon,
  onToggle,
  s,
}: Extract<SectionRow, { kind: "toggle" }> & { s: ReturnType<typeof createStyles> }): JSX.Element {
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [s.row, pressed && { opacity: 0.75 }]}>
      <View style={s.rowIcon}>{icon}</View>
      <View style={s.rowContent}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowHint}>{value ? "On" : "Off"}</Text>
      </View>
      <View style={[s.toggleTrack, value && s.toggleTrackActive]}>
        <View style={[s.toggleThumb, value && s.toggleThumbActive]} />
      </View>
    </Pressable>
  );
});

const PickerRow = memo(function PickerRow({
  label,
  value,
  options,
  icon,
  onSelect,
  s,
}: Extract<SectionRow, { kind: "picker" }> & { s: ReturnType<typeof createStyles> }): JSX.Element {
  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? options[0],
    [options, value],
  );

  return (
    <View style={s.row}>
      <View style={s.rowIcon}>{icon}</View>
      <View style={s.rowContent}>
        <Text style={s.rowLabel}>{label}</Text>
        <View style={s.pickerOptions}>
          {options.map((opt) => {
            const isActive = opt.id === value;
            return (
              <Pressable
                key={opt.id}
                onPress={() => onSelect(opt.id)}
                style={({ pressed }) => [
                  s.pickerChip,
                  isActive && s.pickerChipActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                {opt.icon}
                <Text
                  style={[
                    s.pickerChipText,
                    isActive && s.pickerChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
});

const LinkRow = memo(function LinkRow({
  label,
  icon,
  onPress,
  s,
  pal,
}: Extract<SectionRow, { kind: "link" }> & { s: ReturnType<typeof createStyles>; pal: P }): JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
    >
      <View style={s.rowIcon}>{icon}</View>
      <View style={s.rowContent}>
        <Text style={s.rowLabel}>{label}</Text>
      </View>
      <ChevronRight color={pal.muted} size={16} />
    </Pressable>
  );
});

const AdminOverrideRow = memo(function AdminOverrideRow({
  tier,
  expiresAt,
  note,
  s,
  pal,
}: Extract<SectionRow, { kind: "adminOverride" }> & { s: ReturnType<typeof createStyles>; pal: P }): JSX.Element {
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1).replace("_", " ");
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString()
    : "No expiration";

  return (
    <View style={[s.row, s.adminOverrideRow]}>
      <View style={s.rowIcon}>
        <Crown color={pal.gold} size={18} />
      </View>
      <View style={s.rowContent}>
        <View style={s.adminOverrideHeader}>
          <Zap color={pal.gold} size={12} />
          <Text style={s.adminOverrideLabel}>Promotional Access Active</Text>
        </View>
        <View style={s.adminOverrideDetails}>
          <Text style={s.adminOverrideDetail}>
            Tier: <Text style={{ color: pal.gold, fontWeight: "900" }}>{tierLabel}</Text>
          </Text>
          <Text style={s.adminOverrideDetail}>Expires: {expiresLabel}</Text>
          {note ? (
            <Text style={s.adminOverrideDetail}>Note: {note}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
});

// ── Main screen ────────────────────────────────────────────────────────────

export default function SettingsScreen(): JSX.Element {
  const router = useRouter();
  const { user, signOut, signOutState, resetPassword, resetPasswordState } = useAuth();
  const {
    profile,
    effectiveSubscriptionTier,
    isAdminOverrideActive,
    updateProfile,
    setPreferences,
  } = useProfile();
  const pal = palette;
  const h = useHaptics();
  const queryClient = useQueryClient();

  // ── Themed styles ──────────────────────────────────────────────────────
  const s = useMemo(() => createStyles(pal), [pal]);

  // ── Local state ────────────────────────────────────────────────────────
  const [usernameDraft, setUsernameDraft] = useState<string>(
    profile?.username ?? "",
  );
  const [savingUsername, setSavingUsername] = useState<boolean>(false);
  const [uploadingAvatar, setUploadingAvatar] = useState<boolean>(false);
  const [uploadingBanner, setUploadingBanner] = useState<boolean>(false);

  const usernameValue = profile?.username ?? "";
  const displayUsername = usernameDraft || usernameValue;

  const email = user?.email ?? "—";
  const currentTier = effectiveSubscriptionTier;
  const baseTier = profile?.subscription_tier ?? "free";
  const hapticsEnabled = profile?.preferences?.hapticsEnabled !== false;

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSaveUsername = useCallback(async (): Promise<void> => {
    if (!usernameDraft.trim()) return;
    setSavingUsername(true);
    try {
      await updateProfile({ username: usernameDraft.trim() });
      h.success();
    } catch (err) {
      console.warn("[settings] username save failed", err);
    } finally {
      setSavingUsername(false);
    }
  }, [usernameDraft, updateProfile, h]);

  const handleResetPassword = useCallback((): void => {
    if (!user?.email) return;
    resetPassword(user.email)
      .then(() => {
        Alert.alert(
          "Password Reset Sent",
          "Check your email for a password reset link.",
        );
      })
      .catch((err: unknown) => {
        Alert.alert("Error", "Failed to send reset email. Please try again.");
        console.warn("[settings] resetPassword failed", err);
      });
  }, [user?.email, resetPassword]);

  const handleLogout = useCallback((): void => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          h.warning();
          signOut().catch((e) => console.warn("[settings] signOut failed", e));
        },
      },
    ]);
  }, [signOut, h]);

  const handleToggleHaptics = useCallback((): void => {
    const next = !hapticsEnabled;
    setPreferences({
      ...(profile?.preferences ?? {}),
      hapticsEnabled: next,
    }).catch((err: unknown) => console.warn("[settings] haptics toggle failed", err));
  }, [hapticsEnabled, profile?.preferences, setPreferences]);



  const handleClearCache = useCallback((): void => {
    Alert.alert(
      "Clear Local Cache",
      "This will clear cached app data stored on your device. Your account and EAGOH data on our servers will not be affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: () => {
            queryClient.clear();
            h.success();
            Alert.alert("Cache Cleared", "Local cache has been cleared successfully.");
          },
        },
      ],
    );
  }, [queryClient, h]);

  const handleExportData = useCallback((): void => {
    Alert.alert("Data Export", "Data export coming soon.");
  }, []);

  const handleDeleteAccount = useCallback((): void => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone. All your EAGOHs, observations, marketplace listings, and faction memberships will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Account Deletion",
              "Account deletion is coming soon. Please contact eagohsupport@ndstriistudios.com to delete your account.",
            );
          },
        },
      ],
    );
  }, []);

  const handleManageSubscription = useCallback((): void => {
    Alert.alert("Manage Subscription", "RevenueCat integration coming soon.");
  }, []);

  const navigateTo = useCallback(
    (route: string) => (): void => {
      h.selection();
      router.push(route as never);
    },
    [router, h],
  );

  const uploadProfileMedia = useCallback(async (type: "avatar" | "banner", setUploading: (v: boolean) => void): Promise<void> => {
    if (!user?.id) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Photo library access is needed to upload a profile image.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: type === "avatar" ? [1, 1] : [3, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      // ── Dev log: asset diagnostics ──────────────────────────────────
      if (__DEV__) {
        console.log("[settings] upload asset", {
          fileName: asset.fileName ?? "(none)",
          mimeType: asset.mimeType ?? "(none)",
          type: asset.type ?? "(none)",
          uri: asset.uri,
        });
      }

      // ── Format validation (mimeType-first, NOT filename) ────────────
      const acceptedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;
      const mimeType = (asset.mimeType ?? "").toLowerCase();

      // HEIC is not natively uploadable — show a clear message if encountered
      const isHeic = mimeType === "image/heic" || mimeType === "image/heif";
      if (isHeic) {
        Alert.alert(
          "Unsupported Format",
          "This image format is not currently supported. Please choose a different photo.",
        );
        return;
      }

      // Determine a safe extension and content-type from mimeType
      let ext: string;
      let contentType: string;
      if (mimeType && acceptedMimes.includes(mimeType as typeof acceptedMimes[number])) {
        // Extract extension from mimeType (e.g. "image/png" → "png")
        ext = mimeType.split("/")[1] === "jpeg" || mimeType.split("/")[1] === "jpg" ? "jpg" : mimeType.split("/")[1];
        contentType = mimeType;
      } else if (asset.type === "image") {
        // mimeType missing on iOS — fall back to uri extension
        const uriExt = (asset.uri.split(".").pop()?.split("?")[0] ?? "").toLowerCase();
        if (["jpg", "jpeg", "png", "webp"].includes(uriExt)) {
          ext = uriExt === "jpeg" ? "jpg" : uriExt;
          contentType = `image/${uriExt === "jpg" ? "jpeg" : uriExt}`;
        } else {
          // asset.type says "image" but no recognizable extension — assume jpeg
          ext = "jpg";
          contentType = "image/jpeg";
        }
      } else {
        Alert.alert(
          "Unsupported Format",
          `Please select a PNG, JPG, or WebP image.`,
        );
        return;
      }

      // ── File size validation ───────────────────────────────────────
      const maxBytes = type === "avatar" ? 3 * 1024 * 1024 : 5 * 1024 * 1024;
      const maxLabel = type === "avatar" ? "3 MB" : "5 MB";
      if (asset.fileSize && asset.fileSize > maxBytes) {
        const fileSizeMB = (asset.fileSize / (1024 * 1024)).toFixed(1);
        Alert.alert(
          "File Too Large",
          `This image is ${fileSizeMB} MB. ${type === "avatar" ? "Profile images" : "Banners"} must be under ${maxLabel}. Please select a smaller image or resize it before uploading.`,
        );
        return;
      }

      setUploading(true);
      const fileName = `${user.id}/${type}_${Date.now()}.${ext}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      // ── Double-check blob size (belt-and-suspenders) ────────────────
      if (blob.size > maxBytes) {
        const blobSizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        Alert.alert(
          "File Too Large",
          `This image is ${blobSizeMB} MB after processing. ${type === "avatar" ? "Profile images" : "Banners"} must be under ${maxLabel}. Please select a smaller image.`,
        );
        return;
      }

      const { error: uploadError } = await supabase.storage
        .from("user-profile-media")
        .upload(fileName, blob, { upsert: true, contentType });
      if (uploadError) {
        console.warn("[settings] upload failed", uploadError.message);
        Alert.alert("Upload Failed", "Could not upload image. The service may be temporarily unavailable. Please try again.");
        return;
      }
      const { data: urlData } = supabase.storage.from("user-profile-media").getPublicUrl(fileName);
      const publicUrl = urlData?.publicUrl;
      if (publicUrl) {
        const field = type === "avatar" ? { avatar_url: publicUrl } : { banner_url: publicUrl };
        await updateProfile(field);
        h.success();
      }
    } catch (err: unknown) {
      console.warn(`[settings] ${type} upload error`, err);
      Alert.alert("Upload Failed", "Could not upload image. Please check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }, [user?.id, updateProfile, h]);

  const handleAvatarUpload = useCallback((): void => {
    void uploadProfileMedia("avatar", setUploadingAvatar);
  }, [uploadProfileMedia]);

  const handleBannerUpload = useCallback((): void => {
    void uploadProfileMedia("banner", setUploadingBanner);
  }, [uploadProfileMedia]);

  // ── Sections ────────────────────────────────────────────────────────────

  const sections: SettingsSection[] = useMemo<SettingsSection[]>(() => {
    const secs: SettingsSection[] = [
      {
        id: "account",
        title: "Account",
        titleIcon: <User color={pal.cyan} size={15} />,
        rows: [
          {
            kind: "info",
            label: "Email Address",
            value: email,
            icon: <Mail color={pal.muted} size={18} />,
          },
          {
            kind: "input",
            label: "Username",
            value: displayUsername,
            placeholder: "Enter username",
            icon: <User color={pal.muted} size={18} />,
            onChangeText: setUsernameDraft,
            onSave: handleSaveUsername,
            saving: savingUsername,
          },
          {
            kind: "button",
            label: "Send Password Reset Email",
            variant: "primary",
            icon: <Lock color={pal.cyan} size={18} />,
            onPress: handleResetPassword,
            loading: resetPasswordState.isPending,
          },
          {
            kind: "button",
            label: "Sign Out",
            variant: "danger",
            icon: <LogOut color={pal.ember} size={18} />,
            onPress: handleLogout,
            loading: signOutState.isPending,
          },
        ],
      },
      {
        id: "profileMedia",
        title: "Profile Media",
        titleIcon: <Camera color={pal.cyan} size={15} />,
        rows: [
          {
            kind: "imageUpload" as const,
            label: "Profile Image",
            currentUrl: profile?.avatar_url ?? null,
            icon: <User color={pal.muted} size={18} />,
            onPress: handleAvatarUpload,
            uploading: uploadingAvatar,
            helperText: "Recommended: 800 × 800 px. PNG or JPG. Max 3 MB.",
            infoTitle: "Profile Image Tips",
            infoBody: "Recommended size: 800 × 800 px.\nUse a square image for best results.",
          },
          {
            kind: "imageUpload" as const,
            label: "Profile Banner",
            currentUrl: profile?.banner_url ?? null,
            icon: <ImageIcon color={pal.muted} size={18} />,
            onPress: handleBannerUpload,
            uploading: uploadingBanner,
            helperText: "Recommended: 1500 × 500 px (3:1 ratio). PNG or JPG. Max 5 MB.",
            infoTitle: "Banner Tips",
            infoBody: "Recommended size: 1500 × 500 px.\nImages may be cropped on smaller devices.\nKeep important content centered.",
          },
        ],
      },
      {
        id: "socialVerification",
        title: "Social Verification",
        titleIcon: <BadgeCheck color={pal.cyan} size={15} />,
        rows: [
          {
            kind: "custom" as const,
            render: () => <SocialVerificationPanel pal={pal} />,
          },
        ],
      },

      {
        id: "feedback",
        title: "Touch Feedback",
        titleIcon: <Hand color={pal.ember} size={15} />,
        rows: [
          {
            kind: "toggle",
            label: "Haptics",
            value: hapticsEnabled,
            icon: <Vibrate color={pal.muted} size={18} />,
            onToggle: handleToggleHaptics,
          },
        ],
      },
      {
        id: "subscription",
        title: "Subscription",
        titleIcon: <Crown color={pal.gold} size={15} />,
        rows: [
          {
            kind: "info",
            label: "Effective Tier",
            value: currentTier.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            icon: <Star color={pal.gold} size={18} />,
          },
          {
            kind: "info",
            label: "Base Tier",
            value: baseTier.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            icon: <Layers3 color={pal.muted} size={18} />,
          },
          {
            kind: "info",
            label: "Current Neuron Balance",
            value: `${(profile?.edge_subscription ?? 0) + (profile?.edge_purchased ?? 0)} Neurons`,
            icon: <Zap color={pal.cyan} size={18} />,
          },
          ...(isAdminOverrideActive && profile
            ? [
                {
                  kind: "adminOverride" as const,
                  tier: profile.admin_tier_override ?? "",
                  expiresAt: profile.admin_tier_expires_at,
                  note: profile.admin_tier_note,
                },
              ]
            : []),
          {
            kind: "link",
            label: "Neuron Store",
            icon: <Coins color={pal.gold} size={18} />,
            onPress: navigateTo("/edge-store"),
          },
          {
            kind: "button",
            label: "Manage Subscription",
            variant: "primary",
            icon: <Sliders color={pal.gold} size={18} />,
            onPress: handleManageSubscription,
          },
        ],
      },
      {
        id: "privacy",
        title: "Privacy & Safety",
        titleIcon: <Shield color={pal.success} size={15} />,
        rows: [
          {
            kind: "button",
            label: "Clear Local Cache",
            variant: "primary",
            icon: <RefreshCcw color={pal.cyan} size={18} />,
            onPress: handleClearCache,
          },
          {
            kind: "button",
            label: "Export My Data",
            variant: "primary",
            icon: <Upload color={pal.muted} size={18} />,
            onPress: handleExportData,
          },
          {
            kind: "button",
            label: "Delete Account",
            variant: "danger",
            icon: <Trash2 color={pal.ember} size={18} />,
            onPress: handleDeleteAccount,
          },
        ],
      },
      {
        id: "legal",
        title: "Legal",
        titleIcon: <FileText color={pal.muted} size={15} />,
        rows: [
          {
            kind: "link",
            label: "Terms of Service",
            icon: <FileText color={pal.muted} size={18} />,
            onPress: navigateTo("/legal/terms"),
          },
          {
            kind: "link",
            label: "Privacy Policy",
            icon: <Shield color={pal.muted} size={18} />,
            onPress: navigateTo("/legal/privacy"),
          },
          {
            kind: "link",
            label: "Disclaimer",
            icon: <AlertTriangle color={pal.muted} size={18} />,
            onPress: navigateTo("/legal/disclaimer"),
          },
        ],
      },
      {
        id: "about",
        title: "About EAGOH",
        titleIcon: <Info color={pal.blue} size={15} />,
        rows: [
          {
            kind: "info",
            label: "App Name",
            value: "EAGOH",
            icon: <Cpu color={pal.cyan} size={18} />,
          },
          {
            kind: "info",
            label: "Full Name",
            value: "Enhanced Analytics & Game Oracle Hub",
            icon: <Info color={pal.muted} size={18} />,
          },
          {
            kind: "info",
            label: "Company",
            value: "NDSTRII Studios LLC",
            icon: <Star color={pal.gold} size={18} />,
          },
          {
            kind: "info",
            label: "App Version",
            value: Constants.expoConfig?.version ?? "1.0.0",
            icon: <Layers3 color={pal.muted} size={18} />,
          },
          {
            kind: "info",
            label: "Build Number",
            value: String(
              Constants.expoConfig?.ios?.buildNumber ??
                Constants.expoConfig?.android?.versionCode ??
                "1",
            ),
            icon: <Cpu color={pal.muted} size={18} />,
          },
          {
            kind: "link",
            label: "Contact Support",
            icon: <MessageCircle color={pal.cyan} size={18} />,
            onPress: () => {
              Alert.alert("Contact Support", "eagohsupport@ndstriistudios.com");
            },
          },
        ],
      },
    ];

    return secs;
  }, [
    email,
    displayUsername,
    handleSaveUsername,
    savingUsername,
    uploadingAvatar,
    uploadingBanner,
    handleAvatarUpload,
    handleBannerUpload,
    handleResetPassword,
    resetPasswordState.isPending,
    handleLogout,
    signOutState.isPending,
    hapticsEnabled,
    handleToggleHaptics,
    currentTier,
    baseTier,
    profile,
    isAdminOverrideActive,
    handleManageSubscription,
    handleClearCache,
    handleExportData,
    handleDeleteAccount,
    navigateTo,
    pal,
  ]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={["top"]} style={s.safe}>
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
        >
          <ArrowLeft color={pal.text} size={20} />
        </Pressable>
        <Sliders color={pal.cyan} size={20} />
        <Text style={s.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section) => (
          <View key={section.id} style={s.section}>
            <SectionHeader title={section.title} icon={section.titleIcon} s={s} />
            <View style={s.sectionBody}>
              {section.rows.map((row, idx) => {
                const key = `${section.id}-${idx}`;
                switch (row.kind) {
                  case "info":
                    return <InfoRow key={key} {...row} s={s} />;
                  case "input":
                    return <InputRow key={key} {...row} s={s} pal={pal} />;
                  case "button":
                    return <ButtonRow key={key} {...row} s={s} pal={pal} />;
                  case "toggle":
                    return <ToggleRow key={key} {...row} s={s} />;
                  case "picker":
                    return <PickerRow key={key} {...row} s={s} />;
                  case "link":
                    return <LinkRow key={key} {...row} s={s} pal={pal} />;
                  case "adminOverride":
                    return <AdminOverrideRow key={key} {...row} s={s} pal={pal} />;
                  case "imageUpload":
                    return <ImageUploadRow key={key} {...row} s={s} pal={pal} />;
                  case "custom":
                    return <View key={key}>{row.render()}</View>;
                  default:
                    return null;
                }
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
