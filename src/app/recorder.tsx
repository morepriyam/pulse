import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';

type LocalSegment = { id: string; uri: string };

export default function RecorderScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [camPermission, requestCam] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const [segments, setSegments] = useState<LocalSegment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHolding = useRef(false);

  const granted = !!camPermission?.granted && !!micPermission?.granted;
  const askedOnce = useRef(false);

  // Just-in-time: ask for camera + mic the moment the recorder opens.
  useEffect(() => {
    if (askedOnce.current || !camPermission || !micPermission || granted) return;
    askedOnce.current = true;
    void (async () => {
      if (!camPermission.granted && camPermission.canAskAgain) await requestCam();
      if (!micPermission.granted && micPermission.canAskAgain) await requestMic();
    })();
  }, [camPermission, micPermission, granted, requestCam, requestMic]);

  async function startRecording() {
    if (!cameraRef.current || isRecording || !cameraReady) return;
    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync();
      if (video?.uri) {
        setSegments((prev) => [...prev, { id: String(Date.now()), uri: video.uri }]);
      }
    } catch {
      // recording was interrupted — drop it.
    } finally {
      setIsRecording(false);
    }
  }

  function stopRecording() {
    cameraRef.current?.stopRecording();
  }

  function deleteSegment(id: string) {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }

  // --- Permission gate -------------------------------------------------------
  if (!camPermission || !micPermission) {
    return <ThemedView style={styles.fill} />;
  }

  if (!granted) {
    const blocked = !camPermission.canAskAgain || !micPermission.canAskAgain;
    return (
      <ThemedView style={[styles.fill, styles.permission]}>
        <CloseButton top={insets.top} />
        <SymbolView name="camera.fill" size={48} tintColor={Accent} />
        <ThemedText style={styles.permissionTitle}>Camera access needed</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.permissionBody}>
          Pulse records video with your camera and microphone.
        </ThemedText>
        <Pressable
          onPress={() => {
            if (blocked) {
              void Linking.openSettings();
            } else {
              void requestCam();
              void requestMic();
            }
          }}
          style={({ pressed }) => [styles.allowButton, { opacity: pressed ? 0.85 : 1 }]}>
          <ThemedText themeColor="onAccent" style={styles.allowLabel}>
            {blocked ? 'Open Settings' : 'Allow access'}
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  // --- Camera ----------------------------------------------------------------
  return (
    <View style={styles.fill}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        mode="video"
        facing="back"
        onCameraReady={() => setCameraReady(true)}
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={{ paddingTop: insets.top + Spacing.two, paddingHorizontal: Spacing.three }}>
          <CloseButton onPress={() => router.back()} />
        </View>

        <View style={styles.spacer} pointerEvents="box-none" />

        <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.three }]} pointerEvents="box-none">
          <Pressable
            onPress={isRecording ? stopRecording : startRecording}
            disabled={!cameraReady}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            style={[styles.recordOuter, { opacity: cameraReady ? 1 : 0.4 }]}>
            <View style={isRecording ? styles.recordInnerActive : styles.recordInner} />
          </Pressable>

          {segments.length > 0 && (
            <View style={styles.bar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.barContent}>
                {segments.map((segment) => (
                  <View key={segment.id} style={styles.thumb}>
                    <SymbolView name="video.fill" size={18} tintColor="rgba(255,255,255,0.8)" />
                    <Pressable
                      onPress={() => deleteSegment(segment.id)}
                      hitSlop={6}
                      style={styles.thumbDelete}
                      accessibilityLabel="Delete clip">
                      <SymbolView name="xmark.circle.fill" size={20} tintColor="#fff" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>

              <Pressable
                onPress={() => router.push('/timeline')}
                accessibilityRole="button"
                accessibilityLabel="Next"
                style={({ pressed }) => [styles.nextButton, { opacity: pressed ? 0.85 : 1 }]}>
                <SymbolView name="arrow.right" size={22} weight="semibold" tintColor="#fff" />
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function CloseButton({ onPress, top }: { onPress?: () => void; top?: number }) {
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={[styles.close, top !== undefined && { position: 'absolute', top: top + Spacing.two, left: Spacing.four }]}>
      <SymbolView name="xmark" size={22} weight="semibold" tintColor="#fff" />
    </Pressable>
  );
}

const RECORD_SIZE = 76;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  spacer: { flex: 1 },

  // Permission screen
  permission: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingHorizontal: Spacing.five },
  permissionTitle: { fontSize: 20, fontWeight: '600' },
  permissionBody: { textAlign: 'center' },
  allowButton: {
    marginTop: Spacing.two,
    backgroundColor: Accent,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  allowLabel: { fontWeight: '600' },

  close: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // Bottom controls
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

  // Segment bar
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  barContent: { gap: Spacing.two, alignItems: 'center', paddingRight: Spacing.two },
  thumb: {
    width: 48,
    height: 64,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbDelete: { position: 'absolute', top: -6, right: -6 },
  nextButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
