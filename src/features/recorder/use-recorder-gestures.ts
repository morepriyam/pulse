// Gesture callbacks imperatively drive shared values and latest-callback refs by design —
// same situation the React-Compiler rules flag in playhead-cursor.tsx.
/* eslint-disable react-hooks/immutability, react-hooks/refs */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';

/** Press-and-hold this long on the record button to enter hold-to-record. */
const HOLD_MS = 250;
/** Vertical drag distance (px) that doubles (drag up) or halves (drag down) the zoom factor.
 * Drag-zoom is multiplicative so the feel is consistent regardless of the device's zoom range.
 * Tuned by feel — wants an on-device pass. */
const DRAG_DOUBLING_PX = 250;
/** Pinch scale is multiplicative and VisionCamera's `zoom` is an absolute factor, so the pinch
 * scale maps straight onto the factor (scale 2 ⇒ 2× the zoom factor) — physically exact. */

export function useRecorderGestures({
  onToggle,
  onHoldStart,
  onHoldEnd,
  onFocus,
  enabled,
  neutralZoom,
  minZoom,
  maxZoom,
}: {
  onToggle: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onFocus: (x: number, y: number) => void;
  enabled: boolean;
  /** The default/neutral zoom factor (the 1x wide lens) — opening value and flip reset target. */
  neutralZoom: number;
  /** Device's minimum zoom factor (the widest lens; 1 on devices without an ultra-wide). */
  minZoom: number;
  /** Capped maximum zoom factor we allow (see MAX_ZOOM_FACTOR in recorder.tsx). */
  maxZoom: number;
}) {
  // VisionCamera reads the `zoom` prop as a Reanimated SharedValue directly, so the gesture
  // tracks zoom per-frame with no JS round-trip or quantization. The value is an absolute zoom
  // factor in [minZoom, maxZoom]; 1 is the neutral 1x lens.
  const zoomSv = useSharedValue(1);
  const dragBase = useSharedValue(0);
  const pinchBase = useSharedValue(0);
  const holdActive = useSharedValue(false);
  // Mirror the device's zoom bounds into shared values so the worklets always clamp against
  // the current device (bounds change on flip / lens device).
  const minSv = useSharedValue(minZoom);
  const maxSv = useSharedValue(maxZoom);
  useEffect(() => {
    minSv.value = minZoom;
    maxSv.value = maxZoom;
  }, [minZoom, maxZoom, minSv, maxSv]);

  // The gestures are memoized but the recorder's callbacks are recreated each render —
  // dispatch through refs so a gesture never calls a stale closure over recording state.
  const onToggleRef = useRef(onToggle);
  const onHoldStartRef = useRef(onHoldStart);
  const onHoldEndRef = useRef(onHoldEnd);
  const onFocusRef = useRef(onFocus);
  onToggleRef.current = onToggle;
  onHoldStartRef.current = onHoldStart;
  onHoldEndRef.current = onHoldEnd;
  onFocusRef.current = onFocus;

  const fireToggle = useCallback(() => onToggleRef.current(), []);
  const fireHoldStart = useCallback(() => onHoldStartRef.current(), []);
  const fireHoldEnd = useCallback(() => onHoldEndRef.current(), []);
  const fireFocus = useCallback((x: number, y: number) => onFocusRef.current(x, y), []);

  const { buttonGesture, screenGesture } = useMemo(() => {
    const writeZoom = (next: number) => {
      'worklet';
      zoomSv.value = Math.min(Math.max(next, minSv.value), maxSv.value);
    };

    // Hold-to-record and vertical drag-zoom are ONE recognizer on the record button: the
    // long-press threshold activates it, then translationY drives zoom until release — no
    // cross-component touch coordination to race against the button.
    const holdPan = Gesture.Pan()
      .enabled(enabled)
      .activateAfterLongPress(HOLD_MS)
      .onStart(() => {
        holdActive.value = true;
        dragBase.value = zoomSv.value;
        runOnJS(fireHoldStart)();
      })
      .onUpdate((e) => {
        // Finger up (negative translationY) zooms in; multiplicative so it scales with range.
        writeZoom(dragBase.value * 2 ** (-e.translationY / DRAG_DOUBLING_PX));
      })
      .onFinalize(() => {
        // Fires on END and CANCELLED alike (unmount, navigation) — the stop always lands.
        if (holdActive.value) {
          holdActive.value = false;
          runOnJS(fireHoldEnd)();
        }
      });

    const recordTap = Gesture.Tap()
      .enabled(enabled)
      .maxDuration(HOLD_MS) // a completed hold can never also fire the toggle
      .onEnd((_e, success) => {
        if (success) runOnJS(fireToggle)();
      });

    // Two-finger pinch on the preview surface, mapped multiplicatively onto the zoom factor.
    const pinch = Gesture.Pinch()
      .enabled(enabled)
      // A two-finger pinch on the preview must not cancel an in-flight hold-record.
      .simultaneousWithExternalGesture(holdPan)
      .onStart(() => {
        pinchBase.value = zoomSv.value;
      })
      .onUpdate((e) => {
        writeZoom(pinchBase.value * e.scale);
      });

    // Single-finger tap on the preview → focus to that point (tap-to-focus). One finger vs the
    // pinch's two, so they coexist; the record button owns its own taps separately.
    const focusTap = Gesture.Tap()
      .enabled(enabled)
      .maxDuration(HOLD_MS)
      .onEnd((e, success) => {
        if (success) runOnJS(fireFocus)(e.x, e.y);
      });

    return {
      buttonGesture: Gesture.Exclusive(holdPan, recordTap),
      screenGesture: Gesture.Simultaneous(pinch, focusTap),
    };
  }, [
    enabled,
    fireToggle,
    fireHoldStart,
    fireHoldEnd,
    fireFocus,
    zoomSv,
    dragBase,
    pinchBase,
    holdActive,
    minSv,
    maxSv,
  ]);

  // Reset to the neutral 1x lens — on a flip, and once when the device (and its real neutral
  // factor) first resolves, so the camera opens at 1x instead of the ultra-wide minZoom.
  const resetZoom = useCallback(() => {
    zoomSv.value = Math.min(Math.max(neutralZoom, minZoom), maxZoom);
  }, [zoomSv, neutralZoom, minZoom, maxZoom]);

  // Animate zoom to a specific factor — used by the lens chips (0.5x / 1x / Tele are zoom
  // presets). VisionCamera switches the physical camera as the factor crosses the device's
  // lens-switch boundaries, so a short timing animation gives the smooth lens transition their
  // startZoomAnimation API is meant for (a direct gesture write below cancels it, as expected).
  const setZoomTo = useCallback(
    (factor: number) => {
      zoomSv.value = withTiming(Math.min(Math.max(factor, minZoom), maxZoom), { duration: 220 });
    },
    [zoomSv, minZoom, maxZoom],
  );

  return { zoomSv, holdActive, buttonGesture, screenGesture, resetZoom, setZoomTo };
}
