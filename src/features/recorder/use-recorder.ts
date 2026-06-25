import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { launchImageLibraryAsync, VideoExportPreset } from 'expo-image-picker';
import { usePermissions } from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { isValidFile } from 'react-native-video-trim';
import {
  type CameraRef,
  CommonResolutions,
  type Recorder,
  useVideoOutput,
} from 'react-native-vision-camera';

import {
  addSegment,
  createDraft,
  deleteDraft,
  deleteSegment,
  reorderSegments,
  segmentsForDraft,
} from '@/db/drafts';
import {
  CAMERA_FACING_KEY,
  CAMERA_MUTED_KEY,
  CAMERA_STABILIZATION_KEY,
  getRecorderPrefs,
  setSetting,
} from '@/db/settings';
import { absolutize, copyIntoSegments, persistRecording, thumbRelPath } from '@/utils/file-store';
import { generateThumbnailFile, getDurationMs } from '@/utils/video';

export const STABILIZATION_MODES = ['off', 'standard', 'cinematic', 'auto'] as const;
export type StabilizationMode = (typeof STABILIZATION_MODES)[number];

/** Which camera the recorder is pointed at. Mirrors VisionCamera's `CameraPosition`,
 * declared locally so the rest of the app doesn't import the camera SDK for a string union. */
export type CameraFacing = 'front' | 'back';

/** Stopping the native recorder before it has actually started hangs the capture —
 * earlier stop requests are deferred to this boundary. */
const MIN_RECORD_MS = 350;

