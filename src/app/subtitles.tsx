import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEvent } from 'expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { segmentsForDraft } from '@/db/drafts';
import { clearEditedTranscript, getDraftTranscriptRow } from '@/db/transcripts';
import { CloseButton } from '@/features/recorder/close-button';
import { CaptionOverlay } from '@/features/transcription/caption-overlay';
import { CueRow } from '@/features/transcription/cue-row';
import { CueToolbar } from '@/features/transcription/cue-toolbar';
import { useAutosaveTranscript } from '@/features/transcription/use-autosave-transcript';
import { type Cue, useSubtitleEditor } from '@/features/transcription/use-subtitle-editor';
import { parseTranscriptLines, type TranscriptLine } from '@/features/transcription/whisper';
import { useParkedPlayback } from '@/hooks/use-parked-playback';
import { useTheme } from '@/hooks/use-theme';
import { toFileUri } from '@/utils/file-store';
import { effMs, segmentSignature } from '@/utils/segment-window';

export default function SubtitlesScreen() {
  // Edits the MERGED video's captions. `videoUri` is the merged export output, passed from the
  // export screen; `draftId` anchors the single draft transcript row that edits persist to.
  const { draftId, videoUri } = useLocalSearchParams<{ draftId?: string; videoUri?: string }>();
  const [data, setData] = useState<{
    signature: string;
    initial: TranscriptLine[];
    autoLines: TranscriptLine[];
    savedJson: string | null;
  } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!draftId || !videoUri) return setMissing(true);
      // Signature snapshot of the current segment set — the same key export/transcription use, so
      // an autosave here is tied to exactly the timeline the shown merged video was cut from.
      const segments = await segmentsForDraft(draftId);
      const clips = segments.filter((s) => effMs(s) > 0);
      const signature = segmentSignature(clips);
      const row = await getDraftTranscriptRow(draftId);
      const autoLines = parseTranscriptLines(row?.lines ?? null);
      const savedJson = row?.editedLines ?? null;
      const initial = savedJson ? parseTranscriptLines(savedJson) : autoLines;
      if (alive) setData({ signature, initial, autoLines, savedJson });
    })();
    return () => {
      alive = false;
    };
  }, [draftId, videoUri]);

  if (missing) {
    return (
      <ThemedView style={[styles.fill, styles.centerAll]}>
        <ThemedText>Captions unavailable — export the video first.</ThemedText>
        <Pressable onPress={() => router.back()} style={styles.linkBtn}>
          <ThemedText style={{ color: Accent }}>Go back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (!data) {
    return (
      <ThemedView style={[styles.fill, styles.centerAll]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <Editor
      key={videoUri}
      draftId={draftId!}
      signature={data.signature}
      videoUri={videoUri!}
      initial={data.initial}
      autoLines={data.autoLines}
      savedJson={data.savedJson}
    />
  );
}

/**
 * Optimistic caption editor. No Save button: every edit applies immediately (undo/redo in the
 * header) and persists via a debounced autosave. Three modes:
 *  - browse: preview over the cue list, follows playback;
 *  - timing (a cue selected, keyboard down): a slim CueToolbar (times + split/merge/delete)
 *    docks under the preview;
 *  - text (selected row tapped again): the row's text becomes an inline input, keyboard up,
 *    the preview shrinks to keep the row visible.
 * The karaoke word highlight renders both on the video (CaptionOverlay) and in the playing cue
 * row (see CueRow).
 */
function Editor({
  draftId,
  signature,
  videoUri,
  initial,
  autoLines,
  savedJson,
}: {
  draftId: string;
  signature: string;
  videoUri: string;
  initial: TranscriptLine[];
  autoLines: TranscriptLine[];
  savedJson: string | null;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const editor = useSubtitleEditor(initial);

  const player = useVideoPlayer(toFileUri(videoUri), (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.loop = false;
  });
  const timeUpdate = useEvent(player, 'timeUpdate');
  const { isPlaying, seekTo } = useParkedPlayback(player);
  const posCs = (timeUpdate?.currentTime ?? player.currentTime) * 100;

  const { toLines } = editor;
  const lines = useMemo(() => toLines(), [toLines]);
  const { markCleared } = useAutosaveTranscript({
    projectId: draftId,
    signature,
    lines,
    dirty: editor.dirty,
    savedJson,
  });

  // Selection drives the mode; both ids are cleared/derived defensively — a stale id (cue removed
  // by undo/delete/split) simply resolves to no cue and the screen falls back to browse mode.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const selCue = editor.cues.find((c) => c.id === selectedId) ?? null;
  const mode: 'browse' | 'timing' | 'text' =
    selCue && editingId === selCue.id ? 'text' : selCue ? 'timing' : 'browse';

  const playingId = useMemo(() => {
    const c = editor.cues.find((x) => posCs >= x.t0 && posCs <= x.t1);
    return c?.id ?? null;
  }, [editor.cues, posCs]);

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Map<string, number>>(new Map());

  // Playback follow: auto-scroll to the playing cue, but yield while a cue is selected/being
  // edited and for a beat after the user scrolls the list themselves.
  const followSuspendedRef = useRef(false);
  const suspendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (selectedId || editingId || !playingId || followSuspendedRef.current) return;
    const y = offsets.current.get(playingId);
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 96), animated: true });
  }, [playingId, selectedId, editingId]);
  const onUserScrollStart = () => {
    followSuspendedRef.current = true;
    if (suspendTimerRef.current) clearTimeout(suspendTimerRef.current);
  };
  const onUserScrollSettle = () => {
    if (suspendTimerRef.current) clearTimeout(suspendTimerRef.current);
    suspendTimerRef.current = setTimeout(() => {
      followSuspendedRef.current = false;
    }, 2000);
  };

  // Keyboard dismissal (interactive drag, Done, back button) always ends text mode.
  useEffect(() => {
    if (!editingId) return;
    const evt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const hide = Keyboard.addListener(evt, () => setEditingId(null));
    return () => hide.remove();
  }, [editingId]);

  const scrollToCue = (id: string, margin: number) => {
    const y = offsets.current.get(id);
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - margin), animated: true });
  };

  const selectCue = (cue: Cue) => {
    setEditingId(null);
    setSelectedId(cue.id);
    player.pause();
    seekTo(cue.t0 / 100);
    scrollToCue(cue.id, 96);
  };

  const beginTextEdit = (id: string) => {
    setEditingId(id);
    scrollToCue(id, Spacing.two);
  };

  const endTextEdit = () => {
    setEditingId(null);
    editor.endCoalescing();
  };

  const clearSelection = () => {
    setSelectedId(null);
    setEditingId(null);
  };

  // Play is the "done" gesture: it drops the selection and resumes playback follow. No
  // end-of-clip restart logic needed — useParkedPlayback reparks the playhead at 0 on end.
  const togglePlay = () => {
    if (player.playing) {
      player.pause();
      return;
    }
    clearSelection();
    Keyboard.dismiss();
    player.play();
  };

  const onAddCue = () => {
    player.pause();
    const id = editor.addCueAt(posCs);
    setSelectedId(id);
    setEditingId(id); // a fresh cue is empty — jump straight to typing
  };

  const onSplit = () => {
    if (!selCue) return;
    const id = editor.splitAt(selCue.id, posCs);
    if (id) setSelectedId(id); // keep selection on the playhead's half
  };

  const [rowEdited, setRowEdited] = useState(savedJson != null);
  const showReset = (rowEdited || editor.dirty) && editor.cues.length > 0;
  const onResetToAuto = () => {
    Alert.alert(
      'Reset captions?',
      'This discards your edits and restores the automatic captions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            clearSelection();
            await clearEditedTranscript(draftId);
            markCleared();
            editor.reset(autoLines);
            setRowEdited(false);
          },
        },
      ],
    );
  };

  const selIndex = selCue ? editor.cues.indexOf(selCue) : -1;

  return (
    <ThemedView style={styles.fill}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
          <View
            style={[styles.headerTitleWrap, { top: insets.top + Spacing.two }]}
            pointerEvents="none">
            <ThemedText style={styles.headerTitle}>Captions</ThemedText>
          </View>
          <CloseButton onPress={() => router.back()} />
          <View style={styles.headerActions}>
            <HeaderBtn
              name="arrow.uturn.backward"
              label="Undo"
              disabled={!editor.canUndo}
              onPress={editor.undo}
              theme={theme}
            />
            <HeaderBtn
              name="arrow.uturn.forward"
              label="Redo"
              disabled={!editor.canRedo}
              onPress={editor.redo}
              theme={theme}
            />
          </View>
        </View>

        <Pressable
          style={[styles.previewCard, mode === 'text' ? styles.previewCompact : styles.previewFull]}
          onPress={togglePlay}
          accessibilityLabel="Toggle playback">
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            contentFit="contain"
            nativeControls={false}
          />
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <CaptionOverlay
              lines={lines}
              positionMs={posCs * 10}
              fontSize={mode === 'text' ? 12 : 17}
            />
          </View>
          {!isPlaying && (
            <View style={styles.playOverlay} pointerEvents="none">
              <View style={[styles.playBadge, mode === 'text' && styles.playBadgeCompact]}>
                <Icon name="play.fill" size={mode === 'text' ? 15 : 22} tintColor="#fff" />
              </View>
            </View>
          )}
        </Pressable>

        {mode === 'timing' && selCue && (
          <CueToolbar
            cue={selCue}
            posCs={posCs}
            theme={theme}
            canMerge={selIndex >= 0 && selIndex < editor.cues.length - 1}
            onSplit={onSplit}
            onMerge={() => editor.mergeNext(selCue.id)}
            onDelete={() => {
              editor.remove(selCue.id);
              clearSelection();
            }}
          />
        )}

        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onScrollBeginDrag={onUserScrollStart}
          onScrollEndDrag={onUserScrollSettle}
          onMomentumScrollEnd={onUserScrollSettle}>
          {editor.cues.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No captions yet. Add a cue at the playhead to start.
            </ThemedText>
          )}
          {editor.cues.map((cue) => (
            <View
              key={cue.id}
              onLayout={(e: LayoutChangeEvent) =>
                offsets.current.set(cue.id, e.nativeEvent.layout.y)
              }>
              <CueRow
                cue={cue}
                state={
                  cue.id === editingId ? 'editing' : cue.id === selectedId ? 'selected' : 'view'
                }
                playing={cue.id === playingId}
                posCs={posCs}
                theme={theme}
                onSelect={() => selectCue(cue)}
                onBeginTextEdit={() => beginTextEdit(cue.id)}
                onChangeText={(t) => editor.setText(cue.id, t)}
                onEndTextEdit={endTextEdit}
              />
            </View>
          ))}
          {showReset && (
            <Pressable onPress={onResetToAuto} accessibilityRole="button" style={styles.resetLink}>
              <ThemedText type="footnote" themeColor="textSecondary">
                Reset to automatic captions
              </ThemedText>
            </Pressable>
          )}
        </ScrollView>

        {mode === 'browse' && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
            <Pressable
              onPress={onAddCue}
              style={[styles.footerBtn, { backgroundColor: theme.backgroundElement }]}>
              <Icon name="plus" size={16} tintColor={theme.text} />
              <ThemedText>Add cue</ThemedText>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function HeaderBtn({
  name,
  label,
  disabled,
  onPress,
  theme,
}: {
  name: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        styles.headerBtn,
        { backgroundColor: theme.backgroundElement },
        disabled && styles.headerBtnDisabled,
      ]}>
      <Icon name={name} size={15} tintColor={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centerAll: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  linkBtn: { padding: Spacing.two },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: Spacing.two },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnDisabled: { opacity: 0.35 },
  previewCard: {
    aspectRatio: 9 / 16,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#000',
    alignSelf: 'center',
  },
  previewFull: { width: '56%', marginVertical: Spacing.two },
  // Text mode: smaller so the editing row stays visible above the keyboard.
  previewCompact: { width: '36%', marginVertical: Spacing.one },
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  playBadgeCompact: { width: 32, height: 32, borderRadius: 16, paddingLeft: 2 },
  list: { flex: 1 },
  listContent: { padding: Spacing.three },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  resetLink: { alignItems: 'center', paddingVertical: Spacing.three },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
  },
});
