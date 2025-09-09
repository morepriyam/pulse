export interface ExportProgress {
  progress: number;  // 0-1
  currentSegment: number;
  phase: 'preparing' | 'processing' | 'finalizing';
}

export interface VideoConcatModuleEvents {
  [key: string]: (params: any) => void;  // Add index signature
  onProgress: (event: { progress: ExportProgress }) => void;
}

// Payload for simple change events emitted by the web shim
export type ChangeEventPayload = {
  value: string;
};

// Props supported by the native/web view component
export type VideoConcatViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: { url: string } }) => void;
};