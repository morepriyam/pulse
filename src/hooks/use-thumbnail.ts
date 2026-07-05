import { useEffect, useState } from 'react';
import type { VideoThumbnail } from 'expo-video';

import { absolutize } from '@/utils/file-store';
import { generateThumbnail } from '@/utils/video';

type Thumb = { uri: string } | VideoThumbnail | undefined;

/**
 * Cover frame for a stored clip. Prefers the persisted jpeg (`thumbRel`, written at record/edit
 * time) rendered straight from disk — no player. Falls back to runtime first-frame extraction
 * from `videoRelFallback` for legacy rows persisted before disk thumbnails existed (null column).
 * `undefined` while the fallback loads or when there is nothing to show.
 */
export function useThumbnail(thumbRel?: string | null, videoRelFallback?: string | null): Thumb {
  const [fallback, setFallback] = useState<VideoThumbnail>();

  useEffect(() => {
    if (thumbRel || !videoRelFallback) return;
    let alive = true;
    void generateThumbnail(absolutize(videoRelFallback)).then((t) => {
      if (alive) setFallback(t);
    });
    return () => {
      alive = false;
    };
  }, [thumbRel, videoRelFallback]);

  if (thumbRel) return { uri: absolutize(thumbRel) };
  return videoRelFallback ? fallback : undefined;
}
