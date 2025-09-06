import { RecordingSegment } from '@/components/RecordingProgressBar';
import { AudioAnalysis, FillerWord } from './audioAnalysis';

export interface AutoEditOptions {
  enabled: boolean;
  confidence: number; // Minimum confidence threshold (0-1)
  buffer: number; // Buffer time around filler words in ms
  minSegmentLength: number; // Minimum segment length to keep in ms
}

export interface AutoEditResult {
  originalSegment: RecordingSegment;
  editedSegment: RecordingSegment;
  fillerWordsDetected: FillerWord[];
  timeSaved: number; // Time saved in ms
}

/**
 * Auto-edit processing service for removing filler words from video segments.
 * Integrates with existing recording and draft management system.
 */
export class AutoEditProcessor {
  private static readonly DEFAULT_OPTIONS: AutoEditOptions = {
    enabled: true,
    confidence: 0.7,
    buffer: 100, // 100ms buffer
    minSegmentLength: 500 // 500ms minimum segment
  };

  /**
   * Process a recording segment for auto-editing
   * @param segment - Original recording segment
   * @param options - Auto-edit options
   * @returns Promise<AutoEditResult> - Processing result with edited segment
   */
  static async processSegment(
    segment: RecordingSegment,
    options: AutoEditOptions = this.DEFAULT_OPTIONS
  ): Promise<AutoEditResult> {
    try {
      if (!options.enabled) {
        return {
          originalSegment: segment,
          editedSegment: segment,
          fillerWordsDetected: [],
          timeSaved: 0
        };
      }

      // Analyze audio for filler words
      const analysisResult = await AudioAnalysis.analyzeVideo(segment.uri);
      
      // Filter by confidence threshold
      const highConfidenceFillers = analysisResult.fillerWords.filter(
        filler => filler.confidence >= options.confidence
      );

      if (highConfidenceFillers.length === 0) {
        return {
          originalSegment: segment,
          editedSegment: segment,
          fillerWordsDetected: [],
          timeSaved: 0
        };
      }

      // Generate trim suggestions
      const trimSuggestions = AudioAnalysis.generateTrimSuggestions(
        highConfidenceFillers,
        segment.duration * 1000, // Convert to ms
        options.buffer
      );

      // Calculate new duration after edits
      const timeSaved = this.calculateTimeSaved(highConfidenceFillers, options.buffer);
      const newDuration = segment.duration - (timeSaved / 1000);

      // Create edited segment with trim points
      const editedSegment: RecordingSegment = {
        ...segment,
        id: `${segment.id}_edited`,
        duration: Math.max(newDuration, options.minSegmentLength / 1000),
        fillerWords: highConfidenceFillers,
        inMs: trimSuggestions.segments?.[0]?.startMs,
        outMs: trimSuggestions.segments?.[trimSuggestions.segments.length - 1]?.endMs
      };

      return {
        originalSegment: segment,
        editedSegment,
        fillerWordsDetected: highConfidenceFillers,
        timeSaved
      };

    } catch (error) {
      console.error('Error processing segment for auto-edit:', error);
      return {
        originalSegment: segment,
        editedSegment: segment,
        fillerWordsDetected: [],
        timeSaved: 0
      };
    }
  }

  /**
   * Process multiple segments for auto-editing
   * @param segments - Array of recording segments
   * @param options - Auto-edit options
   * @returns Promise<AutoEditResult[]> - Array of processing results
   */
  static async processSegments(
    segments: RecordingSegment[],
    options: AutoEditOptions = this.DEFAULT_OPTIONS
  ): Promise<AutoEditResult[]> {
    const results: AutoEditResult[] = [];
    
    for (const segment of segments) {
      const result = await this.processSegment(segment, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Calculate total time saved by removing filler words
   * @param fillerWords - Detected filler words
   * @param buffer - Buffer time around each filler word
   * @returns Total time saved in ms
   */
  private static calculateTimeSaved(fillerWords: FillerWord[], buffer: number): number {
    return fillerWords.reduce((total, filler) => {
      const duration = (filler.endMs - filler.startMs) + (buffer * 2);
      return total + duration;
    }, 0);
  }

  /**
   * Get summary statistics for auto-edit results
   * @param results - Auto-edit results
   * @returns Summary statistics
   */
  static getSummary(results: AutoEditResult[]): {
    totalSegments: number;
    editedSegments: number;
    totalFillerWords: number;
    totalTimeSaved: number;
    averageConfidence: number;
  } {
    const totalSegments = results.length;
    const editedSegments = results.filter(r => r.fillerWordsDetected.length > 0).length;
    const totalFillerWords = results.reduce((sum, r) => sum + r.fillerWordsDetected.length, 0);
    const totalTimeSaved = results.reduce((sum, r) => sum + r.timeSaved, 0);
    
    const allFillers = results.flatMap(r => r.fillerWordsDetected);
    const averageConfidence = allFillers.length > 0 
      ? allFillers.reduce((sum, f) => sum + f.confidence, 0) / allFillers.length 
      : 0;

    return {
      totalSegments,
      editedSegments,
      totalFillerWords,
      totalTimeSaved,
      averageConfidence
    };
  }
}