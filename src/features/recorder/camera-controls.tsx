import { CameraType } from 'expo-camera';
import type { SymbolViewProps } from 'expo-symbols';
import { Icon } from '@/components/icon';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Accent, Spacing } from '@/constants/theme';
import { StabilizationMode } from './use-recorder';

const STABILIZATION_LABELS: Record<StabilizationMode, string> = {
  off: 'Off',
  standard: 'Std',
  cinematic: 'Cine',
  auto: 'Auto',
};

// One SF Symbol per mode so the rail reads at a glance: slashed = off, gyroscope =
// standard sensor stabilization, film = cinematic, sparkles = auto-picked.
const STABILIZATION_ICONS: Record<StabilizationMode, SymbolViewProps['name']> = {
  off: 'circle.slash',
  standard: 'gyroscope',
  cinematic: 'film',
  auto: 'sparkles',
};

type Props = {
  facing: CameraType;
  torch: boolean;
  stabilization: StabilizationMode;
  muted: boolean;
  disabled?: boolean;
  onFlip: () => void;
  onToggleTorch: () => void;
  onCycleStabilization: () => void;
  onToggleMute: () => void;
};

export function CameraControls({
  facing,
  torch,
  stabilization,
  muted,
  disabled = false,
  onFlip,
  onToggleTorch,
  onCycleStabilization,
  onToggleMute,
}: Props) {
  return (
    <View style={styles.rail} pointerEvents="box-none">
      <ControlButton
        icon="arrow.triangle.2.circlepath.camera"
        label="Flip camera"
        disabled={disabled}
        onPress={onFlip}
      />
      <ControlButton
        icon={torch ? 'bolt.fill' : 'bolt.slash.fill'}
        label={torch ? 'Turn off flash' : 'Turn on flash'}
        tint={torch ? Accent : '#fff'}
        disabled={disabled || facing === 'front'}
        onPress={onToggleTorch}
      />
      <ControlButton
        icon={STABILIZATION_ICONS[stabilization]}
        label={`Stabilization: ${STABILIZATION_LABELS[stabilization]}`}
        caption={STABILIZATION_LABELS[stabilization]}
        tint={stabilization === 'off' ? '#fff' : Accent}
        disabled={disabled}
        onPress={onCycleStabilization}
      />
      <ControlButton
        icon={muted ? 'mic.slash.fill' : 'mic.fill'}
        label={muted ? 'Unmute recording audio' : 'Mute recording audio'}
        tint={muted ? Accent : '#fff'}
        disabled={disabled}
        onPress={onToggleMute}
      />
    </View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  tint = '#fff',
  caption,
  disabled = false,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  tint?: string;
  caption?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.wrap, { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}>
      <View style={styles.button}>
        <Icon name={icon} size={24} weight="medium" tintColor={tint} />
      </View>
      {caption && <Text style={[styles.caption, { color: tint }]}>{caption}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Spans the full height with the buttons centered, then nudged up a bit — dead center
  // reads too low against the bottom-heavy recorder UI (segment bar + record button).
  rail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: Spacing.three,
    justifyContent: 'center',
    gap: Spacing.three,
    alignItems: 'center',
    paddingBottom: 120,
  },
  wrap: { alignItems: 'center', gap: 2 },
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  caption: { fontSize: 10, fontWeight: '600' },
});
