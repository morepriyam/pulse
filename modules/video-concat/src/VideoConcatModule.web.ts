import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './VideoConcat.types';

type VideoConcatModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class VideoConcatModule extends NativeModule<VideoConcatModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(VideoConcatModule, 'VideoConcatModule');
