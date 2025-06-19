import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import React from "react";

export default function ProfileScreen() {
  return (
    <ThemedView
      style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
    >
      <ThemedText type="title">Profile</ThemedText>
      <ThemedText>This is your profile page.</ThemedText>
    </ThemedView>
  );
}
