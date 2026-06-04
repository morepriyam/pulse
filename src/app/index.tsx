import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.three }]}>
        <ThemedText type="title">Pulse</ThemedText>
      </View>

      {/* Empty state — drafts list slots in here once recording + storage land. */}
      <View style={styles.empty}>
        <SymbolView name="video.badge.plus" size={52} tintColor={theme.textSecondary} />
        <ThemedText style={styles.emptyTitle}>No drafts yet</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.emptyHint}>
          Tap + to record your first video.
        </ThemedText>
      </View>

      <Pressable
        onPress={() => router.push('/recorder')}
        accessibilityRole="button"
        accessibilityLabel="New recording"
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.accent,
            bottom: insets.bottom + Spacing.four,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <SymbolView name="plus" size={28} weight="semibold" tintColor={theme.onAccent} />
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 26,
  },
  emptyHint: {
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    // Soft elevation so the action floats above content.
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
