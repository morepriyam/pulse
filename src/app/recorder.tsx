import { CameraView } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { CameraControls } from '@/features/recorder/camera-controls';
import { CloseButton } from '@/features/recorder/close-button';
import { PermissionGate } from '@/features/recorder/permission-gate';
import { SegmentBar } from '@/features/recorder/segment-bar';
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

  if (!permissions.ready) return <ThemedView style={styles.fill} />;
  if (!permissions.granted) {
    return <PermissionGate blocked={permissions.blocked} onRequest={permissions.request} />;
  }

  return (
    <View style={styles.fill}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        mode="video"
        facing={facing}
        enableTorch={torch}
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
          onFlip={flipCamera}
          onToggleTorch={toggleTorch}
          onCycleStabilization={cycleStabilization}
        />

        <View
          style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.three }]}
          pointerEvents="box-none">
          <Pressable
            onPress={toggleRecording}
            disabled={!cameraReady}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            style={[styles.recordOuter, { opacity: cameraReady ? 1 : 0.4 }]}>
            <View style={isRecording ? styles.recordInnerActive : styles.recordInner} />
          </Pressable>

          <SegmentBar
            segments={segments}
            onReorder={reorderSegments}
            onDelete={deleteSegment}
            onNext={
              draftId
                ? () => router.push({ pathname: '/timeline', params: { draftId } })
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
