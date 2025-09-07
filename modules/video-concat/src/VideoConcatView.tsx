import { requireNativeView } from 'expo';
import * as React from 'react';

import { VideoConcatViewProps } from './VideoConcat.types';

const NativeView: React.ComponentType<VideoConcatViewProps> =
  requireNativeView('VideoConcat');

export default function VideoConcatView(props: VideoConcatViewProps) {
  return <NativeView {...props} />;
}
