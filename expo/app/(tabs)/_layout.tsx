import { Tabs } from "expo-router";
import { Flame, Home, MessageCircle, Store, UserRound } from "lucide-react-native";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { palette } from "@/constants/colors";
import AmbientBackground from "@/app/components/ui/AmbientBackground";

/**
 * Floating glass tab bar with neon-glow active state.
 * Renders the shared AmbientBackground behind every tab screen so the entire
 * app inherits a single cybernetic atmosphere.
 *
 * Tabs: Home, Forge, Sessions, Exchange, Profile
 */
export default function TabLayout(): JSX.Element {
  return (
    <View style={styles.root}>
      <AmbientBackground />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: palette.cyan,
          tabBarInactiveTintColor: palette.muted,
          tabBarShowLabel: true,
          sceneStyle: { backgroundColor: "transparent" },
          tabBarBackground: () => (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={Platform.OS === "ios" ? 38 : 24} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.tabBg} />
              <View style={styles.tabBorder} />
            </View>
          ),
          tabBarStyle: {
            position: "absolute",
            left: 16,
            right: 16,
            bottom: Platform.OS === "ios" ? 22 : 14,
            height: 68,
            borderRadius: 5,
            borderTopWidth: 0,
            backgroundColor: "transparent",
            elevation: 0,
            shadowColor: palette.blue,
            shadowOpacity: 0.35,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 6 },
            paddingTop: 10,
            paddingBottom: Platform.OS === "ios" ? 10 : 8,
          },
          tabBarLabelStyle: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 2 },
          tabBarItemStyle: { borderRadius: 5 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "HOME", tabBarIcon: ({ color, size, focused }) => <TabIcon focused={focused}><Home color={color} size={size - 2} /></TabIcon> }} />
        <Tabs.Screen name="forge" options={{ title: "FORGE", tabBarIcon: ({ color, size, focused }) => <TabIcon focused={focused} forge><Flame color={color} size={size - 2} /></TabIcon> }} />
        <Tabs.Screen name="sessions" options={{ title: "SESSIONS", tabBarIcon: ({ color, size, focused }) => <TabIcon focused={focused}><MessageCircle color={color} size={size - 2} /></TabIcon> }} />
        <Tabs.Screen name="marketplace" options={{ title: "EXCHANGE", tabBarIcon: ({ color, size, focused }) => <TabIcon focused={focused}><Store color={color} size={size - 2} /></TabIcon> }} />
        <Tabs.Screen name="profile" options={{ title: "PROFILE", tabBarIcon: ({ color, size, focused }) => <TabIcon focused={focused}><UserRound color={color} size={size - 2} /></TabIcon> }} />
      </Tabs>
    </View>
  );
}

function TabIcon({ children, focused, forge }: { children: React.ReactNode; focused: boolean; forge?: boolean }): JSX.Element {
  return (
    <View style={[styles.iconWrap, focused && styles.iconFocused, focused && forge && styles.iconForge]}>
      {focused ? <View style={[styles.iconRing, forge && { borderColor: palette.blue }]} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  tabBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(7,17,31,0.78)", borderRadius: 5 },
  tabBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 5, borderWidth: 1, borderColor: "rgba(108,230,255,0.22)" },
  iconWrap: { width: 36, height: 36, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  iconFocused: { backgroundColor: "rgba(108,230,255,0.10)" },
  iconForge: { backgroundColor: "rgba(61,165,255,0.18)", shadowColor: palette.blue, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  iconRing: { position: "absolute", width: 38, height: 38, borderRadius: 5, borderWidth: 1, borderColor: "rgba(108,230,255,0.4)" },
});
