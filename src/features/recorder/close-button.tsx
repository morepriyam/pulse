import { Icon } from '@/components/icon';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { closeToHome } from '@/utils/navigation';

export function CloseButton({
  onPress,
  style,
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress ?? closeToHome}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={[styles.button, style]}>
      <Icon name="xmark" size={22} weight="semibold" tintColor="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
