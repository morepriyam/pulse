import { StyleSheet } from 'react-native';
import { GestureDetector, type ComposedGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';

import { Accent } from '@/constants/theme';
import { RECORD_BUTTON_SIZE } from '@/features/recorder/track-metrics';

/**
 * The record button — render and hold-feedback animation only. All touch handling
 * (tap-to-toggle, hold-to-record, drag-zoom) lives in the composed gesture from
 * useRecorderGestures.
 */
export function RecordButton({
  gesture,
  holdActive,
  isRecording,
  cameraReady,
  dragging,
}: {
  gesture: ComposedGesture;
  holdActive: SharedValue<boolean>;
  isRecording: boolean;
  cameraReady: boolean;
  dragging: boolean;
}) {
  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(holdActive.value ? 1.15 : 1, { duration: 150 }) }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(holdActive.value ? 0.75 : 1, { duration: 150 }) }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityRole="button"
        accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        style={[styles.recordOuter, { opacity: dragging ? 0 : cameraReady ? 1 : 0.4 }, outerStyle]}>
        <Animated.View
          style={[isRecording ? styles.recordInnerActive : styles.recordInner, innerStyle]}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  recordOuter: {
    width: RECORD_BUTTON_SIZE,
    height: RECORD_BUTTON_SIZE,
    borderRadius: RECORD_BUTTON_SIZE / 2,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: Accent },
  recordInnerActive: { width: 30, height: 30, borderRadius: 8, backgroundColor: Accent },
});
