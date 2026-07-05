import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ModeBadge } from './destination-selector';
import { useDestinations } from './use-destinations';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * A floating pill on the home screen surfacing the device-wide pool of paired upload destinations
 * (§ destination pool). Tapping it opens a sheet to *view and delete* every non-expired
 * destination — its host, segment/merged mode, and expiry. View/delete only; picking *which* one to
 * upload to happens later, on the export screen. Renders nothing when the pool is empty, so it
 * only appears once at least one server is paired, and disappears as destinations are consumed by
 * finished uploads, deleted here, or expire.
 */
export function DestinationsFloat() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { destinations, deleteDestination } = useDestinations();
  const [open, setOpen] = useState(false);

  if (destinations.length === 0) return null;

  const confirmDelete = (id: string, host: string) => {
    Alert.alert('Remove destination?', `Stop uploading to “${host}” from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void deleteDestination(id) },
    ]);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${destinations.length} upload ${
          destinations.length === 1 ? 'destination' : 'destinations'
        }`}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: theme.backgroundElement,
            bottom: insets.bottom + Spacing.four,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <Icon name="icloud.and.arrow.up" size={18} tintColor={theme.text} />
        <ThemedText type="smallBold">
          {destinations.length === 1
            ? hostOf(destinations[0].server)
            : `${destinations.length} destinations`}
        </ThemedText>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close"
          />
          <View
            style={[
              styles.sheet,
              { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three },
            ]}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <ThemedText type="subtitle">Upload destinations</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Servers this device is paired with. Pick one when you upload a pulse; remove any
                  you no longer need.
                </ThemedText>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel="Close">
                <Icon name="xmark.circle.fill" size={28} tintColor={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {destinations.map((d) => {
                const host = hostOf(d.server);
                return (
                  <View
                    key={d.id}
                    style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
                    <View style={styles.rowText}>
                      <View style={styles.rowHeader}>
                        <ThemedText type="smallBold" numberOfLines={1} style={styles.rowHost}>
                          {host}
                        </ThemedText>
                        <ModeBadge uploadUnit={d.uploadUnit} />
                      </View>
                      <ThemedText type="caption1" themeColor="textSecondary">
                        {d.expiryLabel}
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() => confirmDelete(d.id, host)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${host}`}
                      style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
                      <Icon name="trash" size={20} tintColor={theme.accent} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  headerText: { flex: 1, gap: Spacing.half },
  list: { maxHeight: 360 },
  listContent: { gap: Spacing.two, paddingBottom: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 14,
  },
  rowText: { flex: 1, gap: Spacing.half },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowHost: { flexShrink: 1 },
  delete: { padding: Spacing.one },
  pressed: { opacity: 0.6 },
});
