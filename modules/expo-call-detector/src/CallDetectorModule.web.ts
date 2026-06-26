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

export default registerWebModule(CallDetectorModule, 'CallDetectorModule');
