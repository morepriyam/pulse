import { useEvent } from 'expo';
import { useLocalSearchParams, router } from 'expo-router';
import { Icon } from '@/components/icon';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { getSegment } from '@/db/drafts';
import type { Segment } from '@/db/schema';
import {
  clearEditedTranscript,
  getTranscriptRow,
  saveEditedTranscript,
} from '@/db/transcripts';
import { CloseButton } from '@/features/recorder/close-button';
import { CaptionOverlay } from '@/features/transcription/caption-overlay';
import { useSubtitleEditor, type Cue } from '@/features/transcription/use-subtitle-editor';
import type { TranscriptLine } from '@/features/transcription/whisper';
import { useTheme } from '@/hooks/use-theme';
import { absolutize } from '@/utils/file-store';
import { effFile } from '@/utils/segment-window';

const NUDGE_CS = 10; // ±100ms
const CPS_WARN = 17;
const CPS_BAD = 20;
const MAX_CHARS = 42;

function parse(json: string | null): TranscriptLine[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as TranscriptLine[];
  } catch {
    return [];
  }
}

// Collapsed rows show a coarse clock (m:ss); the editor's timing chips show tenths (m:ss.d).
const clock = (cs: number) => {
  const total = Math.floor(cs / 100);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const fine = (cs: number) => `${clock(cs)}.${Math.floor((cs % 100) / 10)}`;

export default function SubtitlesScreen() {
  const { segmentId, draftId } = useLocalSearchParams<{ segmentId?: string; draftId?: string }>();
  const [data, setData] = useState<{
    segment: Segment;
    initial: TranscriptLine[];
    autoLines: TranscriptLine[];
  } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!segmentId) return setMissing(true);
      const segment = await getSegment(segmentId);
      if (!segment) return alive && setMissing(true);
      const row = await getTranscriptRow(segmentId);
      const autoLines = parse(row?.lines ?? null);
      const initial = row?.editedLines ? parse(row.editedLines) : autoLines;
      if (alive) setData({ segment, initial, autoLines });
    })();
    return () => {
      alive = false;
    };
  }, [segmentId]);

  if (missing) {
    return (
      <ThemedView style={[styles.fill, styles.centerAll]}>
        <ThemedText>Captions unavailable for this clip.</ThemedText>
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
      key={segmentId}
      segmentId={segmentId!}
      draftId={draftId}
      segment={data.segment}
      initial={data.initial}
      autoLines={data.autoLines}
    />
  );
}

