import { useEvent } from 'expo';
import * as Clipboard from 'expo-clipboard';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams } from 'expo-router';
import { Icon } from '@/components/icon';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import { shareAsync } from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloseButton } from '@/features/recorder/close-button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { segmentsForDraft } from '@/db/drafts';
import type { Segment } from '@/db/schema';
import { useExport } from '@/features/export/use-export';
import { MergeProgressRing } from '@/features/export/merge-progress-ring';
import { useSaveToDocuments } from '@/features/export/use-save-to-documents';
import { useSaveToPhotos } from '@/features/export/use-save-to-photos';
import { setActiveDraft } from '@/features/transcription/active-draft';
import { CaptionOverlay } from '@/features/transcription/caption-overlay';
import { mergedLines } from '@/features/transcription/srt';
import { useDraftTranscripts } from '@/features/transcription/use-draft-transcripts';
import type { TranscriptLine } from '@/features/transcription/whisper';
import { type UploadState, useUpload } from '@/features/upload/use-upload';
import { useParkedPlayback } from '@/hooks/use-parked-playback';
import { formatClipCount, formatDuration } from '@/utils/format';
import { effMs } from '@/utils/segment-window';

/** Sum of each clip's effective duration — the beat-mode summary line has no merged output to read a duration from. */
const totalDurationMs = (clips: Segment[]) => clips.reduce((sum, s) => sum + effMs(s), 0);

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// merge()/effective paths may come back as a bare fs path; expo APIs want a file:// URI.
const toFileUri = (path: string) => (path.startsWith('/') ? `file://${path}` : path);

// The watch link embeds a live bearer token (the same one that authorizes this upload) — anyone
// who gets it can act as this session, so warn before it leaves the app via clipboard/share.
const WATCH_LINK_WARNING =
  'This link lets anyone who has it view (and control) this upload — treat it like a password.';

