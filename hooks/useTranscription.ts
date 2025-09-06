import { useState, useEffect, useCallback } from 'react';
import { VideoTranscript } from '../types/transcription';
import { TranscriptStorage, WhisperTranscriber } from '../utils/transcription';
import { RecordingSegment } from '../components/RecordingProgressBar';
import { RetimingEngine } from '../utils/retiming';

interface TranscriptionState {
  transcript: VideoTranscript | null;
  isTranscribing: boolean;
  error: string | null;
  isLoading: boolean;
}

interface TranscriptionActions {
  transcribeVideo: (videoUri: string, language?: string) => Promise<void>;
  retimeTranscript: (segments: RecordingSegment[]) => VideoTranscript | null;
  clearTranscript: () => void;
  refreshTranscript: (videoId: string) => Promise<void>;
}

/**
 * Hook for managing video transcription state and operations
 */
export function useTranscription(videoId?: string): TranscriptionState & TranscriptionActions {
  const [transcript, setTranscript] = useState<VideoTranscript | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load existing transcript on mount
  useEffect(() => {
    if (videoId) {
      loadTranscript(videoId);
    }
  }, [videoId]);

  const loadTranscript = async (id: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const existingTranscript = await TranscriptStorage.getTranscriptByVideoId(id);
      setTranscript(existingTranscript);
    } catch (err) {
      console.error('Failed to load transcript:', err);
      setError('Failed to load existing transcript');
    } finally {
      setIsLoading(false);
    }
  };

  const transcribeVideo = useCallback(async (videoUri: string, language: string = 'en') => {
    setIsTranscribing(true);
    setError(null);

    try {
      // Check if Whisper is supported
      const isSupported = await WhisperTranscriber.isSupported();
      if (!isSupported) {
        throw new Error('Whisper transcription is not supported on this device');
      }

      // Create pending transcript entry
      const pendingTranscript: VideoTranscript = {
        id: Date.now().toString(),
        videoId: videoUri,
        segments: [],
        language,
        durationMs: 0,
        createdAt: new Date(),
        model: 'whisper-base',
        status: 'processing',
      };

      setTranscript(pendingTranscript);
      await TranscriptStorage.saveTranscript(pendingTranscript);

      // Perform transcription
      const result = await WhisperTranscriber.transcribeVideo(videoUri, language);
      
      // Save completed transcript
      await TranscriptStorage.saveTranscript(result);
      setTranscript(result);

    } catch (err) {
      console.error('Transcription failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Transcription failed';
      setError(errorMessage);

      // Update transcript status to error
      if (transcript) {
        const errorTranscript = { ...transcript, status: 'error' as const, error: errorMessage };
        await TranscriptStorage.saveTranscript(errorTranscript);
        setTranscript(errorTranscript);
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [transcript]);

  const retimeTranscript = useCallback((segments: RecordingSegment[]): VideoTranscript | null => {
    if (!transcript || transcript.status !== 'completed') {
      console.warn('No completed transcript available for retiming');
      return null;
    }

    try {
      const retimingResult = RetimingEngine.createRetimingResult(transcript, segments);
      const retimedTranscript = retimingResult.retimedTranscript;
      
      // Save retimed transcript
      TranscriptStorage.saveTranscript(retimedTranscript);
      
      return retimedTranscript;
    } catch (err) {
      console.error('Retiming failed:', err);
      setError('Failed to retime transcript');
      return null;
    }
  }, [transcript]);

  const clearTranscript = useCallback(() => {
    setTranscript(null);
    setError(null);
  }, []);

  const refreshTranscript = useCallback(async (id: string) => {
    await loadTranscript(id);
  }, []);

  return {
    // State
    transcript,
    isTranscribing,
    error,
    isLoading,
    
    // Actions
    transcribeVideo,
    retimeTranscript,
    clearTranscript,
    refreshTranscript,
  };
}