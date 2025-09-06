import { useState, useCallback } from 'react';
import { RecordingSegment } from '@/components/RecordingProgressBar';
import { AutoEditProcessor, AutoEditOptions, AutoEditResult } from '@/utils/autoEditProcessor';

export interface UseAutoEditState {
  isEnabled: boolean;
  isProcessing: boolean;
  options: AutoEditOptions;
  results: AutoEditResult[];
  summary: {
    totalSegments: number;
    editedSegments: number;
    totalFillerWords: number;
    totalTimeSaved: number;
    averageConfidence: number;
  } | null;
}

export interface UseAutoEditActions {
  toggleAutoEdit: () => void;
  updateOptions: (options: Partial<AutoEditOptions>) => void;
  processSegments: (segments: RecordingSegment[]) => Promise<AutoEditResult[]>;
  clearResults: () => void;
  applyEdits: () => RecordingSegment[];
}

/**
 * Custom hook for managing auto-edit functionality.
 * Handles state management, processing, and integration with recording segments.
 */
export function useAutoEdit(): UseAutoEditState & UseAutoEditActions {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [options, setOptions] = useState<AutoEditOptions>({
    enabled: false,
    confidence: 0.7,
    buffer: 100,
    minSegmentLength: 500
  });
  const [results, setResults] = useState<AutoEditResult[]>([]);
  const [summary, setSummary] = useState<UseAutoEditState['summary']>(null);

  const toggleAutoEdit = useCallback(() => {
    setIsEnabled(prev => {
      const newEnabled = !prev;
      setOptions(prevOptions => ({
        ...prevOptions,
        enabled: newEnabled
      }));
      return newEnabled;
    });
  }, []);

  const updateOptions = useCallback((newOptions: Partial<AutoEditOptions>) => {
    setOptions(prev => ({ ...prev, ...newOptions }));
  }, []);

  const processSegments = useCallback(async (segments: RecordingSegment[]): Promise<AutoEditResult[]> => {
    if (!isEnabled || segments.length === 0) {
      return [];
    }

    setIsProcessing(true);
    try {
      const processingResults = await AutoEditProcessor.processSegments(segments, options);
      setResults(processingResults);
      
      const summaryStats = AutoEditProcessor.getSummary(processingResults);
      setSummary(summaryStats);
      
      return processingResults;
    } catch (error) {
      console.error('Error processing segments for auto-edit:', error);
      return [];
    } finally {
      setIsProcessing(false);
    }
  }, [isEnabled, options]);

  const clearResults = useCallback(() => {
    setResults([]);
    setSummary(null);
  }, []);

  const applyEdits = useCallback((): RecordingSegment[] => {
    if (results.length === 0) return [];
    
    return results.map(result => {
      // Return edited segment if filler words were detected, otherwise original
      return result.fillerWordsDetected.length > 0 
        ? result.editedSegment 
        : result.originalSegment;
    });
  }, [results]);

  return {
    // State
    isEnabled,
    isProcessing,
    options,
    results,
    summary,
    
    // Actions
    toggleAutoEdit,
    updateOptions,
    processSegments,
    clearResults,
    applyEdits
  };
}