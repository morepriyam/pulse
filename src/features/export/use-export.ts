import { useEffect, useState } from 'react';
import { merge } from 'react-native-video-trim';

import type { Segment } from '@/db/schema';
import { absolutize } from '@/utils/file-store';
import { effFile, effMs } from '@/utils/segment-window';

export type ExportState =
  | { status: 'merging' }
  | { status: 'done'; outputPath: string; durationMs: number }
  | { status: 'error'; message: string };

/**
 * Headless concat of a draft's clips into a single mp4 via react-native-video-trim's `merge()`
 * (passthrough join for uniform clips, selective outlier-conform for mixed, re-encode fallback).
 * Joins each clip's EFFECTIVE file (edited ?? original) in timeline order. A single-clip draft
 * skips the merge and exports that file directly (nothing to concatenate). The job re-runs only
 * when the clip set actually changes (keyed on a file signature, not array identity) or on `retry`.
 */
export function useExport(segments: Segment[]) {
  const [state, setState] = useState<ExportState>({ status: 'merging' });
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);

  // Stable across re-renders that don't change the actual clips, so the live query re-emitting
  // the same data doesn't kick off a second merge.
  const files = segments.map(effFile);
  const signature = files.join('|');

  useEffect(() => {
    if (segments.length === 0) return;
    // A late merge resolving after this effect re-ran (or the screen unmounted) must not clobber
    // newer state — only the most recent run is allowed to commit.
    let current = true;

    void (async () => {
      // Inside the async body (not the effect's synchronous path) so re-running on a clip change
      // flips back to the loader without a cascading-render warning.
      if (current) setState({ status: 'merging' });
      try {
        const urls = files.map(absolutize);
        const result =
          urls.length === 1
            ? { outputPath: urls[0], duration: effMs(segments[0]) }
            : await merge(urls, { outputExt: 'mp4' });
        if (current) {
          setState({ status: 'done', outputPath: result.outputPath, durationMs: result.duration });
        }
      } catch (e) {
        console.warn('[export] merge failed', e);
        if (current) {
          setState({
            status: 'error',
            message: e instanceof Error ? e.message : 'Could not merge the clips.',
          });
        }
      }
    })();

    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, attempt]);

  return { state, retry };
}
