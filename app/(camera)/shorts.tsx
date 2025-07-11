import CameraControls from "@/components/CameraControls";
import CloseButton from "@/components/CloseButton";
import RecordButton from "@/components/RecordButton";
import RecordingProgressBar, {
  RecordingSegment,
} from "@/components/RecordingProgressBar";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import TimeSelectorButton from "@/components/TimeSelectorButton";
import { DraftStorage } from "@/utils/draftStorage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { CameraType, CameraView } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

export default function ShortsScreen() {
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const cameraRef = React.useRef<CameraView>(null);
  const [selectedDuration, setSelectedDuration] = React.useState(60);
  const [recordingSegments, setRecordingSegments] = React.useState<
    RecordingSegment[]
  >([]);
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

  const isLoadingDraft = React.useRef(false);
  const lastSegmentCount = React.useRef(0);

  React.useEffect(() => {
    const loadDraft = async () => {
      isLoadingDraft.current = true;
      try {
        let draftToLoad = null;

        if (draftId) {
          draftToLoad = await DraftStorage.getDraftById(draftId);
          setIsContinuingLastDraft(false);
        } else {
          // Get the most recently modified draft
          draftToLoad = await DraftStorage.getLastModifiedDraft();
          setIsContinuingLastDraft(!!draftToLoad);
        }

        if (draftToLoad) {
          setRecordingSegments(draftToLoad.segments);
          setSelectedDuration(draftToLoad.totalDuration);
          setCurrentDraftId(draftToLoad.id);
          setOriginalDraftId(draftToLoad.id);
          lastSegmentCount.current = draftToLoad.segments.length;
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
      }, 1000);

      return () => clearTimeout(hideTimer);
    } else {
      setShowContinuingIndicator(false);
    }
  }, [isContinuingLastDraft, recordingSegments.length]);

  React.useEffect(() => {
    if (
      isContinuingLastDraft &&
      recordingSegments.length > lastSegmentCount.current
    ) {
      setIsContinuingLastDraft(false);
    }
  }, [recordingSegments.length, isContinuingLastDraft]);

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
          console.log("Auto-saved to existing draft:", currentDraftId);
        } else {
          const newDraftId = await DraftStorage.saveDraft(
            recordingSegments,
            selectedDuration
          );
          setCurrentDraftId(newDraftId);
          setHasStartedOver(false);
          console.log("Auto-saved as new draft:", newDraftId);
        }

        lastSegmentCount.current = recordingSegments.length;
      } catch (error) {
        console.error("Error auto-saving draft:", error);
      }
    };

    const timeoutId = setTimeout(autoSave, 1000);
    return () => clearTimeout(timeoutId);
  }, [recordingSegments, selectedDuration, currentDraftId]);

  const totalUsedDuration = recordingSegments.reduce(
    (total, segment) => total + segment.duration,
    0
  );

  const handleRecordingStart = (
    mode: "tap" | "hold",
    remainingTime: number
  ) => {
    console.log(`Started ${mode} recording with ${remainingTime}s remaining`);
    setCurrentRecordingDuration(0);
  };

  const handleRecordingProgress = (
    currentDuration: number,
    remainingTime: number
  ) => {
    setCurrentRecordingDuration(currentDuration);

    if (remainingTime <= 0) {
      console.log("Recording will stop - time limit reached");
    }
  };

  const handleRecordingComplete = (
    videoUri: string | null,
    mode: "tap" | "hold",
    duration: number
  ) => {
    console.log(
      `Completed ${mode} recording:`,
      videoUri,
      `Duration: ${duration}s`
    );

    setCurrentRecordingDuration(0);

    if (videoUri && duration > 0) {
      const newSegment: RecordingSegment = {
        id: Date.now().toString(),
        duration: duration,
        uri: videoUri,
      };

      setRecordingSegments((prev) => [...prev, newSegment]);
    }
  };

  const handleTimeSelect = (timeInSeconds: number) => {
    setSelectedDuration(timeInSeconds);
  };

  const handleClearSegments = () => {
    setRecordingSegments([]);
    setCurrentRecordingDuration(0);
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
        console.log("Saved draft and starting over:", currentDraftId);
      } else {
        const draftId = await DraftStorage.saveDraft(
          segments,
          selectedDuration
        );
        console.log("Saved new draft and starting over:", draftId);
      }

      handleStartOver();
      setIsContinuingLastDraft(false);
    } catch (error) {
      console.error("Error saving draft:", error);
    }
  };

  const handleClose = async () => {
    if (hasStartedOver && originalDraftId && recordingSegments.length === 0) {
      try {
        await DraftStorage.deleteDraft(originalDraftId);
        console.log(
          "Deleted original draft after start over:",
          originalDraftId
        );
      } catch (error) {
        console.error("Error deleting original draft:", error);
      }
    }

    router.dismiss();
  };

  // Camera control handlers
  const handleFlipCamera = () => {
    setCameraFacing((current) => (current === "back" ? "front" : "back"));
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

  return (
    <ThemedView style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        mode="video"
        facing={cameraFacing}
        enableTorch={torchEnabled}
      />

      {/* Camera Controls - right side vertical stack */}
      <CameraControls
        onFlipCamera={handleFlipCamera}
        onFlashToggle={handleTorchToggle}
        torchEnabled={torchEnabled}
      />

      {showContinuingIndicator && (
        <View style={styles.continuingDraftIndicator}>
          <ThemedText style={styles.continuingDraftText}>
            Continuing last draft
          </ThemedText>
        </View>
      )}

      <View style={styles.timeSelectorContainer}>
        <TimeSelectorButton
          onTimeSelect={handleTimeSelect}
          selectedTime={selectedDuration}
        />
      </View>

      <RecordingProgressBar
        segments={recordingSegments}
        totalDuration={selectedDuration}
        currentRecordingDuration={currentRecordingDuration}
      />

      <CloseButton
        segments={recordingSegments}
        onStartOver={handleStartOver}
        onSaveAsDraft={handleSaveAsDraft}
        hasStartedOver={hasStartedOver}
        onClose={handleClose}
        isContinuingLastDraft={isContinuingLastDraft}
      />

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

      {/* Preview Button - aligned with record button */}
      {recordingSegments.length > 0 && currentDraftId && (
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
});
