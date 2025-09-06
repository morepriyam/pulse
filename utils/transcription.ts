import AsyncStorage from '@react-native-async-storage/async-storage';
import { VideoTranscript, TranscriptSegment, TranscriptWord } from '../types/transcription';

const TRANSCRIPTS_STORAGE_KEY = 'video_transcripts';

/**
 * Utility class for managing video transcripts in AsyncStorage
 */
export class TranscriptStorage {
  static async saveTranscript(transcript: VideoTranscript): Promise<void> {
    try {
      const existingTranscripts = await this.getAllTranscripts();
      
      // Replace existing transcript with same videoId or append new one
      const updatedTranscripts = existingTranscripts.filter(
        t => t.videoId !== transcript.videoId
      );
      updatedTranscripts.push(transcript);
      
      await AsyncStorage.setItem(
        TRANSCRIPTS_STORAGE_KEY, 
        JSON.stringify(updatedTranscripts)
      );
    } catch (error) {
      console.error('Error saving transcript:', error);
      throw error;
    }
  }

  static async getTranscriptByVideoId(videoId: string): Promise<VideoTranscript | null> {
    try {
      const transcripts = await this.getAllTranscripts();
      return transcripts.find(t => t.videoId === videoId) || null;
    } catch (error) {
      console.error('Error getting transcript:', error);
      return null;
    }
  }

  static async getAllTranscripts(): Promise<VideoTranscript[]> {
    try {
      const transcriptsJson = await AsyncStorage.getItem(TRANSCRIPTS_STORAGE_KEY);
      if (!transcriptsJson) return [];
      
      const transcripts = JSON.parse(transcriptsJson);
      return transcripts.map((transcript: any) => ({
        ...transcript,
        createdAt: new Date(transcript.createdAt),
      }));
    } catch (error) {
      console.error('Error getting transcripts:', error);
      return [];
    }
  }

  static async deleteTranscript(videoId: string): Promise<void> {
    try {
      const transcripts = await this.getAllTranscripts();
      const updatedTranscripts = transcripts.filter(t => t.videoId !== videoId);
      await AsyncStorage.setItem(
        TRANSCRIPTS_STORAGE_KEY, 
        JSON.stringify(updatedTranscripts)
      );
    } catch (error) {
      console.error('Error deleting transcript:', error);
      throw error;
    }
  }

  static async updateTranscriptStatus(
    videoId: string, 
    status: VideoTranscript['status'],
    error?: string
  ): Promise<void> {
    try {
      const transcripts = await this.getAllTranscripts();
      const updatedTranscripts = transcripts.map(transcript =>
        transcript.videoId === videoId
          ? { ...transcript, status, error }
          : transcript
      );
      
      await AsyncStorage.setItem(
        TRANSCRIPTS_STORAGE_KEY, 
        JSON.stringify(updatedTranscripts)
      );
    } catch (error) {
      console.error('Error updating transcript status:', error);
      throw error;
    }
  }

  static async clearAllTranscripts(): Promise<void> {
    try {
      await AsyncStorage.removeItem(TRANSCRIPTS_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing transcripts:', error);
      throw error;
    }
  }
}

/**
 * Mock implementation of Whisper.cpp transcription
 * In a real implementation, this would interface with native Whisper.cpp module
 */
export class WhisperTranscriber {
  static async transcribeVideo(
    videoUri: string,
    language: string = 'en'
  ): Promise<VideoTranscript> {
    // Mock processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // In a real implementation, this would:
    // 1. Extract audio from video
    // 2. Run Whisper.cpp inference
    // 3. Parse timestamps and confidence scores
    // 4. Return structured transcript data

    // Mock transcript data for demonstration
    const mockSegments: TranscriptSegment[] = [
      {
        id: '1',
        startMs: 0,
        endMs: 3000,
        text: 'Hello, this is a sample transcript.',
        confidence: 0.95,
        words: [
          { text: 'Hello,', startMs: 0, endMs: 600, confidence: 0.98 },
          { text: 'this', startMs: 700, endMs: 1000, confidence: 0.95 },
          { text: 'is', startMs: 1100, endMs: 1300, confidence: 0.97 },
          { text: 'a', startMs: 1400, endMs: 1500, confidence: 0.92 },
          { text: 'sample', startMs: 1600, endMs: 2100, confidence: 0.94 },
          { text: 'transcript.', startMs: 2200, endMs: 3000, confidence: 0.96 },
        ],
      },
      {
        id: '2',
        startMs: 3500,
        endMs: 7000,
        text: 'It demonstrates timestamped transcription.',
        confidence: 0.89,
        words: [
          { text: 'It', startMs: 3500, endMs: 3700, confidence: 0.91 },
          { text: 'demonstrates', startMs: 3800, endMs: 4800, confidence: 0.87 },
          { text: 'timestamped', startMs: 4900, endMs: 5800, confidence: 0.85 },
          { text: 'transcription.', startMs: 5900, endMs: 7000, confidence: 0.92 },
        ],
      },
    ];

    const transcript: VideoTranscript = {
      id: Date.now().toString(),
      videoId: videoUri,
      segments: mockSegments,
      language,
      durationMs: 7000,
      createdAt: new Date(),
      model: 'whisper-base',
      status: 'completed',
    };

    return transcript;
  }

  static async isSupported(): Promise<boolean> {
    // In a real implementation, check if Whisper.cpp module is available
    return true;
  }

  static getSupportedLanguages(): string[] {
    return ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'];
  }
}