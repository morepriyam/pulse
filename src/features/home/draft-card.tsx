import { Image } from 'expo-image';
import { Icon } from '@/components/icon';
import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { Anchor } from '@/components/action-menu';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDraftUploadState } from '@/features/upload/use-uploads';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThumbnail } from '@/hooks/use-thumbnail';
import { formatClipCount, formatDuration, formatRelativeDate } from '@/utils/format';

const NAME_MAX_LENGTH = 40;

type Props = {
  id: string;
  /** Persisted upload status, so the card can show its own upload state on the cover. */
  uploadStatus?: 'idle' | 'uploading' | 'uploaded' | 'failed' | null;
  name: string | null;
  /** Relative path of the draft's first clip; the cover frame's legacy runtime fallback. */
  firstSegmentFilename?: string | null;
  /** Relative path of the first clip's persisted jpeg thumbnail (preferred cover frame). */
  firstSegmentThumbnail?: string | null;
  segmentCount: number;
  durationMs: number;
  lastModified: number;
  /** Swaps the name for an inline text input; entered via long press or the ⋯ menu. */
  editing?: boolean;
  /** Multi-select mode: the ⋯ menu is replaced by a checkbox and onPress toggles selection. */
  selectionMode?: boolean;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Opens the draft's action menu, anchored to the ⋯ button's on-screen rect. */
  onMore?: (anchor: Anchor) => void;
  /** Fires once when editing ends (keyboard done or blur) with the trimmed name. */
  onSubmitName?: (name: string) => void;
};

export function DraftCard({
  id,
  uploadStatus,
  name,
  firstSegmentFilename,
  firstSegmentThumbnail,
  segmentCount,
  durationMs,
  lastModified,
  editing = false,
  selectionMode = false,
  selected = false,
  onPress,
  onLongPress,
  onMore,
  onSubmitName,
}: Props) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const thumbnail = useThumbnail(firstSegmentThumbnail, firstSegmentFilename);
  const moreRef = useRef<View>(null);

  // Live upload state (this session) takes precedence; otherwise fall back to the persisted status
  // so a finished/interrupted upload still reads correctly after a relaunch. The live union's
  // transient 'done'/'error' are mapped onto the card's persisted vocabulary ('uploaded'/'failed')
  // — otherwise a background upload that finishes/fails while sitting on Home would show no badge
  // (the live 'done' masks the persisted 'uploaded' until the in-memory state is acknowledged).
  const live = useDraftUploadState(id);
  const liveMapped =
    live.status === 'uploading'
      ? 'uploading'
      : live.status === 'done'
        ? 'uploaded'
        : live.status === 'error'
          ? 'failed'
          : null;
  const upload =
    liveMapped ??
    (uploadStatus === 'uploaded'
      ? 'uploaded'
      : uploadStatus === 'failed'
        ? 'failed'
        : uploadStatus === 'uploading'
          ? 'uploading'
          : 'idle');
  const uploadProgress = live.status === 'uploading' ? live.progress : 0;

  return (
    <Pressable
      onPress={editing ? undefined : onPress}
      onLongPress={selectionMode ? undefined : onLongPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement, opacity: pressed && !editing ? 0.6 : 1 },
      ]}>
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: theme.backgroundSelected,
            borderColor: theme.border,
            // Opposite-tone shadow so it reads in both modes: black in light, white in dark.
            shadowColor: isDark ? '#fff' : '#000',
          },
        ]}>
        {thumbnail ? (
          <Image source={thumbnail} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Icon name="video.fill" size={18} tintColor={theme.textSecondary} />
        )}
        {upload === 'uploading' && (
          <View style={styles.uploadScrim} pointerEvents="none">
            <UploadRing progress={uploadProgress} />
          </View>
        )}
        {(upload === 'uploaded' || upload === 'failed') && (
          <View style={styles.uploadBadge} pointerEvents="none">
            <Icon
              name={upload === 'uploaded' ? 'checkmark' : 'exclamationmark'}
              size={11}
              tintColor="#fff"
            />
          </View>
        )}
      </View>

      <View style={styles.body}>
        {editing ? (
          <TextInput
            defaultValue={name ?? ''}
            placeholder="Name this draft"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            selectTextOnFocus
            maxLength={NAME_MAX_LENGTH}
            returnKeyType="done"
            onEndEditing={(e) => onSubmitName?.(e.nativeEvent.text.trim())}
            style={[styles.name, styles.nameInput, { color: theme.text }]}
          />
        ) : (
          <ThemedText style={styles.name} numberOfLines={1}>
            {name || 'Untitled'}
          </ThemedText>
        )}
        <ThemedText themeColor="textSecondary" type="small" numberOfLines={1}>
          {formatClipCount(segmentCount)} · {formatDuration(durationMs)} ·{' '}
          {formatRelativeDate(lastModified)}
        </ThemedText>
      </View>

      {selectionMode ? (
        <View
          style={styles.more}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}>
          <Icon
            name={selected ? 'checkmark.circle.fill' : 'circle'}
            size={22}
            tintColor={selected ? theme.accent : theme.textSecondary}
          />
        </View>
      ) : (
        onMore &&
        !editing && (
          <Pressable
            ref={moreRef}
            onPress={() =>
              moreRef.current?.measureInWindow((x, y, width, height) =>
                onMore({ x, y, width, height }),
              )
            }
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Draft options"
            style={({ pressed }) => [styles.more, { opacity: pressed ? 0.5 : 1 }]}>
            <Icon name="ellipsis" size={18} tintColor={theme.textSecondary} />
          </Pressable>
        )
      )}
    </Pressable>
  );
}

const RING = 28;
const RING_STROKE = 3;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

/** A small determinate ring shown over a draft's cover while it uploads (white on a dark scrim). */
function UploadRing({ progress }: { progress: number }) {
  const clamped = Math.max(0.03, Math.min(1, progress));
  return (
    <Svg width={RING} height={RING}>
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={RING_R}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={RING_R}
        stroke="#fff"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - clamped)}
        transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  uploadScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  uploadBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    paddingRight: Spacing.three,
    borderRadius: Spacing.three,
  },
  thumb: {
    width: 44,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    // Lift the cover off the card so it pops a little. A hairline ring carries the separation
    // in dark mode (where a black shadow is invisible against the dark card); the shadow does
    // the lifting in light mode.
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '600',
  },
  nameInput: {
    fontSize: 16,
    // Match the name Text's line box exactly so swapping in the input never changes
    // the body height (which would nudge the subtitle).
    height: 24,
    padding: 0,
  },
  more: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
