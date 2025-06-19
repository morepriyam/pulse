import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import React from "react";

export default function SubscriptionsScreen() {
  return (
    <ThemedView
      style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
    >
      <ThemedText type="title">Subscriptions</ThemedText>
      <ThemedText>See your subscribed channels here.</ThemedText>
    </ThemedView>
  );
}
