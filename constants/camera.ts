import { Platform } from 'react-native';

/**
 * Cross-platform video stabilization mode enum.
 * Simple on/off control for both iOS and Android.
 */
export enum VideoStabilization {
  /** Disable video stabilization */
  off = 'off',
  /** Enable video stabilization */
  on = 'on',
}

/**
 * Platform-specific video stabilization capabilities
 */
export interface VideoStabilizationCapabilities {
  /** Available stabilization modes for the current platform/device */
  supportedModes: VideoStabilization[];
  /** Whether video stabilization is supported at all */
  isSupported: boolean;
}

/**
 * Helper to map cross-platform modes to expo-camera's native VideoStabilization
 */
export function mapToNativeVideoStabilization(
  mode: VideoStabilization
): 'off' | 'standard' {
  switch (mode) {
    case VideoStabilization.off:
      return 'off';
    case VideoStabilization.on:
      return 'standard';
    default:
      return 'off';
  }
}

/**
 * Get supported video stabilization modes for the current platform
 */
export function getSupportedVideoStabilizationModes(): VideoStabilizationCapabilities {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    // Both iOS and Android support simple on/off
    return {
      isSupported: true,
      supportedModes: [
        VideoStabilization.off,
        VideoStabilization.on,
      ],
    };
  } else {
    // Web or other platforms - no support for now
    return {
      isSupported: false,
      supportedModes: [],
    };
  }
}