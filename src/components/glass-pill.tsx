import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View, type ViewProps } from 'react-native';

/**
 * The recorder-chrome pill: the shared container for controls floating over the camera preview
 * (close button, control rail, lens chips). On iOS 26+ it renders native Liquid Glass
 * (expo-glass-effect's GlassView); everywhere else — Android and older iOS — it falls back to
 * the flat dark scrim these controls have always used. Callers pass shape styles (size, radius,
 * layout) and NO backgroundColor: the pill owns its surface so the two paths stay consistent.
 *
 * `clear` glass, not `regular`: regular's luminance adaptation flips the pill between light
 * and dark variants as the camera pans across bright/dark scenes (colorScheme pins the theme
 * trait, NOT that flip), which reads as the chrome flashing. Clear is the HIG variant for
 * controls over media — no adaptive flip — and the dark `tintColor` is its dimming layer,
 * keeping the white glyphs legible on bright scenes and matching the fallback scrim.
 *
 * `colorScheme="dark"` is still pinned (not 'auto') so the app-wide light/dark toggle
 * deliberately doesn't restyle chrome that sits on live camera video.
 *
 * `isLiquidGlassAvailable()` is a static capability (device iOS version + build SDK), so it's
 * read once at module load, per the official expo-glass-effect usage.
 */
const LIQUID_GLASS = isLiquidGlassAvailable();

export function GlassPill({ style, children, ...rest }: ViewProps) {
  if (LIQUID_GLASS) {
    return (
      <GlassView
        glassEffectStyle="clear"
        tintColor="rgba(0,0,0,0.35)"
        colorScheme="dark"
        style={style}
        {...rest}>
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
