import CameraControls from "@/components/CameraControls";
import CloseButton from "@/components/CloseButton";
import RecordButton from "@/components/RecordButton";
import RecordingProgressBar, {
  RecordingSegment,
} from "@/components/RecordingProgressBar";
import RedoSegmentButton from "@/components/RedoSegmentButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import TimeSelectorButton from "@/components/TimeSelectorButton";
import UndoSegmentButton from "@/components/UndoSegmentButton";
import { useDraftManager } from "@/hooks/useDraftManager";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { CameraType, CameraView } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import {
  PanGestureHandler,
  PinchGestureHandler,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedGestureHandler,
  useSharedValue,
} from "react-native-reanimated";

/**
 * Shorts recording screen - main camera interface for creating segmented videos.
 *
 * Features:
 * - Segmented video recording with tap/hold controls
 * - Pinch-to-zoom camera view
 * - Camera controls (flip, flash)
 * - Draft auto-save with undo/redo
 * - Time selector for recording duration
 */
export default function ShortsScreen() {
  const searchParams = useLocalSearchParams<{ 
    draftId?: string;
    uploadMode?: string;
    uploadUrl?: string;
    configMode?: string;
    config?: string;
  }>();
  const { draftId } = searchParams;
  
  // URL handling state
  const [uploadConfig, setUploadConfig] = React.useState<{
    enabled: boolean;
    url?: string;
  }>({ enabled: false });
  
  const [externalConfig, setExternalConfig] = React.useState<any>(null);

  const cameraRef = React.useRef<CameraView>(null);
  const [selectedDuration, setSelectedDuration] = React.useState(60);

  // Handle URL parameters on component mount
  React.useEffect(() => {
    if (searchParams.uploadMode === 'true' && searchParams.uploadUrl) {
      setUploadConfig({
        enabled: true,
        url: searchParams.uploadUrl,
      });
    }

    if (searchParams.configMode === 'true' && searchParams.config) {
      try {
        const configData = JSON.parse(decodeURIComponent(searchParams.config));
        setExternalConfig(configData);
        
        // Apply configuration settings
        if (configData.duration && typeof configData.duration === 'number') {
          setSelectedDuration(configData.duration);
        }
      } catch (error) {
        console.error('Error applying configuration:', error);
      }
    }
  }, [searchParams]);
  const [currentRecordingDuration, setCurrentRecordingDuration] =
    React.useState(0);

  // Use the draft manager hook
  const {
    recordingSegments,
    redoStack,
    currentDraftId,
    hasStartedOver,
    isContinuingLastDraft,
    showContinuingIndicator,
    handleStartOver,
    handleSaveAsDraft,
    handleClose,
    handleUndoSegment,
    handleRedoSegment,
    updateSegmentsAfterRecording,
  } = useDraftManager(draftId, selectedDuration);

  // Camera control states
  const [cameraFacing, setCameraFacing] = React.useState<CameraType>("back");
  const [torchEnabled, setTorchEnabled] = React.useState(false);
  const [isCameraSwitching, setIsCameraSwitching] = React.useState(false);
  const [previousCameraFacing, setPreviousCameraFacing] =
    React.useState<CameraType>("back");

  // Recording state
  const [isRecording, setIsRecording] = React.useState(false);

  // Screen-level touch state for continuous hold recording
  const [screenTouchActive, setScreenTouchActive] = React.useState(false);
  const [buttonPressActive, setButtonPressActive] = React.useState(false);

  // Zoom state
  const [zoom, setZoom] = React.useState(0);
  const savedZoom = useSharedValue(0);
  const currentZoom = useSharedValue(0);

  // Drag-to-zoom state
  const initialTouchY = useSharedValue(0);
  const currentTouchY = useSharedValue(0);
  const isHoldRecording = useSharedValue(false);
  const recordingModeShared = useSharedValue("");

  const totalUsedDuration = recordingSegments.reduce(
    (total, segment) => total + segment.duration,
    0
  );

  const handleRecordingStart = (
    mode: "tap" | "hold",
    remainingTime: number
  ) => {
    console.log(`Recording ${mode}, ${remainingTime}s left`);
    setCurrentRecordingDuration(0);
    setIsRecording(true);

    // Update shared values for gesture handler
    isHoldRecording.value = true;
    recordingModeShared.value = mode;
  };

  const handleRecordingProgress = (
    currentDuration: number,
    remainingTime: number
  ) => {
    setCurrentRecordingDuration(currentDuration);

    if (remainingTime <= 0) {
      console.log("Time limit reached");
    }
  };

  const handleRecordingComplete = async (
    videoUri: string | null,
    mode: "tap" | "hold",
    duration: number
  ) => {
    console.log(`${mode} done: ${duration}s`);

    setCurrentRecordingDuration(0);
    setIsRecording(false);

    // Reset shared values
    isHoldRecording.value = false;
    recordingModeShared.value = "";

    if (videoUri && duration > 0) {
      const newSegment: RecordingSegment = {
        id: Date.now().toString(),
        duration: duration,
        uri: videoUri,
      };

      await updateSegmentsAfterRecording(newSegment, selectedDuration);

      // Handle upload if upload mode is enabled
      if (uploadConfig.enabled && uploadConfig.url) {
        await handleUploadVideo(videoUri);
      }
    }
  };

  const handleUploadVideo = async (videoUri: string) => {
    if (!uploadConfig.url) return;

    try {
      console.log('Uploading video to:', uploadConfig.url);
      
      const formData = new FormData();
      formData.append('video', {
        uri: videoUri,
        type: 'video/mp4',
        name: 'pulse_video.mp4',
      } as any);

      // Add additional metadata if available from external config
      if (externalConfig) {
        formData.append('metadata', JSON.stringify(externalConfig));
      }

      const response = await fetch(uploadConfig.url, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.ok) {
        console.log('Video uploaded successfully');
        // Could show success notification here
      } else {
        console.error('Upload failed:', response.status, response.statusText);
        // Could show error notification here
      }
    } catch (error) {
      console.error('Upload error:', error);
      // Could show error notification here
    }
  };

  const handleTimeSelect = (timeInSeconds: number) => {
    setSelectedDuration(timeInSeconds);
  };

  const handleFlipCamera = () => {
    setIsCameraSwitching(true);
    // Reset zoom when switching cameras
    setZoom(0);
    savedZoom.value = 0;
    currentZoom.value = 0;

    setCameraFacing((current) => {
      setPreviousCameraFacing(current);
      const newFacing = current === "back" ? "front" : "back";
      if (newFacing === "front") {
        setTorchEnabled(false);
      }

      setTimeout(() => {
        setIsCameraSwitching(false);
      }, 300);

      return newFacing;
    });
  };

  const handleTorchToggle = () => {
    setTorchEnabled((current) => !current);
  };

  const handlePreview = () => {
    if (currentDraftId && recordingSegments.length > 0) {
      router.push({
        pathname: "/preview",
        params: { draftId: currentDraftId },
      });
    }
  };

  const handleSaveAsDraftWrapper = async (segments: RecordingSegment[]) => {
    await handleSaveAsDraft(segments, selectedDuration);
  };

  const handleUndoSegmentWrapper = async () => {
    await handleUndoSegment(selectedDuration);
  };

  const handleRedoSegmentWrapper = async () => {
    await handleRedoSegment(selectedDuration);
  };

  // Button touch coordination handlers
  const handleButtonTouchStart = () => {
    setButtonPressActive(true);
  };

  const handleButtonTouchEnd = () => {
    setButtonPressActive(false);
  };

  // Screen-level touch handler for continuous hold recording with drag-to-zoom
  const handleScreenPanGesture = useAnimatedGestureHandler({
    onStart: (event) => {
      runOnJS(setScreenTouchActive)(true);
      // Store initial touch position for zoom calculation
      initialTouchY.value = event.y;
      currentTouchY.value = event.y;
    },
    onActive: (event) => {
      currentTouchY.value = event.y;

      // Only apply zoom during hold recording
      if (isHoldRecording.value && recordingModeShared.value === "hold") {
        const deltaY = initialTouchY.value - event.y; // Negative = down, Positive = up

        // Convert pixel movement to zoom change with same sensitivity as pinch
        // Scale factor adjusted for touch movement (roughly 300px = full zoom range)
        const zoomChange =
          deltaY >= 0
            ? deltaY * 0.0013 // Drag up = zoom in (similar to pinch 0.4x sensitivity)
            : deltaY * 0.0023; // Drag down = zoom out (similar to pinch 0.7x sensitivity)

        const newZoom = Math.min(
          0.5,
          Math.max(0, savedZoom.value + zoomChange)
        );
        currentZoom.value = newZoom;
        runOnJS(setZoom)(newZoom);
      }
    },
    onEnd: () => {
      runOnJS(setScreenTouchActive)(false);
      // Save final zoom value when gesture ends
      if (isHoldRecording.value && recordingModeShared.value === "hold") {
        savedZoom.value = currentZoom.value;
      }
    },
    onCancel: () => {
      runOnJS(setScreenTouchActive)(false);
      // Save zoom state on cancel too
      if (isHoldRecording.value && recordingModeShared.value === "hold") {
        savedZoom.value = currentZoom.value;
      }
    },
    onFail: () => {
      runOnJS(setScreenTouchActive)(false);
      // Save zoom state on fail too
      if (isHoldRecording.value && recordingModeShared.value === "hold") {
        savedZoom.value = currentZoom.value;
      }
    },
  });

  const handleCloseWrapper = async () => {
    await handleClose();
    router.dismiss();
  };

  return (
    <ThemedView style={styles.container}>
      <PanGestureHandler onGestureEvent={handleScreenPanGesture}>
        <Animated.View style={{ flex: 1 }}>
          <PinchGestureHandler
            onGestureEvent={useAnimatedGestureHandler({
              onStart: () => {
                currentZoom.value = savedZoom.value;
              },
              onActive: (event) => {
                const scaleChange = event.scale - 1;

                // Asymmetric sensitivity compensates for scale math limitations
                const zoomChange =
                  scaleChange >= 0
                    ? scaleChange * 0.4 // Zoom in
                    : scaleChange * 0.7; // Zoom out (more sensitive)

                const newZoom = Math.min(
                  0.5,
                  Math.max(0, savedZoom.value + zoomChange)
                );
                currentZoom.value = newZoom;
                runOnJS(setZoom)(newZoom);
              },
              onEnd: () => {
                savedZoom.value = currentZoom.value;
              },
            })}
          >
            <Animated.View style={{ flex: 1 }}>
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                mode="video"
                facing={cameraFacing}
                enableTorch={torchEnabled}
                zoom={zoom}
              />
            </Animated.View>
          </PinchGestureHandler>

          {!isRecording && (
            <CameraControls
              onFlipCamera={handleFlipCamera}
              onFlashToggle={handleTorchToggle}
              torchEnabled={torchEnabled}
              cameraFacing={
                isCameraSwitching ? previousCameraFacing : cameraFacing
              }
            />
          )}

          {showContinuingIndicator && (
            <View style={styles.continuingDraftIndicator}>
              <ThemedText style={styles.continuingDraftText}>
                Continuing last draft
              </ThemedText>
            </View>
          )}

          {uploadConfig.enabled && (
            <View style={[styles.modeIndicator, { top: showContinuingIndicator ? '75%' : '70%' }]}>
              <ThemedText style={styles.modeIndicatorText}>
                Upload Mode Enabled
              </ThemedText>
            </View>
          )}

          {externalConfig && (
            <View style={[styles.modeIndicator, { 
              top: uploadConfig.enabled ? '80%' : (showContinuingIndicator ? '75%' : '70%') 
            }]}>
              <ThemedText style={styles.modeIndicatorText}>
                External Config Applied
              </ThemedText>
            </View>
          )}

          {!isRecording && (
            <View style={styles.timeSelectorContainer}>
              <TimeSelectorButton
                onTimeSelect={handleTimeSelect}
                selectedTime={selectedDuration}
              />
            </View>
          )}

          <RecordingProgressBar
            segments={recordingSegments}
            totalDuration={selectedDuration}
            currentRecordingDuration={currentRecordingDuration}
          />

          {isRecording && (
            <View style={styles.recordingTimeContainer}>
              <ThemedText style={styles.recordingTimeText}>
                {(() => {
                  const totalSeconds = Math.floor(
                    totalUsedDuration + currentRecordingDuration
                  );
                  const minutes = Math.floor(totalSeconds / 60);
                  const seconds = totalSeconds % 60;
                  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
                })()}
              </ThemedText>
            </View>
          )}

          {!isRecording && (
            <CloseButton
              segments={recordingSegments}
              onStartOver={handleStartOver}
              onSaveAsDraft={handleSaveAsDraftWrapper}
              hasStartedOver={hasStartedOver}
              onClose={handleCloseWrapper}
              isContinuingLastDraft={isContinuingLastDraft}
            />
          )}

          <RecordButton
            cameraRef={cameraRef}
            maxDuration={60}
            totalDuration={selectedDuration}
            usedDuration={totalUsedDuration}
            holdDelay={300}
            onRecordingStart={handleRecordingStart}
            onRecordingProgress={handleRecordingProgress}
            onRecordingComplete={handleRecordingComplete}
            onButtonTouchStart={handleButtonTouchStart}
            onButtonTouchEnd={handleButtonTouchEnd}
            screenTouchActive={screenTouchActive}
          />

          {recordingSegments.length > 0 && !isRecording && (
            <UndoSegmentButton onUndoSegment={handleUndoSegmentWrapper} />
          )}

          {redoStack.length > 0 && !isRecording && (
            <RedoSegmentButton onRedoSegment={handleRedoSegmentWrapper} />
          )}

          {recordingSegments.length > 0 && currentDraftId && !isRecording && (
            <TouchableOpacity
              style={styles.previewButton}
              onPress={handlePreview}
            >
              <MaterialIcons name="done" size={26} color="black" />
            </TouchableOpacity>
          )}
        </Animated.View>
      </PanGestureHandler>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  continuingDraftIndicator: {
    position: "absolute",
    top: "70%",
    left: 50,
    right: 50,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 80,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 10,
  },
  continuingDraftText: {
    color: "#ffffff",
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Roboto-Regular",
  },
  modeIndicator: {
    position: "absolute",
    left: 50,
    right: 50,
    backgroundColor: "rgba(0, 120, 0, 0.8)",
    borderRadius: 80,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 10,
  },
  modeIndicatorText: {
    color: "#ffffff",
    fontSize: 12,
    textAlign: "center",
    fontFamily: "Roboto-Regular",
  },
  timeSelectorContainer: {
    position: "absolute",
    top: 80,
    right: 25,
    zIndex: 10,
  },
  previewButton: {
    position: "absolute",
    bottom: 40,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  recordingTimeContainer: {
    position: "absolute",
    top: 78,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  recordingTimeText: {
    color: "#ffffff",
    fontSize: 18,
    fontFamily: "Roboto-Bold",
    textShadowColor: "rgba(0, 0, 0, 0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
