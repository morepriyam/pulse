import { registerWebModule, NativeModule } from 'expo';

import { CallDetectorModuleEvents } from './CallDetector.types';

// No telephony on web — report "no call" so the recorder behaves normally.
class CallDetectorModule extends NativeModule<CallDetectorModuleEvents> {
  isCallActive(): boolean {
    return false;
  }
  beginBackgroundTask(): number {
    return -1;
  }
  endBackgroundTask(_taskId: number): void {}
}

// Registered under 'CallDetector' to match Name("CallDetector") on native and the
// requireNativeModule('CallDetector') lookup, so the name is consistent across platforms.
export default registerWebModule(CallDetectorModule, 'CallDetector');
