import RecordButton from "@/components/RecordButton";
import RecordingProgressBar, {
  RecordingSegment,
} from "@/components/RecordingProgressBar";
import { ThemedView } from "@/components/ThemedView";
import TimeSelectorButton from "@/components/TimeSelectorButton";
import { CameraView } from "expo-camera";
import * as React from "react";
import { StyleSheet, View } from "react-native";

export default function ShortsScreen() {
  const cameraRef = React.useRef<CameraView>(null);
  const [selectedDuration, setSelectedDuration] = React.useState(60);
  const [recordingSegments, setRecordingSegments] = React.useState<
    RecordingSegment[]
  >([]);
  const [currentRecordingDuration, setCurrentRecordingDuration] =
    React.useState(0);

  const totalUsedDuration = recordingSegments.reduce(
    (total, segment) => total + segment.duration,
    0
  );

  const handleRecordingStart = (
    mode: "tap" | "hold",
    remainingTime: number
  ) => {
    console.log(`Started ${mode} recording with ${remainingTime}s remaining`);
    setCurrentRecordingDuration(0);
  };

  const handleRecordingProgress = (
    currentDuration: number,
    remainingTime: number
  ) => {
    setCurrentRecordingDuration(currentDuration);

    if (remainingTime <= 0) {
      console.log("Recording will stop - time limit reached");
    }
  };

  const handleRecordingComplete = (
    videoUri: string | null,
    mode: "tap" | "hold",
    duration: number
  ) => {
    console.log(
      `Completed ${mode} recording:`,
      videoUri,
      `Duration: ${duration}s`
    );

    setCurrentRecordingDuration(0);

    if (videoUri && duration > 0) {
      const newSegment: RecordingSegment = {
        id: Date.now().toString(),
        duration: duration,
        uri: videoUri,
      };

      setRecordingSegments((prev) => [...prev, newSegment]);
    }
  };

  const handleTimeSelect = (timeInSeconds: number) => {
    setSelectedDuration(timeInSeconds);
  };

  const handleClearSegments = () => {
    setRecordingSegments([]);
    setCurrentRecordingDuration(0);
  };

  return (
    <ThemedView style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        mode="video"
        facing="back"
      />

      <View style={styles.timeSelectorContainer}>
        <TimeSelectorButton
          onTimeSelect={handleTimeSelect}
          selectedTime={selectedDuration}
        />
      </View>

      <RecordingProgressBar
        segments={recordingSegments}
        totalDuration={selectedDuration}
        currentRecordingDuration={currentRecordingDuration}
      />

      <RecordButton
        cameraRef={cameraRef}
        maxDuration={60}
        totalDuration={selectedDuration}
        usedDuration={totalUsedDuration}
        holdDelay={500}
        onRecordingStart={handleRecordingStart}
        onRecordingProgress={handleRecordingProgress}
        onRecordingComplete={handleRecordingComplete}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  timeSelectorContainer: {
    position: "absolute",
    top: 80,
    right: 25,
    zIndex: 10,
  },
});
