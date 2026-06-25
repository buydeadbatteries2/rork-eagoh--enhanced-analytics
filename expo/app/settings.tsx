import { palette } from "@/constants/colors";
import { useAppTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
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

// ── Sub-components ─────────────────────────────────────────────────────────

const SectionHeader = memo(function SectionHeader({
  title,
  icon,
}: {
  title: string;
  icon: React.ReactNode;
}): JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      {icon}
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
});

const InfoRow = memo(function InfoRow({ label, value, icon }: Extract<SectionRow, { kind: "info" }>): JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
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
}: Extract<SectionRow, { kind: "input" }>): JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={value}
            placeholder={placeholder}
            placeholderTextColor={palette.muted}
            onChangeText={onChangeText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={palette.text} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
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
}: Extract<SectionRow, { kind: "button" }>): JSX.Element {
  const isDanger = variant === "danger";
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.row,
        isDanger && styles.rowDanger,
        pressed && { opacity: 0.75 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isDanger ? palette.ember : palette.cyan} style={styles.rowIcon} />
      ) : (
        <View style={styles.rowIcon}>{icon}</View>
      )}
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, isDanger && { color: palette.ember }]}>
          {label}
        </Text>
      </View>
      {loading && <ActivityIndicator color={isDanger ? palette.ember : palette.cyan} size="small" />}
    </Pressable>
  );
});

