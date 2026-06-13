// The cursor drives Reanimated shared values from gesture callbacks, a frame loop, and
// follow-playback effects — imperative mutation by design, which the React-Compiler
// immutability/refs rules flag. Disabled for this file — the playhead controller.
/* eslint-disable react-hooks/immutability, react-hooks/refs */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type AnimatedRef,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated';

import { Accent } from '@/constants/theme';
import type { Segment } from '@/db/schema';
import { clamp } from '@/utils/math';
import { effMs, indexAtGlobalMs, segmentOffsets } from '@/utils/segment-window';
import { KNOB, POP_LANE, SCRUB_INSET, STEP, THUMB_HEIGHT, THUMB_WIDTH } from './track-metrics';

/** Max rate at which a knob drag issues player seeks (the knob itself moves every frame). */
const SCRUB_INTERVAL_MS = 80;

/** Scrub auto-scroll: while the dragged knob dwells within EDGE_ZONE px of a viewport edge, the bar
 *  scrolls continuously at up to MAX_SCROLL_SPEED px/s (ramping with depth into the zone), so a long
 *  bar can be crossed by holding at the edge rather than repeatedly dragging. The knob's screen-x is
 *  clamped KNOB_PAD in from each edge so it stays fully visible and never chases the finger off-screen. */
const EDGE_ZONE = 56;
const MAX_SCROLL_SPEED = 760;
const KNOB_PAD = KNOB;

/** Breathing room kept between the playhead and each viewport edge before the bar auto-scrolls to
 *  follow it during PLAYBACK. Set to the scrub zone's outer bound so playback parks the playhead
 *  exactly where scrub auto-scroll begins — grabbing the knob mid-follow then starts at zero velocity
 *  (no creep) and only scrolls once the finger pushes further into the edge. */
const EDGE_MARGIN = KNOB_PAD + EDGE_ZONE;

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
 * sortables' long-press drag.
 *
 * The bar auto-scrolls to keep the playhead visible, with two mechanisms tuned to their physics:
 * during PLAYBACK (the knob moves on its own) a calm edge-band reaction nudges the scroll, and it
 * also brings a freshly-opened off-screen clip into view; during a SCRUB (finger dragging the knob)
 * a per-frame velocity loop scrolls continuously while the knob dwells near an edge, so a long bar
 * can be crossed by holding at the edge instead of repeatedly dragging. Neither adds a gesture.
 */
