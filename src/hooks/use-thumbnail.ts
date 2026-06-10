import { VideoThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';

import { absolutize } from '@/utils/file-store';
import { generateThumbnail } from '@/utils/video';

/**
 * First-frame thumbnail for a stored clip (relative path; generation is cached per uri
 * in utils/video). `undefined` while loading or when there is no file.
 */
export function useThumbnail(relPath?: string | null): VideoThumbnail | undefined {
  const [thumbnail, setThumbnail] = useState<VideoThumbnail>();

  useEffect(() => {
    if (!relPath) return;
    let alive = true;
    void generateThumbnail(absolutize(relPath)).then((t) => {
      if (alive) setThumbnail(t);
    });
    return () => {
      alive = false;
    };
  }, [relPath]);

  return relPath ? thumbnail : undefined;
}
