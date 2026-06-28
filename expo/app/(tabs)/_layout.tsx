import { Tabs } from "expo-router";
import { Atom, Home, MessageCircle, Store, UserRound } from "lucide-react-native";
import React from "react";
import { Platform } from "react-native";
import { useAppTheme } from "@/providers/ThemeProvider";

/**
 * Standard native mobile tab bar anchored to the bottom of the screen.
 * Five tabs: Home, Forge, Sessions, Exchange, Profile.
 * Forge is visually emphasized as the primary action tab.
 * Labels always display fully.
 * Theme-aware — responds to light/dark mode preference.
 */
export default function TabLayout(): JSX.Element {
  const { palette: pal } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: pal.cyan,
        tabBarInactiveTintColor: pal.muted,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: pal.obsidian,
          borderTopWidth: 1,
          borderTopColor: pal.line,
          height: Platform.OS === "ios" ? 88 : 68,
          paddingTop: 10,
          paddingBottom: Platform.OS === "ios" ? 28 : 10,
          elevation: 10,
          shadowColor: "#000",
          shadowOpacity: 0.5,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 },
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 0.2,
          marginTop: 3,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="forge"
        options={{
          title: "Forge",
          tabBarIcon: ({ color, size }) => <Atom color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: "Sessions",
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          title: "Exchange",
          tabBarIcon: ({ color, size }) => <Store color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
