import {
  VideoTranscript,
  TranscriptSegment,
  TranscriptWord,
  EditDecisionList,
  EditDecisionListEntry,
  RetimingResult,
} from '../types/transcription';
import { RecordingSegment } from '../components/RecordingProgressBar';

/**
 * Engine for retiming transcripts based on Edit Decision Lists (EDL)
 * Handles timestamp adjustments when video segments are edited
 */
export class RetimingEngine {
  /**
   * Generate an EDL from recording segments with trim points
   */
  static generateEDLFromSegments(segments: RecordingSegment[]): EditDecisionList {
    const entries: EditDecisionListEntry[] = [];
    let currentNewStartMs = 0;

    segments.forEach((segment) => {
      const originalStartMs = segment.inMs || 0;
      const originalEndMs = segment.outMs || (segment.duration * 1000);
      const segmentDurationMs = originalEndMs - originalStartMs;

      entries.push({
        originalStartMs,
        originalEndMs,
        newStartMs: currentNewStartMs,
        newEndMs: currentNewStartMs + segmentDurationMs,
        operation: 'keep',
      });

      currentNewStartMs += segmentDurationMs;
    });

    const originalDurationMs = segments.reduce(
      (total, segment) => total + (segment.duration * 1000),
      0
    );

    return {
      entries,
      videoId: segments[0]?.id || 'unknown',
      originalDurationMs,
      newDurationMs: currentNewStartMs,
    };
  }

  /**
   * Retime a transcript based on an Edit Decision List
   */
  static retimeTranscript(
    transcript: VideoTranscript,
    edl: EditDecisionList
  ): VideoTranscript {
    const retimedSegments: TranscriptSegment[] = [];

    transcript.segments.forEach((segment) => {
      const retimedWords: TranscriptWord[] = [];
      let segmentIncluded = false;

      // Process each word in the segment
      segment.words.forEach((word) => {
        const retimedWord = this.retimeTimestamp(word.startMs, edl);
        const retimedEndMs = this.retimeTimestamp(word.endMs, edl);

        if (retimedWord !== null && retimedEndMs !== null) {
          retimedWords.push({
            ...word,
            startMs: retimedWord,
            endMs: retimedEndMs,
          });
          segmentIncluded = true;
        }
      });

      // If any words were included, create a retimed segment
      if (segmentIncluded && retimedWords.length > 0) {
        const segmentStartMs = Math.min(...retimedWords.map(w => w.startMs));
        const segmentEndMs = Math.max(...retimedWords.map(w => w.endMs));

        retimedSegments.push({
          ...segment,
          id: `${segment.id}_retimed`,
          startMs: segmentStartMs,
          endMs: segmentEndMs,
          words: retimedWords,
        });
      }
    });

    return {
      ...transcript,
      id: `${transcript.id}_retimed`,
      segments: retimedSegments,
      durationMs: edl.newDurationMs,
      createdAt: new Date(),
    };
  }

  /**
   * Retime a single timestamp based on EDL
   */
  private static retimeTimestamp(
    originalMs: number,
    edl: EditDecisionList
  ): number | null {
    // Find which EDL entry contains this timestamp
    for (const entry of edl.entries) {
      if (
        originalMs >= entry.originalStartMs &&
        originalMs <= entry.originalEndMs
      ) {
        if (entry.operation === 'cut') {
          return null; // This timestamp was cut out
        }

        // Calculate relative position within the original segment
        const relativePosition = originalMs - entry.originalStartMs;
        return entry.newStartMs + relativePosition;
      }
    }

    // Timestamp not found in any kept segments
    return null;
  }

  /**
   * Create a complete retiming result
   */
  static createRetimingResult(
    originalTranscript: VideoTranscript,
    segments: RecordingSegment[]
  ): RetimingResult {
    const edl = this.generateEDLFromSegments(segments);
    const retimedTranscript = this.retimeTranscript(originalTranscript, edl);

    return {
      originalTranscript,
      retimedTranscript,
      edl,
    };
  }

  /**
   * Validate an EDL for consistency
   */
  static validateEDL(edl: EditDecisionList): boolean {
    if (edl.entries.length === 0) return false;

    // Check for overlapping segments
    const sortedEntries = [...edl.entries].sort(
      (a, b) => a.originalStartMs - b.originalStartMs
    );

    for (let i = 0; i < sortedEntries.length - 1; i++) {
      const current = sortedEntries[i];
      const next = sortedEntries[i + 1];

      if (current.originalEndMs > next.originalStartMs) {
        console.warn('EDL has overlapping segments');
        return false;
      }
    }

    // Check for negative durations
    for (const entry of edl.entries) {
      if (entry.originalEndMs <= entry.originalStartMs) {
        console.warn('EDL has zero or negative duration segment');
        return false;
      }
      if (entry.newEndMs <= entry.newStartMs) {
        console.warn('EDL has zero or negative new duration segment');
        return false;
      }
    }

    return true;
  }

  /**
   * Get statistics about the retiming operation
   */
  static getRetimingStats(result: RetimingResult) {
    const originalWordCount = result.originalTranscript.segments.reduce(
      (total, segment) => total + segment.words.length,
      0
    );

    const retimedWordCount = result.retimedTranscript.segments.reduce(
      (total, segment) => total + segment.words.length,
      0
    );

    const wordsRemoved = originalWordCount - retimedWordCount;
    const retentionPercentage = (retimedWordCount / originalWordCount) * 100;

    const originalDuration = result.originalTranscript.durationMs;
    const newDuration = result.retimedTranscript.durationMs;
    const durationReduction = originalDuration - newDuration;
    const compressionRatio = (newDuration / originalDuration) * 100;

    return {
      originalWordCount,
      retimedWordCount,
      wordsRemoved,
      retentionPercentage,
      originalDurationMs: originalDuration,
      newDurationMs: newDuration,
      durationReductionMs: durationReduction,
      compressionRatio,
      segmentsRetained: result.retimedTranscript.segments.length,
      originalSegments: result.originalTranscript.segments.length,
    };
  }
}