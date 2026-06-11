import { CameraView } from 'expo-camera';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { CameraControls } from '@/features/recorder/camera-controls';
import { CloseButton } from '@/features/recorder/close-button';
import { PermissionGate } from '@/features/recorder/permission-gate';
import { PreviewModal } from '@/features/recorder/preview-modal';
import { SegmentBar } from '@/features/recorder/segment-bar';
import { RECORD_BUTTON_SIZE } from '@/features/recorder/track-metrics';
import { usePreview } from '@/features/recorder/use-preview';
import { useRecorder } from '@/features/recorder/use-recorder';
import { useRecorderPermissions } from '@/features/recorder/use-recorder-permissions';
import { useVideoTrim } from '@/features/recorder/use-video-trim';

const RECORD_SIZE = RECORD_BUTTON_SIZE;

export default function RecorderScreen() {
  const insets = useSafeAreaInsets();
  const { draftId: draftIdParam } = useLocalSearchParams<{ draftId?: string }>();
  const permissions = useRecorderPermissions();
  const {
    cameraRef,
    draftId,
    segments,
    isRecording,
    cameraReady,
    facing,
    torch,
    stabilization,
    onCameraReady,
    toggleRecording,
    flipCamera,
    toggleTorch,
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

  const confirmDeleteSegment = (id: string) =>
    Alert.alert('Delete clip?', 'This clip will be removed from the draft.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSegment(id) },
    ]);

  if (!permissions.ready) return <ThemedView style={styles.fill} />;
  if (!permissions.granted) {
    return <PermissionGate blocked={permissions.blocked} onRequest={permissions.request} />;
  }

  return (
    <View style={styles.fill}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        active={!previewing && focused}
        mode="video"
        facing={facing}
        enableTorch={torch && !previewing}
        videoStabilizationMode={stabilization}
        onCameraReady={onCameraReady}
      />

      <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="box-none">
        <View style={{ paddingTop: insets.top + Spacing.two, paddingHorizontal: Spacing.three }}>
          <CloseButton onPress={() => router.back()} />
        </View>

        <CameraControls
          top={insets.top + Spacing.six}
          facing={facing}
          torch={torch}
          stabilization={stabilization}
          disabled={previewing}
          onFlip={flipCamera}
          onToggleTorch={toggleTorch}
          onCycleStabilization={cycleStabilization}
        />

        {previewing && preview.active != null && (
          <View style={styles.previewArea} pointerEvents="box-none">
            <PreviewModal
              player={preview.player}
              isPlaying={preview.isPlaying}
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
            <Pressable
              onPress={toggleRecording}
              disabled={!cameraReady || dragging}
              accessibilityRole="button"
              accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
              style={[styles.recordOuter, { opacity: dragging ? 0 : cameraReady ? 1 : 0.4 }]}>
              <View style={isRecording ? styles.recordInnerActive : styles.recordInner} />
            </Pressable>
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
  previewArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottom: { alignItems: 'center', gap: Spacing.three },
  recordOuter: {
    width: RECORD_SIZE,
    height: RECORD_SIZE,
    borderRadius: RECORD_SIZE / 2,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: Accent },
  recordInnerActive: { width: 30, height: 30, borderRadius: 8, backgroundColor: Accent },
});
