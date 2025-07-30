import { NativeModules } from 'react-native';
import { ConcatOptions, ConcatResult } from '../types';

const { RNVideoConcat } = NativeModules;

export default class VideoConcatIOS {
  static async concatenate(
    segmentPaths: string[],
    options: ConcatOptions = {}
  ): Promise<ConcatResult> {
    try {
      console.log('🍎 iOS: Starting concatenation...', segmentPaths);
      const result = await RNVideoConcat.concatenate(segmentPaths, options);
      console.log('🍎 iOS: Concatenation result:', result);
      return result;
    } catch (error) {
      console.error('🍎 iOS: Concatenation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'iOS concatenation failed'
      };
    }
  }
} 