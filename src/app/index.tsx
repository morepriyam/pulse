import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { Icon } from '@/components/icon';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionMenu, type Anchor, type MenuAction } from '@/components/action-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { deleteDraft, draftListQuery, renameDraft } from '@/db/drafts';
import { selectedModelQuery } from '@/db/settings';
import { useDraftTransfer } from '@/features/draft-transfer/use-draft-transfer';
import { DraftCard } from '@/features/home/draft-card';
import { useOnboardingRedirect } from '@/features/onboarding/use-onboarding-redirect';
import { ModelSwitcherModal } from '@/features/transcription/model-switcher-modal';
import { resolveSelectedModel } from '@/features/transcription/models';
import { DestinationsFloat } from '@/features/upload/destinations-float';
import { uploads } from '@/features/upload/upload-manager';
import { useTheme } from '@/hooks/use-theme';

// Dev-only seeding controls, behind a `__DEV__`-guarded require so the component and `@/dev/seed`
// (with its perf fixtures) are dead-code-eliminated from the production bundle, not just hidden.
const DevSeedRow = __DEV__
  ? (require('@/dev/dev-seed-row') as typeof import('@/dev/dev-seed-row')).DevSeedRow
  : null;

type DraftRef = { id: string; name: string | null; anchor: Anchor };

