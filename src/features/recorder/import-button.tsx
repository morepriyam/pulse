import { Icon } from '@/components/icon';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

/** The "+" import control next to the record button — opens the system video picker to add
 *  an existing device clip as a segment. Shows a spinner while a picked clip is being
 *  normalized/copied into the draft. */
export function ImportButton({
  onPress,
  disabled,
  busy = false,
}: {
  onPress: () => void;
  disabled: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Import video"
      accessibilityState={{ busy }}
      style={({ pressed }) => [
        styles.button,
        { opacity: disabled || busy ? 0.35 : pressed ? 0.7 : 1 },
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color="#000" />
      ) : (
        <Icon name="plus" size={24} weight="medium" tintColor="#000" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
