import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

export default function PhotoScreen() {
  return (
    <ThemedView
      style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
    >
      <ThemedText type="title">Photo Page</ThemedText>
    </ThemedView>
  );
}
