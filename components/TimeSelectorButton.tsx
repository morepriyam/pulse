import { ThemedText } from "@/components/ThemedText";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

export interface TimeOption {
  label: string;
  value: number;
}

interface TimeSelectorButtonProps {
  onTimeSelect: (timeInSeconds: number) => void;
  selectedTime: number;
}

const timeOptions: TimeOption[] = [
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "3m", value: 180 },
];

export default function TimeSelectorButton({
  onTimeSelect,
  selectedTime,
}: TimeSelectorButtonProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const selectedOption = timeOptions.find(
    (option) => option.value === selectedTime
  );

  const handleOptionSelect = (option: TimeOption) => {
    onTimeSelect(option.value);
    setIsModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.selectorButton}
        onPress={() => setIsModalVisible(true)}
      >
        <ThemedText style={styles.selectorText}>
          {selectedOption?.label || "1m"}
        </ThemedText>
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
            {timeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  selectedTime === option.value && styles.selectedOption,
                ]}
                onPress={() => handleOptionSelect(option)}
              >
                <ThemedText
                  style={[
                    styles.optionText,
                    selectedTime === option.value && styles.selectedOptionText,
                  ]}
                >
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
  selectorButton: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    width: 40,
    height: 40,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  selectorText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Roboto-Bold",
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
    minWidth: 100,
    borderWidth: 1,
    borderColor: "#333",
  },
  optionButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  selectedOption: {
    backgroundColor: "#ff0000",
  },
  optionText: {
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
    fontFamily: "Roboto-Regular",
  },
  selectedOptionText: {
    fontWeight: "600",
    fontFamily: "Roboto-Bold",
  },
});
