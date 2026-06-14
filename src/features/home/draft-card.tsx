import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { Anchor } from '@/components/action-menu';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThumbnail } from '@/hooks/use-thumbnail';
import { formatClipCount, formatDuration, formatRelativeDate } from '@/utils/format';

const NAME_MAX_LENGTH = 40;

type Props = {
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

      {selectionMode ? (
        <View style={styles.more} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
          <SymbolView
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
            <SymbolView name="ellipsis" size={18} tintColor={theme.textSecondary} />
          </Pressable>
        )
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
