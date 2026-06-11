import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { Anchor } from '@/components/action-menu';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThumbnail } from '@/hooks/use-thumbnail';
import { formatClipCount, formatDuration, formatRelativeDate } from '@/utils/format';

const NAME_MAX_LENGTH = 40;

type Props = {
  name: string | null;
  /** Relative path of the draft's first clip; the cover frame is derived from it at runtime. */
  firstSegmentFilename?: string | null;
  segmentCount: number;
  durationMs: number;
  lastModified: number;
  /** Swaps the name for an inline text input; entered via long press or the ⋯ menu. */
  editing?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Opens the draft's action menu, anchored to the ⋯ button's on-screen rect. */
  onMore?: (anchor: Anchor) => void;
  /** Fires once when editing ends (keyboard done or blur) with the trimmed name. */
  onSubmitName?: (name: string) => void;
};

export function DraftCard({
  name,
  firstSegmentFilename,
  segmentCount,
  durationMs,
  lastModified,
  editing = false,
  onPress,
  onLongPress,
  onMore,
  onSubmitName,
}: Props) {
  const theme = useTheme();
  const thumbnail = useThumbnail(firstSegmentFilename);
  const moreRef = useRef<View>(null);

  return (
    <Pressable
      onPress={editing ? undefined : onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement, opacity: pressed && !editing ? 0.6 : 1 },
      ]}>
      <View style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]}>
        {thumbnail ? (
          <Image source={thumbnail} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <SymbolView name="video.fill" size={18} tintColor={theme.textSecondary} />
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

      {onMore && !editing && (
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
          <SymbolView name="ellipsis" size={18} tintColor={theme.textSecondary} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
