import { useEffect, useState } from 'react';

import type { Segment } from '@/db/schema';
import { effMs } from '@/utils/segment-window';

// Running total time for the recorder's top timer. While idle this is just the sum of saved
// clip durations; while recording it adds the wall-clock elapsed since `recordStartedAt`,
// ticking every 100ms. On stop the new clip's precise file duration lands in `segments` and
// the live estimate is dropped — a sub-second snap that's expected.
export function useRecordingTimer(segments: Segment[], recordStartedAt: number | null): number {
  const savedTotal = segments.reduce((sum, s) => sum + effMs(s), 0);
  // Only the interval mutates `now`; elapsed is derived in render. A stale `now` (idle, or the
  // first 100ms of a fresh recording) yields a negative diff that the clamp floors to 0.
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (recordStartedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [recordStartedAt]);

  if (recordStartedAt == null) return savedTotal;
  return savedTotal + Math.max(0, now - recordStartedAt);
}
