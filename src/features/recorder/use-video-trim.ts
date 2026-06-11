import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import VideoTrim, { showEditor, type Spec } from 'react-native-video-trim';

import { setEdited } from '@/db/drafts';
import type { Segment } from '@/db/schema';
import { Accent } from '@/constants/theme';
import { absolutize, importTrimmedFile } from '@/utils/file-store';
import { getDurationMs } from '@/utils/video';

const Native = VideoTrim as Spec;

/**
 * Drives react-native-video-trim's full-screen editor (trim + crop/rotate/flip/mute/speed).
 * Tap a clip → `openTrim` opens the editor on the PRISTINE original; on save, RNVT's
 * re-encoded output is moved into the draft as the segment's `.edited.mp4` and recorded via
 * `setEdited` (destructive model — originals stay untouched, re-editing re-opens the original).
 */
export function useVideoTrim(draftId: string | null) {
  // The editor is fire-and-forget (showEditor) and its events carry no correlation id, so we
  // stash which segment/draft the current session belongs to and read it back in onFinishTrimming.
  const pendingSegmentId = useRef<string | null>(null);
  const draftIdRef = useRef(draftId);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  useEffect(() => {
    const subs = [
      Native.onFinishTrimming(({ outputPath, duration }) => {
        const segmentId = pendingSegmentId.current;
        const dId = draftIdRef.current;
        pendingSegmentId.current = null;
        if (!segmentId || !dId) return;
        void (async () => {
          try {
            const editedRel = await importTrimmedFile(outputPath, dId, segmentId);
            // Prefer the decoded file's duration (source of truth elsewhere); fall back to the
            // event's reported ms.
            const dur = (await getDurationMs(absolutize(editedRel))) || duration;
            await setEdited(segmentId, editedRel, dur);
          } catch (e) {
            console.warn('[trim] failed to apply edit', e);
            Alert.alert('Edit failed', 'Could not save the trimmed clip. Please try again.');
          }
        })();
      }),
      Native.onCancel(() => {
        pendingSegmentId.current = null;
      }),
      Native.onError(({ message }) => {
        pendingSegmentId.current = null;
        console.warn('[trim] editor error', message);
        Alert.alert('Edit failed', message || 'The editor reported an error.');
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const openTrim = (segment: Segment) => {
    if (!draftIdRef.current) return;
    pendingSegmentId.current = segment.id;
    showEditor(absolutize(segment.originalFilename), {
      enablePreciseTrimming: true, // frame-accurate (re-encodes; transforms re-encode anyway)
      saveToPhoto: false, // we keep the file ourselves → no photo permission needed
      outputExt: 'mp4',
      theme: 'dark',
      trimmerColor: Accent,
      handleIconColor: '#FFFFFF',
      headerText: 'Edit clip',
      headerTextColor: '#FFFFFF',
      enableCancelDialog: false, // Cancel/Save dismiss immediately — no "are you sure?" prompts
      enableSaveDialog: false,
      // enableEditTools defaults true (crop/rotate/flip/mute/speed exposed).
    });
  };

  return { openTrim };
}
