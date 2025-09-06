import { RetimingEngine } from '../utils/retiming';
import { VideoTranscript, TranscriptSegment, EditDecisionList } from '../types/transcription';
import { RecordingSegment } from '../components/RecordingProgressBar';

describe('RetimingEngine', () => {
  const mockRecordingSegments: RecordingSegment[] = [
    {
      id: '1',
      duration: 3,
      uri: 'video1.mp4',
      inMs: 0,
      outMs: 3000,
    },
    {
      id: '2', 
      duration: 2,
      uri: 'video2.mp4',
      inMs: 500,
      outMs: 2500,
    },
  ];

  const mockTranscriptSegments: TranscriptSegment[] = [
    {
      id: '1',
      startMs: 0,
      endMs: 2000,
      text: 'Hello world',
      confidence: 0.95,
      words: [
        { text: 'Hello', startMs: 0, endMs: 1000, confidence: 0.95 },
        { text: 'world', startMs: 1000, endMs: 2000, confidence: 0.95 },
      ],
    },
    {
      id: '2',
      startMs: 3500,
      endMs: 5000,
      text: 'Testing transcription',
      confidence: 0.90,
      words: [
        { text: 'Testing', startMs: 3500, endMs: 4200, confidence: 0.90 },
        { text: 'transcription', startMs: 4200, endMs: 5000, confidence: 0.90 },
      ],
    },
  ];

  const mockTranscript: VideoTranscript = {
    id: '1',
    videoId: 'test-video',
    segments: mockTranscriptSegments,
    language: 'en',
    durationMs: 5000,
    createdAt: new Date(),
    model: 'whisper-base',
    status: 'completed',
  };

  describe('generateEDLFromSegments', () => {
    it('should generate correct EDL from recording segments', () => {
      const edl = RetimingEngine.generateEDLFromSegments(mockRecordingSegments);

      expect(edl.entries).toHaveLength(2);
      
      // First segment: 0-3000ms maps to 0-3000ms
      expect(edl.entries[0]).toEqual({
        originalStartMs: 0,
        originalEndMs: 3000,
        newStartMs: 0,
        newEndMs: 3000,
        operation: 'keep',
      });

      // Second segment: 500-2500ms maps to 3000-5000ms
      expect(edl.entries[1]).toEqual({
        originalStartMs: 500,
        originalEndMs: 2500,
        newStartMs: 3000,
        newEndMs: 5000,
        operation: 'keep',
      });

      expect(edl.newDurationMs).toBe(5000);
    });

    it('should handle segments without trim points', () => {
      const segments: RecordingSegment[] = [
        { id: '1', duration: 2, uri: 'video1.mp4' },
        { id: '2', duration: 3, uri: 'video2.mp4' },
      ];

      const edl = RetimingEngine.generateEDLFromSegments(segments);

      expect(edl.entries).toHaveLength(2);
      expect(edl.entries[0].originalStartMs).toBe(0);
      expect(edl.entries[0].originalEndMs).toBe(2000);
      expect(edl.entries[1].originalStartMs).toBe(0);
      expect(edl.entries[1].originalEndMs).toBe(3000);
    });
  });

  describe('retimeTranscript', () => {
    it('should retime transcript segments correctly', () => {
      const edl = RetimingEngine.generateEDLFromSegments(mockRecordingSegments);
      const retimedTranscript = RetimingEngine.retimeTranscript(mockTranscript, edl);

      expect(retimedTranscript.segments).toHaveLength(1);
      
      // Only the first segment should be kept (0-2000ms fits in 0-3000ms range)
      const retimedSegment = retimedTranscript.segments[0];
      expect(retimedSegment.startMs).toBe(0);
      expect(retimedSegment.endMs).toBe(2000);
      expect(retimedSegment.words).toHaveLength(2);
    });

    it('should exclude words outside of kept ranges', () => {
      const edl: EditDecisionList = {
        entries: [
          {
            originalStartMs: 0,
            originalEndMs: 1500,
            newStartMs: 0,
            newEndMs: 1500,
            operation: 'keep',
          },
        ],
        videoId: 'test',
        originalDurationMs: 5000,
        newDurationMs: 1500,
      };

      const retimedTranscript = RetimingEngine.retimeTranscript(mockTranscript, edl);
      
      // Should only include first word (0-1000ms)
      expect(retimedTranscript.segments).toHaveLength(1);
      expect(retimedTranscript.segments[0].words).toHaveLength(1);
      expect(retimedTranscript.segments[0].words[0].text).toBe('Hello');
    });
  });

  describe('validateEDL', () => {
    it('should validate correct EDL', () => {
      const edl = RetimingEngine.generateEDLFromSegments(mockRecordingSegments);
      expect(RetimingEngine.validateEDL(edl)).toBe(true);
    });

    it('should reject empty EDL', () => {
      const edl: EditDecisionList = {
        entries: [],
        videoId: 'test',
        originalDurationMs: 1000,
        newDurationMs: 0,
      };
      expect(RetimingEngine.validateEDL(edl)).toBe(false);
    });

    it('should reject EDL with negative duration', () => {
      const edl: EditDecisionList = {
        entries: [
          {
            originalStartMs: 1000,
            originalEndMs: 500, // End before start
            newStartMs: 0,
            newEndMs: 500,
            operation: 'keep',
          },
        ],
        videoId: 'test',
        originalDurationMs: 1000,
        newDurationMs: 500,
      };
      expect(RetimingEngine.validateEDL(edl)).toBe(false);
    });
  });

  describe('getRetimingStats', () => {
    it('should calculate correct retiming statistics', () => {
      const edl = RetimingEngine.generateEDLFromSegments(mockRecordingSegments);
      const retimingResult = RetimingEngine.createRetimingResult(mockTranscript, mockRecordingSegments);
      const stats = RetimingEngine.getRetimingStats(retimingResult);

      expect(stats.originalWordCount).toBe(4); // 2 words in each segment
      expect(stats.originalDurationMs).toBe(5000);
      expect(stats.newDurationMs).toBe(5000);
      expect(stats.compressionRatio).toBe(100);
    });
  });
});