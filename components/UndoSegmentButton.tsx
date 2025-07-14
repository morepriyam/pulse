import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";

interface UndoSegmentButtonProps {
  onUndoSegment: () => void;
  disabled?: boolean;
}

export default function UndoSegmentButton({
  onUndoSegment,
  disabled = false,
}: UndoSegmentButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.undoButton, disabled && styles.disabled]}
      onPress={onUndoSegment}
      disabled={disabled}
    >
      <MaterialIcons
        name="undo"
        size={24}
        color={disabled ? "#666" : "#ffffff"}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  undoButton: {
    position: "absolute",
    bottom: 40,
    left: 20,
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
