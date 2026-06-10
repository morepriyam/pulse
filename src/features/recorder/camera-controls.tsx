import { CameraType } from 'expo-camera';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Accent, Spacing } from '@/constants/theme';
import { StabilizationMode } from './use-recorder';

const STABILIZATION_LABELS: Record<StabilizationMode, string> = {
  off: 'Off',
  standard: 'Std',
  cinematic: 'Cine',
  auto: 'Auto',
};

type Props = {
  top: number;
  facing: CameraType;
  torch: boolean;
  stabilization: StabilizationMode;
  disabled?: boolean;
  onFlip: () => void;
  onToggleTorch: () => void;
  onCycleStabilization: () => void;
};

export function CameraControls({
  top,
  facing,
  torch,
  stabilization,
  disabled = false,
  onFlip,
  onToggleTorch,
  onCycleStabilization,
}: Props) {
  return (
    <View style={[styles.rail, { top }]}>
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
        icon="gyroscope"
        label={`Stabilization: ${STABILIZATION_LABELS[stabilization]}`}
        caption={STABILIZATION_LABELS[stabilization]}
        tint={stabilization === 'off' ? '#fff' : Accent}
        disabled={disabled}
        onPress={onCycleStabilization}
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
        <SymbolView name={icon} size={24} weight="medium" tintColor={tint} />
      </View>
      {caption && <Text style={[styles.caption, { color: tint }]}>{caption}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: Spacing.three,
    gap: Spacing.three,
    alignItems: 'center',
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
