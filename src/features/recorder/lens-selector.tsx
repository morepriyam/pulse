import { Pressable, StyleSheet, Text, View } from 'react-native';

// Physical lenses we surface as chips, in zoom order. Other names (virtual multi-lens
// devices) are ignored — selectedLens wants a single physical lens.
const LENS_ORDER = [
  'builtInUltraWideCamera',
  'builtInWideAngleCamera',
  'builtInTelephotoCamera',
] as const;

const LENS_LABELS: Record<(typeof LENS_ORDER)[number], string> = {
  builtInUltraWideCamera: '0.5x',
  builtInWideAngleCamera: '1x',
  builtInTelephotoCamera: 'Tele',
};

const DEFAULT_LENS = 'builtInWideAngleCamera';

/**
 * Lens chips above the record button (0.5x · 1x · Tele). Renders nothing when the
 * current facing has fewer than two known lenses (e.g. the front camera).
 */
export function LensSelector({
  lenses,
  selected,
  onSelect,
  disabled,
}: {
  lenses: string[];
  selected: string | undefined;
  onSelect: (lens: string) => void;
  disabled: boolean;
}) {
  const known = LENS_ORDER.filter((l) => lenses.includes(l));
  if (known.length < 2) return null;

  const active = selected ?? DEFAULT_LENS;

  return (
    <View style={styles.row}>
      {known.map((l) => (
        <Pressable
          key={l}
          onPress={() => onSelect(l)}
          disabled={disabled}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Lens ${LENS_LABELS[l]}`}
          style={({ pressed }) => [
            styles.chip,
            l === active && styles.chipActive,
            { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.label, l === active && styles.labelActive]}>{LENS_LABELS[l]}</Text>
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
