import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { DestinationOption } from './use-destinations';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** A small beat/merged pill so the upload strategy is legible at a glance on each chip/row. */
export function ModeBadge({ uploadUnit }: { uploadUnit: 'beat' | 'merged' }) {
  const theme = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: theme.background }]}>
      <ThemedText type="caption2" themeColor="textSecondary" style={styles.badgeText}>
        {uploadUnit}
      </ThemedText>
    </View>
  );
}

/**
 * Horizontal, scrollable picker of paired upload destinations (§ destination pool). Shown on the
 * export screen so the user can change their mind about *where* to send a pulse right up to the
 * moment they tap Upload. Each chip names the host, its beat/merged mode, and its expiry; the
 * selected one is outlined in the accent color. Selection is presentational only — nothing is
 * committed until the Upload button claims the selected destination.
 */
export function DestinationSelector({
  destinations,
  selectedId,
  onSelect,
}: {
  destinations: DestinationOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup">
      {destinations.map((d) => {
        const selected = d.id === selectedId;
        return (
          <Pressable
            key={d.id}
            onPress={() => onSelect(d.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`Upload to ${hostOf(d.server)}, ${d.uploadUnit}, ${d.expiryLabel}`}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: selected ? theme.accent : 'transparent',
              },
              pressed && styles.pressed,
            ]}>
            <View style={styles.chipHeader}>
              {selected && <Icon name="checkmark.circle.fill" size={14} tintColor={theme.accent} />}
              <ThemedText type="smallBold" numberOfLines={1} style={styles.host}>
                {hostOf(d.server)}
              </ThemedText>
            </View>
            <View style={styles.chipMeta}>
              <ModeBadge uploadUnit={d.uploadUnit} />
              <ThemedText type="caption2" themeColor="textSecondary">
                {d.expiryLabel}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two, paddingVertical: Spacing.one },
  chip: {
    minWidth: 132,
    maxWidth: 200,
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
    borderWidth: 2,
  },
  chipHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  host: { flexShrink: 1 },
  chipMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
    borderRadius: 6,
  },
  badgeText: { textTransform: 'uppercase', letterSpacing: 0.5 },
  pressed: { opacity: 0.85 },
});
