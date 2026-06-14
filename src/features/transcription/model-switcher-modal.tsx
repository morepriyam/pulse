import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { SymbolView } from 'expo-symbols';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { selectedModelQuery, setSelectedModel } from '@/db/settings';
import { useTheme } from '@/hooks/use-theme';
import { isModelReady } from './model';
import { getModel, LARGE_MODEL_BYTES, MODELS } from './models';
import { useTranscriptionStatus } from './transcription-provider';

const sizeMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(0)} MB`;

function statusLine(status: ReturnType<typeof useTranscriptionStatus>): string | null {
  switch (status.kind) {
    case 'deleting':
      return 'Removing previous model…';
    case 'downloading': {
      const pct =
        status.totalBytes > 0 ? Math.round((status.bytesWritten / status.totalBytes) * 100) : 0;
      return `Downloading model… ${pct}%`;
    }
    case 'transcribing':
      return `Generating captions… ${status.done}/${status.total}`;
    default:
      return null;
  }
}

/**
 * The on-device AI panel. Today it holds a single section — Captions — but it's structured so
 * future on-device features can slot in as additional sections. Selecting a model persists the
 * choice, which the global background engine picks up (delete-old → download-new → regenerate
 * captions across the library). The panel only records intent and shows live progress; closing
 * without selecting downloads nothing. The active model can be removed here to free disk.
 */
export function ModelSwitcherModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = useLiveQuery(selectedModelQuery, []);
  const selectedId = data[0]?.value ?? null;
  const status = useTranscriptionStatus();
  const busy = statusLine(status);

  const select = (id: string) => {
    void setSelectedModel(id);
    onClose();
  };

  const choose = (id: string) => {
    if (id === selectedId) {
      onClose();
      return;
    }
    // Warn before kicking off a large download that isn't already on disk (cellular/data cost).
    const model = getModel(id);
    if (model && model.approxBytes >= LARGE_MODEL_BYTES && !isModelReady(model)) {
      Alert.alert(
        'Large download',
        `${model.label} is about ${sizeMb(model.approxBytes)}. Download it now? Connect to Wi-Fi to avoid cellular data charges.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Download', onPress: () => select(id) },
        ],
      );
      return;
    }
    select(id);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three },
          ]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText type="subtitle">On-device AI</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Runs entirely on your device — nothing leaves your phone. Powers captions today, with
                more features coming.
              </ThemedText>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <SymbolView name="xmark.circle.fill" size={28} tintColor={theme.textSecondary} />
            </Pressable>
          </View>

          {busy && (
            <View style={[styles.status, { backgroundColor: theme.backgroundElement }]}>
              <ActivityIndicator size="small" color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary">
                {busy}
              </ThemedText>
            </View>
          )}

          {/* First (and currently only) feature. Future on-device features slot in as new sections. */}
          <View style={styles.section}>
            <SymbolView
              name="captions.bubble.fill"
              size={18}
              tintColor={selectedId ? theme.accent : theme.textSecondary}
            />
            <View style={styles.sectionText}>
              <ThemedText type="smallBold">Captions</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Auto-transcribe clips with a speech model. Only the selected model is kept on disk.
              </ThemedText>
            </View>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {MODELS.map((m) => {
              const active = m.id === selectedId;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => choose(m.id)}
                  style={[
                    styles.row,
                    { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                    active && { borderColor: theme.accent },
                  ]}>
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold">{m.label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {m.note} · {sizeMb(m.approxBytes)}
                    </ThemedText>
                  </View>
                  {active && (
                    <SymbolView name="checkmark.circle.fill" size={24} tintColor={theme.accent} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedId && (
            <Pressable
              onPress={() => {
                void setSelectedModel(null);
                onClose();
              }}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.delete}>
              <SymbolView name="trash" size={16} tintColor={theme.accent} />
              <ThemedText type="small" themeColor="accent" style={styles.deleteText}>
                Remove model & free up space
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  headerText: { flex: 1, gap: Spacing.one },
  section: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  sectionText: { flex: 1, gap: 2 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  list: { maxHeight: 360 },
  listContent: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowText: { flex: 1, gap: 2 },
  delete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  deleteText: { fontWeight: '700' },
});
