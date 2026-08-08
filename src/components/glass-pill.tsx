import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View, type ViewProps } from 'react-native';

/**
 * The recorder-chrome pill: the shared container for controls floating over the camera preview
 * (close button, control rail, lens chips). On iOS 26+ it renders native Liquid Glass
 * (expo-glass-effect's GlassView); everywhere else — Android and older iOS — it falls back to
 * the flat dark scrim these controls have always used. Callers pass shape styles (size, radius,
 * layout) and NO backgroundColor: the pill owns its surface so the two paths stay consistent.
 *
 * `colorScheme="dark"` is pinned (not 'auto'): this chrome sits on live camera video, where
 * dark glass stays legible on bright scenes and matches the fallback scrim — the app-wide
 * light/dark toggle deliberately doesn't apply here.
 *
 * `isLiquidGlassAvailable()` is a static capability (device iOS version + build SDK), so it's
 * read once at module load, per the official expo-glass-effect usage.
 */
const LIQUID_GLASS = isLiquidGlassAvailable();

export function GlassPill({ style, children, ...rest }: ViewProps) {
  if (LIQUID_GLASS) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme="dark" style={style} {...rest}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[styles.fallback, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: 'rgba(0,0,0,0.35)' },
});
