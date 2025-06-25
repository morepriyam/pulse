import { CameraView } from "expo-camera";
import * as React from "react";
import {
  Alert,
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

interface RecordButtonProps {
  cameraRef: React.RefObject<CameraView | null>;
  maxDuration?: number;
  onRecordingStart?: (mode: "tap" | "hold") => void;
  onRecordingComplete?: (videoUri: string | null, mode: "tap" | "hold") => void;
  holdDelay?: number;
  style?: any;
}

export default function RecordButton({
  cameraRef,
  maxDuration = 60,
  onRecordingStart,
  onRecordingComplete,
  holdDelay = 500,
  style,
}: RecordButtonProps) {
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingMode, setRecordingMode] = React.useState<
    "tap" | "hold" | null
  >(null);
  const [isHoldingForRecord, setIsHoldingForRecord] = React.useState(false);

  // Animations for tap mode (inner button)
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const borderRadiusAnim = React.useRef(new Animated.Value(30)).current;

  // Animation for hold mode (outer border pulse only)
  const outerBorderScaleAnim = React.useRef(new Animated.Value(1)).current;
  const pulsingRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const holdTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const pressStartTimeRef = React.useRef<number>(0);
  const recordingPromiseRef = React.useRef<Promise<any> | null>(null);
  const manuallyStoppedRef = React.useRef(false);
  const isHoldingRef = React.useRef(false);

  const startRecording = (mode: "tap" | "hold") => {
    if (!cameraRef.current || isRecording) return;

    setIsRecording(true);
    setRecordingMode(mode);
    manuallyStoppedRef.current = false;

    // Call optional callback
    onRecordingStart?.(mode);

    if (mode === "tap") {
      // Tap mode: shrink to square
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
    }

    // Shared recording logic
    recordingPromiseRef.current = cameraRef.current
      .recordAsync({ maxDuration })
      .then((video) => {
        // Only show alert if not manually stopped
        if (!manuallyStoppedRef.current && video?.uri) {
          Alert.alert("Recording Complete", `Video saved to: ${video.uri}`);
        }
        // Call optional callback
        onRecordingComplete?.(video?.uri || null, mode);
        return video;
      })
      .catch((error) => {
        // For manual stops, don't show error
        if (!error.message?.includes("stopped")) {
          Alert.alert("Recording Error", "Failed to record video");
        }
        onRecordingComplete?.(null, mode);
        return null;
      })
      .finally(() => {
        setIsRecording(false);
        setRecordingMode(null);
        recordingPromiseRef.current = null;
        manuallyStoppedRef.current = false;
      });
  };

  const startHoldVisualFeedback = () => {
    setIsHoldingForRecord(true);
    isHoldingRef.current = true;

    // Start pulsing immediately for visual feedback
    const startPulsing = () => {
      pulsingRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(outerBorderScaleAnim, {
            toValue: 1.4,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(outerBorderScaleAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: false,
          }),
        ])
      );
      pulsingRef.current.start();
    };
    startPulsing();
  };

  const stopHoldVisualFeedback = () => {
    setIsHoldingForRecord(false);
    isHoldingRef.current = false;

    // Stop pulsing and reset outer border
    if (pulsingRef.current) {
      pulsingRef.current.stop();
    }
    Animated.timing(outerBorderScaleAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const stopRecording = async () => {
    if (!cameraRef.current || !isRecording) return;

    // Mark as manually stopped
    manuallyStoppedRef.current = true;

    // Stop the recording and wait for the result
    try {
      if (recordingPromiseRef.current) {
        cameraRef.current.stopRecording();
        const video = await recordingPromiseRef.current;

        // Show the same alert for both modes
        if (video?.uri) {
          Alert.alert("Recording Complete", `Video saved to: ${video.uri}`);
        } else {
          Alert.alert(
            "Recording Complete",
            "Video recording finished successfully"
          );
        }

        // Call optional callback
        onRecordingComplete?.(video?.uri || null, recordingMode!);
      }
    } catch (error) {
      Alert.alert(
        "Recording Complete",
        "Video recording finished successfully"
      );
      onRecordingComplete?.(null, recordingMode!);
    }

    if (recordingMode === "tap") {
      // Reset tap animations
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
    }
  };

  const handleRecordPress = () => {
    // Calculate press duration to differentiate between tap and hold
    const pressDuration = Date.now() - pressStartTimeRef.current;

    // If it was a quick press (less than 200ms), treat as tap
    // If it was a longer press, ignore (it was a hold operation)
    if (pressDuration < 200) {
      isRecording ? stopRecording() : startRecording("tap");
    }
  };

  const handlePressIn = () => {
    pressStartTimeRef.current = Date.now();

    if (!isRecording && !isHoldingForRecord) {
      // Start visual feedback immediately
      startHoldVisualFeedback();

      // Start actual recording after delay
      holdTimeoutRef.current = setTimeout(() => {
        if (isHoldingRef.current) {
          startRecording("hold");
        }
      }, holdDelay);
    }
  };

  const handlePressOut = () => {
    // Clear the timeout if user releases before delay
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    if (isRecording && recordingMode === "hold") {
      // Stop recording if actually recording
      stopRecording();
      stopHoldVisualFeedback();
    } else if (isHoldingForRecord) {
      // Just stop visual feedback if only holding (not yet recording)
      stopHoldVisualFeedback();
    }
  };

  return (
    <View style={[styles.buttonContainer, style]}>
      {/* Pulsing outer border for hold mode */}
      <Animated.View
        style={[
          styles.outerBorder,
          (isRecording || isHoldingForRecord) && styles.outerBorderActive,
          {
            transform: [{ scale: outerBorderScaleAnim }],
          },
        ]}
      />

      {/* Semi-transparent background that pulses during hold mode */}
      <Animated.View
        style={[
          styles.recordButton,
          {
            transform: [{ scale: outerBorderScaleAnim }],
          },
        ]}
      />

      {/* Static center button with tap animation only */}
      <TouchableOpacity
        style={styles.touchableArea}
        onPress={handleRecordPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
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
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  outerBorder: {
    position: "absolute",
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: "#ffffff",
    backgroundColor: "transparent",
  },
  outerBorderActive: {
    borderColor: "#ff0000",
  },
  recordButton: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(17, 17, 17, 0.5)",
  },
  touchableArea: {
    position: "absolute",
    width: 76,
    height: 76,
    justifyContent: "center",
    alignItems: "center",
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
