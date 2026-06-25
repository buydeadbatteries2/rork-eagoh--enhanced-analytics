import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useMemo } from "react";
import { palette, lightPalette, getPaletteForTheme } from "@/constants/colors";
import { useProfile } from "@/providers/ProfileProvider";
import type { AppTheme, ProfilePreferences } from "@/services/profile";

/**
 * ThemeProvider – exposes the active theme (dark/light) and the computed palette.
 * Reads/writes `profiles.preferences.theme`. Falls back to "dark" when no
 * preference is stored or the profile hasn't loaded yet.
 */
export type ThemePalette = typeof palette;

export const [ThemeProviderInner, useAppTheme] = createContextHook(() => {
  const { profile, setPreferences, isLoading } = useProfile();

  const theme: AppTheme = useMemo<AppTheme>(() => {
    const stored: unknown = profile?.preferences?.theme;
    if (stored === "light" || stored === "dark") return stored as AppTheme;
    return "dark";
  }, [profile?.preferences?.theme]);

  const activePalette: ThemePalette = useMemo<ThemePalette>(
    () => getPaletteForTheme(theme),
    [theme],
  );

  const setTheme = useCallback(
    async (next: AppTheme): Promise<void> => {
      const prefs: ProfilePreferences = {
        ...(profile?.preferences ?? {}),
        theme: next,
      };
      await setPreferences(prefs);
    },
    [profile?.preferences, setPreferences],
  );

  return { theme, palette: activePalette, setTheme, isLoading };
});

/**
 * Public ThemeProvider – wraps the inner hook so it can be placed in the component
 * tree above ProfileProvider consumers while itself consuming ProfileProvider.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  return <ThemeProviderInner>{children}</ThemeProviderInner>;
}
