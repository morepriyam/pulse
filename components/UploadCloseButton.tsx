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

interface UploadCloseButtonProps {
  segments: RecordingSegment[];
  onStartOver: () => void;
  hasStartedOver: boolean;
  onClose?: () => void;
}

const closeOptions = [
  { label: "Start Over", action: "startOver" as const },
  { label: "Close", action: "close" as const },
];

export default function UploadCloseButton({
  segments,
  onStartOver,
  hasStartedOver,
  onClose,
}: UploadCloseButtonProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleClosePress = () => {
    if (segments.length === 0) {
      onClose?.();
    } else {
      setIsModalVisible(true);
    }
  };

  const handleOptionSelect = (action: "startOver" | "close") => {
    setIsModalVisible(false);

    switch (action) {
      case "startOver":
        onStartOver();
        break;
      case "close":
        onClose?.();
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
                onPress={() => handleOptionSelect(option.action)}
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
    top: 80,
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
