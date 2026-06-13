import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionMenu, type Anchor, type MenuAction } from '@/components/action-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { deleteDraft, draftListQuery, renameDraft } from '@/db/drafts';
import { clearDrafts, seedDraft, seedSpeedMixed, seedSpeedUniform } from '@/dev/seed';
import { DraftCard } from '@/features/home/draft-card';
import { useTheme } from '@/hooks/use-theme';

type DraftRef = { id: string; name: string | null; anchor: Anchor };

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: drafts } = useLiveQuery(draftListQuery);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  // The draft whose action menu (rename, delete, …) is open; null when closed.
  const [actionsDraft, setActionsDraft] = useState<DraftRef | null>(null);
  // Name shown ahead of the DB write; dropped once the live query reflects it.
  const [pendingRename, setPendingRename] = useState<{ id: string; name: string | null } | null>(
    null,
  );
  // Rows hidden optimistically while their delete is in flight.
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set());

  if (
    pendingRename &&
    drafts.some((d) => d.id === pendingRename.id && d.name === pendingRename.name)
  ) {
    setPendingRename(null);
  }
  // Once a delete lands (row gone from the query), stop tracking it so the set stays small.
  if (deletingIds.size) {
    const live = new Set(drafts.map((d) => d.id));
    if ([...deletingIds].some((id) => !live.has(id))) {
      setDeletingIds(new Set([...deletingIds].filter((id) => live.has(id))));
    }
  }

  const visibleDrafts = drafts.filter((d) => !deletingIds.has(d.id));

  const submitRename = (draftId: string, currentName: string | null, input: string) => {
    setEditingDraftId(null);
    const name = input || null;
    if (name === currentName) return;
    setPendingRename({ id: draftId, name });
    renameDraft(draftId, name).catch(() => {
      setPendingRename(null);
      Alert.alert('Rename failed', 'The draft name could not be saved.');
    });
  };

  const confirmDelete = (draft: DraftRef) => {
    Alert.alert(
      'Delete draft?',
      `“${draft.name || 'Untitled'}” and its clips will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeletingIds((prev) => new Set(prev).add(draft.id));
            deleteDraft(draft.id).catch(() => {
              setDeletingIds((prev) => {
                const next = new Set(prev);
                next.delete(draft.id);
                return next;
              });
              Alert.alert('Delete failed', 'The draft could not be deleted.');
            });
          },
        },
      ],
    );
  };

  // Built per-render from the open draft; new options are added here (§extensible menu).
  const menuActions: MenuAction[] = actionsDraft
    ? [
        {
          key: 'rename',
          label: 'Rename',
          icon: 'pencil',
          onPress: () => {
            setEditingDraftId(actionsDraft.id);
            setActionsDraft(null);
          },
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: 'trash',
          destructive: true,
          onPress: () => {
            const draft = actionsDraft;
            setActionsDraft(null);
            confirmDelete(draft);
          },
        },
      ]
    : [];

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.three }]}>
        <ThemedText type="title">Pulse</ThemedText>
        {__DEV__ && (
          <View style={styles.devRow}>
            <Pressable onPress={() => void seedDraft()} hitSlop={8}>
              <ThemedText themeColor="accent" type="small">
                + seed
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => void seedSpeedUniform()} hitSlop={8}>
              <ThemedText themeColor="accent" type="small">
                + s2
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => void seedSpeedMixed()} hitSlop={8}>
              <ThemedText themeColor="accent" type="small">
                + s3
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => void clearDrafts()} hitSlop={8}>
              <ThemedText themeColor="textSecondary" type="small">
                clear
              </ThemedText>
            </Pressable>
          </View>
        )}
      </View>

      {visibleDrafts.length === 0 ? (
        <View style={styles.empty}>
          <SymbolView name="video.badge.plus" size={52} tintColor={theme.textSecondary} />
          <ThemedText style={styles.emptyTitle}>No drafts yet</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.emptyHint}>
            Tap + to record your first video.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={visibleDrafts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + Spacing.six + Spacing.four },
          ]}
          renderItem={({ item }) => (
            <DraftCard
              name={pendingRename?.id === item.id ? pendingRename.name : item.name}
              firstSegmentFilename={item.firstSegmentFilename}
              firstSegmentThumbnail={item.firstSegmentThumbnail}
              segmentCount={item.segmentCount}
              durationMs={item.durationMs}
              lastModified={item.lastModified}
              editing={editingDraftId === item.id}
              onPress={() => router.push({ pathname: '/recorder', params: { draftId: item.id } })}
              onLongPress={() => setEditingDraftId(item.id)}
              onMore={(anchor) => setActionsDraft({ id: item.id, name: item.name, anchor })}
              onSubmitName={(input) => submitRename(item.id, item.name, input)}
            />
          )}
        />
      )}

      <ActionMenu
        visible={actionsDraft !== null}
        anchor={actionsDraft?.anchor ?? null}
        actions={menuActions}
        onClose={() => setActionsDraft(null)}
      />

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