const ToggleRow = memo(function ToggleRow({
  label,
  value,
  icon,
  onToggle,
}: Extract<SectionRow, { kind: "toggle" }>): JSX.Element {
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{value ? "On" : "Off"}</Text>
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackActive]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
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
}: Extract<SectionRow, { kind: "picker" }>): JSX.Element {
  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? options[0],
    [options, value],
  );

  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.pickerOptions}>
          {options.map((opt) => {
            const isActive = opt.id === value;
            return (
              <Pressable
                key={opt.id}
                onPress={() => onSelect(opt.id)}
                style={({ pressed }) => [
                  styles.pickerChip,
                  isActive && styles.pickerChipActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                {opt.icon}
                <Text
                  style={[
                    styles.pickerChipText,
                    isActive && styles.pickerChipTextActive,
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
}: Extract<SectionRow, { kind: "link" }>): JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <ChevronRight color={palette.muted} size={16} />
    </Pressable>
  );
});

const AdminOverrideRow = memo(function AdminOverrideRow({
  tier,
  expiresAt,
  note,
}: Extract<SectionRow, { kind: "adminOverride" }>): JSX.Element {
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1).replace("_", " ");
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString()
    : "No expiration";

  return (
    <View style={[styles.row, styles.adminOverrideRow]}>
      <View style={styles.rowIcon}>
        <Crown color={palette.gold} size={18} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.adminOverrideHeader}>
          <Zap color={palette.gold} size={12} />
          <Text style={styles.adminOverrideLabel}>Promotional Access Active</Text>
        </View>
        <View style={styles.adminOverrideDetails}>
          <Text style={styles.adminOverrideDetail}>
            Tier: <Text style={{ color: palette.gold, fontWeight: "900" }}>{tierLabel}</Text>
          </Text>
          <Text style={styles.adminOverrideDetail}>Expires: {expiresLabel}</Text>
          {note ? (
            <Text style={styles.adminOverrideDetail}>Note: {note}</Text>
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
  const { theme, setTheme } = useAppTheme();
  const queryClient = useQueryClient();

  // ── Local state ────────────────────────────────────────────────────────
  const [usernameDraft, setUsernameDraft] = useState<string>(
    profile?.username ?? "",
  );
  const [savingUsername, setSavingUsername] = useState<boolean>(false);

  // Sync username draft when profile loads
  const usernameValue = profile?.username ?? "";
  const displayUsername = usernameDraft || usernameValue;

  const email = user?.email ?? "—";
  const currentTier = effectiveSubscriptionTier;
  const baseTier = profile?.subscription_tier ?? "free";
  const hapticsEnabled = profile?.preferences?.hapticsEnabled !== false; // default on

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSaveUsername = useCallback(async (): Promise<void> => {
    if (!usernameDraft.trim()) return;
    setSavingUsername(true);
    try {
      await updateProfile({ username: usernameDraft.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (err) {
      console.warn("[settings] username save failed", err);
    } finally {
      setSavingUsername(false);
    }
  }, [usernameDraft, updateProfile]);

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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
          signOut().catch((e) => console.warn("[settings] signOut failed", e));
        },
      },
    ]);
  }, [signOut]);

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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            Alert.alert("Cache Cleared", "Local cache has been cleared successfully.");
          },
        },
      ],
    );
  }, [queryClient]);

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
      Haptics.selectionAsync().catch(() => undefined);
      router.push(route as never);
    },
    [router],
  );

  // ── Sections ────────────────────────────────────────────────────────────

  const sections: SettingsSection[] = useMemo<SettingsSection[]>(() => {
    const s: SettingsSection[] = [
      {
        id: "account",
        title: "Account",
        titleIcon: <User color={palette.cyan} size={15} />,
        rows: [
          {
            kind: "info",
            label: "Email Address",
            value: email,
            icon: <Mail color={palette.muted} size={18} />,
          },
          {
            kind: "input",
            label: "Username",
            value: displayUsername,
            placeholder: "Enter username",
            icon: <User color={palette.muted} size={18} />,
            onChangeText: setUsernameDraft,
            onSave: handleSaveUsername,
            saving: savingUsername,
          },
          {
            kind: "button",
            label: "Send Password Reset Email",
            variant: "primary",
            icon: <Lock color={palette.cyan} size={18} />,
            onPress: handleResetPassword,
            loading: resetPasswordState.isPending,
          },
          {
            kind: "button",
            label: "Sign Out",
            variant: "danger",
            icon: <LogOut color={palette.ember} size={18} />,
            onPress: handleLogout,
            loading: signOutState.isPending,
          },
        ],
      },
      {
        id: "appearance",
        title: "Appearance",
        titleIcon: <Brush color={palette.violet} size={15} />,
        rows: [
          {
            kind: "picker",
            label: "Theme",
            value: theme,
            icon: <Moon color={palette.muted} size={18} />,
            options: [
              { id: "dark", label: "Dark Mode", icon: <Moon color={palette.blue} size={14} /> },
              { id: "light", label: "Light Mode", icon: <Sun color={palette.gold} size={14} /> },
            ],
            onSelect: handleThemeSelect,
          },
        ],
      },
      {
        id: "feedback",
        title: "Touch Feedback",
        titleIcon: <Hand color={palette.ember} size={15} />,
        rows: [
          {
            kind: "toggle",
            label: "Haptics",
            value: hapticsEnabled,
            icon: <Vibrate color={palette.muted} size={18} />,
            onToggle: handleToggleHaptics,
          },
        ],
      },
      {
        id: "subscription",
        title: "Subscription",
        titleIcon: <Crown color={palette.gold} size={15} />,
        rows: [
          {
            kind: "info",
            label: "Effective Tier",
            value: currentTier.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            icon: <Star color={palette.gold} size={18} />,
          },
          {
            kind: "info",
            label: "Base Tier",
            value: baseTier.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            icon: <Layers3 color={palette.muted} size={18} />,
          },
          {
            kind: "info",
            label: "Current Edge Balance",
            value: `${(profile?.edge_subscription ?? 0) + (profile?.edge_purchased ?? 0)} Edge`,
            icon: <Zap color={palette.cyan} size={18} />,
          },
          // Admin override
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
            icon: <Sliders color={palette.gold} size={18} />,
            onPress: handleManageSubscription,
          },
        ],
      },
      {
        id: "privacy",
        title: "Privacy & Safety",
        titleIcon: <Shield color={palette.success} size={15} />,
        rows: [
          {
            kind: "button",
            label: "Clear Local Cache",
            variant: "primary",
            icon: <RefreshCcw color={palette.cyan} size={18} />,
            onPress: handleClearCache,
          },
          {
            kind: "button",
            label: "Export My Data",
            variant: "primary",
            icon: <Upload color={palette.muted} size={18} />,
            onPress: handleExportData,
          },
          {
            kind: "button",
            label: "Delete Account",
            variant: "danger",
            icon: <Trash2 color={palette.ember} size={18} />,
            onPress: handleDeleteAccount,
          },
        ],
      },
      {
        id: "legal",
        title: "Legal",
        titleIcon: <FileText color={palette.muted} size={15} />,
        rows: [
          {
            kind: "link",
            label: "Terms of Service",
            icon: <FileText color={palette.muted} size={18} />,
            onPress: navigateTo("/legal/terms"),
          },
          {
            kind: "link",
            label: "Privacy Policy",
            icon: <Shield color={palette.muted} size={18} />,
            onPress: navigateTo("/legal/privacy"),
          },
          {
            kind: "link",
            label: "Disclaimer",
            icon: <AlertTriangle color={palette.muted} size={18} />,
            onPress: navigateTo("/legal/disclaimer"),
          },
        ],
      },
      {
        id: "about",
        title: "About EAGOH",
        titleIcon: <Info color={palette.blue} size={15} />,
        rows: [
          {
            kind: "info",
            label: "App Name",
            value: "EAGOH",
            icon: <Cpu color={palette.cyan} size={18} />,
          },
          {
            kind: "info",
            label: "Full Name",
            value: "Enhanced Analytics & Game Oracle Hub",
            icon: <Info color={palette.muted} size={18} />,
          },
          {
            kind: "info",
            label: "Company",
            value: "NDSTRII Studios LLC",
            icon: <Star color={palette.gold} size={18} />,
          },
          {
            kind: "info",
            label: "App Version",
            value: Constants.expoConfig?.version ?? "1.0.0",
            icon: <Layers3 color={palette.muted} size={18} />,
          },
          {
            kind: "info",
            label: "Build Number",
            value: String(
              Constants.expoConfig?.ios?.buildNumber ??
                Constants.expoConfig?.android?.versionCode ??
                "1",
            ),
            icon: <Cpu color={palette.muted} size={18} />,
          },
          {
            kind: "link",
            label: "Contact Support",
            icon: <MessageCircle color={palette.cyan} size={18} />,
            onPress: () => {
              Alert.alert("Contact Support", "support@eagoh.com");
            },
          },
        ],
      },
    ];

    return s;
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
  ]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <ArrowLeft color={palette.text} size={20} />
        </Pressable>
        <Sliders color={palette.cyan} size={20} />
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <SectionHeader title={section.title} icon={section.titleIcon} />
            <View style={styles.sectionBody}>
              {section.rows.map((row, idx) => {
                const key = `${section.id}-${idx}`;
                switch (row.kind) {
                  case "info":
                    return <InfoRow key={key} {...row} />;
                  case "input":
                    return <InputRow key={key} {...row} />;
                  case "button":
                    return <ButtonRow key={key} {...row} />;
                  case "toggle":
                    return <ToggleRow key={key} {...row} />;
                  case "picker":
                    return <PickerRow key={key} {...row} />;
                  case "link":
                    return <LinkRow key={key} {...row} />;
                  case "adminOverride":
                    return <AdminOverrideRow key={key} {...row} />;
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

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.void },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    backgroundColor: palette.obsidian,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: palette.line,
  },
  headerTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "900",
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 120, gap: 14 },

  // Section
  section: {
    borderRadius: 5,
    backgroundColor: "rgba(10,20,40,0.50)",
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  sectionHeaderText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionBody: { gap: 0 },

  // Row base
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  rowDanger: {
    backgroundColor: "rgba(255,77,109,0.06)",
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.line,
  },
  rowContent: { flex: 1 },
  rowLabel: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "800",
  },
  rowValue: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  rowHint: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },

  // Input row
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  textInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 5,
    backgroundColor: palette.cyan,
  },
  saveBtnText: {
    color: palette.void,
    fontSize: 12,
    fontWeight: "900",
  },

  // Toggle
  toggleTrack: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(141,162,181,0.24)",
    justifyContent: "center",
    padding: 3,
  },
  toggleTrackActive: {
    backgroundColor: "rgba(0,255,178,0.30)",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.muted,
  },
  toggleThumbActive: {
    backgroundColor: palette.success,
    alignSelf: "flex-end",
  },

  // Picker
  pickerOptions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  pickerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.line,
  },
  pickerChipActive: {
    backgroundColor: "rgba(108,230,255,0.12)",
    borderColor: palette.cyan,
  },
  pickerChipText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  pickerChipTextActive: {
    color: palette.text,
  },

  // Admin override
  adminOverrideRow: {
    backgroundColor: "rgba(255,184,77,0.08)",
    borderBottomColor: "rgba(255,184,77,0.22)",
  },
  adminOverrideHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  adminOverrideLabel: {
    color: palette.gold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  adminOverrideDetails: {
    gap: 2,
  },
  adminOverrideDetail: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
  },
});
