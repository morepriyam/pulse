import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import React from "react";

export default function ShortsTabScreen() {
  return (
    <ThemedView
      style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
    >
      <ThemedText type="title">Shorts</ThemedText>
      <ThemedText>Watch trending short videos here.</ThemedText>
    </ThemedView>
  );
}
