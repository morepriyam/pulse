// Gesture callbacks imperatively drive shared values and latest-callback refs by design —
// same situation the React-Compiler rules flag in playhead-cursor.tsx.
/* eslint-disable react-hooks/immutability, react-hooks/refs */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

/** Press-and-hold this long on the record button to enter hold-to-record. */
const HOLD_MS = 250;
/** Granularity of React zoom commits — zoom tracks gestures per-frame in a shared value,
 * but CameraView only re-renders when the quantized value changes (≤200 steps full-range). */
const ZOOM_QUANTUM = 0.005;
/** expo-camera's 0–1 zoom spans the device's ENTIRE digital range (~100x+ on recent
 * iPhones, mapped exponentially) — the upper half is unusable digital mush, so cap there. */
const MAX_ZOOM = 0.5;
/** Vertical drag distance (px) spanning the full 0→1 zoom prop range (so roughly one
 * screen height of drag to hit MAX_ZOOM). */
const DRAG_FULL_RANGE_PX = 800;
/** Pinch scale is multiplicative; log2(scale)/PINCH_RANGE maps it into expo-camera's
 * (already exponential) 0–1 zoom space — slightly faster than the physically exact
 * divisor (~7 for the modern-iPhone ~128x range). */
const PINCH_RANGE = 5;

export function useRecorderGestures({
  onToggle,
  onHoldStart,
  onHoldEnd,
  enabled,
}: {
  onToggle: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  enabled: boolean;
}) {
  const zoomSv = useSharedValue(0);
  const lastCommitted = useSharedValue(0);
  const dragBase = useSharedValue(0);
  const pinchBase = useSharedValue(0);
  const holdActive = useSharedValue(false);
  const [zoom, setZoom] = useState(0);

  // The gestures are memoized but the recorder's callbacks are recreated each render —
  // dispatch through refs so a gesture never calls a stale closure over recording state.
  const onToggleRef = useRef(onToggle);
  const onHoldStartRef = useRef(onHoldStart);
  const onHoldEndRef = useRef(onHoldEnd);
  onToggleRef.current = onToggle;
  onHoldStartRef.current = onHoldStart;
  onHoldEndRef.current = onHoldEnd;

  const fireToggle = useCallback(() => onToggleRef.current(), []);
  const fireHoldStart = useCallback(() => onHoldStartRef.current(), []);
  const fireHoldEnd = useCallback(() => onHoldEndRef.current(), []);

  const { buttonGesture, pinchGesture } = useMemo(() => {
    const writeZoom = (next: number) => {
      'worklet';
      const v = Math.min(Math.max(next, 0), MAX_ZOOM);
      zoomSv.value = v;
      const q = Math.round(v / ZOOM_QUANTUM) * ZOOM_QUANTUM;
      if (q !== lastCommitted.value) {
        lastCommitted.value = q;
        runOnJS(setZoom)(q);
      }
    };

    // Hold-to-record and vertical drag-zoom are ONE recognizer: the long-press threshold
    // activates it, then translationY drives zoom until release — no cross-component touch
    // coordination to race against the button.
    const holdPan = Gesture.Pan()
      .enabled(enabled)
      .activateAfterLongPress(HOLD_MS)
      .onStart(() => {
        holdActive.value = true;
        dragBase.value = zoomSv.value;
        runOnJS(fireHoldStart)();
      })
      .onUpdate((e) => {
        // Finger up (negative translationY) zooms in.
        writeZoom(dragBase.value - e.translationY / DRAG_FULL_RANGE_PX);
      })
      .onFinalize(() => {
        // Fires on END and CANCELLED alike (unmount, navigation) — the stop always lands.
        if (holdActive.value) {
          holdActive.value = false;
          runOnJS(fireHoldEnd)();
        }
      });

    const tap = Gesture.Tap()
      .enabled(enabled)
      .maxDuration(HOLD_MS) // a completed hold can never also fire the toggle
      .onEnd((_e, success) => {
        if (success) runOnJS(fireToggle)();
      });

    const pinch = Gesture.Pinch()
      .enabled(enabled)
      // A two-finger pinch on the preview must not cancel an in-flight hold-record.
      .simultaneousWithExternalGesture(holdPan)
      .onStart(() => {
        pinchBase.value = zoomSv.value;
      })
      .onUpdate((e) => {
        writeZoom(pinchBase.value + Math.log2(e.scale) / PINCH_RANGE);
      });

    return { buttonGesture: Gesture.Exclusive(holdPan, tap), pinchGesture: pinch };
  }, [enabled, fireToggle, fireHoldStart, fireHoldEnd, zoomSv, lastCommitted, dragBase, pinchBase, holdActive]);

  // Front/back max zoom factors differ, so the 0–1 value isn't portable across a flip.
  const resetZoom = useCallback(() => {
    zoomSv.value = 0;
    lastCommitted.value = 0;
    setZoom(0);
  }, [zoomSv, lastCommitted]);

  return { zoom, holdActive, buttonGesture, pinchGesture, resetZoom };
}
