import { useEvent } from 'expo';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon } from '@/components/icon';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
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
import {
  useMergedTranscription,
  type MergedTranscriptionState,
} from '@/features/export/use-merged-transcription';
import { MergeProgressRing } from '@/features/export/merge-progress-ring';
import { useSaveToDocuments } from '@/features/export/use-save-to-documents';
import { useSaveToPhotos } from '@/features/export/use-save-to-photos';
import { CaptionOverlay } from '@/features/transcription/caption-overlay';
import { ModelSwitcherModal } from '@/features/transcription/model-switcher-modal';
import type { TranscriptLine } from '@/features/transcription/whisper';
import { DestinationSelector } from '@/features/upload/destination-selector';
import { useUpload } from '@/features/upload/use-upload';
import { useParkedPlayback } from '@/hooks/use-parked-playback';
import { toFileUri } from '@/utils/file-store';
import { formatClipCount, formatDuration } from '@/utils/format';
import { effMs } from '@/utils/segment-window';

/** Sum of each clip's effective duration — the segmented-mode summary line has no merged output to read a duration from. */
const totalDurationMs = (clips: Segment[]) => clips.reduce((sum, s) => sum + effMs(s), 0);

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();

  const { data: segments } = useLiveQuery(segmentsForDraft(draftId ?? ''), [draftId]);
  // Zero-length clips (failed native reads) can't be concatenated — drop them before merging.
  const clips = segments.filter((s) => effMs(s) > 0);

  // Stable ref (not a plain value) so `useUpload` can be called — and its `destination`/pool
  // read — before the merge finishes. `uploadMerged` reads it lazily at upload time. See the
  // `useUpload` doc comment.
  const mergedRef = useRef<{ path: string; durationMs: number } | null>(null);
  const upload = useUpload(draftId ?? '', clips, mergedRef);

  // The upload unit that governs the current view: the draft's claimed destination once a run is
  // underway/finished, otherwise the pool destination the user has currently selected. Drives the
  // error-title wording and (via the selected unit below) the Upload button's readiness.
  const effectiveUploadUnit = upload.activeDestination?.uploadUnit ?? null;
  const isSegmentOnly = effectiveUploadUnit === 'segment';

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

  // Transcribe the merged video once it's ready; drives the "Transcribing…" state and the caption
  // overlay/editor. Captions live on the merged timeline now — no per-clip stitching.
  const transcription = useMergedTranscription(draftId ?? '', clips, state);
  const captionLines = transcription.lines;

  // Whether the share sheet is being presented, so we can disable the button and show a spinner.
  const [busy, setBusy] = useState(false);
  // The On-device AI sheet, opened from the caption CTA when no model is selected yet.
  const [modelSheetVisible, setModelSheetVisible] = useState(false);
  const photos = useSaveToPhotos();
  const docs = useSaveToDocuments();
  const theme = useTheme();

  // Open the merged-video caption editor (only meaningful once the merge is done).
  const openCaptionEditor = () => {
    if (state.status !== 'done' || !draftId) return;
    router.push(
      `/subtitles?draftId=${draftId}&videoUri=${encodeURIComponent(state.outputPath)}`,
    );
  };

  // Merged-only: uploading the single video needs the merge done first (segmented uploads each clip
  // on its own). Computed from the currently *selected* pool destination so switching segment↔merged in
  // the selector updates the Upload button's readiness immediately.
  const selectedNeedsMerge = upload.selectedDestination?.uploadUnit === 'merged';
  const selectedUploadReady = !selectedNeedsMerge || state.status === 'done';
  const selectedHost = upload.selectedDestination ? hostOf(upload.selectedDestination.server) : '';
  // Local const so TS narrows the discriminated union within the UPLOAD section below — property
  // chains like `upload.state` don't stay narrowed across nested JSX the way a plain const does.
  const uState = upload.state;

  const watchUrl =
    upload.destination?.uploadUnit === 'merged'
      ? `${upload.destination.server}/artifacts/${upload.destination.artifactId}${
          upload.destination.token ? `?token=${encodeURIComponent(upload.destination.token)}` : ''
        }`
      : null;

  // A finished upload is surfaced exactly once — a prompt to watch the video in the browser —
  // then acknowledged so no "uploaded" button lingers in the draft (§ post-upload UX). `done`
  // only occurs for a run completed this session (see `useUpload`), so this can't fire for a
  // draft that was uploaded some other time. Segmented sessions have no single watchable video (the
  // anchor artifact is the ordering manifest), so they get a plain confirmation instead.
  const acknowledgeDone = upload.acknowledgeDone;
  useEffect(() => {
    if (upload.state.status !== 'done') return;
    if (watchUrl) {
      Alert.alert(
        'Upload complete',
        'Watch the video in your browser?',
        [
          { text: 'Cancel', style: 'cancel', onPress: acknowledgeDone },
          {
            text: 'Watch',
            onPress: () => {
              void Linking.openURL(watchUrl);
              acknowledgeDone();
            },
          },
        ],
        { cancelable: true, onDismiss: acknowledgeDone },
      );
    } else {
      Alert.alert('Upload complete', 'Your pulse was uploaded.', [
        { text: 'OK', onPress: acknowledgeDone },
      ]);
    }
  }, [upload.state.status, watchUrl, acknowledgeDone]);

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

  // The pool selector + claim button, shared by every non-uploading state — including a draft
  // that was already uploaded before (claiming re-pairs it and restarts cleanly, see `claim`),
  // so a destination paired after a finished upload is always reachable.
  const selectorAndUpload = upload.destinations.length > 0 && (
    <>
      <DestinationSelector
        destinations={upload.destinations}
        selectedId={upload.selectedId}
        onSelect={upload.setSelectedId}
      />
      <Pressable
        onPress={() => void upload.claim(upload.selectedId)}
        disabled={!upload.selectedId || !selectedUploadReady}
        accessibilityRole="button"
        accessibilityLabel={selectedHost ? `Upload to ${selectedHost}` : 'Upload'}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.accent },
          (!upload.selectedId || !selectedUploadReady) && styles.disabled,
          pressed && styles.pressed,
        ]}>
        {selectedNeedsMerge && !selectedUploadReady ? (
          <>
            <ActivityIndicator color={theme.onAccent} />
            <ThemedText style={{ color: theme.onAccent }}>Preparing merged video…</ThemedText>
          </>
        ) : (
          <>
            <Icon name="icloud.and.arrow.up" size={18} tintColor={theme.onAccent} />
            <ThemedText style={{ color: theme.onAccent }}>Upload to {selectedHost}</ThemedText>
          </>
        )}
      </Pressable>
    </>
  );

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
            <MergedPreview
              uri={state.outputPath}
              lines={captionLines}
              meta={`${formatClipCount(clips.length)} · ${formatDuration(state.durationMs)}`}
              captionStatus={transcription.state.status}
              onEditCaptions={openCaptionEditor}
              onAddCaptions={() => setModelSheetVisible(true)}
            />

            {/* Compact inline row — these are secondary actions; the upload button(s) below
                own the vertical space. */}
            <View style={styles.actionsRow}>
              <Pressable
                onPress={runShare}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={busy ? 'Sharing' : 'Share'}
                accessibilityState={{ disabled: busy, busy }}
                style={({ pressed }) => [
                  styles.smallButton,
                  { backgroundColor: theme.backgroundElement },
                  busy && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                {busy ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <>
                    <Icon name="square.and.arrow.up" size={14} tintColor={theme.text} />
                    <ThemedText type="small">Share</ThemedText>
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
                  styles.smallButton,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                {photos.status === 'saving' ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : photos.status === 'saved' ? (
                  <>
                    <Icon name="checkmark" size={14} tintColor={theme.text} />
                    <ThemedText type="small">Saved</ThemedText>
                  </>
                ) : (
                  <>
                    <Icon name="square.and.arrow.down" size={14} tintColor={theme.text} />
                    <ThemedText type="small">Photos</ThemedText>
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
                  styles.smallButton,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                {docs.status === 'saving' ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : docs.status === 'saved' ? (
                  <>
                    <Icon name="checkmark" size={14} tintColor={theme.text} />
                    <ThemedText type="small">Saved</ThemedText>
                  </>
                ) : (
                  <>
                    <Icon name="folder" size={14} tintColor={theme.text} />
                    <ThemedText type="small">Files</ThemedText>
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
              {isSegmentOnly ? 'Merged copy failed' : 'Export failed'}
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

        {/* One UPLOAD section for both units. Merge always runs (above), so a merged-unit
            destination just waits on `state.status === 'done'` while a segment-unit one is ready
            immediately — the difference is only the Upload button's enabled state, not a
            separate flow. Shown while there's something actionable: destinations to pick, a run
            in flight (or its error/expiry notice). A previously-uploaded draft with nothing to
            pick shows no upload UI at all (§ post-upload UX — no persistent buttons). */}
        {(upload.destinations.length > 0 ||
          uState.status === 'uploading' ||
          uState.status === 'error' ||
          (upload.destination && upload.destinationExpired)) && (
          <View style={styles.uploadSection}>
            <ThemedText type="caption1" themeColor="textSecondary" style={styles.uploadSectionLabel}>
              UPLOAD
            </ThemedText>

            {uState.status === 'uploading' ? (
              <View style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
                <ActivityIndicator color={theme.text} />
                <ThemedText>Uploading… {Math.round(uState.progress * 100)}%</ThemedText>
                <Pressable
                  onPress={() => void upload.cancel()}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel upload">
                  <Icon name="xmark" size={16} tintColor={theme.textSecondary} />
                </Pressable>
              </View>
            ) : (
              // Idle or error: pick a destination and upload (or retry the claimed one). A prior
              // error shows its own Retry (same destination) plus the selector to re-pick a
              // different destination — re-claiming is the escape hatch for a dead session.
              <>
                {uState.status === 'error' && (
                  // Compact banner, not a button: title + reason share one card, with Retry as
                  // a small pill only when retrying can actually help. A non-retryable
                  // rejection is information, so nothing about it should look pressable.
                  <View
                    style={[styles.errorBanner, { backgroundColor: theme.backgroundElement }]}
                    accessibilityRole="alert"
                    accessibilityLabel={`${uState.retryable ? 'Upload failed' : 'Upload rejected by server'}. ${uState.reason}`}>
                    <Icon
                      name="exclamationmark.triangle.fill"
                      size={16}
                      tintColor={theme.accent}
                    />
                    <View style={styles.errorBody}>
                      <ThemedText type="smallBold">
                        {uState.retryable ? 'Upload failed' : 'Rejected by server'}
                      </ThemedText>
                      <ThemedText type="caption1" themeColor="textSecondary" numberOfLines={2}>
                        {uState.reason}
                      </ThemedText>
                    </View>
                    {uState.retryable && (
                      <Pressable
                        onPress={() => void upload.retry()}
                        accessibilityRole="button"
                        accessibilityLabel="Retry upload"
                        style={({ pressed }) => [
                          styles.smallButton,
                          { backgroundColor: theme.accent },
                          pressed && styles.pressed,
                        ]}>
                        <Icon name="arrow.clockwise" size={14} tintColor={theme.onAccent} />
                        <ThemedText type="small" style={{ color: theme.onAccent }}>
                          Retry
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                )}

                {upload.destinations.length > 0 ? (
                  selectorAndUpload
                ) : (
                  upload.destination &&
                  upload.destinationExpired && (
                    <View style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
                      <Icon
                        name="exclamationmark.triangle.fill"
                        size={18}
                        tintColor={theme.textSecondary}
                      />
                      <ThemedText themeColor="textSecondary">Upload link expired</ThemedText>
                    </View>
                  )
                )}
              </>
            )}
          </View>
        )}
      </View>

      <ModelSwitcherModal
        visible={modelSheetVisible}
        onClose={() => setModelSheetVisible(false)}
      />
    </ThemedView>
  );
}

/**
 * Plays the merged output. Mounts only once the merge is done, so `uri` is known at first
 * render and the player never needs a source swap. Plays once (no loop); tap to pause or
 * replay after it ends.
 */
function MergedPreview({
  uri,
  lines,
  meta,
  captionStatus,
  onEditCaptions,
  onAddCaptions,
}: {
  uri: string;
  lines: TranscriptLine[];
  /** Clip-count · duration readout, shown as a pill over the video. */
  meta: string;
  captionStatus: MergedTranscriptionState['status'];
  onEditCaptions: () => void;
  onAddCaptions: () => void;
}) {
  const player = useVideoPlayer(toFileUri(uri), (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });
  // Parked playback: on end the playhead reparks at 0 (while paused), so play always restarts
  // cleanly — replay()'s seek-then-play races an audible blip of the clip's end otherwise.
  const { isPlaying, togglePlay } = useParkedPlayback(player);
  const timeUpdate = useEvent(player, 'timeUpdate');
  const positionMs = (timeUpdate?.currentTime ?? player.currentTime) * 1000;

  // Working state → a spinner badge; actionable state → a tappable caption badge; `idle` (merge not
  // done) → nothing. `error` is actionable: transcription failed, but the user can still open the
  // editor to add captions by hand. Sits OUTSIDE the play Pressable so taps don't toggle playback.
  const working = captionStatus === 'transcribing' || captionStatus === 'downloading';
  const actionable =
    captionStatus === 'ready' || captionStatus === 'no-model' || captionStatus === 'error';

  return (
    <View style={styles.previewCard}>
      <Pressable
        style={styles.previewSurface}
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
        <View style={styles.metaRow} pointerEvents="none">
          <View style={styles.metaPill}>
            <ThemedText style={styles.metaText}>{meta}</ThemedText>
          </View>
        </View>
      </Pressable>

      {working && (
        <View style={styles.captionBadge} pointerEvents="none">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
      {actionable && (
        <Pressable
          onPress={captionStatus === 'no-model' ? onAddCaptions : onEditCaptions}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            captionStatus === 'ready' && lines.length > 0 ? 'Edit captions' : 'Add captions'
          }
          style={styles.captionBadge}>
          <Icon name="captions.bubble" size={16} weight="semibold" tintColor="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: Spacing.three },
  previewCard: {
    width: '90%',
    aspectRatio: 9 / 16,
    // Cap height so the preview scales down on shorter screens instead of pushing the
    // actions/upload section off the non-scrolling centered column.
    maxHeight: '66%',
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
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  previewSurface: { flex: 1 },
  // Clip-count · duration readout, bottom-center over the video.
  metaRow: { position: 'absolute', left: 0, right: 0, bottom: Spacing.two, alignItems: 'center' },
  metaPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  metaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  // Small tappable badge in the top-right of the merged preview — edit/add captions, or a
  // spinner while transcribing/downloading. White glyph on a translucent scrim over the video.
  captionBadge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 34,
    paddingHorizontal: Spacing.three,
    borderRadius: 17,
  },
  uploadSection: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.four },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
  },
  errorBody: { flex: 1, gap: Spacing.half },
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
