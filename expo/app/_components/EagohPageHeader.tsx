/**
 * Shared page header used by Sessions and Forge pages.
 * Displays a small uppercase kicker label and a large title below it —
 * matching the cybernetic EAGOH brand typography.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette } from "@/constants/colors";

export interface EagohPageHeaderProps {
  kicker: string;
  title: string;
  /** Optional slot rendered after the title (e.g. an empty-state banner). */
  children?: React.ReactNode;
}

export default function EagohPageHeader({ kicker, title, children }: EagohPageHeaderProps): JSX.Element {
  return (
    <View style={styles.hero}>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginBottom: 14 },
  kicker: {
    color: palette.cyan,
    fontSize: 10,
    fontWeight: "900" as const,
    letterSpacing: 2.2,
    marginBottom: 4,
  },
  title: {
    color: palette.text,
    fontSize: 26,
    fontWeight: "900" as const,
    letterSpacing: -0.6,
  },
});
