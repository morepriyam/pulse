import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { launchImageLibraryAsync, VideoExportPreset } from 'expo-image-picker';
import { usePermissions } from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
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

import CallDetector from '../../../modules/expo-call-detector/src/CallDetectorModule';
import { useCallState } from './use-call-state';

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

  // callActive: a phone / VoIP call holds the mic — telephony outranks us for the microphone, so
  // capturing with it live throws the AVFoundation -11800 / '!pri' error that froze the session, so
  // we drop the mic for the call's duration (see enableAudio). appActive: false while backgrounded —
  // the camera session is stopped then (see cameraActive in recorder.tsx) so iOS can't auto-resume
  // the mic into a call that began in the background.
  const { callActive, appActive, reportMicPriorityError } = useCallState();

  // The mic config the session SHOULD have. `cameraReady` gates it so a cold open comes up
  // video-only first (call detection lands before the mic is ever requested); dropped while a call
  // holds the mic (`callActive`) or the user muted, so that clip has no audio track.
  const micWanted = cameraReady && !muted && !callActive;
  // Freeze the mic config for the duration of a recording: an enableAudio change rebuilds the video
  // output, which tears down the in-flight recorder before it can finalize — dropping the clip. We
  // hold the value captured while idle and only let it change once recording stops, so a call
  // mid-recording finalizes the current clip first, then drops the mic for the next one.
  const frozenMicRef = useRef(false);
  if (!isRecording) frozenMicRef.current = micWanted;
  const micEnabled = isRecording ? frozenMicRef.current : micWanted;

  // VisionCamera records to a file via a per-recording `Recorder` created from this output. The
  // output is also handed to `<Camera outputs={[videoOutput]}>` in recorder.tsx. Pinned to 1080p;
  // the HEVC codec is pinned per-recording via setOutputSettings (iOS) so every clip stays
  // format-uniform and exports on the merge engine's zero-re-encode fast path.
  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.FHD_16_9,
    enableAudio: micEnabled,
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
  // The promise for the in-flight startRecording() run (it resolves once the clip is persisted).
  // Awaited by finalizeRecording so leaving the screen can save the segment before the camera
  // tears down.
  const recordingPromiseRef = useRef<Promise<void> | null>(null);
  // Guards the background-finalize listener against re-entry: iOS fires 'inactive' THEN 'background'
  // on a single backgrounding, and the persist tail keeps isRecordingRef true across both — without
  // this we'd finalize and open a background task twice for one clip.
  const backgroundFinalizingRef = useRef(false);

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

  // Stop the in-flight recording whenever the call state CHANGES — starting (the mic must drop) or
  // ending (the clip was recording silent and the mic is back). No clip then spans an audio-state
  // change: it's finalized and saved at the boundary, and the user starts the next one manually
  // (with the mic in its new state). We deliberately do NOT auto-resume.
  useEffect(() => {
    if (isRecordingRef.current) stopRecording();
  }, [callActive]);

  // Leaving the app mid-recording must save the clip. We finalize on the FIRST sign of leaving —
  // AppState 'inactive', which precedes 'background' — while the capture session is still alive and
  // JS is still running. Finalizing only at 'background' loses the clip: iOS has by then interrupted
  // the session, so the recorder can't flush cleanly. A background task covers the persist tail in
  // case we cross into the background. Trade-off: anything that deactivates the app (backgrounding,
  // Control Center, app switcher) stops and saves the current clip; we never auto-resume.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || !isRecordingRef.current || backgroundFinalizingRef.current) return;
      backgroundFinalizingRef.current = true;
      let taskId = -1;
      void (async () => {
        taskId = CallDetector.beginBackgroundTask();
        try {
          await finalizeRecording();
        } finally {
          CallDetector.endBackgroundTask(taskId);
          backgroundFinalizingRef.current = false;
        }
      })();
    });
    return () => sub.remove();
    // finalizeRecording reads only refs; the listener is set up once and reads current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Reflect the new segment synchronously: a close/unmount that races the live query must not
      // see an "empty" draft and delete it (the deletion check below reads these refs).
      everHadSegments.current = true;
      segmentCount.current = Math.max(segmentCount.current, 1);
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
    else recordingPromiseRef.current = startRecording();
  }

  function startHoldRecording() {
    if (isRecordingRef.current) return;
    holdInitiatedRef.current = true;
    recordingPromiseRef.current = startRecording();
  }

  // Stop an in-flight recording and wait for its clip to be persisted into the draft. Called before
  // leaving the screen (the close button) so the segment is saved instead of being lost when the
  // camera tears down. No-op when idle.
  async function finalizeRecording() {
    if (!isRecordingRef.current) return;
    stopRecording();
    try {
      await recordingPromiseRef.current;
    } catch {
      // persist failed — nothing more we can do; the caller leaves regardless
    }
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
    callActive,
    appActive,
    reportMicPriorityError,
    onCameraReady: () => setCameraReady(true),
    toggleRecording,
    finalizeRecording,
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
