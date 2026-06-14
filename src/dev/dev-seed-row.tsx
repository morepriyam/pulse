import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { clearDrafts, seedDraft, seedSpeedMixed, seedSpeedUniform } from '@/dev/seed';

/**
 * Dev-only seeding controls for the home header. Lives in its own module so it can be loaded behind
 * a `__DEV__`-guarded `require` (see HomeScreen) — that keeps this component AND `@/dev/seed` (with
 * its perf-test fixtures) out of the production bundle entirely, not just hidden at runtime.
 */
export function DevSeedRow() {
  return (
    <View style={styles.devRow}>
      <Pressable onPress={() => void seedDraft()} hitSlop={8}>
        <ThemedText themeColor="accent" type="small">
          + seed
        </ThemedText>
      </Pressable>
      <Pressable onPress={() => void seedSpeedUniform()} hitSlop={8}>
        <ThemedText themeColor="accent" type="small">
          + s2
        </ThemedText>
      </Pressable>
      <Pressable onPress={() => void seedSpeedMixed()} hitSlop={8}>
        <ThemedText themeColor="accent" type="small">
          + s3
        </ThemedText>
      </Pressable>
      <Pressable onPress={() => void clearDrafts()} hitSlop={8}>
        <ThemedText themeColor="textSecondary" type="small">
          clear
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
