import { VideoConcat } from '../../video/VideoConcat';
import { ConcatOptions, ConcatResult } from '../../video/types';
import { mockVideoFiles, mockRecordingSegments } from './mockVideoData';

// Import React Native mock after mock is set up
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Platform, NativeModules } = require('react-native');
const mockRNVideoConcat = NativeModules.RNVideoConcat;

describe('VideoConcat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset Platform.OS to ios for most tests
    (Platform as any).OS = 'ios';
  });

  describe('concatenateSegments', () => {
    it('should return error when no segments provided', async () => {
      const result = await VideoConcat.concatenateSegments([]);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No segments to concatenate');
      expect(result.outputPath).toBeUndefined();
    });

    it('should return single segment as-is when only one segment provided', async () => {
      const singleSegment = [mockVideoFiles.segment1];
      const result = await VideoConcat.concatenateSegments(singleSegment);
      
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(mockVideoFiles.segment1);
      expect(result.error).toBeUndefined();
      // Should not call native module for single segment
      expect(mockRNVideoConcat.concatenate).not.toHaveBeenCalled();
    });

    it('should successfully concatenate multiple segments on iOS', async () => {
      const segments = [
        mockVideoFiles.segment1,
        mockVideoFiles.segment2,
        mockVideoFiles.segment3,
      ];
      
      const expectedResult: ConcatResult = {
        success: true,
        outputPath: mockVideoFiles.outputPath,
      };
      
      mockRNVideoConcat.concatenate.mockResolvedValue(expectedResult);
      
      const result = await VideoConcat.concatenateSegments(segments);
      
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(mockVideoFiles.outputPath);
      expect(mockRNVideoConcat.concatenate).toHaveBeenCalledWith(segments, {});
    });

    it('should pass concatenation options to native module', async () => {
      const segments = [mockVideoFiles.segment1, mockVideoFiles.segment2];
      const options: ConcatOptions = {
        outputPath: '/custom/output/path.mp4',
        quality: 'high',
      };
      
      const expectedResult: ConcatResult = {
        success: true,
        outputPath: options.outputPath,
      };
      
      mockRNVideoConcat.concatenate.mockResolvedValue(expectedResult);
      
      const result = await VideoConcat.concatenateSegments(segments, options);
      
      expect(result.success).toBe(true);
      expect(mockRNVideoConcat.concatenate).toHaveBeenCalledWith(segments, options);
    });

    it('should handle native module errors gracefully', async () => {
      const segments = [mockVideoFiles.segment1, mockVideoFiles.segment2];
      const error = new Error('Native concatenation failed');
      
      mockRNVideoConcat.concatenate.mockRejectedValue(error);
      
      const result = await VideoConcat.concatenateSegments(segments);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Native concatenation failed');
      expect(result.outputPath).toBeUndefined();
    });

    it('should handle unknown errors gracefully', async () => {
      const segments = [mockVideoFiles.segment1, mockVideoFiles.segment2];
      
      mockRNVideoConcat.concatenate.mockRejectedValue('Unknown error type');
      
      const result = await VideoConcat.concatenateSegments(segments);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('iOS concatenation failed'); // This is what the iOS wrapper returns for non-Error types
    });

    it('should return error for unsupported platforms', async () => {
      // Mock Android platform
      (Platform as any).OS = 'android';
      
      const segments = [mockVideoFiles.segment1, mockVideoFiles.segment2];
      const result = await VideoConcat.concatenateSegments(segments);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Platform android not implemented yet');
      expect(mockRNVideoConcat.concatenate).not.toHaveBeenCalled();
    });

    it('should handle native module concatenation with recording segments format', async () => {
      // Reset to iOS for this test
      (Platform as any).OS = 'ios';
      
      // Test with actual recording segment URIs
      const segmentUris = mockRecordingSegments.map(segment => segment.uri);
      
      const expectedResult: ConcatResult = {
        success: true,
        outputPath: mockVideoFiles.outputPath,
      };
      
      mockRNVideoConcat.concatenate.mockResolvedValue(expectedResult);
      
      const result = await VideoConcat.concatenateSegments(segmentUris);
      
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(mockVideoFiles.outputPath);
      expect(mockRNVideoConcat.concatenate).toHaveBeenCalledWith(segmentUris, {});
    });

    it('should verify correct order of segments is maintained', async () => {
      // Reset to iOS for this test
      (Platform as any).OS = 'ios';
      
      const segments = [
        mockVideoFiles.segment3, // Intentionally out of order
        mockVideoFiles.segment1,
        mockVideoFiles.segment2,
      ];
      
      const expectedResult: ConcatResult = {
        success: true,
        outputPath: mockVideoFiles.outputPath,
      };
      
      mockRNVideoConcat.concatenate.mockResolvedValue(expectedResult);
      
      const result = await VideoConcat.concatenateSegments(segments);
      
      expect(result.success).toBe(true);
      // Verify the exact order is passed to native module
      expect(mockRNVideoConcat.concatenate).toHaveBeenCalledWith(segments, {});
      
      const callArgs = mockRNVideoConcat.concatenate.mock.calls[0][0];
      expect(callArgs[0]).toBe(mockVideoFiles.segment3);
      expect(callArgs[1]).toBe(mockVideoFiles.segment1);
      expect(callArgs[2]).toBe(mockVideoFiles.segment2);
    });

    it('should test different quality options', async () => {
      // Reset to iOS for this test
      (Platform as any).OS = 'ios';
      
      const segments = [mockVideoFiles.segment1, mockVideoFiles.segment2];
      const qualityOptions: ConcatOptions['quality'][] = ['low', 'medium', 'high'];
      
      for (const quality of qualityOptions) {
        const options: ConcatOptions = { quality };
        const expectedResult: ConcatResult = {
          success: true,
          outputPath: `${quality}_output.mp4`,
        };
        
        mockRNVideoConcat.concatenate.mockResolvedValue(expectedResult);
        
        const result = await VideoConcat.concatenateSegments(segments, options);
        
        expect(result.success).toBe(true);
        expect(mockRNVideoConcat.concatenate).toHaveBeenCalledWith(segments, options);
      }
    });
  });

  describe('integration with app components', () => {
    it('should work with the expected RecordingSegment interface', () => {
      // Verify our mock data matches the expected interface from the app
      mockRecordingSegments.forEach(segment => {
        expect(segment).toHaveProperty('id');
        expect(segment).toHaveProperty('duration');
        expect(segment).toHaveProperty('uri');
        expect(typeof segment.id).toBe('string');
        expect(typeof segment.duration).toBe('number');
        expect(typeof segment.uri).toBe('string');
      });
      
      // Test with different trimming scenarios
      const segment = mockRecordingSegments[1]; // Has inMs and outMs
      expect(segment.inMs).toBe(500);
      expect(segment.outMs).toBe(3000);
      expect(segment.duration).toBe(2500); // Matches the trimmed duration
    });
  });
});