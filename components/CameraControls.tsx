import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface CameraControlsProps {
  onFlipCamera?: () => void;
  onFlashToggle?: () => void;
  torchEnabled?: boolean;
}

export default function CameraControls({
  onFlipCamera,
  onFlashToggle,
  torchEnabled = false,
}: CameraControlsProps) {
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

      <TouchableOpacity
        style={[
          styles.controlButton,
          torchEnabled && styles.activeControlButton,
        ]}
        onPress={onFlashToggle}
      >
        {getTorchIcon()}
      </TouchableOpacity>
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
