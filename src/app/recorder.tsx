import { CameraView } from 'expo-camera';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CameraControls } from '@/features/recorder/camera-controls';
import { CloseButton } from '@/features/recorder/close-button';
import { ImportButton } from '@/features/recorder/import-button';
import { LensSelector } from '@/features/recorder/lens-selector';
import { PermissionGate } from '@/features/recorder/permission-gate';
import { PreviewModal } from '@/features/recorder/preview-modal';
import { RecordButton } from '@/features/recorder/record-button';
import { SegmentBar } from '@/features/recorder/segment-bar';
import { RECORD_BUTTON_SIZE } from '@/features/recorder/track-metrics';
import { useAudioFocus } from '@/features/recorder/use-audio-focus';
import { usePreview } from '@/features/recorder/use-preview';
import { useRecorder } from '@/features/recorder/use-recorder';
import { useRecorderGestures } from '@/features/recorder/use-recorder-gestures';
import { useRecorderPermissions } from '@/features/recorder/use-recorder-permissions';
import { useRecordingTimer } from '@/features/recorder/use-recording-timer';
import { useVideoTrim } from '@/features/recorder/use-video-trim';
import { setActiveDraft } from '@/features/transcription/active-draft';
import { setRecordingActive } from '@/features/transcription/recording-signal';
import { useDraftTranscripts } from '@/features/transcription/use-draft-transcripts';
import { formatDurationPadded } from '@/utils/format';

export default function RecorderScreen() {
  const insets = useSafeAreaInsets();
  const { draftId: draftIdParam } = useLocalSearchParams<{ draftId?: string }>();
  const permissions = useRecorderPermissions();
  const {
    cameraRef,
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
    lens,
    availableLenses,
    onCameraReady,
    toggleRecording,
    importClip,
    startHoldRecording,
    endHoldRecording,
    flipCamera,
    toggleTorch,
    toggleMute,
    selectLens,
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

  // Captions for this draft (read-only) — generation happens in the global background engine
  // (TranscriptionProvider). Mirror the recording state into the engine's signal so Whisper yields
  // while the camera is capturing.
  const transcripts = useDraftTranscripts(draftId);
  useEffect(() => {
    setRecordingActive(isRecording);
  }, [isRecording]);
  useEffect(() => () => setRecordingActive(false), []);

  // Tell the engine which draft is on screen so its clips are captioned first.
  useEffect(() => {
    setActiveDraft(draftId);
    return () => setActiveDraft(null);
  }, [draftId]);

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
  // Tied to screen focus (not per segment) to avoid toggling the session mid-draft.
  const audioFocus = useAudioFocus();
  useEffect(() => {
    if (focused && !muted && prefsReady) void audioFocus.acquire();
    else void audioFocus.release();
  }, [focused, muted, prefsReady, audioFocus]);
  useEffect(() => () => void audioFocus.release(), [audioFocus]);

  const { zoom, holdActive, buttonGesture, pinchGesture, resetZoom } = useRecorderGestures({
    onToggle: toggleRecording,
    onHoldStart: startHoldRecording,
    onHoldEnd: endHoldRecording,
    enabled: cameraReady && !previewing && !dragging,
  });

  // Front/back (and per-lens) max zoom factors differ, so the 0–1 zoom value isn't portable
  // across a flip or lens switch. (Flipping mid-recording already stops the recording natively.)
  useEffect(() => {
    resetZoom();
  }, [facing, lens, resetZoom]);

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

  // The camera should be live only when recording is possible: not while a clip preview is
  // open and not while the Export screen covers the recorder. iOS honors `active={false}` to
  // pause the session in place; Android's `active` prop is a no-op (it's iOS-only in
  // expo-camera), so there we unmount the CameraView entirely to actually drop the session
  // (torch/indicator off, no battery drain). Recording is never in flight when inactive, so
  // unmounting is safe; `useRecorder`'s unmount effect is the stop backstop regardless.
  const cameraActive = !previewing && focused;
  const renderCamera = Platform.OS === 'ios' || cameraActive;

  return (
    <View style={styles.fill}>
      {renderCamera && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          active={cameraActive}
          mode="video"
          videoQuality="1080p"
          facing={facing}
          enableTorch={torch && !previewing}
          videoStabilizationMode={stabilization}
          mute={muted}
          selectedLens={lens}
          autofocus="on"
          zoom={zoom}
          onCameraReady={onCameraReady}
        />
      )}

      {/* Pinch-to-zoom surface. CameraView can't take children, so this sits between it and
          the overlay; the overlay is box-none, so touches that miss a control land here.
          Single-finger touches are inert (Pinch needs two pointers). */}
      <GestureDetector gesture={pinchGesture}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>

      <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="box-none">
        <View
          style={[
            styles.topBar,
            { paddingTop: insets.top + Spacing.two, paddingHorizontal: Spacing.three },
          ]}>
          <CloseButton />
          <Text style={styles.timerText}>{formatDurationPadded(totalMs)}</Text>
          {/* Mirrors the CloseButton's width so the timer stays optically centered. */}
          <View style={styles.topBarSpacer} />
        </View>

        <CameraControls
          facing={facing}
          torch={torch}
          stabilization={stabilization}
          muted={muted}
          disabled={previewing}
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
              captionMs={preview.positionMs}
              transcript={preview.activeId ? transcripts.get(preview.activeId) : undefined}
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
              onEditCaptions={() => {
                if (!preview.activeId || !draftId) return;
                preview.pause();
                router.push(`/subtitles?segmentId=${preview.activeId}&draftId=${draftId}`);
              }}
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
                lenses={availableLenses}
                selected={lens}
                onSelect={selectLens}
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
                <ImportButton onPress={importClip} disabled={isRecording || dragging} />
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
