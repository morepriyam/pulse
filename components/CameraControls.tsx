import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { CameraType } from "expo-camera";
import React from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import VideoStabilizationControl from "./VideoStabilizationControl";
import { VideoStabilization } from "@/constants/camera";

interface CameraControlsProps {
  onFlipCamera?: () => void;
  onFlashToggle?: () => void;
  torchEnabled?: boolean;
  cameraFacing?: CameraType;
  videoStabilizationMode?: VideoStabilization;
  onVideoStabilizationChange?: (mode: VideoStabilization) => void;
}

export default function CameraControls({
  onFlipCamera,
  onFlashToggle,
  torchEnabled = false,
  cameraFacing = "back",
  videoStabilizationMode = VideoStabilization.off,
  onVideoStabilizationChange,
}: CameraControlsProps) {
  // Trace prop changes for debugging
  React.useEffect(() => {
    console.log(
      `[CameraControls] facing=${cameraFacing} torch=${torchEnabled} stabilization=${videoStabilizationMode}`
    );
  }, [cameraFacing, torchEnabled, videoStabilizationMode]);
  const getTorchIcon = () => {
    return torchEnabled ? (
      <MaterialIcons name="flash-on" size={24} color="white" />
    ) : (
      <MaterialIcons name="flash-off" size={24} color="white" />
    );
  };

  return (
    <View style={styles.cameraControlsContainer}>
      <TouchableOpacity style={styles.controlButton} onPress={onFlipCamera}>
        <Ionicons name="camera-reverse-outline" size={24} color="white" />
      </TouchableOpacity>

      {/* Only show flash button for back camera */}
      {cameraFacing === "back" && (
        <TouchableOpacity
          style={[
            styles.controlButton,
            torchEnabled && styles.activeControlButton,
          ]}
          onPress={onFlashToggle}
        >
          {getTorchIcon()}
        </TouchableOpacity>
      )}

      {/* Video stabilization control (iOS only) */}
      {onVideoStabilizationChange && Platform.OS === "ios" && (
        <VideoStabilizationControl
          stabilizationMode={videoStabilizationMode}
          onStabilizationModeChange={onVideoStabilizationChange}
          compact
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cameraControlsContainer: {
    position: "absolute",
    right: 20,
    top: "40%",
    transform: [{ translateY: -20 }],
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  controlButton: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    width: 40,
    height: 40,
    borderRadius: 25,
    marginVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  activeControlButton: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  controlIcon: {
    fontSize: 18,
    color: "#ffffff",
    fontWeight: "600",
  },
});
