import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clock, cueLoad } from './cue-row';
import { MIN_DUR_CS, type Cue } from './use-subtitle-editor';

const fine = (cs: number) => `${clock(cs)}.${Math.floor((cs % 100) / 10)}`;

/**
 * Slim strip for the selected cue: its time range (tinted by readability load) and the
 * structural actions — split at playhead, merge with the next cue, delete.
 */
export function CueToolbar({
  cue,
  posCs,
  theme,
  canMerge,
  onSplit,
  onMerge,
  onDelete,
}: {
  cue: Cue;
  posCs: number;
  theme: ReturnType<typeof useTheme>;
  canMerge: boolean;
  onSplit: () => void;
  onMerge: () => void;
  onDelete: () => void;
}) {
  const canSplit = posCs > cue.t0 + MIN_DUR_CS && posCs < cue.t1 - MIN_DUR_CS;
  const load = cueLoad(cue);
  const labelColor = load === 'bad' ? Accent : load === 'warn' ? theme.warning : theme.textSecondary;

  return (
    <View style={styles.strip}>
      <ThemedText style={[styles.times, { color: labelColor }]}>
        {fine(cue.t0)} – {fine(cue.t1)}
      </ThemedText>
      <View style={styles.tools}>
        <ToolBtn name="scissors" label="Split at playhead" theme={theme} disabled={!canSplit} onPress={onSplit} />
        <ToolBtn name="arrow.triangle.merge" label="Merge with next" theme={theme} disabled={!canMerge} onPress={onMerge} />
        <ToolBtn name="trash" label="Delete caption" theme={theme} onPress={onDelete} tint={Accent} />
      </View>
    </View>
  );
}

function ToolBtn({
  name,
  label,
  theme,
  onPress,
  disabled,
  tint,
}: {
  name: IconName;
  label: string;
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
  disabled?: boolean;
  tint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.toolBtn, { backgroundColor: theme.backgroundElement }, disabled && styles.toolDisabled]}>
      <Icon name={name} size={14} tintColor={tint ?? theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  times: { fontSize: 13, fontVariant: ['tabular-nums'] },
  tools: { flexDirection: 'row', gap: Spacing.two },
  toolBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolDisabled: { opacity: 0.35 },
});