function Editor({
  segmentId,
  draftId,
  segment,
  initial,
  autoLines,
}: {
  segmentId: string;
  draftId?: string;
  segment: Segment;
  initial: TranscriptLine[];
  autoLines: TranscriptLine[];
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const editor = useSubtitleEditor(initial);

  const uri = absolutize(effFile(segment));
  const player = useVideoPlayer(uri, (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.loop = false;
  });
  const timeUpdate = useEvent(player, 'timeUpdate');
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const positionMs = (timeUpdate?.currentTime ?? player.currentTime) * 1000;
  const posCs = positionMs / 10;

  const lines = editor.toLines();
  // The cue under the playhead (highlighted while playing) and the cue the user opened for editing.
  const playingId = useMemo(() => {
    const c = editor.cues.find((x) => posCs >= x.t0 && posCs <= x.t1);
    return c?.id ?? null;
  }, [editor.cues, posCs]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Best-effort auto-scroll: follow the playing cue, but don't yank the list while the user is
  // editing an expanded cue.
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (selectedId || !playingId) return;
    const y = offsets.current.get(playingId);
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 96), animated: true });
  }, [playingId, selectedId]);

  const selectCue = (id: string, t0: number) => {
    setSelectedId(id);
    player.pause();
    player.seekBy(t0 / 100 - player.currentTime);
  };

  const togglePlay = () => {
    if (isPlaying) player.pause();
    else if (player.duration > 0 && player.currentTime >= player.duration - 0.05) player.replay();
    else player.play();
  };

  const onSave = async () => {
    await saveEditedTranscript(segmentId, effFile(segment), editor.toLines(), Date.now());
    router.back();
  };

  const onResetToAuto = async () => {
    await clearEditedTranscript(segmentId);
    editor.reset(autoLines);
  };

  return (
    <ThemedView style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <CloseButton onPress={() => router.back()} />
        <ThemedText style={styles.headerTitle}>Captions</ThemedText>
        <Pressable
          onPress={onSave}
          disabled={!editor.dirty}
          accessibilityRole="button"
          accessibilityLabel="Save captions"
          style={[styles.saveBtn, { backgroundColor: Accent }, !editor.dirty && styles.disabled]}>
          <ThemedText style={styles.saveLabel}>Save</ThemedText>
        </Pressable>
      </View>

      <View style={styles.previewWrap}>
        <Pressable style={styles.previewCard} onPress={togglePlay} accessibilityLabel="Toggle playback">
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            contentFit="contain"
            nativeControls={false}
          />
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <CaptionOverlay lines={lines} positionMs={positionMs} />
          </View>
          {!isPlaying && (
            <View style={styles.playOverlay} pointerEvents="none">
              <View style={styles.playBadge}>
                <Icon name="play.fill" size={22} tintColor="#fff" />
              </View>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={{ padding: Spacing.three, paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled">
        {editor.cues.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No captions yet. Add a cue at the playhead to start.
          </ThemedText>
        )}
        {editor.cues.map((cue) => (
          <View
            key={cue.id}
            onLayout={(e: LayoutChangeEvent) => offsets.current.set(cue.id, e.nativeEvent.layout.y)}>
            <CueRow
              cue={cue}
              playing={cue.id === playingId}
              selected={cue.id === selectedId}
              theme={theme}
              onSelect={() => selectCue(cue.id, cue.t0)}
              onText={(t) => editor.setText(cue.id, t)}
              onNudgeStart={(d) => editor.nudgeStart(cue.id, d)}
              onNudgeEnd={(d) => editor.nudgeEnd(cue.id, d)}
              onSetStart={() => editor.setStart(cue.id, posCs)}
              onSetEnd={() => editor.setEnd(cue.id, posCs)}
              onSplit={() => editor.splitAt(cue.id, posCs)}
              onMerge={() => editor.mergeNext(cue.id)}
              onCollapse={() => {
                setSelectedId(null);
                Keyboard.dismiss();
              }}
              onDelete={() => {
                editor.remove(cue.id);
                setSelectedId(null);
              }}
            />
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Pressable
          onPress={() => editor.addCueAt(posCs)}
          style={[styles.footerBtn, { backgroundColor: theme.backgroundElement }]}>
          <Icon name="plus" size={16} tintColor={theme.text} />
          <ThemedText>Add cue</ThemedText>
        </Pressable>
        <Pressable
          onPress={onResetToAuto}
          style={[styles.footerBtn, { backgroundColor: theme.backgroundElement }]}>
          <Icon name="arrow.uturn.backward" size={16} tintColor={theme.text} />
          <ThemedText>Reset to auto</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

type CueRowProps = {
  cue: Cue;
  playing: boolean;
  selected: boolean;
  theme: ReturnType<typeof useTheme>;
  onSelect: () => void;
  onText: (t: string) => void;
  onNudgeStart: (d: number) => void;
  onNudgeEnd: (d: number) => void;
  onSetStart: () => void;
  onSetEnd: () => void;
  onSplit: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onCollapse: () => void;
};

function CueRow({
  cue,
  playing,
  selected,
  theme,
  onSelect,
  onText,
  onNudgeStart,
  onNudgeEnd,
  onSetStart,
  onSetEnd,
  onSplit,
  onMerge,
  onDelete,
  onCollapse,
}: CueRowProps) {
  const chars = cue.text.trim().length;
  const cps = chars / Math.max(0.01, (cue.t1 - cue.t0) / 100);
  const over = cps > CPS_BAD || chars > MAX_CHARS;
  const cpsColor = cps > CPS_BAD ? Accent : cps > CPS_WARN ? theme.warning : theme.textSecondary;

  // Collapsed: a calm, readable row — start time + text, accent when it's the playing cue.
  if (!selected) {
    return (
      <Pressable
        onPress={onSelect}
        style={[
          styles.row,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          playing && { borderColor: Accent },
        ]}>
        <View style={styles.collapsed}>
          <ThemedText style={[styles.tc, { color: playing ? Accent : theme.textSecondary }]}>
            {clock(cue.t0)}
          </ThemedText>
          <ThemedText
            numberOfLines={2}
            style={[styles.collapsedText, !chars && { color: theme.textSecondary }]}>
            {chars ? cue.text : 'Empty cue'}
          </ThemedText>
          {over && <View style={styles.cpsDot} />}
        </View>
      </Pressable>
    );
  }

  // Expanded: the one cue being edited — text field + timing + actions.
  return (
    <View style={[styles.row, styles.rowSelected, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.expandedHeader}>
        <ThemedText style={[styles.tc, styles.rangeText, { color: Accent }]}>
          {clock(cue.t0)}–{clock(cue.t1)}
        </ThemedText>
        <Pressable onPress={onCollapse} hitSlop={8} accessibilityLabel="Done editing cue">
          <Icon name="chevron.up" size={15} weight="semibold" tintColor={theme.textSecondary} />
        </Pressable>
      </View>

      <TextInput
        value={cue.text}
        onChangeText={onText}
        placeholder="Caption text"
        placeholderTextColor={theme.textSecondary}
        multiline
        autoFocus
        style={[styles.input, { color: theme.text }]}
      />

      <View style={styles.timeRow}>
        <TimeControl
          label="In"
          value={fine(cue.t0)}
          theme={theme}
          onMinus={() => onNudgeStart(-NUDGE_CS)}
          onPlus={() => onNudgeStart(NUDGE_CS)}
          onPlayhead={onSetStart}
        />
        <TimeControl
          label="Out"
          value={fine(cue.t1)}
          theme={theme}
          onMinus={() => onNudgeEnd(-NUDGE_CS)}
          onPlus={() => onNudgeEnd(NUDGE_CS)}
          onPlayhead={onSetEnd}
        />
      </View>

      <View style={[styles.actionRow, { borderTopColor: theme.border }]}>
        <ActionBtn name="scissors" label="Split" theme={theme} onPress={onSplit} />
        <ActionBtn name="arrow.triangle.merge" label="Merge" theme={theme} onPress={onMerge} />
        <ActionBtn name="trash" label="Delete" theme={theme} onPress={onDelete} tint={Accent} />
        <View style={styles.flexSpacer} />
        <ThemedText style={{ color: cpsColor, fontSize: 12 }}>{cps.toFixed(0)} cps</ThemedText>
      </View>
    </View>
  );
}

function TimeControl({
  label,
  value,
  theme,
  onMinus,
  onPlus,
  onPlayhead,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  onMinus: () => void;
  onPlus: () => void;
  onPlayhead: () => void;
}) {
  return (
    <View style={[styles.timeControl, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText themeColor="textSecondary" style={styles.timeLabel}>
        {label}
      </ThemedText>
      <Pressable onPress={onMinus} hitSlop={8} style={styles.stepBtn} accessibilityLabel={`${label} earlier`}>
        <Icon name="minus" size={12} weight="semibold" tintColor={theme.text} />
      </Pressable>
      <ThemedText style={styles.timeValue}>{value}</ThemedText>
      <Pressable onPress={onPlus} hitSlop={8} style={styles.stepBtn} accessibilityLabel={`${label} later`}>
        <Icon name="plus" size={12} weight="semibold" tintColor={theme.text} />
      </Pressable>
      <Pressable
        onPress={onPlayhead}
        hitSlop={8}
        style={styles.stepBtn}
        accessibilityLabel={`Set ${label} to playhead`}>
        <Icon name="arrow.down.to.line" size={13} tintColor={Accent} />
      </Pressable>
    </View>
  );
}

function ActionBtn({
  name,
  label,
  theme,
  onPress,
  tint,
}: {
  name: string;
  label: string;
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
  tint?: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityLabel={label} style={styles.actionBtn}>
      <Icon name={name as never} size={15} tintColor={tint ?? theme.text} />
      <ThemedText style={[styles.actionLabel, { color: tint ?? theme.text }]}>{label}</ThemedText>
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
  headerTitle: { fontSize: 17, fontWeight: '700' },
  saveBtn: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: 10 },
  saveLabel: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.4 },
  previewWrap: { alignItems: 'center', paddingVertical: Spacing.two },
  previewCard: {
    width: '44%',
    aspectRatio: 9 / 16,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#000',
  },
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
  list: { flex: 1 },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  row: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.two,
  },
  rowSelected: {
    borderWidth: 1.5,
    borderColor: Accent,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  // Collapsed row: time + text on one line.
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
  },
  tc: { fontSize: 13, fontVariant: ['tabular-nums'], width: 38 },
  expandedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rangeText: { width: 'auto', fontWeight: '600' },
  collapsedText: { flex: 1, fontSize: 15, lineHeight: 20 },
  cpsDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Accent },
  input: { fontSize: 17, lineHeight: 23, minHeight: 24, padding: 0 },
  timeRow: { flexDirection: 'row', gap: Spacing.two },
  timeControl: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 10,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  timeLabel: { fontSize: 12, width: 24 },
  timeValue: { flex: 1, fontSize: 13, fontVariant: ['tabular-nums'], textAlign: 'center' },
  stepBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  actionLabel: { fontSize: 13 },
  flexSpacer: { flex: 1 },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
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
