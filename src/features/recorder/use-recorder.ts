import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { launchImageLibraryAsync, VideoExportPreset } from 'expo-image-picker';
import { usePermissions } from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { isValidFile, compress, deleteFile, probeVideo } from 'react-native-video-trim';
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
import { decideImport } from '@/utils/import-normalization';
import { generateThumbnailFile, getDurationMs } from '@/utils/video';

import CallDetector from '../../../modules/expo-call-detector/src/CallDetectorModule';
import { useCallState } from './use-call-state';

// 'cinematic' is an iOS-only AVCaptureVideoStabilizationMode — CameraX has no equivalent, so
// Android only cycles through the modes it can actually honor. The union type keeps 'cinematic'
// on both platforms so persisted iOS prefs and shared UI maps still typecheck.
export const STABILIZATION_MODES: readonly StabilizationMode[] =
  Platform.OS === 'ios' ? ['off', 'standard', 'cinematic', 'auto'] : ['off', 'standard', 'auto'];
export type StabilizationMode = 'off' | 'standard' | 'cinematic' | 'auto';

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
  const [isImporting, setIsImporting] = useState(false);
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

  // The mic config the session SHOULD have: dropped while a call holds the mic (`callActive`)
  // or the user muted, so that clip has no audio track. Deliberately NOT gated on cameraReady:
  // call state is read synchronously at first render (useCallState's initializer), so the mic
  // can attach from the session's FIRST configure. Gating on cameraReady made every cold open
  // come up video-only and then rebuild the output audio-ful at `onStarted` — a second full
  // session reconfigure ~25ms after the first preview frame, i.e. a visible flash on every
  // open (and two extra rebuilds on every camera flip). The '!pri' -11800 recovery path
  // (reportMicPriorityError) remains the backstop for the rare cold open that races an
  // in-progress call the synchronous snapshot missed.
  const micWanted = !muted && !callActive;
  // Freeze the mic config for the duration of a recording: an enableAudio change rebuilds the video
  // output, which tears down the in-flight recorder before it can finalize — dropping the clip. We
  // hold the value captured while idle and only let it change once recording stops, so a call
  // mid-recording finalizes the current clip first, then drops the mic for the next one.
  const frozenMicRef = useRef(false);
  if (!isRecording) frozenMicRef.current = micWanted;
  const micEnabled = isRecording ? frozenMicRef.current : micWanted;

  // VisionCamera records to a file via a per-recording `Recorder` created from this output. The
  // output is also handed to `<Camera outputs={[videoOutput]}>` in recorder.tsx. Pinned to 1080p;
  // the codec is forced to H.264 below (see the setOutputSettings effect) so every clip is
  // format-uniform, exports on the merge engine's zero-re-encode fast path, AND plays in every
  // browser — VisionCamera's device default is HEVC on modern iPhones, which Firefox never
  // decodes and Chrome usually can't without hardware support.
  // fileType 'mov' on iOS: a `.mp4`-named output arms Apple's movieFragmentInterval bug — clips
  // >10s consolidate with an audio sample entry AVFoundation refuses to read back, playing back
  // SILENT in preview/merge/transcription. Full RCA in #157. Android ignores fileType (CameraX
  // always writes a real MP4). Segments are persisted and uploaded as `{segmentId}.mp4` either way.
  // targetBitRate ~5 Mbps: the mobile-feed sweet spot for 1080p. CAVEAT (measured on-device,
  // see PR #142): VisionCamera applies this inside the session-configuration batch, where it
  // can silently fail to land — real 1080p clips have probed at ~8 Mbps (the encoder default
  // scaled to the pixel count). The pin stays as intent, but nothing downstream may ASSUME it:
  // the upload contract gate (#142) and the pulsevault web-ready backstop own the guarantee.
  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.FHD_16_9,
    targetBitRate: 5_000_000,
    enableAudio: micEnabled,
    fileType: Platform.OS === 'ios' ? 'mov' : 'mp4',
  });

  // Force H.264 (iOS only — Android's CameraX camcorder profiles are already AVC, and its
  // setOutputSettings is a native no-op). Natively the codec is applied PER-CONNECTION
  // (output.setOutputSettings(settings, for: connection)), and a connection is torn down and
  // re-formed whenever the session reconfigures — an enableAudio output rebuild, or a camera
  // flip swapping the device input. So the pin is re-applied once per *connection epoch*:
  // `onConfigured` (VisionCamera's "connections are formed" hook, wired in recorder.tsx) bumps
  // the epoch AFTER the new connection exists, which is the only ordering that can't lose the
  // pin to a reconfigure that lands later. Gated on cameraReady && !isRecording because
  // mutating the settings of a session that is actively capturing is what crashed the recorder
  // historically. setOutputSettings preserves whatever compression settings are present
  // (it only swaps the codec key). Failure is non-fatal — worst case that clip records HEVC,
  // exactly today's behavior, and the merge engine still handles it.
  // The ref is committed only when the native call RESOLVES: setOutputSettings runs on the
  // output's own queue and throws while a rebuilt output is not yet connected — the session
  // reconfigure that attaches it runs on a different queue, so the first attempt can race it
  // and reject. Committing eagerly would let that rejection permanently pin the epoch to HEVC;
  // instead a short bounded retry rides out the reconfigure window, and the effect cleanup
  // cancels retries if a recording starts or another reconfigure supersedes this epoch.
  // A pin that is still in flight when recording starts cannot corrupt the capture:
  // setOutputSettings and createRecorder both run on the output's own serial queue
  // (Promise.parallel(queue) in HybridCameraVideoOutput), so the mutation and the recorder
  // creation are serialized natively — the codec lands either before or after the recorder
  // exists, never mid-setup. Worst case remains a fail-open HEVC clip, never a crash.
  // NOTE: raw per-clip files are still written moov-at-end — AVCaptureMovieFileOutput (what
  // createRecorder actually wraps) has no faststart API, so faststart for uploads is owned by
  // the merge/export layer (fork's +faststart), the upload gate (#142), and the server backstop.
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const h264PinnedRef = useRef<{ output: typeof videoOutput; epoch: number } | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'ios' || !cameraReady || isRecording) return;
    const output = videoOutput;
    const pinned = h264PinnedRef.current;
    if (pinned && pinned.output === output && pinned.epoch === connectionEpoch) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = (retriesLeft: number) => {
      output.setOutputSettings({ codec: 'h264' }).then(
        () => {
          if (!cancelled) h264PinnedRef.current = { output, epoch: connectionEpoch };
        },
        (e: unknown) => {
          if (cancelled) return;
          if (retriesLeft > 0) {
            timer = setTimeout(() => {
              if (!cancelled) attempt(retriesLeft - 1);
            }, 250);
          } else {
            console.warn('Failed to force H.264 on the video output; clip may record as HEVC', e);
          }
        },
      );
    };
    attempt(4);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [videoOutput, cameraReady, isRecording, connectionEpoch]);

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

  // Reuses the current draft, or lazily creates one on the first clip/import of the session.
  async function ensureDraft(): Promise<string> {
    if (draftId) return draftId;
    const id = await createDraft();
    sessionDraftId.current = id;
    setDraftId(id);
    return id;
  }

  // Generates the thumbnail and writes the db row for a segment whose file is already copied
  // into the draft, then reflects it synchronously in the unmount-cleanup refs (see the effect
  // above) so a racing close/unmount can't see an "empty" draft and delete the clip just added.
  async function persistSegment(
    forDraftId: string,
    segmentId: string,
    originalFilename: string,
    durationMs: number,
  ) {
    const thumbRel = thumbRelPath(forDraftId, segmentId);
    const ok = await generateThumbnailFile(absolutize(originalFilename), absolutize(thumbRel));
    await addSegment(forDraftId, {
      id: segmentId,
      originalFilename,
      durationMs,
      thumbnail: ok ? thumbRel : null,
    });
    everHadSegments.current = true;
    segmentCount.current = Math.max(segmentCount.current, 1);
  }

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

      const id = await ensureDraft();
      const segmentId = `${id}-${Date.now()}`;
      const originalFilename = await persistRecording(uri, id, segmentId);
      const durationMs = await getDurationMs(absolutize(originalFilename));
      await persistSegment(id, segmentId, originalFilename, durationMs);
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
  // segment, following the same persist path as a recording. Merge-friendly imports keep
  // their original bytes (Passthrough); hostile ones (HDR/10-bit, >1080p, >30fps, exotic
  // codecs, non-AAC audio) are normalized to the recorder's bounds first — the policy
  // lives in decideImport (§ imports). Format-mismatched-but-benign clips remain the
  // merge engine's selective path.
  async function importClip() {
    if (isRecordingRef.current || isImporting) return;
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
      setIsImporting(true);

      // Reject corrupt / zero-length picks before they enter the draft (one native probe,
      // reused below for the duration). A thrown probe is non-fatal — fall through and let
      // copy + getDurationMs decide.
      const info = await isValidFile(picked.uri).catch(() => null);
      if (info && !info.isValid) {
        Alert.alert('Import failed', 'That file isn’t a supported video.');
        return;
      }

      // Normalize hostile imports before they enter the draft. A failed probe or a failed
      // re-encode falls back to importing the original bytes — the merge engine's legacy
      // re-encode path still handles them, just slower.
      let sourceUri = picked.uri;
      let normalizedPath: string | null = null;
      const probe = await probeVideo(picked.uri).catch(() => null);
      if (probe) {
        const decision = decideImport(probe);
        if (decision.action === 'normalize') {
          const normalized = await compress(picked.uri, decision.options).catch(() => null);
          if (normalized) {
            normalizedPath = normalized.outputPath;
            sourceUri = normalized.outputPath;
          }
        }
      }

      const id = await ensureDraft();
      const segmentId = `${id}-${Date.now()}`;
      const originalFilename = await copyIntoSegments(sourceUri, id, segmentId);
      // The compress output lives in the OS-purgeable cache dir; drop it once copied.
      if (normalizedPath) void deleteFile(normalizedPath).catch(() => {});
      const durationMs =
        normalizedPath === null && info && info.duration > 0
          ? info.duration
          : await getDurationMs(absolutize(originalFilename));
      await persistSegment(id, segmentId, originalFilename, durationMs);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Could not import the video.');
    } finally {
      setIsImporting(false);
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
    // Re-gate zoom/torch until the flipped session has started — ANDROID ONLY. The reset exists
    // for CameraX: torchMode landing on the outgoing camera mid-rebind throws
    // IllegalStateException("No flash unit") when the torch-less front camera is still bound,
    // and CameraX re-fires `onStarted` per device bind so the gate re-arms (verified in #133).
    // On iOS the flip is an input swap inside beginConfiguration/commitConfiguration on a
    // RUNNING session — didStartRunningNotification never fires, so `onStarted` never re-fires
    // and a reset here would stick cameraReady=false forever, permanently disabling the record
    // gestures. (Before the mic un-gating in #150 this was masked: the flip rebuilt the video
    // output via micWanted, which restarted the session and re-armed the gate by accident.)
    // iOS also doesn't need the gate: its zoom/torch props bind ungated (see recorder.tsx).
    // Matched to 'android' explicitly (not "everything but iOS") — the guard exists for
    // CameraX, and any other platform would inherit iOS's stuck-gate failure mode instead.
    if (Platform.OS === 'android') setCameraReady(false);
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
    isImporting,
    prefsReady,
    facing,
    torch,
    stabilization,
    muted,
    callActive,
    appActive,
    reportMicPriorityError,
    onCameraReady: () => setCameraReady(true),
    // Wire to <Camera onConfigured>: fires whenever the session's connections are (re)formed —
    // cold open, enableAudio output rebuild, camera flip. Bumping the epoch re-arms the H.264
    // pin for the NEW video connection (the codec is applied per-connection natively, so it
    // dies with the old one on every reconfigure).
    onSessionConfigured: () => setConnectionEpoch((prev) => prev + 1),
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
