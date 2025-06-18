import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import React from "react";
import { StyleSheet } from "react-native";

export default function CreateTab() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title} type="title">
        Tab Placeholder
      </ThemedText>
      <ThemedText style={styles.subtitle} type="subtitle">
        This screen should not be visible
      </ThemedText>
      <ThemedText style={styles.description}>
        The + button in the tab bar should navigate to the camera screen, not
        this placeholder screen.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginBottom: 10,
  },
  subtitle: {
    marginBottom: 20,
  },
  description: {
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