export default function HomeScreen() {
  // First-run gate: pushes the onboarding tour over home when not yet completed.
  useOnboardingRedirect();

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

  // Multi-select for `.pulse` export. `selectionMode` swaps the header for a selection toolbar
  // and turns each card into a checkbox; `selectedIds` tracks the chosen drafts.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const { busy, state: transferState, shareDrafts, importDrafts } = useDraftTransfer();

  // On-device AI: the globally-selected model (persisted) that powers captions today and more
  // on-device features later. Weights download lazily at export time; here we just open the panel
  // and reflect whether a model is active (migrating a retired stored id to its replacement).
  const { data: modelRow } = useLiveQuery(selectedModelQuery, []);
  const selectedModel = resolveSelectedModel(modelRow[0]?.value);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Once the live query reflects the pending name, drop it so the DB value takes back over.
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
  const allSelected = visibleDrafts.length > 0 && visibleDrafts.every((d) => selectedIds.has(d.id));

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(visibleDrafts.map((d) => d.id)));

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
            // Stop any in-flight upload FIRST — deleting the row/files under a running session
            // would otherwise let a deleted draft finish landing on the server (or die midway
            // with a file-not-found), and strand its session in the manager.
            uploads
              .cancel(draft.id)
              .then(() => deleteDraft(draft.id))
              .catch(() => {
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

  // Built per-render from the open draft; new actions are added here.
  const actionsDraftStatus = actionsDraft
    ? drafts.find((d) => d.id === actionsDraft.id)?.uploadStatus
    : null;
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
        // Only for a draft whose upload failed (the ! badge) — re-drives it via the background
        // manager (reusing/reconstructing the session) without reopening the export screen.
        ...(actionsDraftStatus === 'failed'
          ? [
              {
                key: 'retry-upload',
                label: 'Retry upload',
                icon: 'arrow.clockwise',
                onPress: () => {
                  const draftId = actionsDraft.id;
                  setActionsDraft(null);
                  void uploads.retry(draftId);
                },
              } satisfies MenuAction,
            ]
          : []),
        // Only while the upload is running (the progress ring) — aborts and resets to idle
        // without reopening the export screen; the manager also server-cancels best-effort.
        ...(actionsDraftStatus === 'uploading'
          ? [
              {
                key: 'cancel-upload',
                label: 'Cancel upload',
                icon: 'xmark',
                onPress: () => {
                  const draftId = actionsDraft.id;
                  setActionsDraft(null);
                  void uploads.cancel(draftId);
                },
              } satisfies MenuAction,
            ]
          : []),
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
      {selectionMode ? (
        <View style={[styles.header, { paddingTop: insets.top + Spacing.three }]}>
          <Pressable onPress={exitSelection} hitSlop={12} accessibilityRole="button">
            <ThemedText themeColor="accent">Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">
            {selectedIds.size === 0 ? 'Select drafts' : `${selectedIds.size} selected`}
          </ThemedText>
          <Pressable
            onPress={toggleSelectAll}
            hitSlop={12}
            accessibilityRole="button"
            disabled={visibleDrafts.length === 0}>
            <ThemedText themeColor={visibleDrafts.length === 0 ? 'textSecondary' : 'accent'}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.header, { paddingTop: insets.top + Spacing.three }]}>
          <ThemedText type="title">Pulse</ThemedText>
          <View style={styles.headerActions}>
            <Pressable
              onPress={importDrafts}
              hitSlop={12}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={
                transferState === 'importing' ? 'Importing drafts' : 'Import drafts'
              }
              accessibilityHint="Imports drafts from a .pulse file"
              accessibilityState={{ disabled: busy, busy: transferState === 'importing' }}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && { backgroundColor: theme.backgroundElement },
              ]}>
              {transferState === 'importing' ? (
                <ActivityIndicator size="small" color={theme.textSecondary} />
              ) : (
                <Icon
                  name="square.and.arrow.down"
                  size={20}
                  tintColor={busy ? theme.textSecondary : theme.text}
                />
              )}
              <ThemedText
                type="smallBold"
                themeColor={busy ? 'textSecondary' : 'text'}
                style={styles.headerButtonLabel}>
                Import
              </ThemedText>
            </Pressable>
            {visibleDrafts.length > 0 && (
              <Pressable
                onPress={() => setSelectionMode(true)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Export drafts"
                accessibilityHint="Select drafts to share as a .pulse file"
                style={({ pressed }) => [
                  styles.headerButton,
                  pressed && { backgroundColor: theme.backgroundElement },
                ]}>
                <Icon name="square.and.arrow.up" size={20} tintColor={theme.text} />
                <ThemedText type="smallBold" style={styles.headerButtonLabel}>
                  Export
                </ThemedText>
              </Pressable>
            )}
            <Pressable
              onPress={() => setPickerOpen(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="On-device AI model"
              accessibilityHint="Choose the model used for captions"
              accessibilityState={{ selected: !!selectedModel }}
              accessibilityValue={{ text: selectedModel ? selectedModel.label : 'Off' }}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && { backgroundColor: theme.backgroundElement },
              ]}>
              <Icon
                name="wand.and.stars"
                size={20}
                tintColor={selectedModel ? theme.accent : theme.textSecondary}
              />
              <ThemedText
                type="smallBold"
                themeColor={selectedModel ? 'accent' : 'textSecondary'}
                style={styles.headerButtonLabel}>
                Model
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {/* Dev-only seeding controls live on their own line so they never crowd the AI action. */}
      {DevSeedRow && (
        <View style={styles.devRowWrap}>
          <DevSeedRow />
        </View>
      )}

      {visibleDrafts.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="video.badge.plus" size={52} tintColor={theme.textSecondary} />
          <ThemedText type="title3" style={styles.emptyTitle}>
            No drafts yet
          </ThemedText>
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
              id={item.id}
              uploadStatus={item.uploadStatus}
              name={pendingRename?.id === item.id ? pendingRename.name : item.name}
              firstSegmentFilename={item.firstSegmentFilename}
              firstSegmentThumbnail={item.firstSegmentThumbnail}
              segmentCount={item.segmentCount}
              durationMs={item.durationMs}
              lastModified={item.lastModified}
              editing={editingDraftId === item.id}
              selectionMode={selectionMode}
              selected={selectedIds.has(item.id)}
              onPress={() =>
                selectionMode
                  ? toggleSelected(item.id)
                  : router.push({ pathname: '/recorder', params: { draftId: item.id } })
              }
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

      {selectionMode ? (
        <Pressable
          onPress={() => shareDrafts([...selectedIds])}
          disabled={selectedIds.size === 0 || busy}
          accessibilityRole="button"
          accessibilityLabel="Share selected drafts"
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.accent,
              bottom: insets.bottom + Spacing.four,
              opacity: selectedIds.size === 0 || busy ? 0.4 : pressed ? 0.85 : 1,
            },
          ]}>
          {transferState === 'exporting' ? (
            <ActivityIndicator color={theme.onAccent} />
          ) : (
            <Icon
              name="square.and.arrow.up"
              size={26}
              weight="semibold"
              tintColor={theme.onAccent}
            />
          )}
        </Pressable>
      ) : (
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
          <Icon name="plus" size={28} weight="semibold" tintColor={theme.onAccent} />
        </Pressable>
      )}

      {/* Bottom-left float for the paired upload-destination pool (view/delete); clears the +
          FAB at bottom-right. Hidden during .pulse multi-select to avoid crowding that toolbar. */}
      {!selectionMode && <DestinationsFloat />}

      <ModelSwitcherModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // Shared header action: icon stacked above its label, with a ≥44×44pt touch target (HIG).
  headerButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    minHeight: 44,
    minWidth: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
  },
  headerButtonLabel: { fontSize: 11, lineHeight: 13 },
  devRowWrap: {
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.four,
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
  // Size/leading come from the `title3` type; keep it semibold for the empty-state heading.
  emptyTitle: {
    fontWeight: '600',
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
