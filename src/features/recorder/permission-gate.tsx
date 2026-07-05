import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';

import { CloseButton } from './close-button';

export function PermissionGate({
  blocked,
  onRequest,
}: {
  blocked: boolean;
  onRequest: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.container}>
      <CloseButton
        style={{ position: 'absolute', top: insets.top + Spacing.two, left: Spacing.four }}
      />
      <Icon name="camera.fill" size={48} tintColor={Accent} />
      <ThemedText style={styles.title}>Camera access needed</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        Pulse records video with your camera and microphone.
      </ThemedText>
      <Pressable
        onPress={onRequest}
        style={({ pressed }) => [styles.button, { opacity: pressed ? 0.85 : 1 }]}>
        <ThemedText themeColor="onAccent" style={styles.buttonLabel}>
          {blocked ? 'Open Settings' : 'Allow access'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  title: { fontSize: 20, fontWeight: '600' },
  body: { textAlign: 'center' },
  button: {
    marginTop: Spacing.two,
    backgroundColor: Accent,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  buttonLabel: { fontWeight: '600' },
});
