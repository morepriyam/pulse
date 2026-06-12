import { SymbolView } from 'expo-symbols';
import { VideoView, type VideoPlayer } from 'expo-video';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

type Props = {
  player: VideoPlayer;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onClose: () => void;
  onTrim: () => void;
  onDelete: () => void;
};

/**
 * Floating preview card over the recorder — the camera UI, record button, and segment bar
 * all stay visible around it. Plays the draft through one shared player; tap toggles play,
 * ✕ closes, ✂ opens the RNVT editor for the active clip, 🗑 deletes. `contentFit="contain"`
 * on black lets the native player honor each clip's rotation matrix (portrait upright).
 */
export function PreviewModal({
  player,
  isPlaying,
  onTogglePlay,
  onClose,
  onTrim,
  onDelete,
}: Props) {
  return (
    <View style={styles.card}>
      <Pressable style={styles.surface} onPress={onTogglePlay} accessibilityLabel="Toggle playback">
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="contain"
          nativeControls={false}
        />
        {!isPlaying && (
          <View style={styles.playOverlay} pointerEvents="none">
            <View style={styles.playBadge}>
              <SymbolView name="play.fill" size={24} tintColor="#fff" />
            </View>
          </View>
        )}
      </Pressable>

      <Pressable
        onPress={onClose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close preview"
        style={[styles.badge, styles.close]}>
        <SymbolView name="xmark" size={14} weight="semibold" tintColor="#fff" />
      </Pressable>

      <Pressable
        onPress={onTrim}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Edit clip"
        style={[styles.badge, styles.trim]}>
        <SymbolView name="scissors" size={16} weight="semibold" tintColor="#fff" />
      </Pressable>

      <Pressable
        onPress={onDelete}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Delete clip"
        style={[styles.badge, styles.delete]}>
        <SymbolView name="trash" size={16} weight="semibold" tintColor="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '72%',
    aspectRatio: 9 / 16,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  surface: { flex: 1 },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  badge: {
    position: 'absolute',
    top: Spacing.two,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    left: Spacing.two,
  },
  delete: {
    right: Spacing.two,
  },
  // Left of the delete badge (28 wide + an 8pt gap).
  trim: {
    right: Spacing.two + 28 + Spacing.two,
  },
});
