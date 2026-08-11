import { Icon } from '@/components/icon';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlassPill } from '@/components/glass-pill';
import { closeToHome } from '@/utils/navigation';

export function CloseButton({
  onPress,
  style,
  overVideo = false,
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /**
   * True when the button floats over live/video content (the recorder) — renders the Liquid
   * Glass pill there. On themed screens (export, caption editor, permission gate) glass is
   * wrong: dark-pinned glass over a light background turns nearly transparent, leaving a
   * white ✕ invisible in light mode — those keep the opaque scrim.
   */
  overVideo?: boolean;
}) {
  const inner = <Icon name="xmark" size={22} weight="semibold" tintColor="#fff" />;
  return (
    <Pressable
      onPress={onPress ?? closeToHome}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={style}>
      {overVideo ? (
        <GlassPill style={styles.button}>{inner}</GlassPill>
      ) : (
        <View style={[styles.button, styles.scrim]}>{inner}</View>
      )}
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
  },
  scrim: { backgroundColor: 'rgba(0,0,0,0.35)' },
});
