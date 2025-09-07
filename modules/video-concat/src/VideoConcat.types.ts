export interface ExportProgress {
  progress: number;  // 0-1
  currentSegment: number;
  phase: 'preparing' | 'processing' | 'finalizing';
}

export interface VideoConcatModuleEvents {
  [key: string]: (params: any) => void;  // Add index signature
  onProgress: (event: { progress: ExportProgress }) => void;
}