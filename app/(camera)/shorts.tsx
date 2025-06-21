import { ThemedView } from "@/components/ThemedView";
import { CameraView } from "expo-camera";
import * as React from "react";
import {
  Alert,
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

export default function ShortsScreen() {
  const cameraRef = React.useRef<CameraView>(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const borderRadiusAnim = React.useRef(new Animated.Value(30)).current;

  const startRecording = () => {
    if (!cameraRef.current || isRecording) return;

    setIsRecording(true);

    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.4,
          duration: 150,
          useNativeDriver: false,
        }),
        Animated.timing(borderRadiusAnim, {
          toValue: 8,
          duration: 150,
          useNativeDriver: false,
        }),
      ]),
    ]).start();

    cameraRef.current
      .recordAsync({ maxDuration: 60 })
      .then((video) => {
        if (video?.uri) {
          Alert.alert("Recording Complete", `Video saved to: ${video.uri}`);
        }
      })
      .catch((error) => {
        if (!error.message?.includes("stopped")) {
          Alert.alert("Recording Error", "Failed to record video");
        }
      })
      .finally(() => setIsRecording(false));
  };

  const stopRecording = () => {
    if (!cameraRef.current || !isRecording) return;

    cameraRef.current.stopRecording();

    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(borderRadiusAnim, {
        toValue: 30,
        duration: 150,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const handleRecordPress = () => {
    isRecording ? stopRecording() : startRecording();
  };

  return (
    <ThemedView style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        mode="video"
        facing="back"
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording && styles.recordButtonActive,
          ]}
          onPress={handleRecordPress}
          activeOpacity={0.8}
        >
          <Animated.View
            style={[
              styles.innerButton,
              {
                transform: [{ scale: scaleAnim }],
                borderRadius: borderRadiusAnim,
                backgroundColor: "#ff0000",
              },
            ]}
          />
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(17, 17, 17, 0.5)",
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  recordButtonActive: {
    backgroundColor: "rgba(17, 17, 17, 0.5)",
    borderColor: "#ff0000",
  },
  innerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#ff0000",
    justifyContent: "center",
    alignItems: "center",
  },
});
