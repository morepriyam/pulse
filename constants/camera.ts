import { Platform } from 'react-native';

/**
 * Cross-platform video stabilization mode enum.
 * Extends expo-camera's VideoStabilization with additional modes.
 */
export enum VideoStabilization {
  /** Disable video stabilization */
  off = 'off',
  /** Enable basic stabilization (Android + iOS convenience mapping) */
  on = 'on',
  /** Standard stabilization (iOS only, maps to 'on' on Android) */
  standard = 'standard',
  /** Cinematic stabilization (iOS only, maps to 'on' on Android) */
  cinematic = 'cinematic',
  /** Cinematic extended stabilization (iOS only, maps to 'on' on Android) */
  cinematicExtended = 'cinematicExtended',
  /** Auto stabilization (iOS only, maps to 'on' on Android) */
  auto = 'auto',
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
): 'off' | 'standard' | 'cinematic' | 'auto' {
  switch (mode) {
    case VideoStabilization.off:
      return 'off';
    case VideoStabilization.on:
    case VideoStabilization.standard:
      return 'standard';
    case VideoStabilization.cinematic:
    case VideoStabilization.cinematicExtended:
      return 'cinematic';
    case VideoStabilization.auto:
      return 'auto';
    default:
      return 'off';
  }
}

/**
 * Get supported video stabilization modes for the current platform
 */
export function getSupportedVideoStabilizationModes(): VideoStabilizationCapabilities {
  if (Platform.OS === 'ios') {
    // iOS supports the full range
    return {
      isSupported: true,
      supportedModes: [
        VideoStabilization.off,
        VideoStabilization.on,
        VideoStabilization.standard,
        VideoStabilization.cinematic,
        VideoStabilization.cinematicExtended,
        VideoStabilization.auto,
      ],
    };
  } else if (Platform.OS === 'android') {
    // Android only supports on/off
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