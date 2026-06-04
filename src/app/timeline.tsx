import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Placeholder — the timeline editor (Milestone 0) is built in a later step.
export default function TimelineScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.container}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={[styles.close, { top: insets.top + Spacing.two }]}>
        <SymbolView name="xmark" size={22} weight="semibold" tintColor={theme.text} />
      </Pressable>
      <View style={styles.center}>
        <ThemedText themeColor="textSecondary">Timeline editor — coming next</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  close: { position: 'absolute', left: Spacing.four, zIndex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
