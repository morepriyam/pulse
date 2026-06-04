import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatClipCount, formatDuration, formatRelativeDate } from '@/utils/format';
import { ThemedText } from './themed-text';

type Props = {
  name: string | null;
  thumbnailUri?: string | null;
  segmentCount: number;
  durationMs: number;
  lastModified: number;
  onPress?: () => void;
};

export function DraftCard({
  name,
  thumbnailUri,
  segmentCount,
  durationMs,
  lastModified,
  onPress,
}: Props) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]}>
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <SymbolView name="video.fill" size={18} tintColor={theme.textSecondary} />
        )}
      </View>

      <View style={styles.body}>
        <ThemedText style={styles.name} numberOfLines={1}>
          {name || 'Untitled'}
        </ThemedText>
        <ThemedText themeColor="textSecondary" type="small">
          {formatClipCount(segmentCount)} · {formatDuration(durationMs)}
        </ThemedText>
      </View>

      <ThemedText themeColor="textSecondary" type="small">
        {formatRelativeDate(lastModified)}
      </ThemedText>
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
});
