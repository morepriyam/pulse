import { CameraType, CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { createVideoPlayer, VideoThumbnail } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';

type LocalSegment = { id: string; uri: string; thumbnail?: VideoThumbnail };

type Player = ReturnType<typeof createVideoPlayer>;

/** Resolves once the player has loaded enough to extract frames (or errors / times out). */
function whenReady(player: Player): Promise<void> {
  return new Promise((resolve) => {
    if (player.status === 'readyToPlay') return resolve();
    const done = () => {
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' || status === 'error') done();
    });
    const timer = setTimeout(done, 5000); // safety net so a stuck load can't hang
  });
}

/** First-frame thumbnail for a freshly recorded clip (expo-video, §thumbnails). */
async function makeThumbnail(uri: string): Promise<VideoThumbnail | undefined> {
  let player: Player | undefined;
  try {
    player = createVideoPlayer(uri);
    await whenReady(player); // generation returns [] if the asset isn't loaded yet
    const thumbs = await player.generateThumbnailsAsync(0, { maxWidth: 96, maxHeight: 128 });
    return thumbs[0];
  } catch (e) {
    console.warn('[thumb] failed for', uri, e);
    return undefined; // keep the placeholder icon if extraction fails
  } finally {
    player?.release();
  }
}

// Full set of expo-camera stabilization modes (§2.2 — richer than the original's on/off).
const STABILIZATION_MODES = ['off', 'standard', 'cinematic', 'auto'] as const;
type StabilizationMode = (typeof STABILIZATION_MODES)[number];
const STABILIZATION_LABELS: Record<StabilizationMode, string> = {
  off: 'Off',
  standard: 'Std',
  cinematic: 'Cine',
  auto: 'Auto',
};

export default function RecorderScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [camPermission, requestCam] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const [segments, setSegments] = useState<LocalSegment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [torch, setTorch] = useState(false);
  // Default 'off' so the preview FOV matches what gets recorded (no zoom jump at
  // record start). Stabilization crops the recording connection and expo-camera
  // can't crop the preview to match, so the richer modes stay opt-in.
  const [stabilization, setStabilization] = useState<StabilizationMode>('off');
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHolding = useRef(false);
  const barScrollRef = useAnimatedRef<Animated.ScrollView>();

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
        const id = String(Date.now());
        const uri = video.uri;
        // Show the clip right away; fill in its thumbnail when it's ready.
        setSegments((prev) => [...prev, { id, uri }]);
        void makeThumbnail(uri).then((thumbnail) => {
          if (!thumbnail) return;
          setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, thumbnail } : s)));
        });
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

  function flipCamera() {
    setFacing((prev) => {
      const next = prev === 'back' ? 'front' : 'back';
      if (next === 'front') setTorch(false); // torch is back-camera only
      return next;
    });
  }

  function cycleStabilization() {
    setStabilization((prev) => {
      const i = STABILIZATION_MODES.indexOf(prev);
      return STABILIZATION_MODES[(i + 1) % STABILIZATION_MODES.length];
    });
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
        facing={facing}
        enableTorch={torch}
        videoStabilizationMode={stabilization}
        onCameraReady={() => setCameraReady(true)}
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={{ paddingTop: insets.top + Spacing.two, paddingHorizontal: Spacing.three }}>
          <CloseButton onPress={() => router.back()} />
        </View>

        <View style={styles.spacer} pointerEvents="box-none">
          <View style={[styles.rail, { top: insets.top + Spacing.six }]}>
            <ControlButton
              icon="arrow.triangle.2.circlepath.camera"
              label="Flip camera"
              onPress={flipCamera}
            />
            <ControlButton
              icon={torch ? 'bolt.fill' : 'bolt.slash.fill'}
              label={torch ? 'Turn off flash' : 'Turn on flash'}
              tint={torch ? Accent : '#fff'}
              disabled={facing === 'front'}
              onPress={() => setTorch((t) => !t)}
            />
            <ControlButton
              icon="gyroscope"
              label={`Stabilization: ${STABILIZATION_LABELS[stabilization]}`}
              caption={STABILIZATION_LABELS[stabilization]}
              tint={stabilization === 'off' ? '#fff' : Accent}
              onPress={cycleStabilization}
            />
          </View>
        </View>

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
              <Animated.ScrollView
                ref={barScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.barScroll}
                contentContainerStyle={styles.barContent}>
                <Sortable.Grid
                  rows={1}
                  rowHeight={THUMB_HEIGHT}
                  columnGap={Spacing.two}
                  data={segments}
                  keyExtractor={(s) => s.id}
                  scrollableRef={barScrollRef}
                  autoScrollDirection="horizontal"
                  onDragEnd={({ data }) => setSegments(data)}
                  renderItem={({ item }) => (
                    <View style={styles.thumb}>
                      {item.thumbnail ? (
                        <Image source={item.thumbnail} style={styles.thumbImage} contentFit="cover" />
                      ) : (
                        <SymbolView name="video.fill" size={18} tintColor="rgba(255,255,255,0.8)" />
                      )}
                      <Pressable
                        onPress={() => deleteSegment(item.id)}
                        hitSlop={6}
                        style={styles.thumbDelete}
                        accessibilityLabel="Delete clip">
                        <SymbolView name="xmark" size={11} weight="bold" tintColor="#fff" />
                      </Pressable>
                    </View>
                  )}
                />
              </Animated.ScrollView>

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

function ControlButton({
  icon,
  label,
  onPress,
  tint = '#fff',
  caption,
  disabled = false,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  tint?: string;
  caption?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.controlWrap, { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}>
      <View style={styles.control}>
        <SymbolView name={icon} size={24} weight="medium" tintColor={tint} />
      </View>
      {caption && <Text style={[styles.controlCaption, { color: tint }]}>{caption}</Text>}
    </Pressable>
  );
}

const RECORD_SIZE = 76;
const THUMB_HEIGHT = 64;

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

  // Right-side control rail
  rail: {
    position: 'absolute',
    right: Spacing.three,
    gap: Spacing.three,
    alignItems: 'center',
  },
  controlWrap: { alignItems: 'center', gap: 2 },
  control: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  controlCaption: { fontSize: 10, fontWeight: '600' },

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
  barScroll: { flex: 1 },
  barContent: { alignItems: 'center', paddingRight: Spacing.two },
  thumb: {
    width: 48,
    height: THUMB_HEIGHT,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: Spacing.two },
  thumbDelete: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
