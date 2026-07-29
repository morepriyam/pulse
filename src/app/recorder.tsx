import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  type Constraint,
  type PhysicalDeviceType,
  useCameraDevice,
} from 'react-native-vision-camera';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CameraControls } from '@/features/recorder/camera-controls';
import { CloseButton } from '@/features/recorder/close-button';
import { ImportButton } from '@/features/recorder/import-button';
import {
  DEFAULT_LENS_LABEL,
  type LensPreset,
  LensSelector,
} from '@/features/recorder/lens-selector';
import { PermissionGate } from '@/features/recorder/permission-gate';
import { PreviewModal } from '@/features/recorder/preview-modal';
import { RecordButton } from '@/features/recorder/record-button';
import { SegmentBar } from '@/features/recorder/segment-bar';
import { RECORD_BUTTON_SIZE } from '@/features/recorder/track-metrics';
import { useAudioFocus } from '@/features/recorder/use-audio-focus';
import { usePreview } from '@/features/recorder/use-preview';
import { useRecorder } from '@/features/recorder/use-recorder';
import { RETICLE_SIZE, useFocusReticle } from '@/features/recorder/use-focus-reticle';
import { useRecorderGestures } from '@/features/recorder/use-recorder-gestures';
import { useRecorderPermissions } from '@/features/recorder/use-recorder-permissions';
import { useRecordingTimer } from '@/features/recorder/use-recording-timer';
import { useVideoTrim } from '@/features/recorder/use-video-trim';
import { formatDurationPadded } from '@/utils/format';
import { closeToHome } from '@/utils/navigation';

// Ask for the full multi-camera device on the back so 0.5x / 1x / Tele are all reachable via
// zoom; the front falls back to its single wide lens automatically.
const PHYSICAL_DEVICES: PhysicalDeviceType[] = ['ultra-wide-angle', 'wide-angle', 'telephoto'];
// Upper zoom cap (factor). Devices expose 100x+ of mostly-unusable digital zoom; cap so the
// drag/pinch range stays useful. Tunable on-device.
const MAX_ZOOM_FACTOR = 16;
// A second -11800 landing this soon after a recovery bounce means the rebuilt session hit the
// same wall (an undetected call still owns the mic) — stop bouncing and drop the mic instead.
const SESSION_ERROR_ESCALATION_MS = 3000;
// One beat for expo-video's post-unload audio-session writes (async, on its own queue) to flush
// before the recording config is restored — restoring first would let a late `.playback` write
// clobber it right back.
const PREVIEW_CLOSE_SETTLE_MS = 50;

