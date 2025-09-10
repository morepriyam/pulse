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
): 'off' | 'standard' | 'cinematic' | 'auto' {
  // Use the best available mode on iOS, and default to 'off' elsewhere
  if (Platform.OS === 'ios') {
    switch (mode) {
      case VideoStabilization.off:
        return 'off';
      case VideoStabilization.on:
        // Prefer 'cinematic' for strongest stabilization (action-like)
        return 'cinematic';
      default:
        return 'off';
    }
  }

  // On Android (and other platforms), we disable stabilization entirely
  return 'off';
}

/**
 * Get supported video stabilization modes for the current platform
 */
export function getSupportedVideoStabilizationModes(): VideoStabilizationCapabilities {
  if (Platform.OS === 'ios') {
    // iOS: expose the simple on/off control (mapped to native 'off'/'auto')
    return {
      isSupported: true,
      supportedModes: [VideoStabilization.off, VideoStabilization.on],
    };
  }

  // Android and other platforms: disable/hide stabilization UI entirely
  return {
    isSupported: false,
    supportedModes: [],
  };
}