// Accessibility label for the upload button, one per upload state; `idle` names the destination
// since that's the only state where a tap actually starts something new.
function uploadButtonLabel(state: UploadState, server: string): string {
  switch (state.status) {
    case 'uploading':
      return `Uploading, ${Math.round(state.progress * 100)} percent`;
    case 'done':
      return 'Uploaded, copy link';
    case 'error':
      return state.retryable ? 'Upload failed, retry' : 'Upload rejected by server';
    case 'idle':
      return `Upload to ${hostOf(server)}`;
  }
}

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();

  const { data: segments } = useLiveQuery(segmentsForDraft(draftId ?? ''), [draftId]);
  // Tell the engine which draft is on screen so any missing captions for it are generated first.
  useEffect(() => {
    setActiveDraft(draftId ?? null);
    return () => setActiveDraft(null);
  }, [draftId]);
  // Zero-length clips (failed native reads) can't be concatenated — drop them before merging.
  const clips = segments.filter((s) => effMs(s) > 0);

  // Stable ref (not a plain value) so `useUpload` can be called — and its `destination`/
  // `pendingPairing` read — before the merge finishes. `uploadMerged` reads it lazily at
  // upload time. See the `useUpload` doc comment.
  const mergedRef = useRef<{ path: string; durationMs: number } | null>(null);
  const upload = useUpload(draftId ?? '', clips, mergedRef);

  // `pendingPairing` covers a draft that hasn't claimed its destination yet (§ pairing UX):
  // the same distinction has to apply before the first tap, not just after.
  const effectiveUploadUnit = upload.destination?.uploadUnit ?? upload.pendingPairing?.uploadUnit ?? null;
  const isBeatOnly = effectiveUploadUnit === 'beat';

  // Always auto-merge, whatever the upload unit. Share/Save/Preview want the merged file in
  // every mode anyway, and a pairing can arrive (or switch to "merged") at any moment — merging
  // eagerly means a merged-mode upload never has to stop and ask the user to export first.
  const { state, run } = useExport(clips);
  // `uploadMerged` reads `mergedRef.current` at upload time, not via a reactive prop — update it
  // whenever the merge's own state changes instead of threading `merged` through as a value.
  useEffect(() => {
    mergedRef.current =
      state.status === 'done' ? { path: state.outputPath, durationMs: state.durationMs } : null;
  }, [state]);

  // Captions stitched onto one draft-wide timeline (same clip order/offsets as the merge), for the
  // preview overlay.
  const transcripts = useDraftTranscripts(draftId ?? null);
  const captionLines = useMemo(() => mergedLines(clips, transcripts), [clips, transcripts]);

  // Whether the share sheet is being presented, so we can disable the button and show a spinner.
  const [busy, setBusy] = useState(false);
  const photos = useSaveToPhotos();
  const docs = useSaveToDocuments();
  const theme = useTheme();

  // Merged-only: uploading the single video needs the merge done first. Beat mode has nothing to
  // wait on — each clip uploads on its own, so the section shows up immediately.
  const uploadReady = isBeatOnly || state.status === 'done';

  const watchUrl =
    upload.destination?.uploadUnit === 'merged'
      ? `${upload.destination.server}/artifacts/${upload.destination.artifactId}${
          upload.destination.token ? `?token=${encodeURIComponent(upload.destination.token)}` : ''
        }`
      : null;

  const copyWatchLink = async () => {
    if (!watchUrl) return;
    Alert.alert('Copy watch link?', WATCH_LINK_WARNING, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Copy',
        onPress: () => {
          void Clipboard.setStringAsync(watchUrl).then(() =>
            Alert.alert('Link copied', 'The watch link is on your clipboard.'),
          );
        },
      },
    ]);
  };
  const shareWatchLink = () => {
    if (!watchUrl) return;
    Alert.alert('Share watch link?', WATCH_LINK_WARNING, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Share', onPress: () => void Share.share({ message: watchUrl, url: watchUrl }) },
    ]);
  };

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
            <MergeProgressRing progress={state.progress} />
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
            <MergedPreview uri={state.outputPath} lines={captionLines} />
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
                accessibilityLabel={busy ? 'Sharing' : 'Share'}
                accessibilityState={{ disabled: busy, busy }}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.accent },
                  busy && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                {busy ? (
                  <ActivityIndicator color={theme.onAccent} />
                ) : (
                  <>
                    <Icon name="square.and.arrow.up" size={18} tintColor={theme.onAccent} />
                    <ThemedText style={{ color: theme.onAccent }}>Share</ThemedText>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => void photos.save(toFileUri(state.outputPath))}
                disabled={photos.status !== 'idle'}
                accessibilityRole="button"
                accessibilityLabel={
                  photos.status === 'saved'
                    ? 'Saved to Photos'
                    : photos.status === 'saving'
                      ? 'Saving to Photos'
                      : 'Save to Photos'
                }
                accessibilityState={{
                  disabled: photos.status !== 'idle',
                  busy: photos.status === 'saving',
                }}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                {photos.status === 'saving' ? (
                  <ActivityIndicator color={theme.text} />
                ) : photos.status === 'saved' ? (
                  <>
                    <Icon name="checkmark" size={18} tintColor={theme.text} />
                    <ThemedText>Saved</ThemedText>
                  </>
                ) : (
                  <>
                    <Icon name="square.and.arrow.down" size={18} tintColor={theme.text} />
                    <ThemedText>Save to Photos</ThemedText>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => void docs.save(toFileUri(state.outputPath))}
                disabled={docs.status !== 'idle'}
                accessibilityRole="button"
                accessibilityLabel={
                  docs.status === 'saved'
                    ? 'Saved to Files'
                    : docs.status === 'saving'
                      ? 'Saving to Files'
                      : 'Save to Files'
                }
                accessibilityState={{
                  disabled: docs.status !== 'idle',
                  busy: docs.status === 'saving',
                }}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                {docs.status === 'saving' ? (
                  <ActivityIndicator color={theme.text} />
                ) : docs.status === 'saved' ? (
                  <>
                    <Icon name="checkmark" size={18} tintColor={theme.text} />
                    <ThemedText>Saved</ThemedText>
                  </>
                ) : (
                  <>
                    <Icon name="folder" size={18} tintColor={theme.text} />
                    <ThemedText>Save to Files</ThemedText>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}

        {state.status === 'idle' && (
          <>
            <ThemedText type="subtitle" style={styles.title}>
              Ready to upload
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {formatClipCount(clips.length)} · {formatDuration(totalDurationMs(clips))}
            </ThemedText>

            <View style={styles.actions}>
              <Pressable
                onPress={run}
                accessibilityRole="button"
                accessibilityLabel="Export a merged copy"
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                <Icon name="film" size={18} tintColor={theme.text} />
                <ThemedText>Export a merged copy</ThemedText>
              </Pressable>
            </View>
          </>
        )}

        {state.status === 'error' && (
          <>
            <Icon name="exclamationmark.triangle.fill" size={64} tintColor={theme.accent} />
            <ThemedText type="subtitle" style={styles.title}>
              {isBeatOnly ? 'Merged copy failed' : 'Export failed'}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.errorMessage}>
              {state.message}
            </ThemedText>

            <View style={styles.actions}>
              <Pressable
                onPress={run}
                accessibilityRole="button"
                accessibilityLabel="Try again"
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.accent },
                  pressed && styles.pressed,
                ]}>
                <Icon name="arrow.clockwise" size={18} tintColor={theme.onAccent} />
                <ThemedText style={{ color: theme.onAccent }}>Try again</ThemedText>
              </Pressable>
            </View>
          </>
        )}

        {/* Beat mode has nothing to wait on (each clip uploads on its own) so this shows up
            regardless of merge state; merged mode still needs `state.status === 'done'` first —
            see `uploadReady`. */}
        {(upload.destination || upload.pendingPairing) && uploadReady && (
          <View style={styles.uploadSection}>
            <ThemedText type="caption1" themeColor="textSecondary" style={styles.uploadSectionLabel}>
              UPLOAD
            </ThemedText>

            {upload.destination ? (
              upload.destinationExpired && upload.state.status === 'idle' ? (
                <View style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
                  <Icon name="exclamationmark.triangle.fill" size={18} tintColor={theme.textSecondary} />
                  <ThemedText themeColor="textSecondary">Upload link expired</ThemedText>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    if (upload.state.status === 'idle') void upload.start();
                    else if (upload.state.status === 'error' && upload.state.retryable)
                      void upload.retry();
                    else if (upload.state.status === 'done') void copyWatchLink();
                  }}
                  onLongPress={upload.state.status === 'done' ? shareWatchLink : undefined}
                  disabled={upload.state.status === 'uploading'}
                  accessibilityRole="button"
                  accessibilityLabel={uploadButtonLabel(upload.state, upload.destination.server)}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}>
                  {upload.state.status === 'uploading' ? (
                    <>
                      <ActivityIndicator color={theme.text} />
                      <ThemedText>Uploading… {Math.round(upload.state.progress * 100)}%</ThemedText>
                      <Pressable
                        onPress={() => void upload.cancel()}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel upload">
                        <Icon name="xmark" size={16} tintColor={theme.textSecondary} />
                      </Pressable>
                    </>
                  ) : upload.state.status === 'done' ? (
                    <>
                      <Icon name="checkmark" size={18} tintColor={theme.text} />
                      <ThemedText>Uploaded — Copy link</ThemedText>
                    </>
                  ) : upload.state.status === 'error' ? (
                    <>
                      <Icon name="exclamationmark.triangle.fill" size={18} tintColor={theme.accent} />
                      <ThemedText>
                        {upload.state.retryable ? 'Upload failed — Retry' : 'Rejected by server'}
                      </ThemedText>
                    </>
                  ) : (
                    <>
                      <Icon name="icloud.and.arrow.up" size={18} tintColor={theme.text} />
                      <ThemedText>Upload to {hostOf(upload.destination.server)}</ThemedText>
                    </>
                  )}
                </Pressable>
              )
            ) : (
              // Gated on `idle` too, not just `pendingPairing` itself, so a tap can't double-fire in
              // the brief window between `claim()` flipping local state to "uploading" and the
              // destination/pendingPairing live queries catching up to make `destination` non-null.
              upload.pendingPairing &&
              upload.state.status === 'idle' && (
                <Pressable
                  onPress={() => void upload.claim(upload.pendingPairing!)}
                  accessibilityRole="button"
                  accessibilityLabel={`Upload to ${hostOf(upload.pendingPairing.server)}`}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}>
                  <Icon name="icloud.and.arrow.up" size={18} tintColor={theme.text} />
                  <ThemedText>Upload to {hostOf(upload.pendingPairing.server)}</ThemedText>
                </Pressable>
              )
            )}

            {upload.state.status === 'error' && (
              <ThemedText themeColor="textSecondary" type="small" style={styles.errorMessage}>
                {upload.state.reason}
              </ThemedText>
            )}
          </View>
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
function MergedPreview({ uri, lines }: { uri: string; lines: TranscriptLine[] }) {
  const player = useVideoPlayer(toFileUri(uri), (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });
  // Parked playback: on end the playhead reparks at 0 (while paused), so play always restarts
  // cleanly — replay()'s seek-then-play races an audible blip of the clip's end otherwise.
  const { isPlaying, togglePlay } = useParkedPlayback(player);
  const timeUpdate = useEvent(player, 'timeUpdate');
  const positionMs = (timeUpdate?.currentTime ?? player.currentTime) * 1000;

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
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <CaptionOverlay lines={lines} positionMs={positionMs} />
      </View>
      {!isPlaying && (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playBadge}>
            <Icon name="play.fill" size={24} tintColor="#fff" />
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
  uploadSection: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.four },
  uploadSectionLabel: { letterSpacing: 0.5 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: 14,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
