export interface ConcatOptions {
  outputPath?: string;
  quality?: 'low' | 'medium' | 'high';
}

export interface ConcatResult {
  success: boolean;
  outputPath?: string;
  error?: string;
} 