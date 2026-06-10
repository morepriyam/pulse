import { CameraView } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { CameraControls } from '@/features/recorder/camera-controls';
import { CloseButton } from '@/features/recorder/close-button';
import { PermissionGate } from '@/features/recorder/permission-gate';
import { PreviewModal } from '@/features/recorder/preview-modal';
import { SegmentBar } from '@/features/recorder/segment-bar';
import { usePreview } from '@/features/recorder/use-preview';
import { useRecorder } from '@/features/recorder/use-recorder';
import { useRecorderPermissions } from '@/features/recorder/use-recorder-permissions';

const RECORD_SIZE = 76;

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

  // Preview mode (§1.0a): a tapped segment opens the in-recorder preview over the camera
  // area; `null` means record mode. The camera stays mounted but its session pauses.
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Derived as a render-phase adjustment so NO deletion path (✕ taps racing the live
  // query, future swipe-to-delete, clear-draft) can strand an open preview with zero
  // segments — which would disable the whole recorder with no close affordance left.
  if (previewId != null && segments.length === 0) setPreviewId(null);
  const preview = usePreview(segments, previewId);
  const previewing = previewId != null;

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
        active={!previewing}
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
            />
          </View>
        )}

        <View
          style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.three }]}
          pointerEvents="box-none">
          <Pressable
            onPress={toggleRecording}
            disabled={!cameraReady || previewing}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            style={[styles.recordOuter, { opacity: cameraReady && !previewing ? 1 : 0.4 }]}>
            <View style={isRecording ? styles.recordInnerActive : styles.recordInner} />
          </Pressable>

          <SegmentBar
            segments={segments}
            onReorder={reorderSegments}
            onDelete={confirmDeleteSegment}
            onSelect={(id) => {
              if (previewing) preview.selectSegment(id);
              else if (!isRecording) setPreviewId(id);
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
              draftId
                ? () =>
                    Alert.alert(
                      'Export coming soon',
                      'Merging and uploading the draft lands in a later milestone. Your edits are saved.',
                    )
                : undefined
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
