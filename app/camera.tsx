import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function CameraScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>📷 Camera Screen</Text>
      <Text style={styles.subtitle}>Fullscreen - No Tab Bar</Text>
      <Text style={styles.description}>
        This is where your camera functionality will go. This screen opens when
        you tap the + button in the tab bar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: "#fff",
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    color: "#ccc",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
