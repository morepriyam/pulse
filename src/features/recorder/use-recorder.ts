import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { CameraType, CameraView } from 'expo-camera';
import { launchImageLibraryAsync, VideoExportPreset } from 'expo-image-picker';
import { usePermissions } from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';

import {
  addSegment,
  createDraft,
  deleteDraft,
  deleteSegment,
  reorderSegments,
  segmentsForDraft,
} from '@/db/drafts';
import { absolutize, copyIntoSegments, persistRecording } from '@/utils/file-store';
import { getDurationMs } from '@/utils/video';

export const STABILIZATION_MODES = ['off', 'standard', 'cinematic', 'auto'] as const;
export type StabilizationMode = (typeof STABILIZATION_MODES)[number];

/** Stopping the native recorder before it has actually started hangs `recordAsync` —
 * earlier stop requests are deferred to this boundary. */
const MIN_RECORD_MS = 350;

export function useRecorder(initialDraftId?: string) {
  const cameraRef = useRef<CameraView>(null);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [torch, setTorch] = useState(false);
  const [stabilization, setStabilization] = useState<StabilizationMode>('off');
  const [muted, setMuted] = useState(false);
  // undefined = the camera's default wide lens; physical lens names come from the device.
  const [lens, setLens] = useState<string | undefined>(undefined);
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);

  const { data: segments } = useLiveQuery(segmentsForDraft(draftId ?? ''), [draftId]);

  // Library access for the + import — granular (photo+video) like the camera/mic gate,
  // but requested just-in-time on tap (§2.3). Granting up front also lets the picker's
  // passthrough fast path stream originals instead of prompting mid-import.
  const [libraryPermission, requestLibraryPermission] = usePermissions({
    granularPermissions: ['photo', 'video'],
  });

  // Start/stop decisions run from memoized gesture callbacks where `isRecording` state can
  // lag a render behind — they go through refs that flip synchronously instead.
  const isRecordingRef = useRef(false);
  const recordCallAtRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set only when a hold STARTED the recording — releasing a hold begun on top of a
  // tap-started recording must not stop it (that hold is just drag-zooming).
  const holdInitiatedRef = useRef(false);

  // Drop an empty draft on leave so it doesn't litter Home: either one we created this
  // session and never kept a clip in, or a resumed draft whose every clip was deleted.
  // A resumed draft we never saw load (segments still []) is left alone — deleting it
  // would nuke a draft that simply hadn't loaded yet.
  const sessionDraftId = useRef<string | null>(null);
  const draftIdRef = useRef<string | null>(initialDraftId ?? null);
  const segmentCount = useRef(0);
  const everHadSegments = useRef(false);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);
  useEffect(() => {
    segmentCount.current = segments.length;
    if (segments.length > 0) everHadSegments.current = true;
  }, [segments]);
  useEffect(
    () => () => {
      // Backstop for a recording still live at unmount — the gesture's onFinalize is the
      // primary stop path, and `active={false}` resolving recordAsync is the second.
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (isRecordingRef.current) cameraRef.current?.stopRecording();
      const id = draftIdRef.current;
      const safeToDelete = sessionDraftId.current != null || everHadSegments.current;
      if (id && segmentCount.current === 0 && safeToDelete) {
        void deleteDraft(id);
      }
    },
    [],
  );

  // Physical lenses differ per facing (front is usually just the one), so re-query on flip.
  useEffect(() => {
    if (!cameraReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const lenses = (await cameraRef.current?.getAvailableLensesAsync()) ?? [];
        if (!cancelled) setAvailableLenses(lenses);
      } catch {
        if (!cancelled) setAvailableLenses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cameraReady, facing]);

  async function startRecording() {
    if (!cameraRef.current || isRecordingRef.current || !cameraReady) return;
    // A deferred stop aimed at the previous recording must not hit this one.
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    isRecordingRef.current = true;
    recordCallAtRef.current = Date.now();
    setIsRecording(true);
    try {
      // Pinned capture format (with videoQuality="1080p" on CameraView): HEVC 1080p. Every
      // segment a device records is format-identical to the rest of the draft, so export
      // always hits the merge engine's zero-re-encode passthrough path — and clips recorded
      // on different devices stay mergeable with each other too. Keep in sync with the
      // selective-merge majority expectations in the RNVT fork.
      const video = await cameraRef.current.recordAsync({ codec: 'hvc1' });
      if (!video?.uri) return;

      let id = draftId;
      if (!id) {
        id = await createDraft();
        sessionDraftId.current = id;
        setDraftId(id);
      }

      const segmentId = `${id}-${Date.now()}`;
      const originalFilename = await persistRecording(video.uri, id, segmentId);
      const durationMs = await getDurationMs(absolutize(originalFilename));
      await addSegment(id, { id: segmentId, originalFilename, durationMs });
    } catch {
      // interrupted mid-record — drop the clip
    } finally {
      isRecordingRef.current = false;
      holdInitiatedRef.current = false;
      setIsRecording(false);
    }
  }

  // Pick an existing device video (system picker — no permission prompt) and add it as a
  // segment, following the same persist path as a recording. Imports keep their original
  // format (Passthrough); format-mismatched clips are the merge engine's selective path.
  async function importClip() {
    if (isRecordingRef.current) return;
    if (!libraryPermission?.granted) {
      if (libraryPermission && !libraryPermission.canAskAgain) {
        Alert.alert(
          'Photos access needed',
          'Allow Pulse to access your photo library in Settings to import videos.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }
      const next = await requestLibraryPermission();
      if (!next.granted) return;
    }
    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: ['videos'],
        videoExportPreset: VideoExportPreset.Passthrough,
      });
      const picked = result.assets?.[0];
      if (result.canceled || !picked) return;

      let id = draftId;
      if (!id) {
        id = await createDraft();
        sessionDraftId.current = id;
        setDraftId(id);
      }

      const segmentId = `${id}-${Date.now()}`;
      const originalFilename = await copyIntoSegments(picked.uri, id, segmentId);
      const durationMs = await getDurationMs(absolutize(originalFilename));
      await addSegment(id, { id: segmentId, originalFilename, durationMs });
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Could not import the video.');
    }
  }

  function stopRecording() {
    if (!isRecordingRef.current || stopTimerRef.current) return;
    const elapsed = Date.now() - recordCallAtRef.current;
    if (elapsed < MIN_RECORD_MS) {
      stopTimerRef.current = setTimeout(() => {
        stopTimerRef.current = null;
        if (isRecordingRef.current) cameraRef.current?.stopRecording();
      }, MIN_RECORD_MS - elapsed);
      return;
    }
    cameraRef.current?.stopRecording();
  }

  function toggleRecording() {
    if (isRecordingRef.current) stopRecording();
    else void startRecording();
  }

  function startHoldRecording() {
    if (isRecordingRef.current) return;
    holdInitiatedRef.current = true;
    void startRecording();
  }

  function endHoldRecording() {
    if (holdInitiatedRef.current) stopRecording();
  }

  function flipCamera() {
    setLens(undefined); // lens names are per-facing; fall back to the default wide
    setFacing((prev) => {
      const next = prev === 'back' ? 'front' : 'back';
      if (next === 'front') setTorch(false);
      return next;
    });
  }

  function cycleStabilization() {
    setStabilization((prev) => {
      const next = (STABILIZATION_MODES.indexOf(prev) + 1) % STABILIZATION_MODES.length;
      return STABILIZATION_MODES[next];
    });
  }

  return {
    cameraRef,
    draftId,
    segments,
    isRecording,
    cameraReady,
    facing,
    torch,
    stabilization,
    muted,
    lens,
    availableLenses,
    onCameraReady: () => setCameraReady(true),
    toggleRecording,
    importClip: () => void importClip(),
    startHoldRecording,
    endHoldRecording,
    flipCamera,
    toggleTorch: () => setTorch((prev) => !prev),
    toggleMute: () => setMuted((prev) => !prev),
    selectLens: setLens,
    cycleStabilization,
    deleteSegment: (id: string) => void deleteSegment(id),
    reorderSegments: (ids: string[]) => void reorderSegments(ids),
  };
}
