import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { AuthProvider } from "@/providers/AuthProvider";
import { ProfileProvider } from "@/providers/ProfileProvider";
import { EagohProvider } from "@/providers/EagohProvider";
import { EdgeProvider } from "@/providers/EdgeProvider";
import { ForgeProvider } from "@/providers/ForgeProvider";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav(): JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#03060B" } }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
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
          <EdgeProvider>
          <EagohProvider>
          <ForgeProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <View style={{ flex: 1, backgroundColor: "#03060B" }}>
                <StatusBar style="light" />
                <RootLayoutNav />
              </View>
            </GestureHandlerRootView>
          </ForgeProvider>
          </EagohProvider>
          </EdgeProvider>
        </ProfileProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
