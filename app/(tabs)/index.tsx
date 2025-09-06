import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import React from "react";

export default function HomeScreen() {
  return (
    <ThemedView
      style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
    >
      <ThemedText type="title">Welcome to Pulse!</ThemedText>
      <ThemedText>This is the main tab of the app.</ThemedText>
    </ThemedView>
  );
}
