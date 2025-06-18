import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import React from "react";
import { StyleSheet } from "react-native";

export default function CameraScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title} type="title">
        📷 Camera Screen
      </ThemedText>
      <ThemedText style={styles.subtitle} type="subtitle">
        Fullscreen - No Tab Bar
      </ThemedText>
      <ThemedText style={styles.description}>
        This is where your camera functionality will go. This screen opens when
        you tap the + button in the tab bar.
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
    fontSize: 24,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
