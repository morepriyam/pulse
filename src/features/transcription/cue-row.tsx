import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Accent, Spacing } from '@/constants/theme';
import type { useTheme } from '@/hooks/use-theme';

import type { Cue } from './use-subtitle-editor';
import { activeWordIndex } from './word-timing';

const CPS_WARN = 17;
const CPS_BAD = 20;
const MAX_CHARS = 42;

export type CueLoad = 'ok' | 'warn' | 'bad';

/** Readability load of a cue: chars-per-second and line length, as a passive severity level. */
export function cueLoad(cue: Cue): CueLoad {
  const chars = cue.text.trim().length;
  const cps = chars / Math.max(0.01, (cue.t1 - cue.t0) / 100);
  if (cps > CPS_BAD || chars > MAX_CHARS) return 'bad';
  if (cps > CPS_WARN) return 'warn';
  return 'ok';
}

// Rows show a coarse clock (m:ss); the timing bar's labels show tenths.
export const clock = (cs: number) => {
  const total = Math.floor(cs / 100);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export type CueRowState = 'view' | 'selected' | 'editing';

/**
 * One caption line in the list. `view` = tap to select (seeks the video); `selected` = accent
 * outline, tap again to edit the text in place; `editing` = the text is a live TextInput.
 * The playing row renders its text karaoke-style — spoken words solid, the word under the
 * playhead in accent, upcoming words dimmed (the same behavior CaptionOverlay draws on video).
 * The timestamp is tinted by readability load (never a "cps" number in the UI).
 */
export function CueRow({
  cue,
  state,
  playing,
  posCs,
  theme,
  onSelect,
  onBeginTextEdit,
  onChangeText,
  onEndTextEdit,
}: {
  cue: Cue;
  state: CueRowState;
  playing: boolean;
  /** Playhead position (centiseconds) — drives the word highlight of the playing row. */
  posCs: number;
  theme: ReturnType<typeof useTheme>;
  onSelect: () => void;
  onBeginTextEdit: () => void;
  onChangeText: (t: string) => void;
  onEndTextEdit: () => void;
}) {
  const chars = cue.text.trim().length;
  const load = cueLoad(cue);
  const active = state !== 'view';
  const tcColor =
    active || playing
      ? Accent
      : load === 'bad'
        ? Accent
        : load === 'warn'
          ? theme.warning
          : theme.textSecondary;

  return (
    <Pressable
      onPress={state === 'view' ? onSelect : state === 'selected' ? onBeginTextEdit : undefined}
      accessibilityLabel={state === 'view' ? 'Select caption' : 'Edit caption text'}
      style={[
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        playing && { borderColor: Accent },
        active && {
          borderColor: Accent,
          borderWidth: 1.5,
          backgroundColor: theme.backgroundSelected,
        },
      ]}>
      <View style={styles.inner}>
        <ThemedText style={[styles.tc, { color: tcColor }]}>{clock(cue.t0)}</ThemedText>
        {state === 'editing' ? (
          <TextInput
            value={cue.text}
            onChangeText={onChangeText}
            onBlur={onEndTextEdit}
            placeholder="Caption text"
            placeholderTextColor={theme.textSecondary}
            multiline
            autoFocus
            style={[styles.input, { color: theme.text }]}
          />
        ) : playing && chars > 0 && cue.words.length > 0 ? (
          <KaraokeText words={cue.words} posCs={posCs} theme={theme} />
        ) : (
          <ThemedText
            numberOfLines={2}
            style={[styles.text, !chars && { color: theme.textSecondary }]}>
            {chars ? cue.text : 'Empty cue — tap to type'}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

/**
 * Word-level (karaoke) rendering of the playing cue's text. The active word is the one covering
 * the playhead, else the last one already started (so the highlight rests on the most recent
 * word during short gaps) — the same rule CaptionOverlay uses on video.
 */
function KaraokeText({
  words,
  posCs,
  theme,
}: {
  words: Cue['words'];
  posCs: number;
  theme: ReturnType<typeof useTheme>;
}) {
  const active = activeWordIndex(words, posCs);
  return (
    <ThemedText numberOfLines={2} style={styles.text}>
      {words.map((w, i) => (
        <Text
          key={i}
          style={{
            color: i === active ? Accent : i < active ? theme.text : theme.textSecondary,
            fontWeight: i === active ? '600' : '400',
          }}>
          {(i > 0 ? ' ' : '') + w.text}
        </Text>
      ))}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.two,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
  },
  tc: { fontSize: 13, fontVariant: ['tabular-nums'], width: 38 },
  text: { flex: 1, fontSize: 15, lineHeight: 20 },
  input: { flex: 1, fontSize: 15, lineHeight: 20, padding: 0, textAlignVertical: 'top' },
});
