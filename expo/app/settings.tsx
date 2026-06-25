import { useAppTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useHaptics } from "@/hooks/useHaptics";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowLeft,
  Brush,
  ChevronRight,
  Cpu,
  Crown,
  FileText,
  Hand,
  Info,
  Layers3,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Moon,
  RefreshCcw,
  Shield,
  Sliders,
  Star,
  Sun,
  Trash2,
  Upload,
  User,
  Vibrate,
  Zap,
} from "lucide-react-native";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AppTheme } from "@/services/profile";
import { palette as darkPalette, lightPalette } from "@/constants/colors";

type P = typeof darkPalette;

// ── Section types ──────────────────────────────────────────────────────────

type SectionRow =
  | { kind: "info"; label: string; value: string; icon: React.ReactNode }
  | { kind: "input"; label: string; value: string; placeholder: string; icon: React.ReactNode; onChangeText: (text: string) => void; onSave: () => void; saving: boolean }
  | { kind: "button"; label: string; variant: "primary" | "danger"; icon: React.ReactNode; onPress: () => void; loading?: boolean }
  | { kind: "toggle"; label: string; value: boolean; icon: React.ReactNode; onToggle: () => void }
  | { kind: "picker"; label: string; value: string; options: { id: string; label: string; icon: React.ReactNode }[]; icon: React.ReactNode; onSelect: (id: string) => void }
  | { kind: "link"; label: string; icon: React.ReactNode; onPress: () => void }
  | { kind: "adminOverride"; tier: string; expiresAt: string | null; note: string | null };

type SettingsSection = {
  id: string;
  title: string;
  titleIcon: React.ReactNode;
  rows: SectionRow[];
};

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
  const { theme, setTheme, palette: pal } = useAppTheme();
  const h = useHaptics();
  const queryClient = useQueryClient();

  // ── Themed styles ──────────────────────────────────────────────────────
  const s = useMemo(() => createStyles(pal), [pal]);

  // ── Local state ────────────────────────────────────────────────────────
  const [usernameDraft, setUsernameDraft] = useState<string>(
    profile?.username ?? "",
  );
  const [savingUsername, setSavingUsername] = useState<boolean>(false);

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

  const handleThemeSelect = useCallback(
    (id: string): void => {
      setTheme(id as AppTheme).catch((err: unknown) =>
        console.warn("[settings] theme change failed", err),
      );
    },
    [setTheme],
  );

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
              "Account deletion is coming soon. Please contact support@eagoh.com to delete your account.",
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
        id: "appearance",
        title: "Appearance",
        titleIcon: <Brush color={pal.violet} size={15} />,
        rows: [
          {
            kind: "picker",
            label: "Theme",
            value: theme,
            icon: <Moon color={pal.muted} size={18} />,
            options: [
              { id: "dark", label: "Dark Mode", icon: <Moon color={pal.blue} size={14} /> },
              { id: "light", label: "Light Mode", icon: <Sun color={pal.gold} size={14} /> },
            ],
            onSelect: handleThemeSelect,
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
            label: "Current Edge Balance",
            value: `${(profile?.edge_subscription ?? 0) + (profile?.edge_purchased ?? 0)} Edge`,
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
              Alert.alert("Contact Support", "support@eagoh.com");
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
    handleResetPassword,
    resetPasswordState.isPending,
    handleLogout,
    signOutState.isPending,
    theme,
    handleThemeSelect,
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