export function PlayheadCursor({
  cursor,
  segments,
  scrollRef,
  scrollOffset,
  viewportW,
  contentW,
  suspendAutoScroll,
}: {
  cursor: Cursor;
  segments: Segment[];
  /** The bar's ScrollView ref — auto-scrolled (UI thread) to follow the playhead. */
  scrollRef: AnimatedRef<Animated.ScrollView>;
  /** The bar's live scroll offset — owned by the always-mounted SegmentBar so it is
   * already correct when the cursor mounts on an earlier-scrolled bar. */
  scrollOffset: SharedValue<number>;
  /** Measured viewport width and scroll-content width — the edge-band follow math. */
  viewportW: SharedValue<number>;
  contentW: SharedValue<number>;
  /** True during a reorder drag — pauses follow so it doesn't fight Sortable's auto-scroll. */
  suspendAutoScroll: SharedValue<boolean>;
}) {
  const offsets = useMemo(() => segmentOffsets(segments), [segments]);

  const cursorX = useSharedValue(msToPx(cursor.globalMs, segments, offsets));
  const draggingRef = useRef(false);

  // Scrub state, all driven from the pan + frame loop below.
  const scrubbing = useSharedValue(false); // a finger drag is in progress (vs. playback follow)
  const fingerTransX = useSharedValue(0); // the pan's translationX, fed to the frame loop
  const baseKnobScreen = useSharedValue(0); // knob centre screen-x captured at drag start
  const sinceSeek = useSharedValue(0); // accumulated frame time for the throttled seek
  // Highest content-x the playhead can reach (right edge of the last thumb), kept current as the
  // clip count changes so the frame loop can clamp without reading the segments array on the UI thread.
  const maxContentX = useSharedValue(0);
  useEffect(() => {
    maxContentX.value = Math.max(0, (segments.length - 1) * STEP + THUMB_WIDTH);
  }, [segments.length, maxContentX]);

  // PLAYBACK follow: when the playhead's content-x nears either viewport edge, nudge the bar's scroll
  // to restore EDGE_MARGIN. cursorX is smoothly animated on playback-follow, so animated:false tracks
  // it cleanly; the reaction's first run scrolls a freshly-opened far clip into view. Yields while a
  // reorder OR a finger-scrub is active (those own the scroll then), and is idle while cursorX is
  // steady — so a manual scroll on a paused bar is preserved.
  useAnimatedReaction(
    () => cursorX.value,
    (x) => {
      if (suspendAutoScroll.value || scrubbing.value) return;
      const vw = viewportW.value;
      if (vw <= 0) return;
      const maxScroll = Math.max(0, contentW.value - vw);
      const knobX = x + SCRUB_INSET; // content-x of the knob/line (matches the translate inset)
      const cur = scrollOffset.value;
      let target = cur;
      if (knobX < cur + EDGE_MARGIN) target = knobX - EDGE_MARGIN;
      else if (knobX > cur + vw - EDGE_MARGIN) target = knobX - vw + EDGE_MARGIN;
      target = Math.min(Math.max(target, 0), maxScroll);
      if (Math.abs(target - cur) > 0.5) scrollTo(scrollRef, target, 0, false);
    },
  );

  // Follow playback (smoothed to the ~4Hz timeUpdate cadence) unless the user is dragging.
  useEffect(() => {
    if (draggingRef.current) return;
    cursorX.value = withTiming(msToPx(cursor.globalMs, segments, offsets), {
      duration: 250,
      easing: Easing.linear,
    });
  }, [cursor.globalMs, segments, offsets, cursorX]);

  // seekToGlobalMs changes identity mid-scrub (it sets selectedId), so the frame loop must NOT
  // capture it — it calls through this per-render ref. pxToMs / segments / offsets stay on JS.
  // flushSeek is stable so the frame callback can be memoized (below), registering only once.
  const scrubSeekRef = useRef<(contentX: number) => void>(() => {});
  scrubSeekRef.current = (contentX) => cursor.onScrub(pxToMs(contentX, segments, offsets));
  const flushSeek = useCallback((contentX: number) => scrubSeekRef.current(contentX), []);

  // SCRUB follow: while a drag is active, this runs every frame. The knob's screen-x is finger-driven
  // but clamped fully inside the viewport (so it never chases off-screen); when it dwells within
  // EDGE_ZONE of an edge the bar scrolls continuously (velocity ∝ depth). The seek position is derived
  // from knob screen-x + the live scroll offset, so it keeps advancing while the finger holds still.
  // Memoized (deps are all stable shared values) so useFrameCallback registers it once, not every
  // 4Hz render; the explicit 'worklet' keeps the babel plugin workletizing the extracted function.
  const onScrubFrame = useCallback(
    (frame: FrameInfo) => {
      'worklet';
      if (!scrubbing.value) return;
      const vw = viewportW.value;
      if (vw <= 0) return;
      const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
      const knob = Math.min(
        Math.max(baseKnobScreen.value + fingerTransX.value, KNOB_PAD),
        vw - KNOB_PAD,
      );
      let v = 0;
      if (knob < KNOB_PAD + EDGE_ZONE) v = -MAX_SCROLL_SPEED * (1 - (knob - KNOB_PAD) / EDGE_ZONE);
      else if (knob > vw - KNOB_PAD - EDGE_ZONE)
        v = MAX_SCROLL_SPEED * (1 - (vw - KNOB_PAD - knob) / EDGE_ZONE);
      const maxScroll = Math.max(0, contentW.value - vw);
      const nextOffset = Math.min(Math.max(scrollOffset.value + v * dt, 0), maxScroll);
      if (nextOffset !== scrollOffset.value) scrollTo(scrollRef, nextOffset, 0, false);
      // content-x (the playhead/seek position) = knob screen-x − inset + offset.
      const contentX = Math.min(Math.max(knob - SCRUB_INSET + nextOffset, 0), maxContentX.value);
      cursorX.value = contentX; // drives the knob render (cursorX − scrollOffset)
      sinceSeek.value += dt;
      if (sinceSeek.value >= SCRUB_INTERVAL_MS / 1000) {
        sinceSeek.value = 0;
        runOnJS(flushSeek)(contentX);
      }
    },
    [
      flushSeek,
      scrubbing,
      viewportW,
      contentW,
      scrollOffset,
      scrollRef,
      baseKnobScreen,
      fingerTransX,
      sinceSeek,
      maxContentX,
      cursorX,
    ],
  );
  const autoScroll = useFrameCallback(onScrubFrame, false);

  // The pan is memoized so GestureDetector doesn't push a new native config on every 4Hz playhead
  // render — including mid-drag on the very gesture being processed. It only records finger state and
  // toggles the frame loop (which owns cursorX + the scroll during a scrub); the final settle seek is
  // flushed here so the end point is exact even if it lands between throttled frames.
  const { onScrub } = cursor;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          draggingRef.current = true;
          cancelAnimation(cursorX);
          baseKnobScreen.value = cursorX.value - scrollOffset.value + SCRUB_INSET;
          fingerTransX.value = 0;
          sinceSeek.value = 0;
          scrubbing.value = true;
          autoScroll.setActive(true);
        })
        .onUpdate((e) => {
          fingerTransX.value = e.translationX;
        })
        .onEnd(() => {
          onScrub(pxToMs(cursorX.value, segments, offsets));
        })
        .onFinalize(() => {
          scrubbing.value = false;
          autoScroll.setActive(false);
          draggingRef.current = false;
        }),
    [
      segments,
      offsets,
      onScrub,
      cursorX,
      scrollOffset,
      autoScroll,
      baseKnobScreen,
      fingerTransX,
      scrubbing,
      sinceSeek,
    ],
  );

  const style = useAnimatedStyle(() => ({
    // + SCRUB_INSET matches the track's left inset so the line stays on the thumb edges; − KNOB/2
    // centers the knob on the line.
    transform: [{ translateX: cursorX.value - scrollOffset.value - KNOB / 2 + SCRUB_INSET }],
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
    // The thumbs sit POP_LANE below the scroll-frame top (the pop lane); match it so the line
    // starts on the thumb's top edge.
    marginTop: POP_LANE,
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
