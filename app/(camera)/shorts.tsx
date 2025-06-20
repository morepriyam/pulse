import { ThemedView } from "@/components/ThemedView";
import { CameraView } from "expo-camera";
import * as React from "react";

export default function ShortsScreen() {
  const cameraRef = React.useRef<CameraView>(null);

  return (
    <ThemedView style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }}></CameraView>
    </ThemedView>
  );
}
