import { CameraView } from "expo-camera";
import * as React from "react";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";

interface RecordButtonProps {
  cameraRef: React.RefObject<CameraView | null>;
  maxDuration?: number;
  onRecordingStart?: (mode: "tap" | "hold", remainingTime: number) => void;
  onRecordingComplete?: (
    videoUri: string | null,
    mode: "tap" | "hold",
    duration: number
  ) => void;
  onRecordingProgress?: (
    currentDuration: number,
    remainingTime: number
  ) => void;
  holdDelay?: number;
  style?: any;
  totalDuration: number;
  usedDuration: number;
  // New props for screen-level touch coordination
  onButtonTouchStart?: () => void;
  onButtonTouchEnd?: () => void;
  screenTouchActive?: boolean;
}

export default function RecordButton({
  cameraRef,
  maxDuration = 60,
  onRecordingStart,
  onRecordingComplete,
  onRecordingProgress,
  holdDelay = 500,
  style,
  totalDuration,
  usedDuration,
  // New props for screen-level touch coordination
  onButtonTouchStart,
  onButtonTouchEnd,
  screenTouchActive = false,
}: RecordButtonProps) {
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingMode, setRecordingMode] = React.useState<
    "tap" | "hold" | null
  >(null);
  const [isHoldingForRecord, setIsHoldingForRecord] = React.useState(false);
  // Track if current recording session was initiated by this button
  const [buttonInitiatedRecording, setButtonInitiatedRecording] =
    React.useState(false);

  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const borderRadiusAnim = React.useRef(new Animated.Value(30)).current;
  const outerBorderScaleAnim = React.useRef(new Animated.Value(1)).current;
  const pulsingRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const holdTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pressStartTimeRef = React.useRef<number>(0);
  const recordingPromiseRef = React.useRef<Promise<any> | null>(null);
  const manuallyStoppedRef = React.useRef(false);
  const isHoldingRef = React.useRef(false);

  const recordingStartTimeRef = React.useRef<number>(0);
  const progressIntervalRef = React.useRef<ReturnType<
    typeof setInterval
  > | null>(null);

  const remainingTime = totalDuration - usedDuration;

  // Handle screen-level touch end for hold recording
  React.useEffect(() => {
    if (
      !screenTouchActive &&
      buttonInitiatedRecording &&
      isRecording &&
      recordingMode === "hold"
    ) {
      // Screen touch ended, stop hold recording
      stopRecording();
      stopHoldVisualFeedback();
      setButtonInitiatedRecording(false);
    }
  }, [screenTouchActive, buttonInitiatedRecording, isRecording, recordingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = (mode: "tap" | "hold") => {
    if (!cameraRef.current || isRecording || remainingTime <= 0) return;

    setIsRecording(true);
    setRecordingMode(mode);
    setButtonInitiatedRecording(true);
    manuallyStoppedRef.current = false;
    recordingStartTimeRef.current = Date.now();

    const sessionMaxDuration = Math.min(maxDuration, remainingTime);
    onRecordingStart?.(mode, remainingTime);
    progressIntervalRef.current = setInterval(() => {
      const currentRecordingDuration =
        (Date.now() - recordingStartTimeRef.current) / 1000;
      const newRemainingTime = remainingTime - currentRecordingDuration;

      onRecordingProgress?.(
        currentRecordingDuration,
        Math.max(0, newRemainingTime)
      );

      if (newRemainingTime <= 0) {
        stopRecording();
        if (mode === "hold") {
          stopHoldVisualFeedback();
        } else if (mode === "tap") {
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
      }
    }, 100);

    if (mode === "tap") {
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

    recordingPromiseRef.current = cameraRef.current
      .recordAsync({ maxDuration: sessionMaxDuration })
      .then((video) => {
        const recordingDuration =
          (Date.now() - recordingStartTimeRef.current) / 1000;

        if (!manuallyStoppedRef.current && video?.uri) {
          console.log("Recording saved:", video.uri);
        }
        onRecordingComplete?.(video?.uri || null, mode, recordingDuration);
        return video;
      })
      .catch((error) => {
        const recordingDuration =
          (Date.now() - recordingStartTimeRef.current) / 1000;

        if (!error.message?.includes("stopped")) {
          console.log("Recording failed");
        }
        onRecordingComplete?.(null, mode, recordingDuration);
        return null;
      })
      .finally(() => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }

        setIsRecording(false);
        setRecordingMode(null);
        setButtonInitiatedRecording(false);
        recordingPromiseRef.current = null;
        manuallyStoppedRef.current = false;
      });
  };

  const startHoldVisualFeedback = () => {
    setIsHoldingForRecord(true);
    isHoldingRef.current = true;

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

    manuallyStoppedRef.current = true;

    try {
      if (recordingPromiseRef.current) {
        cameraRef.current.stopRecording();
        await recordingPromiseRef.current;
      }
    } catch {
      // Error handling in promise handlers
    }

    if (recordingMode === "tap") {
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
    const pressDuration = Date.now() - pressStartTimeRef.current;

    // Quick press = tap, longer press was hold operation
    if (pressDuration < 200) {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording("tap");
      }
    }
  };

  const handlePressIn = () => {
    pressStartTimeRef.current = Date.now();

    // Notify parent that button touch started
    onButtonTouchStart?.();

    if (!isRecording && !isHoldingForRecord) {
      startHoldVisualFeedback();

      holdTimeoutRef.current = setTimeout(() => {
        if (isHoldingRef.current) {
          startRecording("hold");
        }
      }, holdDelay);
    }
  };

  const handlePressOut = () => {
    // Notify parent that button touch ended
    onButtonTouchEnd?.();

    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    // Only stop hold recording on button press out if we're not using screen-level touch detection
    // or if the screen touch is also inactive
    if (isRecording && recordingMode === "hold") {
      // If we have screen-level touch coordination, let the useEffect handle stopping
      // Otherwise, stop immediately on press out
      if (!onButtonTouchStart || !screenTouchActive) {
        stopRecording();
        stopHoldVisualFeedback();
        setButtonInitiatedRecording(false);
      }
    } else if (isHoldingForRecord) {
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
