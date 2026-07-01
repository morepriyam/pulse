import { NativeModule, requireNativeModule } from 'expo';

import { CallDetectorModuleEvents } from './CallDetector.types';

declare class CallDetectorModule extends NativeModule<CallDetectorModuleEvents> {
  /** Synchronous snapshot of whether a call is active right now (for the first render). */
  isCallActive(): boolean;
  /** Starts an iOS background task so work can continue briefly after backgrounding; returns its
   * id (pass to endBackgroundTask). No-op sentinel (-1) on Android/web. */
  beginBackgroundTask(): number;
  /** Ends a background task started with beginBackgroundTask. */
  endBackgroundTask(taskId: number): void;
}

export default requireNativeModule<CallDetectorModule>('CallDetector');
