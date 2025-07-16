import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";

interface RedoSegmentButtonProps {
  onRedoSegment: () => void;
  disabled?: boolean;
}

export default function RedoSegmentButton({
  onRedoSegment,
  disabled = false,
}: RedoSegmentButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.redoButton, disabled && styles.disabled]}
      onPress={onRedoSegment}
      disabled={disabled}
    >
      <MaterialIcons
        name="redo"
        size={24}
        color={disabled ? "#666" : "#ffffff"}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  redoButton: {
    position: "absolute",
    bottom: 40,
    left: 75,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  disabled: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
});
