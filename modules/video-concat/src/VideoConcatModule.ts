import { NativeModule, requireNativeModule } from 'expo';

import { VideoConcatModuleEvents } from './VideoConcat.types';

declare class VideoConcatModule extends NativeModule<VideoConcatModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<VideoConcatModule>('VideoConcat');
