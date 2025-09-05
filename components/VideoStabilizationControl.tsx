import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import { Alert, Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { VideoStabilization, getSupportedVideoStabilizationModes } from "@/constants/camera";
import { ThemedText } from "./ThemedText";

interface VideoStabilizationControlProps {
  /** Current video stabilization mode */
  stabilizationMode: VideoStabilization;
  /** Callback when stabilization mode changes */
  onStabilizationModeChange: (mode: VideoStabilization) => void;
  /** Whether to show a compact (icon only) or expanded view */
  compact?: boolean;
}

export default function VideoStabilizationControl({
  stabilizationMode,
  onStabilizationModeChange,
  compact = false,
}: VideoStabilizationControlProps) {
  const capabilities = getSupportedVideoStabilizationModes();

  const getStabilizationIcon = (): "video-stable" => {
    return "video-stable";
  };

  const getStabilizationLabel = (mode: VideoStabilization): string => {
    switch (mode) {
      case VideoStabilization.off:
        return "Off";
      case VideoStabilization.on:
        return "On";
      default:
        return "Off";
    }
  };

  const handleStabilizationToggle = () => {
    if (!capabilities.isSupported) {
      Alert.alert(
        "Not Supported",
        "Video stabilization is not supported on this device."
      );
      return;
    }

    // Simple toggle between off and on
    const nextMode = stabilizationMode === VideoStabilization.off 
      ? VideoStabilization.on 
      : VideoStabilization.off;

    onStabilizationModeChange(nextMode);
  };

  if (!capabilities.isSupported) {
    return null; // Don't render if not supported
  }

  const isActive = stabilizationMode !== VideoStabilization.off;

  if (compact) {
    return (
      <TouchableOpacity
        style={[
          styles.compactButton,
          isActive && styles.activeButton,
        ]}
        onPress={handleStabilizationToggle}
      >
        <MaterialIcons
          name={getStabilizationIcon()}
          size={24}
          color="white"
        />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          isActive && styles.activeButton,
        ]}
        onPress={handleStabilizationToggle}
      >
        <MaterialIcons
          name={getStabilizationIcon()}
          size={20}
          color="white"
        />
        <ThemedText style={styles.buttonText}>
          {getStabilizationLabel(stabilizationMode)}
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactButton: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    width: 40,
    height: 40,
    borderRadius: 25,
    marginVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  activeButton: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  buttonText: {
    fontSize: 12,
    color: "white",
    fontWeight: "600",
  },
});