export function useRecorder(initialDraftId?: string) {
  const cameraRef = useRef<CameraRef>(null);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [isRecording, setIsRecording] = useState(false);
  // Wall-clock start of the active recording, for the live running timer in the UI. Mirrors
  // recordCallAtRef (which stays a ref for the MIN_RECORD_MS stop-guard); null when idle.
  const [recordStartedAt, setRecordStartedAt] = useState<number | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>('back');
  const [torch, setTorch] = useState(false);
  const [stabilization, setStabilization] = useState<StabilizationMode>('off');
  const [muted, setMuted] = useState(false);
  // False until persisted prefs (facing/stabilization/mute) are loaded — the screen holds the
  // camera render until then so the first frame uses the saved facing (no back→front flash).
  const [prefsReady, setPrefsReady] = useState(false);

  // VisionCamera records to a file via a per-recording `Recorder` created from this output.
  // The output is also handed to `<Camera outputs={[videoOutput]}>` in recorder.tsx. Disabling
  // audio when muted recreates the output (drops the mic from the session) — a clip with no
  // audio track is what `mute` meant under expo-camera. Pinned to 1080p; the HEVC codec is
  // pinned per-recording via setOutputSettings (iOS) so every clip stays format-uniform and
  // exports on the merge engine's zero-re-encode fast path.
  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.FHD_16_9,
    enableAudio: !muted,
    fileType: 'mov',
  });

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
  // The live VisionCamera recorder (one per recording), and whether a stop was requested
  // before it finished being created — together they make a stop land even if it races the
  // async createRecorder/startRecording handshake.
  const recorderRef = useRef<Recorder | null>(null);
  const stopRequestedRef = useRef(false);
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
      // primary stop path. Stopping the recorder finalizes the file (the clip is then dropped
      // by startRecording's cleanup since we've unmounted), avoiding a dangling capture.
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (isRecordingRef.current) void recorderRef.current?.stopRecording().catch(() => {});
      const id = draftIdRef.current;
      const safeToDelete = sessionDraftId.current != null || everHadSegments.current;
      if (id && segmentCount.current === 0 && safeToDelete) {
        void deleteDraft(id);
      }
    },
    [],
  );

  // Hydrate persisted camera prefs once on mount, then mark ready so the camera can render.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const prefs = await getRecorderPrefs();
      if (cancelled) return;
      setFacing(prefs.facing);
      setStabilization(prefs.stabilization);
      setMuted(prefs.muted);
      setPrefsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist each pref on change. Gated on prefsReady so we never write a default over a stored
  // value before hydration completes (the one write-back of the just-loaded value is harmless).
  useEffect(() => {
    if (prefsReady) void setSetting(CAMERA_FACING_KEY, facing);
  }, [facing, prefsReady]);
  useEffect(() => {
    if (prefsReady) void setSetting(CAMERA_STABILIZATION_KEY, stabilization);
  }, [stabilization, prefsReady]);
  useEffect(() => {
    if (prefsReady) void setSetting(CAMERA_MUTED_KEY, String(muted));
  }, [muted, prefsReady]);

  async function startRecording() {
    if (!cameraRef.current || isRecordingRef.current || !cameraReady) return;
    // A deferred stop aimed at the previous recording must not hit this one.
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    isRecordingRef.current = true;
    stopRequestedRef.current = false;
    recordCallAtRef.current = Date.now();
    setRecordStartedAt(Date.now());
    setIsRecording(true);
    try {
      // Codec: VisionCamera defaults to the most efficient codec available (HEVC/h265 on modern
      // iPhones), which is what keeps every clip format-uniform for the merge engine's fast
      // path. We deliberately do NOT call setOutputSettings to force the codec here — mutating
      // the running session's encoder settings right before createRecorder crashed the native
      // recorder. (Even if a device fell back to H.264, the merge's selective path handles it.)

      // VisionCamera records via a single-use Recorder. startRecording resolves when capture
      // has *started*; the file path arrives later through onRecordingFinished (fired by our
      // stopRecording call), so we await that callback. A stop that raced createRecorder is
      // honored as soon as the recorder exists.
      const recorder = await videoOutput.createRecorder({});
      recorderRef.current = recorder;
      const filePath = await new Promise<string>((resolve, reject) => {
        recorder
          .startRecording(
            (path) => resolve(path),
            (err) => reject(err),
          )
          .then(() => {
            // Capture has actually started — honor a stop requested while we were preparing
            // (the gesture's direct stopRecording would have no-op'd against a not-yet-started
            // recorder). onRecordingFinished then resolves the path above.
            if (stopRequestedRef.current) void recorder.stopRecording().catch(() => {});
          })
          .catch(reject);
      });
      // VisionCamera returns a bare filesystem path; file-store's File API wants a file:// URL.
      const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

      let id = draftId;
      if (!id) {
        id = await createDraft();
        sessionDraftId.current = id;
        setDraftId(id);
      }

      const segmentId = `${id}-${Date.now()}`;
      const originalFilename = await persistRecording(uri, id, segmentId);
      const durationMs = await getDurationMs(absolutize(originalFilename));
      const thumbRel = thumbRelPath(id, segmentId);
      const ok = await generateThumbnailFile(absolutize(originalFilename), absolutize(thumbRel));
      await addSegment(id, {
        id: segmentId,
        originalFilename,
        durationMs,
        thumbnail: ok ? thumbRel : null,
      });
    } catch {
      // interrupted mid-record — drop the clip
    } finally {
      recorderRef.current = null;
      stopRequestedRef.current = false;
      isRecordingRef.current = false;
      holdInitiatedRef.current = false;
      setIsRecording(false);
      setRecordStartedAt(null);
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

      // Reject corrupt / zero-length picks before they enter the draft (one native probe,
      // reused below for the duration). A thrown probe is non-fatal — fall through and let
      // copy + getDurationMs decide.
      const info = await isValidFile(picked.uri).catch(() => null);
      if (info && !info.isValid) {
        Alert.alert('Import failed', 'That file isn’t a supported video.');
        return;
      }

      let id = draftId;
      if (!id) {
        id = await createDraft();
        sessionDraftId.current = id;
        setDraftId(id);
      }

      const segmentId = `${id}-${Date.now()}`;
      const originalFilename = await copyIntoSegments(picked.uri, id, segmentId);
      const durationMs =
        info && info.duration > 0
          ? info.duration
          : await getDurationMs(absolutize(originalFilename));
      const thumbRel = thumbRelPath(id, segmentId);
      const ok = await generateThumbnailFile(absolutize(originalFilename), absolutize(thumbRel));
      await addSegment(id, {
        id: segmentId,
        originalFilename,
        durationMs,
        thumbnail: ok ? thumbRel : null,
      });
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Could not import the video.');
    }
  }

  function stopRecording() {
    if (!isRecordingRef.current || stopTimerRef.current) return;
    // Remembered so a stop that lands before the recorder is even created still fires once it
    // exists (see startRecording). recorderRef may be null here if createRecorder is in flight.
    stopRequestedRef.current = true;
    const elapsed = Date.now() - recordCallAtRef.current;
    if (elapsed < MIN_RECORD_MS) {
      stopTimerRef.current = setTimeout(() => {
        stopTimerRef.current = null;
        if (isRecordingRef.current) void recorderRef.current?.stopRecording().catch(() => {});
      }, MIN_RECORD_MS - elapsed);
      return;
    }
    // May reject if the recorder hasn't started capturing yet; stopRequestedRef makes the
    // start path honor the stop, so swallow the throw here.
    void recorderRef.current?.stopRecording().catch(() => {});
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
    videoOutput,
    draftId,
    segments,
    isRecording,
    recordStartedAt,
    cameraReady,
    prefsReady,
    facing,
    torch,
    stabilization,
    muted,
    onCameraReady: () => setCameraReady(true),
    toggleRecording,
    importClip: () => void importClip(),
    startHoldRecording,
    endHoldRecording,
    flipCamera,
    toggleTorch: () => setTorch((prev) => !prev),
    toggleMute: () => setMuted((prev) => !prev),
    cycleStabilization,
    deleteSegment: (id: string) => void deleteSegment(id),
    reorderSegments: (ids: string[]) => void reorderSegments(ids),
  };
}
