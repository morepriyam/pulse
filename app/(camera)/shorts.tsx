import RecordButton from "@/components/RecordButton";
import { ThemedView } from "@/components/ThemedView";
import { CameraView } from "expo-camera";
import * as React from "react";

export default function ShortsScreen() {
  const cameraRef = React.useRef<CameraView>(null);

  const handleRecordingStart = (mode: "tap" | "hold") => {
    console.log(`Started ${mode} recording`);
  };

  const handleRecordingComplete = (
    videoUri: string | null,
    mode: "tap" | "hold"
  ) => {
    console.log(`Completed ${mode} recording:`, videoUri);
    // You can handle the video here - save to gallery, navigate to edit screen, etc.
  };

  return (
    <ThemedView style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        mode="video"
        facing="back"
      />

      <RecordButton
        cameraRef={cameraRef}
        maxDuration={60}
        holdDelay={500}
        onRecordingStart={handleRecordingStart}
        onRecordingComplete={handleRecordingComplete}
      />
    </ThemedView>
  );
}