export default function RecorderScreen() {
  const insets = useSafeAreaInsets();
  const { draftId: draftIdParam } = useLocalSearchParams<{ draftId?: string }>();
  const permissions = useRecorderPermissions();
  const {
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
    onCameraReady,
    toggleRecording,
    finalizeRecording,
    importClip,
    isImporting,
    startHoldRecording,
    endHoldRecording,
    flipCamera,
    toggleTorch,
    toggleMute,
    cycleStabilization,
    deleteSegment,
    reorderSegments,
  } = useRecorder(draftIdParam);

  // Preview mode: a tapped segment opens the in-recorder preview over the camera area;
  // `null` means record mode. The camera stays mounted but its session pauses.
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Derived as a render-phase adjustment so NO deletion path (✕ taps racing the live
  // query, clear-draft) can strand an open preview with zero segments.
  if (previewId != null && segments.length === 0) setPreviewId(null);
  const preview = usePreview(segments, previewId);
  const previewing = previewId != null;

  // Top running timer: always the live draft total — saved clips plus wall-clock while
  // recording. During preview the playhead position is shown inside the preview card instead.
  const totalMs = useRecordingTimer(segments, recordStartedAt);

  // Trimming = RNVT's full-screen editor, launched from the ✂ button in the preview modal.
  const { openTrim } = useVideoTrim(draftId);

  // True while a clip is being dragged (reorder / drag-to-trash) — hides the record button so
  // the floating trash above the bar has clear space.
  const [dragging, setDragging] = useState(false);

  // While the Export screen is presented over this one, the recorder is unfocused — drop the
  // camera session so it isn't capturing (and burning power) behind the modal. Restored on return.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Audio focus: while the recorder is on screen capturing with a live mic, pause other apps'
  // audio (Spotify / podcasts) rather than mixing it in; restore on leave or mute. Gated on the
  // mic being live — a muted clip has no audio track, so there's nothing to seize focus for.
  // Also released while a call is active: we must yield the audio session to telephony, not fight
  // it for focus. Tied to screen focus (not per segment) to avoid toggling the session mid-draft.
  // `previewing` is a dep so CLOSING the preview re-runs acquire: expo-video's preview player
  // flips the shared AVAudioSession to `.playback` (no mic input) when it plays, which would
  // otherwise leave every post-preview clip recording silence — acquire restores `.playAndRecord`.
  // Destructured because useAudioFocus() returns a fresh object each render — depending on
  // the stable acquire/release callbacks (not the object) keeps the effect from re-running
  // (and re-applying the session config) on every render.
  const { acquire: acquireFocus, release: releaseFocus } = useAudioFocus();
  useEffect(() => {
    const shouldHold = focused && appActive && !muted && !callActive && prefsReady;
    if (previewing) {
      // Preview owns the session config (expo-video forces `.playback`) — skip acquire so we
      // don't fight it; re-acquire runs on close. Still release, though: yielding focus on
      // blur/mute/a call becoming active must keep working even with a preview open.
      if (!shouldHold) void releaseFocus();
      return;
    }
    if (shouldHold) void acquireFocus();
    else void releaseFocus();
  }, [focused, appActive, muted, callActive, prefsReady, previewing, acquireFocus, releaseFocus]);
  useEffect(() => () => void releaseFocus(), [releaseFocus]);

  // Preview-close handoff: closing the preview hands the shared audio session back to the
  // recorder, and the camera restart re-attaches the mic input (enableAudio keeps it on the
  // main capture session). If the restart wins the race against the session-config restore —
  // expo-video's post-unload writes and the acquire above are both async — the mic I/O unit
  // starts under the preview's playback-only category and AVFoundation kills the session with
  // -11800 (underlying -10868, kAudioUnitErr_FormatNotSupported). Sequence instead of race:
  // hold the camera off (cameraActive below) for one settle beat + an acquire, then restart.
  // Detected as a render-phase transition so the same commit that clears `previewing` already
  // holds the camera off. Muted / in-call closes skip the hold — they restart video-only, and
  // a category can't break a session with no mic input.
  const [audioHandoff, setAudioHandoff] = useState(false);
  const [wasPreviewing, setWasPreviewing] = useState(previewing);
  if (wasPreviewing !== previewing) {
    setWasPreviewing(previewing);
    if (!previewing && !muted && !callActive) setAudioHandoff(true);
  }
  useEffect(() => {
    if (!audioHandoff) return;
    let stale = false;
    const timer = setTimeout(() => {
      // acquire never throws (documented in use-audio-focus) — .then always runs.
      void acquireFocus().then(() => {
        if (!stale) setAudioHandoff(false);
      });
    }, PREVIEW_CLOSE_SETTLE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [audioHandoff, acquireFocus]);

  // An AVFoundation -11800 leaves the capture session FROZEN (it doesn't self-recover), so we
  // react to the error directly and bounce the session off→on for a tick to force a clean restart
  // out of the failed state (`recovering` drives the bounce). The -11800 family has two flavors
  // needing different handling:
  //  - '!pri' (561017449): telephony owns the mic — prediction lost the cold-open/resume race
  //    against an in-progress call (the call snapshot read stale and the mic attached anyway).
  //    Drop the mic until the next authoritative call event (reportMicPriorityError rebuilds the
  //    output video-only); recording with it would just re-throw.
  //  - plain -11800 (e.g. underlying -10868, kAudioUnitErr_FormatNotSupported): the session
  //    (re)started while the shared AVAudioSession sat in a playback-only category — the
  //    preview-close handoff race (see the preview handoff above). Transient: re-assert the
  //    recording config and bounce; latching the mic here is issue #124's false "On call" state,
  //    which silently records every later clip without audio. If the bounce lands on the same
  //    wall (a second -11800 inside the escalation window — an undetected call), stop bouncing
  //    and drop the mic after all, so an error can never flicker-loop the camera.
  const [recovering, setRecovering] = useState(false);
  const recoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSessionErrorRef = useRef(0);
  useEffect(() => () => clearTimeout(recoverTimerRef.current ?? undefined), []);
  const onCameraError = useCallback(
    (e: unknown) => {
      const hay = `${String((e as { message?: unknown })?.message ?? '')} ${String(e)}`;
      // CameraX cancels control calls (zoom/torch) that land during session transitions with
      // OperationCanceledException — benign on Android (the next applied value wins), so don't
      // treat it as a real camera error.
      if (
        hay.includes('OperationCanceledException') ||
        hay.includes('Camera is not active') ||
        hay.includes('new enableTorch being set')
      )
        return;
      // VisionCamera wraps the native error; the AVFoundation domain/code and '!pri' four-char code
      // survive in the stringified message, so match on those rather than a brittle wrapper code.
      const micPriority = hay.includes('!pri') || hay.includes('561017449');
      if (!micPriority && !hay.includes('-11800')) {
        console.error('[Camera]', e);
        return;
      }
      // Recovered below — log without the dev red-box a console.error would raise.
      console.warn('[Camera] capture session error, recovering:', e);
      const now = Date.now();
      const repeated = now - lastSessionErrorRef.current < SESSION_ERROR_ESCALATION_MS;
      lastSessionErrorRef.current = now;
      if (micPriority || repeated) {
        reportMicPriorityError();
      } else if (!muted && !callActive) {
        // Restore `.playAndRecord` before the bounce restarts the session, so the retry can't
        // trip over the same stale playback-only category that killed it.
        void acquireFocus();
      }
      // Clustered errors must not let an earlier timer flip `recovering` off mid-bounce — restart it.
      clearTimeout(recoverTimerRef.current ?? undefined);
      setRecovering(true);
      recoverTimerRef.current = setTimeout(() => {
        recoverTimerRef.current = null;
        setRecovering(false);
      }, 150);
    },
    [reportMicPriorityError, muted, callActive, acquireFocus],
  );

  const device = useCameraDevice(facing, { physicalDevices: PHYSICAL_DEVICES });

  // Lens chips are zoom presets on the (possibly multi-camera) device. Each physical lens
  // engages at a zoom boundary: the widest lens at `minZoom`, every subsequent lens at the
  // device's ascending `zoomLensSwitchFactors`. Assigning those boundaries to the present
  // lenses widest→narrowest is the device-agnostic mapping (e.g. a phone whose widest lens is
  // the ultra-wide has 0.5x at minZoom and 1x at the first switch factor — NOT at a literal 1).
  // Only surfaced when the lens exists, so a single-lens front camera shows no chips.
  const { lensPresets, neutralZoom } = useMemo(() => {
    if (!device) return { lensPresets: [] as LensPreset[], neutralZoom: 1 };
    const types = new Set(device.physicalDevices.map((d) => d.type));
    const order = [
      { type: 'ultra-wide-angle', label: '0.5x' },
      { type: 'wide-angle', label: DEFAULT_LENS_LABEL },
      { type: 'telephoto', label: 'Tele' },
    ] as const;
    const present = order.filter((o) => types.has(o.type));
    if (present.length === 0) {
      // Android: CameraX regularly reports no per-lens metadata even on multi-camera phones
      // (physicalDevices comes back empty), so derive presets from the logical zoom bounds
      // instead: a sub-1 minZoom means an ultra-wide is fused into the logical camera, and any
      // switch factor above 1 marks where a telephoto engages. Single-lens devices
      // (minZoom=1, no factors) produce <2 presets and correctly show no chips.
      const derived: LensPreset[] = [];
      if (device.minZoom < 0.95) derived.push({ label: '0.5x', zoom: device.minZoom });
      derived.push({ label: DEFAULT_LENS_LABEL, zoom: 1 });
      const tele = device.zoomLensSwitchFactors.find((f) => f > 1);
      if (tele != null) derived.push({ label: 'Tele', zoom: tele });
      if (derived.length < 2) return { lensPresets: [], neutralZoom: Math.max(1, device.minZoom) };
      return { lensPresets: derived, neutralZoom: 1 };
    }
    const boundaries = [device.minZoom, ...device.zoomLensSwitchFactors];
    const presets: LensPreset[] = present.map((o, i) => ({
      label: o.label,
      zoom: boundaries[i] ?? device.minZoom,
    }));
    // The camera opens at (and flips back to) the 1x wide lens when present, else the widest.
    const neutral = presets.find((p) => p.label === DEFAULT_LENS_LABEL)?.zoom ?? device.minZoom;
    return { lensPresets: presets, neutralZoom: neutral };
  }, [device]);

  // Pinned 1080p output + 30fps so every recorded clip is format-uniform (fast-path merge).
  const constraints = useMemo<Constraint[]>(
    () => [{ videoStabilizationMode: stabilization }, { fps: 30 }],
    [stabilization],
  );
  const outputs = useMemo(() => [videoOutput], [videoOutput]);

  // Tap-to-focus: meters 3A (AF/AE/AWB) to the tapped point and shows a reticle there. Honors
  // VisionCamera's focus guidance (supportsFocusMetering guard; steady while filming, snappy
  // while framing). Focus auto-returns to continuous AF after a few seconds.
  const { onFocus, reticleStyle } = useFocusReticle({
    cameraRef,
    supportsFocus: device?.supportsFocusMetering ?? false,
    isRecording,
  });

  // Re-assert the recording session config right before capture starts — cheap insurance
  // against anything else (another expo-video player, a system event) having flipped the
  // session category since the last acquire. No-op when the config is already correct.
  // Awaited so the session is `.playAndRecord` BEFORE the recorder attaches the mic input
  // (acquire never throws and completes in single-digit ms, so stop-taps aren't delayed).
  const reacquireThen = useCallback(
    (action: () => void) => async () => {
      if (!muted && !callActive) await acquireFocus();
      action();
    },
    [muted, callActive, acquireFocus],
  );

  // Hold-to-record needs more than reacquireThen: acquire() is awaited, and the gesture's
  // release fires synchronously via runOnJS — a quick press-release could run onHoldEnd
  // BEFORE the delayed startHoldRecording() (holdInitiatedRef still false, so nothing to
  // stop), and the start would then fire AFTER the gesture ended, leaving an unheld
  // in-progress recording. Every hold edge bumps a sequence number; the delayed start is
  // dropped when its hold is no longer the live one.
  const holdSeqRef = useRef(0);
  const onHoldStart = useCallback(async () => {
    const seq = ++holdSeqRef.current;
    if (!muted && !callActive) await acquireFocus();
    if (seq === holdSeqRef.current) startHoldRecording();
  }, [muted, callActive, acquireFocus, startHoldRecording]);
  const onHoldEnd = useCallback(() => {
    holdSeqRef.current++;
    endHoldRecording();
  }, [endHoldRecording]);

  const { zoomSv, holdActive, buttonGesture, screenGesture, resetZoom, setZoomTo } =
    useRecorderGestures({
      onToggle: reacquireThen(toggleRecording),
      onHoldStart,
      onHoldEnd,
      onFocus,
      enabled: cameraReady && !previewing && !dragging,
      neutralZoom,
      minZoom: device?.minZoom ?? 1,
      maxZoom: device ? Math.min(device.maxZoom, MAX_ZOOM_FACTOR) : 1,
    });

  // Zoom factors aren't portable across a flip, so reset to neutral 1x. (A lens chip sets its
  // own factor; flipping mid-recording already stops the recording natively.)
  useEffect(() => {
    resetZoom();
  }, [facing, resetZoom]);

  // The highlighted lens chip tracks the LIVE zoom (pinch / drag / chip-tap all move zoomSv),
  // so it reflects whichever physical lens the current factor sits on — the highest preset whose
  // boundary the zoom has reached. runOnJS only fires when the active lens actually changes.
  const [activeLens, setActiveLens] = useState(DEFAULT_LENS_LABEL);
  useAnimatedReaction(
    () => {
      let label = lensPresets[0]?.label;
      for (const p of lensPresets) {
        if (zoomSv.value >= p.zoom) label = p.label;
      }
      return label;
    },
    (label, prev) => {
      if (label != null && label !== prev) runOnJS(setActiveLens)(label);
    },
    [lensPresets],
  );

  const confirmDeleteSegment = (id: string) =>
    Alert.alert('Delete clip?', 'This clip will be removed from the draft.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSegment(id) },
    ]);

  if (!permissions.ready) return <ThemedView style={styles.fill} />;
  if (!permissions.granted) {
    return <PermissionGate blocked={permissions.blocked} onRequest={permissions.request} />;
  }
  // Hold the camera until persisted prefs load, so the first frame uses the saved facing.
  if (!prefsReady) return <ThemedView style={styles.fill} />;

  // The camera is live only when recording is possible: not during preview, not while Export
  // covers this screen, and not while backgrounded — VisionCamera's `isActive` pauses the session
  // in place on both platforms. Background is included (not just preview/blur) because iOS would
  // otherwise auto-resume the session on foreground with the mic still attached, straight into a
  // call that started in the background (the -11800 freeze below); waiting for `appActive` lets
  // call detection re-poll first. `|| isRecording` keeps the session up while a clip finalizes in
  // background, so the segment saves before we tear it down. `!recovering` drops it for one bounce
  // after a mic-priority error so it rebuilds cleanly, and `!audioHandoff` holds the restart after
  // a preview closes until the recording session config is back (see the handoff above).
  const cameraActive =
    !previewing && !audioHandoff && focused && (appActive || isRecording) && !recovering;

  // Close: finalize any in-flight clip (saving it into the draft) before navigating home, so the
  // segment isn't lost when the camera unmounts.
  const handleClose = () => void finalizeRecording().then(closeToHome);

  return (
    <View style={styles.fill}>
      {device && (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={cameraActive}
          outputs={outputs}
          // Zoom/torch are gated until the session has started: CameraX rejects control calls on
          // an inactive camera (OperationCanceledException) where iOS quietly tolerates them, so
          // applying these props on mount — before `onStarted` — throws unhandled rejections on
          // Android. `undefined` makes VisionCamera's updater hooks skip the native call; the
          // shared-value binding still applies the current zoom the moment it attaches.
          zoom={cameraReady ? zoomSv : undefined}
          // ...and torch is additionally gated on hardware: writing any torchMode (even 'off') to
          // a torch-less camera (typically the front one) throws IllegalStateException("No flash
          // unit") on Android, while iOS silently ignores it.
          torchMode={
            cameraReady && device.hasTorch ? (torch && !previewing ? 'on' : 'off') : undefined
          }
          constraints={constraints}
          // Smooth (rather than snapping) continuous-AF transitions — VisionCamera's recommended
          // setting for video, so refocus pulls look cinematic instead of "hunting". Gated on
          // device support so it never throws; tap-to-focus stays snappy via `responsiveness`.
          enableSmoothAutoFocus={device?.supportsSmoothAutoFocus ?? false}
          onStarted={onCameraReady}
          onError={onCameraError}
        />
      )}

      {/* Tap-to-focus + pinch-to-zoom surface. Camera can't take children, so this sits between
          it and the overlay; the overlay is box-none, so touches that miss a control land here.
          Single-finger tap focuses to that point; two-finger pinch zooms. */}
      <GestureDetector gesture={screenGesture}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>

      {/* Focus reticle — driven imperatively by onFocus; pointer-transparent. */}
      <Animated.View pointerEvents="none" style={[styles.reticle, reticleStyle]} />

      <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="box-none">
        <View
          style={[
            styles.topBar,
            { paddingTop: insets.top + Spacing.two, paddingHorizontal: Spacing.three },
          ]}>
          <CloseButton onPress={handleClose} />
          <Text style={styles.timerText}>{formatDurationPadded(totalMs)}</Text>
          {/* Mirrors the CloseButton's width so the timer stays optically centered. */}
          <View style={styles.topBarSpacer} />
        </View>

        <CameraControls
          facing={facing}
          torch={torch}
          stabilization={stabilization}
          muted={muted}
          callActive={callActive}
          // Lock every camera control while a clip is recording — flip / torch / stabilization /
          // mute can't change mid-clip (audio state is fixed at record start, and the others would
          // disrupt or stop capture). Mirrors the lens selector, which is already locked here.
          disabled={previewing || isRecording}
          onFlip={flipCamera}
          onToggleTorch={toggleTorch}
          onCycleStabilization={cycleStabilization}
          onToggleMute={toggleMute}
        />

        {previewing && preview.active != null && (
          <View style={styles.previewArea} pointerEvents="box-none">
            <PreviewModal
              player={preview.player}
              isPlaying={preview.isPlaying}
              positionMs={preview.globalMs}
              totalMs={preview.totalMs}
              onTogglePlay={preview.togglePlay}
              onClose={() => setPreviewId(null)}
              onTrim={() => {
                const seg = preview.active;
                if (!seg) return;
                // Stay in the preview on this clip after the editor closes — edits are
                // usually done together, so this saves a tap. Pause the underlying player
                // while the editor is open; on save, usePreview reloads the clip's new
                // effective file (its load effect keys on the edited filename).
                preview.pause();
                openTrim(seg);
              }}
              onDelete={() => preview.activeId && confirmDeleteSegment(preview.activeId)}
            />
          </View>
        )}

        <View
          style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.three }]}
          pointerEvents="box-none">
          {/* Record button is hidden entirely while previewing — the preview surface owns the
              screen then. During a drag it's faded out (opacity 0, layout kept) so the floating
              trash above the bar has clear space and nothing shifts. */}
          {!previewing && (
            <View style={{ opacity: dragging ? 0 : 1 }}>
              <LensSelector
                presets={lensPresets}
                selected={activeLens}
                onSelect={(preset) => setZoomTo(preset.zoom)}
                disabled={isRecording || dragging}
              />
            </View>
          )}

          {!previewing && (
            <View style={styles.buttonRow}>
              <RecordButton
                gesture={buttonGesture}
                holdActive={holdActive}
                isRecording={isRecording}
                cameraReady={cameraReady}
                dragging={dragging}
              />
              {/* Faded out with the record button during a drag so the trash has clear space. */}
              <View style={[styles.importWrap, { opacity: dragging ? 0 : 1 }]}>
                <ImportButton
                  onPress={importClip}
                  disabled={isRecording || dragging}
                  busy={isImporting}
                />
              </View>
            </View>
          )}

          <SegmentBar
            segments={segments}
            onReorder={reorderSegments}
            // Drag-to-trash deletes immediately (the deliberate drag IS the confirmation) —
            // no Alert here, unlike the preview modal's 🗑 which still confirms.
            onDelete={deleteSegment}
            onDragActiveChange={setDragging}
            onSelect={(id) => {
              if (previewing) preview.selectSegment(id);
              else if (!isRecording) setPreviewId(id);
            }}
            onEdit={(id) => {
              // Hold a thumb → open the editor directly. Does NOT enter preview, so from the
              // recorder it returns to the recorder; from preview it stays in preview
              // (same as the ✂ button). Never opens preview as a side effect.
              if (isRecording) return;
              const seg = segments.find((s) => s.id === id);
              if (!seg) return;
              if (previewing) preview.pause();
              openTrim(seg);
            }}
            cursor={
              previewing
                ? {
                    activeId: preview.activeId,
                    globalMs: preview.globalMs,
                    onScrub: preview.seekToGlobalMs,
                  }
                : undefined
            }
            onNext={
              draftId ? () => router.push({ pathname: '/export', params: { draftId } }) : undefined
            }
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  // Absolutely positioned at the origin; onFocus translates it to the tapped point.
  reticle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  overlay: { justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  topBarSpacer: { width: 40 },
  previewArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottom: { alignItems: 'center', gap: Spacing.three },
  // Full-width row; the record button is centered by the row itself, so its position can't
  // be disturbed by the + control.
  buttonRow: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  // The + sits at the midpoint of the gap between the record button's right edge and the
  // screen edge: 75% marks the center of the right half, +19 shifts past the button's
  // half-width (38/2), -22 centers the 44pt circle on that point.
  importWrap: {
    position: 'absolute',
    left: '75%',
    marginLeft: RECORD_BUTTON_SIZE / 4 - 22,
    top: '50%',
    marginTop: -22,
  },
});
