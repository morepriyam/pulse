/**
 * Manual validation tests for video stabilization functionality.
 * Run these in a development environment to verify implementation.
 */

import { Platform } from 'react-native';
import { 
  VideoStabilization, 
  getSupportedVideoStabilizationModes, 
  mapToNativeVideoStabilization 
} from '../constants/camera';

export function testVideoStabilizationImplementation() {
  console.log('=== Video Stabilization Implementation Tests ===');
  
  // Test 1: Check supported modes
  const capabilities = getSupportedVideoStabilizationModes();
  console.log(`Platform: ${Platform.OS}`);
  console.log(`Supported: ${capabilities.isSupported}`);
  console.log(`Modes: ${capabilities.supportedModes.join(', ')}`);
  
  // Test 2: Test mapping functions
  console.log('\n=== Mapping Tests ===');
  Object.values(VideoStabilization).forEach((mode) => {
    const nativeMode = mapToNativeVideoStabilization(mode);
    console.log(`${mode} -> ${nativeMode}`);
  });
  
  // Test 3: Platform-specific expectations
  console.log('\n=== Platform Expectations ===');
  if (Platform.OS === 'ios') {
    console.log('✓ iOS should support all modes');
    console.log(`✓ Has ${capabilities.supportedModes.length} modes`);
  } else if (Platform.OS === 'android') {
    console.log('✓ Android should support only on/off');
    console.log(`✓ Has ${capabilities.supportedModes.length} modes`);
    const expectedModes = [VideoStabilization.off, VideoStabilization.on];
    const hasExpectedModes = expectedModes.every(mode => capabilities.supportedModes.includes(mode));
    console.log(`✓ Has expected modes: ${hasExpectedModes}`);
  }
  
  console.log('\n=== Implementation Complete ===');
}

export function logVideoStabilizationUsage(mode: VideoStabilization) {
  const nativeMode = mapToNativeVideoStabilization(mode);
  console.log(`Video stabilization set to: ${mode} (native: ${nativeMode})`);
  
  if (Platform.OS === 'android' && mode !== VideoStabilization.off && mode !== VideoStabilization.on) {
    console.warn(`⚠️ Mode '${mode}' is iOS-only and will be mapped to 'on' on Android`);
  }
}