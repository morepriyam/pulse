import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DraftCard } from '@/components/draft-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { devClearDrafts, devSeedDraft, draftListQuery } from '@/db/drafts';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: drafts } = useLiveQuery(draftListQuery);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.three }]}>
        <ThemedText type="title">Pulse</ThemedText>
        {__DEV__ && (
          <View style={styles.devRow}>
            <Pressable onPress={devSeedDraft} hitSlop={8}>
              <ThemedText themeColor="accent" type="small">
                + seed
              </ThemedText>
            </Pressable>
            <Pressable onPress={devClearDrafts} hitSlop={8}>
              <ThemedText themeColor="textSecondary" type="small">
                clear
              </ThemedText>
            </Pressable>
          </View>
        )}
      </View>

      {drafts.length === 0 ? (
        <View style={styles.empty}>
          <SymbolView name="video.badge.plus" size={52} tintColor={theme.textSecondary} />
          <ThemedText style={styles.emptyTitle}>No drafts yet</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.emptyHint}>
            Tap + to record your first video.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + Spacing.six + Spacing.four },
          ]}
          renderItem={({ item }) => (
            <DraftCard
              name={item.name}
              firstSegmentFilename={item.firstSegmentFilename}
              segmentCount={item.segmentCount}
              durationMs={item.durationMs}
              lastModified={item.lastModified}
              onPress={() => router.push({ pathname: '/recorder', params: { draftId: item.id } })}
            />
          )}
        />
      )}

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
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  devRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  list: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
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
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
