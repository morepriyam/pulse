import { TranscriptStorage } from '../utils/transcription';
import { VideoTranscript } from '../types/transcription';

// Mock AsyncStorage
const mockAsyncStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

describe('TranscriptStorage', () => {
  const mockTranscript: VideoTranscript = {
    id: '1',
    videoId: 'video-123',
    segments: [
      {
        id: 'seg1',
        startMs: 0,
        endMs: 1000,
        text: 'Hello world',
        confidence: 0.95,
        words: [
          { text: 'Hello', startMs: 0, endMs: 500, confidence: 0.95 },
          { text: 'world', startMs: 500, endMs: 1000, confidence: 0.95 },
        ],
      },
    ],
    language: 'en',
    durationMs: 1000,
    createdAt: new Date('2024-01-01'),
    model: 'whisper-base',
    status: 'completed',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveTranscript', () => {
    it('should save a new transcript', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);
      mockAsyncStorage.setItem.mockResolvedValueOnce(undefined);

      await TranscriptStorage.saveTranscript(mockTranscript);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'video_transcripts',
        JSON.stringify([mockTranscript])
      );
    });

    it('should replace existing transcript with same videoId', async () => {
      const existingTranscripts = [
        { ...mockTranscript, id: 'old-id' },
        { ...mockTranscript, videoId: 'other-video', id: 'other-id' },
      ];

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(existingTranscripts));
      mockAsyncStorage.setItem.mockResolvedValueOnce(undefined);

      await TranscriptStorage.saveTranscript(mockTranscript);

      const expectedTranscripts = [
        { ...mockTranscript, videoId: 'other-video', id: 'other-id' },
        mockTranscript,
      ];

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'video_transcripts',
        JSON.stringify(expectedTranscripts)
      );
    });
  });

  describe('getTranscriptByVideoId', () => {
    it('should return transcript for existing videoId', async () => {
      const transcripts = [mockTranscript];
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(transcripts));

      const result = await TranscriptStorage.getTranscriptByVideoId('video-123');

      expect(result).toEqual(mockTranscript);
    });

    it('should return null for non-existing videoId', async () => {
      const transcripts = [mockTranscript];
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(transcripts));

      const result = await TranscriptStorage.getTranscriptByVideoId('non-existing');

      expect(result).toBeNull();
    });

    it('should return null when no transcripts exist', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);

      const result = await TranscriptStorage.getTranscriptByVideoId('video-123');

      expect(result).toBeNull();
    });
  });

  describe('getAllTranscripts', () => {
    it('should return all transcripts with parsed dates', async () => {
      const transcripts = [mockTranscript];
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(transcripts));

      const result = await TranscriptStorage.getAllTranscripts();

      expect(result).toHaveLength(1);
      expect(result[0].createdAt).toBeInstanceOf(Date);
      expect(result[0].createdAt.getTime()).toBe(new Date('2024-01-01').getTime());
    });

    it('should return empty array when no data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);

      const result = await TranscriptStorage.getAllTranscripts();

      expect(result).toEqual([]);
    });
  });

  describe('deleteTranscript', () => {
    it('should remove transcript with specified videoId', async () => {
      const transcripts = [
        mockTranscript,
        { ...mockTranscript, videoId: 'video-456', id: '2' },
      ];
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(transcripts));
      mockAsyncStorage.setItem.mockResolvedValueOnce(undefined);

      await TranscriptStorage.deleteTranscript('video-123');

      const expectedTranscripts = [
        { ...mockTranscript, videoId: 'video-456', id: '2' },
      ];

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'video_transcripts',
        JSON.stringify(expectedTranscripts)
      );
    });
  });

  describe('updateTranscriptStatus', () => {
    it('should update status of specified transcript', async () => {
      const transcripts = [mockTranscript];
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(transcripts));
      mockAsyncStorage.setItem.mockResolvedValueOnce(undefined);

      await TranscriptStorage.updateTranscriptStatus('video-123', 'error', 'Test error');

      const expectedTranscripts = [
        { ...mockTranscript, status: 'error', error: 'Test error' },
      ];

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'video_transcripts',
        JSON.stringify(expectedTranscripts)
      );
    });
  });

  describe('clearAllTranscripts', () => {
    it('should remove all transcripts', async () => {
      mockAsyncStorage.removeItem.mockResolvedValueOnce(undefined);

      await TranscriptStorage.clearAllTranscripts();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('video_transcripts');
    });
  });
});