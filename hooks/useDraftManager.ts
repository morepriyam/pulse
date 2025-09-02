import { RecordingSegment } from "@/components/RecordingProgressBar";
import { DraftMode, DraftStorage } from "@/utils/draftStorage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";

const REDO_STACK_KEY = "redo_stack";

interface DraftManagerState {
  recordingSegments: RecordingSegment[];
  redoStack: RecordingSegment[];
  currentDraftId: string | null;
  originalDraftId: string | null;
  hasStartedOver: boolean;
  isContinuingLastDraft: boolean;
  showContinuingIndicator: boolean;
}

interface DraftManagerActions {
  setRecordingSegments: (segments: RecordingSegment[]) => void;
  setRedoStack: (stack: RecordingSegment[]) => void;
  handleStartOver: () => void;
  handleSaveAsDraft: (segments: RecordingSegment[], selectedDuration: number) => Promise<void>;
  handleClose: () => Promise<void>;
  handleUndoSegment: (selectedDuration: number) => Promise<void>;
  handleRedoSegment: (selectedDuration: number) => Promise<void>;
  updateSegmentsAfterRecording: (newSegment: RecordingSegment, selectedDuration: number) => Promise<void>;
}

/**
 * Custom hook for managing draft recording state and operations.
 * 
 * Handles:
 * - Auto-loading last modified draft on mount
 * - Auto-saving segments as they're recorded
 * - Undo/redo stack with persistence
 * - Draft lifecycle (save, delete, start over)
 * 
 * @param draftId - Optional specific draft to load
 * @param selectedDuration - Total recording duration limit
 */
export function useDraftManager(
  draftId?: string,
  selectedDuration: number = 60,
  mode: DraftMode = 'camera'
): DraftManagerState & DraftManagerActions {
  const [recordingSegments, setRecordingSegments] = useState<RecordingSegment[]>([]);
  const [redoStack, setRedoStack] = useState<RecordingSegment[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [originalDraftId, setOriginalDraftId] = useState<string | null>(null);
  const [hasStartedOver, setHasStartedOver] = useState(false);
  const [isContinuingLastDraft, setIsContinuingLastDraft] = useState(false);
  const [showContinuingIndicator, setShowContinuingIndicator] = useState(false);

  const isLoadingDraft = useRef(false);
  const lastSegmentCount = useRef(0);

  // Load draft on mount
  useEffect(() => {
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
          draftToLoad = await DraftStorage.getDraftById(draftId, mode);
          setIsContinuingLastDraft(false);
        } else {
          // Only auto-load last draft in camera mode, not in upload mode
          draftToLoad = mode === 'camera' ? await DraftStorage.getLastModifiedDraft(mode) : null;

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

  // Show continuing indicator
  useEffect(() => {
    if (isContinuingLastDraft && recordingSegments.length > 0) {
      setShowContinuingIndicator(true);
      const hideTimer = setTimeout(() => {
        setShowContinuingIndicator(false);
        setIsContinuingLastDraft(false);
      }, 1000);

      return () => clearTimeout(hideTimer);
    }
  }, [isContinuingLastDraft]);

  // Auto-save effect
  useEffect(() => {
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
            selectedDuration,
            mode,
            draftId  // Pass the URL's draft ID
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

  // Save redo stack to storage
  useEffect(() => {
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

  const handleStartOver = () => {
    setRecordingSegments([]);
    setRedoStack([]);
    setCurrentDraftId(null);
    setHasStartedOver(true);
    lastSegmentCount.current = 0;
  };

  const handleSaveAsDraft = async (segments: RecordingSegment[], duration: number) => {
    try {
      if (currentDraftId && !hasStartedOver) {
        await DraftStorage.updateDraft(currentDraftId, segments, duration);
        console.log("Saved & reset:", currentDraftId);
      } else {
        const newId = await DraftStorage.saveDraft(segments, duration, mode, draftId);
        setCurrentDraftId(newId);
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
  };

  const handleUndoSegment = async (duration: number) => {
    if (recordingSegments.length > 0) {
      const lastSegment = recordingSegments[recordingSegments.length - 1];
      const updatedSegments = recordingSegments.slice(0, -1);

      setRedoStack((prev) => [...prev, lastSegment]);
      setRecordingSegments(updatedSegments);
      lastSegmentCount.current = updatedSegments.length;

      if (currentDraftId) {
        try {
          if (updatedSegments.length === 0) {
            await DraftStorage.deleteDraft(currentDraftId);
            setCurrentDraftId(null);
            setHasStartedOver(false);
            console.log("Draft deleted:", currentDraftId);
          } else {
            await DraftStorage.updateDraft(currentDraftId, updatedSegments, duration);
            console.log("Undo saved:", currentDraftId);
          }
        } catch (error) {
          console.error("Undo failed:", error);
          // Revert on error
          setRecordingSegments(recordingSegments);
          setRedoStack(redoStack);
          lastSegmentCount.current = recordingSegments.length;
        }
      }
    }
  };

  const handleRedoSegment = async (duration: number) => {
    if (redoStack.length > 0) {
      const segmentToRestore = redoStack[redoStack.length - 1];
      const updatedRedoStack = redoStack.slice(0, -1);

      setRedoStack(updatedRedoStack);

      const updatedSegments = [...recordingSegments, segmentToRestore];
      setRecordingSegments(updatedSegments);
      lastSegmentCount.current = updatedSegments.length;

      try {
        if (!currentDraftId) {
          const newDraftId = await DraftStorage.saveDraft(updatedSegments, duration, mode, draftId);
          setCurrentDraftId(newDraftId);
          setHasStartedOver(false);
          console.log("New draft created on redo:", newDraftId);
        } else {
          await DraftStorage.updateDraft(currentDraftId, updatedSegments, duration);
          console.log("Redo saved:", currentDraftId);
        }
      } catch (error) {
        console.error("Redo failed:", error);
        // Revert on error
        setRecordingSegments(recordingSegments);
        setRedoStack(redoStack);
        lastSegmentCount.current = recordingSegments.length;
      }
    }
  };

  const updateSegmentsAfterRecording = async (
    newSegment: RecordingSegment,
    duration: number
  ) => {
    setRedoStack([]);
    const updatedSegments = [...recordingSegments, newSegment];
    setRecordingSegments(updatedSegments);

    try {
      if (currentDraftId) {
        await DraftStorage.updateDraft(currentDraftId, updatedSegments, duration);
        console.log("Saved:", currentDraftId);
      } else {
        // Use provided draftId if available, otherwise generate new one
        const newDraftId = await DraftStorage.saveDraft(
          updatedSegments,
          duration,
          mode,
          draftId // Pass through the ID from URL
        );
        setCurrentDraftId(newDraftId);
        setHasStartedOver(false);
        console.log("New draft:", newDraftId);
      }

      lastSegmentCount.current = updatedSegments.length;
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  return {
    // State
    recordingSegments,
    redoStack,
    currentDraftId,
    originalDraftId,
    hasStartedOver,
    isContinuingLastDraft,
    showContinuingIndicator,
    // Actions
    setRecordingSegments,
    setRedoStack,
    handleStartOver,
    handleSaveAsDraft,
    handleClose,
    handleUndoSegment,
    handleRedoSegment,
    updateSegmentsAfterRecording,
  };
} 