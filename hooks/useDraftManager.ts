import { RecordingSegment } from "@/components/RecordingProgressBar";
import { DraftMode, DraftStorage } from "@/utils/draftStorage";
import { fileStore } from "@/utils/fileStore";
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
  handleStartNew: () => void;
  handleSaveAsDraft: (
    segments: RecordingSegment[],
    selectedDuration: number,
    options?: { forceNew?: boolean }
  ) => Promise<void>;
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
  const [forceNewNext, setForceNewNext] = useState(false);

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
          // Preference: if a redo stack exists, do NOT auto-load any draft; let the user continue the redo WIP
          if (redoData && redoData.segments && redoData.segments.length > 0) {
            draftToLoad = null;
            setIsContinuingLastDraft(false);
          } else {
            // Only auto-load last draft in camera mode, not in upload mode
            draftToLoad = mode === 'camera' ? await DraftStorage.getLastModifiedDraft(mode) : null;
            setIsContinuingLastDraft(!!draftToLoad);
          }
        }

        if (draftToLoad) {
          console.log(`[DraftManager] Loaded draft: ${draftToLoad.id} (${draftToLoad.segments.length} segments)`);
          setRecordingSegments(draftToLoad.segments);
          setCurrentDraftId(draftToLoad.id);
          setOriginalDraftId(draftToLoad.id);
          lastSegmentCount.current = draftToLoad.segments.length;
        } else {
          // No draft loaded (e.g., after last-undo). If redo exists, prefer its draftId and load redo stack only.
          if (redoData && redoData.segments && redoData.segments.length > 0) {
            if (redoData.draftId) {
              setOriginalDraftId(redoData.draftId);
            } else {
              setOriginalDraftId(null);
            }
            // recordingSegments remain empty until user records or presses redo
          } else {
            setOriginalDraftId(null);
          }
        }

        if (redoData && redoData.segments) {
          if (draftToLoad) {
            const shouldLoadRedoStack = redoData.draftId === draftToLoad.id || !redoData.draftId;
            setRedoStack(shouldLoadRedoStack ? redoData.segments : []);
          } else {
            // No draft loaded: always load redo stack to continue last work-in-progress
            setRedoStack(redoData.segments);
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
          console.log(`[DraftManager] Auto-saved: ${currentDraftId}`);
        } else {
          const newDraftId = await DraftStorage.saveDraft(
            recordingSegments,
            selectedDuration,
            mode,
            draftId  // Pass the URL's draft ID
          );
          setCurrentDraftId(newDraftId);
          setHasStartedOver(false);
          console.log(`[DraftManager] Created new draft: ${newDraftId}`);
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
          draftId: currentDraftId ?? originalDraftId ?? null,
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
    console.log("[DraftManager] Starting over - clearing all segments");
    setRecordingSegments([]);
    setRedoStack([]);
    setCurrentDraftId(null);
    setHasStartedOver(true);
    lastSegmentCount.current = 0;
  };

  // Start New: clear local state, arm new-id-on-next-recording, do NOT mark hasStartedOver
  const handleStartNew = () => {
    setRecordingSegments([]);
    setRedoStack([]);
    setCurrentDraftId(null);
    setHasStartedOver(false);
    setForceNewNext(true);
    lastSegmentCount.current = 0;
  };

  const handleSaveAsDraft = async (segments: RecordingSegment[], duration: number, options?: { forceNew?: boolean }) => {
    try {
      if (currentDraftId && !hasStartedOver && !options?.forceNew) {
        await DraftStorage.updateDraft(currentDraftId, segments, duration);
        console.log(`[DraftManager] Saved & reset: ${currentDraftId}`);
      } else {
        const preferredId = options?.forceNew ? undefined : (originalDraftId || draftId || undefined);
        const newId = await DraftStorage.saveDraft(segments, duration, mode, preferredId);
        setCurrentDraftId(newId);
        if (options?.forceNew) {
          // Ensure the next recording starts a new id by clearing original
          setOriginalDraftId(null);
          setForceNewNext(true);
        }
        console.log(`[DraftManager] New draft & reset: ${newId}`);
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
        console.log(`[DraftManager] WHOLE DRAFT DELETED - Original: ${originalDraftId}`);
      } catch (error) {
        console.error("Delete failed:", error);
      }
    }

    if (recordingSegments.length === 0) {
      try {
        // If there are redo segments persisted for this draft, delete their files too
        const savedRedoData = await AsyncStorage.getItem(REDO_STACK_KEY);
        if (savedRedoData) {
          try {
            const parsed = JSON.parse(savedRedoData);
            const segmentsToDelete = Array.isArray(parsed)
              ? parsed
              : parsed?.segments || [];
            if (segmentsToDelete.length > 0) {
              console.log(`[DraftManager] Closing - Deleting ${segmentsToDelete.length} redo files`);
              await fileStore.deleteUris(segmentsToDelete.map((s: any) => s.uri));
            }
          } catch {}
        }

        await AsyncStorage.removeItem(REDO_STACK_KEY);
        setRedoStack([]);
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
            // Metadata-only delete so redo can recreate the draft; keep files on disk
            await DraftStorage.deleteDraft(currentDraftId, { keepFiles: true });
            setCurrentDraftId(null);
            setHasStartedOver(false);
            console.log(`[DraftManager] WHOLE DRAFT DELETED - Undo (metadata only): ${currentDraftId}`);
          } else {
            await DraftStorage.updateDraft(currentDraftId, updatedSegments, duration);
            console.log(`[DraftManager] Undo - Updated draft: ${currentDraftId}`);
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
          // Re-create using the original draft id if available so existing files (segments/thumb) are reused
          const preferredId = originalDraftId || draftId;
          const newDraftId = await DraftStorage.saveDraft(updatedSegments, duration, mode, preferredId || undefined);
          setCurrentDraftId(newDraftId);
          setHasStartedOver(false);
          console.log(`[DraftManager] Redo - Created new draft: ${newDraftId}`);
        } else {
          await DraftStorage.updateDraft(currentDraftId, updatedSegments, duration);
          console.log(`[DraftManager] Redo - Updated draft: ${currentDraftId}`);
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
    const prevRedo = redoStack;

    try {
      // Determine target draft id for file import and metadata save
      const targetDraftId = forceNewNext
        ? Date.now().toString()
        : (currentDraftId ?? draftId ?? Date.now().toString());
      
      console.log(`[DraftManager] Recording segment - Target draft ID: ${targetDraftId}`);

      // Ensure directories exist and import the recorded file into managed storage
      await fileStore.ensureDraftDirs(targetDraftId);
      const managedUri = await fileStore.importSegment({
        draftId: targetDraftId,
        srcUri: newSegment.uri,
        segmentId: newSegment.id,
      });

      // Clear redo stack in state (new recording invalidates redo)
      setRedoStack([]);

      // Append the imported segment with managed URI
      const importedSegment: RecordingSegment = { ...newSegment, uri: managedUri };
      const updatedSegments = [...recordingSegments, importedSegment];
      setRecordingSegments(updatedSegments);

      // Persist draft metadata
      if (currentDraftId && !forceNewNext) {
        await DraftStorage.updateDraft(currentDraftId, updatedSegments, duration);
        console.log(`[DraftManager] Recording segment - Updated existing draft: ${currentDraftId}`);
      } else {
        const preferredId = forceNewNext ? targetDraftId : (originalDraftId || draftId || targetDraftId);
        const newDraftId = await DraftStorage.saveDraft(
          updatedSegments,
          duration,
          mode,
          preferredId
        );
        setCurrentDraftId(newDraftId);
        setOriginalDraftId(preferredId);
        setHasStartedOver(false);
        console.log(`[DraftManager] Recording segment - Created new draft: ${newDraftId}`);
        if (forceNewNext) setForceNewNext(false);
      }

      // Delete redo files now that redo stack is cleared and not referenced
      if (prevRedo.length > 0) {
        console.log(`[DraftManager] Deleting ${prevRedo.length} redo files`);
        await fileStore.deleteUris(prevRedo.map((s) => s.uri));
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
    handleStartNew,
    handleSaveAsDraft,
    handleClose,
    handleUndoSegment,
    handleRedoSegment,
    updateSegmentsAfterRecording,
  };
} 