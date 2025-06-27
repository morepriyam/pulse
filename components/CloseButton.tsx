import { ThemedText } from "@/components/ThemedText";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { RecordingSegment } from "./RecordingProgressBar";

export interface CloseOption {
  label: string;
  action: "startOver" | "saveAsDraft" | "close";
}

interface CloseButtonProps {
  segments: RecordingSegment[];
  onStartOver: () => void;
  onSaveAsDraft: (segments: RecordingSegment[]) => void;
  hasStartedOver: boolean;
  onClose: () => void;
}

const closeOptions: CloseOption[] = [
  { label: "Start Over", action: "startOver" },
  { label: "Save as Draft", action: "saveAsDraft" },
  { label: "Close", action: "close" },
];

export default function CloseButton({
  segments,
  onStartOver,
  onSaveAsDraft,
  hasStartedOver,
  onClose,
}: CloseButtonProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleClosePress = () => {
    // If no segments OR user started over and hasn't recorded anything new, direct close
    if (segments.length === 0) {
      onClose();
    } else {
      // Show options modal - but since we have auto-save, "Save as Draft" might be redundant
      // We'll keep it for explicit user control
      setIsModalVisible(true);
    }
  };

  const handleOptionSelect = (option: CloseOption) => {
    setIsModalVisible(false);

    switch (option.action) {
      case "startOver":
        onStartOver();
        break;
      case "close":
        // Just close - auto-save has already handled saving if needed
        onClose();
        break;
      case "saveAsDraft":
        // Manual save (though auto-save has likely already handled this)
        onSaveAsDraft(segments);
        onClose();
        break;
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.closeButton} onPress={handleClosePress}>
        <ThemedText style={styles.closeText}>×</ThemedText>
      </TouchableOpacity>

      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsModalVisible(false)}
        >
          <View style={styles.modalContent}>
            {closeOptions.map((option) => (
              <TouchableOpacity
                key={option.action}
                style={styles.optionButton}
                onPress={() => handleOptionSelect(option)}
              >
                <ThemedText style={styles.optionText}>
                  {option.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    position: "absolute",
    top: 80, // Below the progress bar (which is at top: 60)
    left: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    width: 40,
    height: 40,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  closeText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
    fontFamily: "Roboto-Bold",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 8,
    minWidth: 150,
    borderWidth: 1,
    borderColor: "#333",
  },
  optionButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  optionText: {
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
    fontFamily: "Roboto-Regular",
  },
});
