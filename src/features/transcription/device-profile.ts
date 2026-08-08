import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { DeviceProfile } from './models';

/**
 * The real device's `DeviceProfile` (see models.ts), read from expo-device. Lives in its own
 * module — NOT models.ts — because expo-device imports react-native, which the pure-Node jest
 * suite that loads the model catalog can't require. Values are static module constants on the
 * native side, so a plain function (no hook/state) is accurate and cheap.
 */
export function currentDeviceProfile(): DeviceProfile {
  return {
    os: Platform.OS,
    totalMemoryBytes: Device.totalMemory,
  };
}
