import { Platform } from 'react-native';
import { ConcatOptions, ConcatResult } from './types';

// Platform-specific imports
const VideoConcatIOS = Platform.OS === 'ios' 
  ? require('./native/VideoConcat.ios').default 
  : null;

/**
 * Cross-platform video concatenation for your Pulse app
 */
export class VideoConcat {
  /**
   * Concatenate video segments from your RecordingSegment system
   */
  static async concatenateSegments(
    segmentUris: string[],
    options: ConcatOptions = {}
  ): Promise<ConcatResult> {
    console.log(`🎬 Concatenating ${segmentUris.length} segments...`);
    
    if (segmentUris.length === 0) {
      return { success: false, error: 'No segments to concatenate' };
    }

    if (segmentUris.length === 1) {
      console.log('📱 Only one segment, returning as-is');
      return { success: true, outputPath: segmentUris[0] };
    }

    try {
      if (Platform.OS === 'ios' && VideoConcatIOS) {
        return await VideoConcatIOS.concatenate(segmentUris, options);
      } else {
        return { 
          success: false, 
          error: `Platform ${Platform.OS} not implemented yet` 
        };
      }
    } catch (error) {
      console.error('❌ Concatenation failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
} 