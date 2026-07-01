import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

/** A single transient banner, positioned below the top safe area. Purely presentational — see `ToastProvider` for the queue/timing. */
export function Toast({ message }: { message: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // `Animated.Value` is mutable and meant to be read during render (its whole purpose is to
  // drive a style prop) — a lazy `useState` initializer holds it without re-creating it on every
  // render, whereas `useRef` is reserved for values that should never be read during render.
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(-12));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { top: insets.top + Spacing.two, opacity, transform: [{ translateY }] },
      ]}>
      <Animated.View style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="checkmark.circle.fill" size={18} tintColor={theme.accent} />
        <ThemedText type="subheadline" style={styles.message} numberOfLines={2}>
          {message}
        </ThemedText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'center',
    zIndex: 1000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    maxWidth: 480,
    alignSelf: 'center',
  },
  message: { flexShrink: 1 },
});
