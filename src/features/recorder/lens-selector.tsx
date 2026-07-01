import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * A selectable lens, expressed as a zoom factor on the (possibly multi-camera) device.
 * VisionCamera switches the underlying physical lens automatically as the zoom factor crosses
 * the device's `zoomLensSwitchFactors`, so "0.5x / 1x / Tele" are just zoom presets.
 */
export type LensPreset = { label: string; zoom: number };

/** The label of the neutral 1x lens — the default selection and the reset target on flip. */
export const DEFAULT_LENS_LABEL = '1x';

/**
 * Lens chips above the record button (e.g. 0.5x · 1x · Tele). Renders nothing when the current
 * device exposes fewer than two presets (e.g. a single-lens front camera).
 */
export function LensSelector({
  presets,
  selected,
  onSelect,
  disabled,
}: {
  presets: LensPreset[];
  selected: string | undefined;
  onSelect: (preset: LensPreset) => void;
  disabled: boolean;
}) {
  if (presets.length < 2) return null;

  const active = selected ?? DEFAULT_LENS_LABEL;

  return (
    <View style={styles.row}>
      {presets.map((preset) => (
        <Pressable
          key={preset.label}
          onPress={() => onSelect(preset)}
          disabled={disabled}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Lens ${preset.label}`}
          style={({ pressed }) => [
            styles.chip,
            preset.label === active && styles.chipActive,
            { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.label, preset.label === active && styles.labelActive]}>
            {preset.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  chip: {
    minWidth: 36,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#fff' },
  label: { color: '#fff', fontSize: 12, fontWeight: '600' },
  labelActive: { color: '#000' },
});
