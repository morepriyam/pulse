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
import { DraftStorage } from "@/utils/draftStorage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraType, CameraView } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { PinchGestureHandler } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedGestureHandler,
  useSharedValue,
} from "react-native-reanimated";

const REDO_STACK_KEY = "redo_stack";

export default function ShortsScreen() {
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const cameraRef = React.useRef<CameraView>(null);
  const [selectedDuration, setSelectedDuration] = React.useState(60);
  const [recordingSegments, setRecordingSegments] = React.useState<
    RecordingSegment[]
  >([]);
  const [redoStack, setRedoStack] = React.useState<RecordingSegment[]>([]);
  const [currentRecordingDuration, setCurrentRecordingDuration] =
    React.useState(0);
  const [currentDraftId, setCurrentDraftId] = React.useState<string | null>(
    null
  );
  const [originalDraftId, setOriginalDraftId] = React.useState<string | null>(
    null
  );
  const [hasStartedOver, setHasStartedOver] = React.useState(false);
  const [isContinuingLastDraft, setIsContinuingLastDraft] =
    React.useState(false);
  const [showContinuingIndicator, setShowContinuingIndicator] =
    React.useState(false);

  // Camera control states
  const [cameraFacing, setCameraFacing] = React.useState<CameraType>("back");
  const [torchEnabled, setTorchEnabled] = React.useState(false);
  const [isCameraSwitching, setIsCameraSwitching] = React.useState(false);
  const [previousCameraFacing, setPreviousCameraFacing] =
    React.useState<CameraType>("back");

  // Recording state
  const [isRecording, setIsRecording] = React.useState(false);

  const [zoom, setZoom] = React.useState(0);
  const savedZoom = useSharedValue(0);
  const currentZoom = useSharedValue(0);

  const isLoadingDraft = React.useRef(false);
  const lastSegmentCount = React.useRef(0);

  React.useEffect(() => {
    const loadDraft = async () => {
      isLoadingDraft.current = true;
      try {
        let draftToLoad = null;
        const savedRedoData = await AsyncStorage.getItem(REDO_STACK_KEY);
        let redoData = null;

        if (savedRedoData) {
          try {
            redoData = JSON.parse(savedRedoData);
            if (Array.isArray(redoData)) {
              redoData = { draftId: null, segments: redoData };
            }
          } catch {
            redoData = null;
          }
        }

        if (draftId) {
          draftToLoad = await DraftStorage.getDraftById(draftId);
          setIsContinuingLastDraft(false);
        } else {
          draftToLoad = await DraftStorage.getLastModifiedDraft();

          const redoBelongsToCurrentDraft =
            redoData &&
            redoData.draftId &&
            draftToLoad &&
            redoData.draftId === draftToLoad.id;

          if (
            redoData &&
            redoData.segments.length > 0 &&
            !redoBelongsToCurrentDraft
          ) {
            draftToLoad = null;
            setIsContinuingLastDraft(false);
          } else {
            setIsContinuingLastDraft(
              !!draftToLoad && (!redoData || redoData.segments.length === 0)
            );
          }
        }

        if (draftToLoad) {
          setRecordingSegments(draftToLoad.segments);
          setSelectedDuration(draftToLoad.totalDuration);
          setCurrentDraftId(draftToLoad.id);
          setOriginalDraftId(draftToLoad.id);
          lastSegmentCount.current = draftToLoad.segments.length;
        }

        if (redoData && redoData.segments) {
          const shouldLoadRedoStack = draftToLoad
            ? redoData.draftId === draftToLoad.id
            : !redoData.draftId;

          if (shouldLoadRedoStack) {
            setRedoStack(redoData.segments);
          } else {
            setRedoStack([]);
          }
        } else {
          setRedoStack([]);
        }
      } catch (error) {
        console.error("Error loading draft:", error);
      } finally {
        isLoadingDraft.current = false;
      }
    };

    loadDraft();
  }, [draftId]);

  React.useEffect(() => {
    if (isContinuingLastDraft && recordingSegments.length > 0) {
      setShowContinuingIndicator(true);
      const hideTimer = setTimeout(() => {
        setShowContinuingIndicator(false);
        setIsContinuingLastDraft(false);
      }, 1000);

      return () => clearTimeout(hideTimer);
    }
  }, [isContinuingLastDraft]);
  React.useEffect(() => {
    const autoSave = async () => {
      if (recordingSegments.length === 0 || isLoadingDraft.current) {
        return;
      }

      if (recordingSegments.length <= lastSegmentCount.current) {
        return;
      }

      try {
        if (currentDraftId) {
          await DraftStorage.updateDraft(
            currentDraftId,
            recordingSegments,
            selectedDuration
          );
          console.log("Auto-saved:", currentDraftId);
        } else {
          const newDraftId = await DraftStorage.saveDraft(
            recordingSegments,
            selectedDuration
          );
          setCurrentDraftId(newDraftId);
          setHasStartedOver(false);
          console.log("New draft:", newDraftId);
        }

        lastSegmentCount.current = recordingSegments.length;
      } catch (error) {
        console.error("Auto-save failed:", error);
      }
    };

    const timeoutId = setTimeout(autoSave, 1000);
    return () => clearTimeout(timeoutId);
  }, [recordingSegments, selectedDuration, currentDraftId]);

  React.useEffect(() => {
    const saveRedoStack = async () => {
      try {
        const redoData = {
          draftId: currentDraftId,
          segments: redoStack,
        };
        await AsyncStorage.setItem(REDO_STACK_KEY, JSON.stringify(redoData));
      } catch (error) {
        console.error("Error saving redo stack:", error);
      }
    };

    saveRedoStack();
  }, [redoStack, currentDraftId]);

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

    if (videoUri && duration > 0) {
      setRedoStack([]);

      const newSegment: RecordingSegment = {
        id: Date.now().toString(),
        duration: duration,
        uri: videoUri,
      };

      const updatedSegments = [...recordingSegments, newSegment];
      setRecordingSegments(updatedSegments);

      try {
        if (currentDraftId) {
          await DraftStorage.updateDraft(
            currentDraftId,
            updatedSegments,
            selectedDuration
          );
          console.log("Saved:", currentDraftId);
        } else {
          const newDraftId = await DraftStorage.saveDraft(
            updatedSegments,
            selectedDuration
          );
          setCurrentDraftId(newDraftId);
          setHasStartedOver(false);
          console.log("New draft:", newDraftId);
        }

        lastSegmentCount.current = updatedSegments.length;
      } catch (error) {
        console.error("Save failed:", error);
      }
    }
  };

  const handleTimeSelect = (timeInSeconds: number) => {
    setSelectedDuration(timeInSeconds);
  };

  const handleClearSegments = () => {
    setRecordingSegments([]);
    setCurrentRecordingDuration(0);
    setRedoStack([]);
  };

  const handleStartOver = () => {
    handleClearSegments();
    setCurrentDraftId(null);
    setHasStartedOver(true);
    lastSegmentCount.current = 0;
  };

  const handleSaveAsDraft = async (segments: RecordingSegment[]) => {
    try {
      if (currentDraftId && !hasStartedOver) {
        await DraftStorage.updateDraft(
          currentDraftId,
          segments,
          selectedDuration
        );
        console.log("Saved & reset:", currentDraftId);
      } else {
        const draftId = await DraftStorage.saveDraft(
          segments,
          selectedDuration
        );
        console.log("New draft & reset:", draftId);
      }

      handleStartOver();
      setIsContinuingLastDraft(false);
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  const handleClose = async () => {
    if (hasStartedOver && originalDraftId && recordingSegments.length === 0) {
      try {
        await DraftStorage.deleteDraft(originalDraftId);
        console.log("Deleted original:", originalDraftId);
      } catch (error) {
        console.error("Delete failed:", error);
      }
    }

    if (recordingSegments.length === 0) {
      try {
        await AsyncStorage.removeItem(REDO_STACK_KEY);
        setRedoStack([]);
        console.log("Cleared redo stack on close");
      } catch (error) {
        console.error("Failed to clear redo stack:", error);
      }
    }

    router.dismiss();
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

  const handleUndoSegment = async () => {
    if (recordingSegments.length > 0) {
      const lastSegment = recordingSegments[recordingSegments.length - 1];
      const updatedSegments = recordingSegments.slice(0, -1);

      setRedoStack((prev) => [...prev, lastSegment]);

      setRecordingSegments(updatedSegments);
      setCurrentRecordingDuration(0);

      lastSegmentCount.current = updatedSegments.length;

      if (currentDraftId) {
        try {
          if (updatedSegments.length === 0) {
            await DraftStorage.deleteDraft(currentDraftId);
            setCurrentDraftId(null);
            setHasStartedOver(false);
            console.log("Draft deleted:", currentDraftId);
          } else {
            await DraftStorage.updateDraft(
              currentDraftId,
              updatedSegments,
              selectedDuration
            );
            console.log("Undo saved:", currentDraftId);
          }
        } catch (error) {
          console.error("Undo failed:", error);

          setRecordingSegments(recordingSegments);
          setRedoStack(redoStack);
          lastSegmentCount.current = recordingSegments.length;
        }
      }
    }
  };

  const handleRedoSegment = async () => {
    if (redoStack.length > 0) {
      const segmentToRestore = redoStack[redoStack.length - 1];
      const updatedRedoStack = redoStack.slice(0, -1);

      setRedoStack(updatedRedoStack);

      const updatedSegments = [...recordingSegments, segmentToRestore];
      setRecordingSegments(updatedSegments);
      setCurrentRecordingDuration(0);

      lastSegmentCount.current = updatedSegments.length;

      try {
        if (!currentDraftId) {
          const newDraftId = await DraftStorage.saveDraft(
            updatedSegments,
            selectedDuration
          );
          setCurrentDraftId(newDraftId);
          setHasStartedOver(false);
          console.log("New draft created on redo:", newDraftId);
        } else {
          await DraftStorage.updateDraft(
            currentDraftId,
            updatedSegments,
            selectedDuration
          );
          console.log("Redo saved:", currentDraftId);
        }
      } catch (error) {
        console.error("Redo failed:", error);
        setRecordingSegments(recordingSegments);
        setRedoStack(redoStack);
        lastSegmentCount.current = recordingSegments.length;
      }
    }
  };

  return (
    <ThemedView style={styles.container}>
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
          cameraFacing={isCameraSwitching ? previousCameraFacing : cameraFacing}
        />
      )}

      {showContinuingIndicator && (
        <View style={styles.continuingDraftIndicator}>
          <ThemedText style={styles.continuingDraftText}>
            Continuing last draft
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
          onSaveAsDraft={handleSaveAsDraft}
          hasStartedOver={hasStartedOver}
          onClose={handleClose}
          isContinuingLastDraft={isContinuingLastDraft}
        />
      )}

      <RecordButton
        cameraRef={cameraRef}
        maxDuration={60}
        totalDuration={selectedDuration}
        usedDuration={totalUsedDuration}
        holdDelay={500}
        onRecordingStart={handleRecordingStart}
        onRecordingProgress={handleRecordingProgress}
        onRecordingComplete={handleRecordingComplete}
      />

      {recordingSegments.length > 0 && !isRecording && (
        <UndoSegmentButton onUndoSegment={handleUndoSegment} />
      )}

      {redoStack.length > 0 && !isRecording && (
        <RedoSegmentButton onRedoSegment={handleRedoSegment} />
      )}

      {recordingSegments.length > 0 && currentDraftId && !isRecording && (
        <TouchableOpacity style={styles.previewButton} onPress={handlePreview}>
          <MaterialIcons name="done" size={26} color="black" />
        </TouchableOpacity>
      )}
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
