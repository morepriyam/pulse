import CloseButton from "@/components/CloseButton";
import RecordButton from "@/components/RecordButton";
import RecordingProgressBar, {
  RecordingSegment,
} from "@/components/RecordingProgressBar";
import { ThemedView } from "@/components/ThemedView";
import TimeSelectorButton from "@/components/TimeSelectorButton";
import { DraftStorage } from "@/utils/draftStorage";
import { CameraView } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { StyleSheet, View } from "react-native";

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

  // Load draft if draftId is provided
  React.useEffect(() => {
    const loadDraft = async () => {
      if (draftId) {
        isLoadingDraft.current = true; // Mark as loading
        try {
          const draft = await DraftStorage.getDraftById(draftId);
          if (draft) {
            setRecordingSegments(draft.segments);
            setSelectedDuration(draft.totalDuration);
            setCurrentDraftId(draft.id);
            setOriginalDraftId(draft.id); // Track the original draft ID
            lastSegmentCount.current = draft.segments.length; // Set initial count
          }
        } catch (error) {
          console.error("Error loading draft:", error);
        } finally {
          isLoadingDraft.current = false; // Mark loading as complete
        }
      }
    };

    loadDraft();
  }, [draftId]);

  // Track if we're loading vs recording new content
  const isLoadingDraft = React.useRef(false);
  const lastSegmentCount = React.useRef(0);

  // Auto-save segments only when they actually change (new recordings)
  React.useEffect(() => {
    const autoSave = async () => {
      // Don't auto-save if no segments or if we're just loading a draft
      if (recordingSegments.length === 0 || isLoadingDraft.current) {
        return;
      }

      // Only save if we actually have NEW segments (more than before)
      if (recordingSegments.length <= lastSegmentCount.current) {
        return;
      }

      try {
        if (currentDraftId) {
          // Update existing draft
          const existingDrafts = await DraftStorage.getAllDrafts();
          const updatedDrafts = existingDrafts.map((draft) =>
            draft.id === currentDraftId
              ? {
                  ...draft,
                  segments: recordingSegments,
                  totalDuration: selectedDuration,
                }
              : draft
          );
          await DraftStorage.saveDraftArray(updatedDrafts);
          console.log("Auto-saved to existing draft:", currentDraftId);
        } else {
          // Create new draft
          const newDraftId = await DraftStorage.saveDraft(
            recordingSegments,
            selectedDuration
          );
          setCurrentDraftId(newDraftId);
          setHasStartedOver(false); // Reset the start over flag
          console.log("Auto-saved as new draft:", newDraftId);
        }

        // Update the last known segment count
        lastSegmentCount.current = recordingSegments.length;
      } catch (error) {
        console.error("Error auto-saving draft:", error);
      }
    };

    // Debounce auto-save to avoid too frequent saves
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
    setCurrentDraftId(null); // Reset draft ID so new recordings create a new draft
    setHasStartedOver(true); // Mark that user started over
    lastSegmentCount.current = 0; // Reset segment count tracking
  };

  const handleSaveAsDraft = async (segments: RecordingSegment[]) => {
    // This is now only used for manual save from close button
    // But since we have auto-save, this might not be needed anymore
    try {
      if (currentDraftId && !hasStartedOver) {
        // Update existing draft
        const existingDrafts = await DraftStorage.getAllDrafts();
        const updatedDrafts = existingDrafts.map((draft) =>
          draft.id === currentDraftId
            ? { ...draft, segments, totalDuration: selectedDuration }
            : draft
        );
        await DraftStorage.saveDraftArray(updatedDrafts);
        console.log("Manually saved to existing draft:", currentDraftId);
      } else {
        // Create new draft
        const draftId = await DraftStorage.saveDraft(
          segments,
          selectedDuration
        );
        console.log("Manually saved as new draft:", draftId);
      }
    } catch (error) {
      console.error("Error saving draft:", error);
    }
  };

  const handleClose = async () => {
    // If user started over from an existing draft and has no new segments, delete the original draft
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

  return (
    <ThemedView style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        mode="video"
        facing="back"
      />

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
  timeSelectorContainer: {
    position: "absolute",
    top: 80,
    right: 25,
    zIndex: 10,
  },
});
