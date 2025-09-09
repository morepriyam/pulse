import * as React from 'react';

import { VideoConcatViewProps } from './VideoConcat.types';

export default function VideoConcatView(props: VideoConcatViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
