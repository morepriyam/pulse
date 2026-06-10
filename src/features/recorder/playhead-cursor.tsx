// The cursor drives a Reanimated shared value from gesture callbacks and follow-playback
// effects — imperative mutation by design, which the React-Compiler rules flag (including
// purity: Date.now() in the drag-throttle runs in an event callback, not during render —
// the rule only sees that the callback is constructed in render). Disabled for this file —
// the playhead controller.
/* eslint-disable react-hooks/immutability, react-hooks/refs, react-hooks/purity */
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Accent } from '@/constants/theme';
import type { Segment } from '@/db/schema';
import { clamp } from '@/utils/math';
import { effMs, indexAtGlobalMs, segmentOffsets } from '@/utils/segment-window';
import { KNOB, STEP, THUMB_HEIGHT, THUMB_WIDTH } from './track-metrics';

/** Max rate at which a knob drag issues player seeks (the knob itself moves every frame). */
const SCRUB_INTERVAL_MS = 80;

/** Playhead state, present only while the preview is open. */
export type Cursor = {
  activeId: string | null;
  globalMs: number;
  onScrub: (globalMs: number) => void;
};

/**
 * The draggable playhead over the track. Thumbs are fixed-width, so each thumb maps
 * proportionally onto its segment's effective (trimmed) duration; gaps snap to the
 * nearer thumb edge. Rendered OUTSIDE the ScrollView and positioned by
 * `contentX − scrollOffset`, so its pan gesture never competes with the bar's scroll or
 * sortables' long-press drag. v1 limitation: dragging the knob doesn't auto-scroll the
 * bar — the cursor clips at the viewport edge until the bar is scrolled.
 */
export function PlayheadCursor({
  cursor,
  segments,
  scrollOffset,
}: {
  cursor: Cursor;
  segments: Segment[];
  /** The bar's live scroll offset — owned by the always-mounted SegmentBar so it is
   * already correct when the cursor mounts on an earlier-scrolled bar. */
  scrollOffset: SharedValue<number>;
}) {
  const offsets = useMemo(() => segmentOffsets(segments), [segments]);

  const cursorX = useSharedValue(msToPx(cursor.globalMs, segments, offsets));
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const lastScrubAtRef = useRef(0);

  // Follow playback (smoothed to the ~4Hz timeUpdate cadence) unless the user is dragging.
  useEffect(() => {
    if (draggingRef.current) return;
    cursorX.value = withTiming(msToPx(cursor.globalMs, segments, offsets), {
      duration: 250,
      easing: Easing.linear,
    });
  }, [cursor.globalMs, segments, offsets, cursorX]);

  // The pan is memoized so GestureDetector doesn't push a new native config on every 4Hz
  // playhead render — including mid-drag on the very gesture being processed.
  const { onScrub } = cursor;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          draggingRef.current = true;
          cancelAnimation(cursorX);
          dragStartXRef.current = cursorX.value;
        })
        .onUpdate((e) => {
          const maxX = (segments.length - 1) * STEP + THUMB_WIDTH;
          const x = clamp(dragStartXRef.current + e.translationX, 0, maxX);
          cursorX.value = x;
          // The knob tracks every frame; seeks are throttled — an unthrottled drag issues
          // a native seek + a full screen re-render per gesture frame (~60-120Hz).
          const now = Date.now();
          if (now - lastScrubAtRef.current < SCRUB_INTERVAL_MS) return;
          lastScrubAtRef.current = now;
          onScrub(pxToMs(x, segments, offsets));
        })
        .onEnd(() => {
          // Always flush the final position so the settle point is exact.
          onScrub(pxToMs(cursorX.value, segments, offsets));
        })
        .onFinalize(() => {
          draggingRef.current = false;
        }),
    [segments, offsets, onScrub, cursorX],
  );

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: cursorX.value - scrollOffset.value - KNOB / 2 }],
  }));

  return (
    <Animated.View style={[styles.cursor, style]} pointerEvents="box-none">
      <View style={styles.cursorLine} pointerEvents="none" />
      <GestureDetector gesture={pan}>
        <View style={styles.cursorKnob} hitSlop={12} accessibilityLabel="Playhead" />
      </GestureDetector>
    </Animated.View>
  );
}

/** Draft-global ms → x in track-content coordinates. */
function msToPx(globalMs: number, segments: Segment[], offsets: number[]): number {
  const i = indexAtGlobalMs(segments, offsets, globalMs);
  if (i < 0) return 0;
  const eff = effMs(segments[i]);
  const frac = eff > 0 ? clamp((globalMs - offsets[i]) / eff, 0, 1) : 0;
  return i * STEP + frac * THUMB_WIDTH;
}

/** x in track-content coordinates → draft-global ms (gaps snap to the thumb's end). */
function pxToMs(x: number, segments: Segment[], offsets: number[]): number {
  const i = clamp(Math.floor(x / STEP), 0, segments.length - 1);
  if (!segments[i]) return 0;
  const local = clamp(x - i * STEP, 0, THUMB_WIDTH);
  return offsets[i] + (local / THUMB_WIDTH) * effMs(segments[i]);
}

const styles = StyleSheet.create({
  cursor: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: KNOB,
    alignItems: 'center',
  },
  cursorLine: {
    width: 2,
    height: THUMB_HEIGHT,
    borderRadius: 1,
    backgroundColor: '#fff',
  },
  cursorKnob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    marginTop: -KNOB / 2 + 2,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Accent,
  },
});
