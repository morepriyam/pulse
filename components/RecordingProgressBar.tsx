import React from "react";
import { StyleSheet, View } from "react-native";

export interface RecordingSegment {
  id: string;
  duration: number;
  uri: string;
  inMs?: number; // Optional start trim point for auto-edit
  outMs?: number; // Optional end trim point for auto-edit
  fillerWords?: { startMs: number; endMs: number; word: string }[]; // Detected filler words for auto-edit mode
}

interface RecordingProgressBarProps {
  segments: RecordingSegment[];
  totalDuration: number;
  currentRecordingDuration?: number;
}

export default function RecordingProgressBar({
  segments,
  totalDuration,
  currentRecordingDuration = 0,
}: RecordingProgressBarProps) {
  const completedDuration = segments.reduce(
    (total, segment) => total + segment.duration,
    0
  );

  const totalUsedDuration = completedDuration + currentRecordingDuration;
  const progressPercentage = Math.min(
    (totalUsedDuration / totalDuration) * 100,
    100
  );

  return (
    <View style={styles.container}>
      <View style={styles.progressBarBackground}>
        <View
          style={[styles.progressBarFill, { width: `${progressPercentage}%` }]}
        />

        {/* Render segment dividers */}
        {segments.map((segment, index) => {
          const segmentEndPercentage = Math.min(
            (segments
              .slice(0, index + 1)
              .reduce((total, seg) => total + seg.duration, 0) /
              totalDuration) *
              100,
            100
          );

          return (
            <View
              key={segment.id}
              style={[
                styles.segmentDivider,
                { left: `${segmentEndPercentage}%` },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 3,
    position: "relative",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#ff0000",
    borderRadius: 3,
  },
  segmentDivider: {
    position: "absolute",
    top: -2,
    width: 2,
    height: 8,
    backgroundColor: "#ffffff",
    borderRadius: 1,
  },
});
