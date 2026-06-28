import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { AuthProvider } from "@/providers/AuthProvider";
import { ProfileProvider } from "@/providers/ProfileProvider";
import { EagohProvider } from "@/providers/EagohProvider";
import { EdgeProvider } from "@/providers/EdgeProvider";
import { ForgeProvider } from "@/providers/ForgeProvider";
import { ThemeProvider, useAppTheme } from "@/providers/ThemeProvider";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/** Inner component that can consume ThemeProvider context for root-level theme. */
function ThemedRoot(): JSX.Element {
  const { palette, theme } = useAppTheme();

  const themedStyles = useMemo(
    () => ({
      root: { flex: 1, backgroundColor: palette.void } as const,
    }),
    [palette.void],
  );

  return (
    <GestureHandlerRootView style={themedStyles.root}>
      <View style={themedStyles.root}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.void },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="labs"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="factions"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="open-intelligence"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="leaderboards"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="settings"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="legal/terms"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="legal/privacy"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="legal/disclaimer"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="public-profile"
            options={{ presentation: "modal", headerShown: false }}
          />
        </Stack>
      </View>
    </GestureHandlerRootView>
  );
}

export default function RootLayout(): JSX.Element {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProfileProvider>
          <ThemeProvider>
          <EdgeProvider>
          <EagohProvider>
          <ForgeProvider>
            <ThemedRoot />
          </ForgeProvider>
          </EagohProvider>
          </EdgeProvider>
          </ThemeProvider>
        </ProfileProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
