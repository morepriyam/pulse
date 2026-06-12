import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

/**
 * The "+" import control to the right of the record button — opens the system video
 * picker to add an existing device clip as a segment (§2.1, orig §4.6). Styled like the
 * original app's video-library button: solid white circle, black plus.
 */
export function ImportButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Import video"
      style={({ pressed }) => [styles.button, { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}>
      <SymbolView name="plus" size={24} weight="medium" tintColor="#000" />
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
