import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 140;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Circular progress ring for the merge screen. `progress` is a fraction in [0,1] emitted by the
 * native merge engine (`onMergeProgress`). The arc sweeps from 12 o'clock; the fill is animated
 * with `withTiming` so even the near-instant passthrough path animates rather than snapping. The
 * centered label shows two decimals (e.g. `50.11%`).
 */
export function MergeProgressRing({ progress }: { progress: number }) {
  const theme = useTheme();
  const value = useSharedValue(0);

  useEffect(() => {
    value.value = withTiming(clamp(progress), { duration: 250 });
  }, [progress, value]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - value.value),
  }));

  return (
    <View style={[styles.wrap, { width: SIZE, height: SIZE }]}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={theme.backgroundElement}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={theme.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.center}>
          <ThemedText type="subtitle">{`${(clamp(progress) * 100).toFixed(2)}%`}</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
