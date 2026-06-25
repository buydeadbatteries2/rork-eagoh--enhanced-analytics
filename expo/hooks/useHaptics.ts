import * as Haptics from "expo-haptics";
import { useProfile } from "@/providers/ProfileProvider";

/**
 * Wraps expo-haptics with the user's hapticsEnabled preference.
 * All haptics calls silently no-op when the preference is disabled.
 */
export function useHaptics(): {
  selection: () => void;
  notification: (type: Haptics.NotificationFeedbackType) => void;
  impact: (style: Haptics.ImpactFeedbackStyle) => void;
  light: () => void;
  medium: () => void;
  heavy: () => void;
  success: () => void;
  warning: () => void;
  error: () => void;
} {
  const { profile } = useProfile();
  const enabled = profile?.preferences?.hapticsEnabled !== false;

  const selection = (): void => {
    if (!enabled) return;
    Haptics.selectionAsync().catch(() => undefined);
  };

  const notification = (type: Haptics.NotificationFeedbackType): void => {
    if (!enabled) return;
    Haptics.notificationAsync(type).catch(() => undefined);
  };

  const impact = (style: Haptics.ImpactFeedbackStyle): void => {
    if (!enabled) return;
    Haptics.impactAsync(style).catch(() => undefined);
  };

  // Shortcut helpers for common patterns
  const light = (): void => impact(Haptics.ImpactFeedbackStyle.Light);
  const medium = (): void => impact(Haptics.ImpactFeedbackStyle.Medium);
  const heavy = (): void => impact(Haptics.ImpactFeedbackStyle.Heavy);
  const success = (): void => notification(Haptics.NotificationFeedbackType.Success);
  const warning = (): void => notification(Haptics.NotificationFeedbackType.Warning);
  const err = (): void => notification(Haptics.NotificationFeedbackType.Error);

  return { selection, notification, impact, light, medium, heavy, success, warning, error: err };
}
