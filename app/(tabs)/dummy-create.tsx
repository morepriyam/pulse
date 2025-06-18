import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function CreateTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tab Placeholder</Text>
      <Text style={styles.subtitle}>This screen should not be visible</Text>
      <Text style={styles.description}>
        The + button in the tab bar should navigate to the camera screen, not
        this placeholder screen.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f0f0",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
  },
  description: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
