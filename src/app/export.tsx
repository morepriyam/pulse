import { useEvent } from 'expo';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { shareAsync } from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloseButton } from '@/features/recorder/close-button';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { segmentsForDraft } from '@/db/drafts';
import { useExport } from '@/features/export/use-export';
import { useSaveToDocuments } from '@/features/export/use-save-to-documents';
import { useSaveToPhotos } from '@/features/export/use-save-to-photos';
import { formatClipCount, formatDuration } from '@/utils/format';
import { effMs } from '@/utils/segment-window';

// merge()/effective paths may come back as a bare fs path; expo APIs want a file:// URI.
const toFileUri = (path: string) => (path.startsWith('/') ? `file://${path}` : path);

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();

  const { data: segments } = useLiveQuery(segmentsForDraft(draftId ?? ''), [draftId]);
  // Zero-length clips (failed native reads) can't be concatenated — drop them before merging.
  const clips = segments.filter((s) => effMs(s) > 0);
  const { state, retry } = useExport(clips);

  // Whether the share sheet is being presented, so we can disable the button and show a spinner.
  const [busy, setBusy] = useState(false);
  const photos = useSaveToPhotos();
  const docs = useSaveToDocuments();
  const theme = useTheme();

  const runShare = async () => {
    if (state.status !== 'done' || busy) return;
    setBusy(true);
    try {
      await shareAsync(toFileUri(state.outputPath), { mimeType: 'video/mp4' });
    } catch (e) {
      Alert.alert('Share failed', e instanceof Error ? e.message : 'Could not share the video.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <CloseButton />
      </View>

      <View style={styles.center}>
        {state.status === 'merging' && (
          <>
            <ActivityIndicator size="large" color={Accent} />
            <ThemedText type="subtitle" style={styles.title}>
              Merging…
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Stitching {formatClipCount(clips.length)} into one video.
            </ThemedText>
          </>
        )}

        {state.status === 'done' && (
          <>
            <MergedPreview uri={state.outputPath} />
            <ThemedText type="subtitle" style={styles.title}>
              Ready to export
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {formatClipCount(clips.length)} · {formatDuration(state.durationMs)}
            </ThemedText>

            <View style={styles.actions}>
              <Pressable
                onPress={runShare}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Share"
                style={[styles.button, styles.primary, busy && styles.disabled]}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <SymbolView name="square.and.arrow.up" size={18} tintColor="#fff" />
                    <ThemedText style={styles.primaryLabel}>Share</ThemedText>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => void photos.save(toFileUri(state.outputPath))}
                disabled={photos.status !== 'idle'}
                accessibilityRole="button"
                accessibilityLabel="Save to Photos"
                style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
                {photos.status === 'saving' ? (
                  <ActivityIndicator color={theme.text} />
                ) : photos.status === 'saved' ? (
                  <>
                    <SymbolView name="checkmark" size={18} tintColor={theme.text} />
                    <ThemedText>Saved</ThemedText>
                  </>
                ) : (
                  <>
                    <SymbolView name="square.and.arrow.down" size={18} tintColor={theme.text} />
                    <ThemedText>Save to Photos</ThemedText>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => void docs.save(toFileUri(state.outputPath))}
                disabled={docs.status !== 'idle'}
                accessibilityRole="button"
                accessibilityLabel="Save to Files"
                style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
                {docs.status === 'saving' ? (
                  <ActivityIndicator color={theme.text} />
                ) : docs.status === 'saved' ? (
                  <>
                    <SymbolView name="checkmark" size={18} tintColor={theme.text} />
                    <ThemedText>Saved</ThemedText>
                  </>
                ) : (
                  <>
                    <SymbolView name="folder" size={18} tintColor={theme.text} />
                    <ThemedText>Save to Files</ThemedText>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}

        {state.status === 'error' && (
          <>
            <SymbolView name="exclamationmark.triangle.fill" size={64} tintColor={Accent} />
            <ThemedText type="subtitle" style={styles.title}>
              Export failed
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.errorMessage}>
              {state.message}
            </ThemedText>

            <View style={styles.actions}>
              <Pressable
                onPress={retry}
                accessibilityRole="button"
                accessibilityLabel="Try again"
                style={[styles.button, styles.primary]}>
                <SymbolView name="arrow.clockwise" size={18} tintColor="#fff" />
                <ThemedText style={styles.primaryLabel}>Try again</ThemedText>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </ThemedView>
  );
}

/**
 * Plays the merged output. Mounts only once the merge is done, so `uri` is known at first
 * render and the player never needs a source swap. Plays once (no loop); tap to pause or
 * replay after it ends.
 */
function MergedPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(toFileUri(uri), (p) => {
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const togglePlay = () => {
    if (isPlaying) {
      player.pause();
    } else if (player.duration > 0 && player.currentTime >= player.duration - 0.05) {
      player.replay();
    } else {
      player.play();
    }
  };

  return (
    <Pressable
      style={styles.previewCard}
      onPress={togglePlay}
      accessibilityRole="button"
      accessibilityLabel="Toggle playback">
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit="contain"
        nativeControls={false}
      />
      {!isPlaying && (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playBadge}>
            <SymbolView name="play.fill" size={24} tintColor="#fff" />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: Spacing.three },
  previewCard: {
    width: '70%',
    aspectRatio: 9 / 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  title: { marginTop: Spacing.two },
  errorMessage: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.five },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: 14,
  },
  primary: { backgroundColor: Accent },
  primaryLabel: { color: '#fff' },
  disabled: { opacity: 0.5 },
});
