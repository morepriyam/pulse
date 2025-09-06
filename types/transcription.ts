/**
 * Transcription types for Whisper.cpp integration
 */

export interface TranscriptWord {
  /** The transcribed word/text */
  text: string;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Confidence score (0-1) */
  confidence: number;
}

export interface TranscriptSegment {
  /** Unique identifier for the segment */
  id: string;
  /** Array of words in this segment */
  words: TranscriptWord[];
  /** Start time of the segment in milliseconds */
  startMs: number;
  /** End time of the segment in milliseconds */
  endMs: number;
  /** Full text of the segment */
  text: string;
  /** Average confidence for the segment */
  confidence: number;
}

export interface VideoTranscript {
  /** Unique identifier for the transcript */
  id: string;
  /** Associated video URI or recording segment ID */
  videoId: string;
  /** Array of transcript segments */
  segments: TranscriptSegment[];
  /** Language of the transcript */
  language: string;
  /** Duration of the transcribed video in milliseconds */
  durationMs: number;
  /** Timestamp when transcript was created */
  createdAt: Date;
  /** Model used for transcription (e.g., "whisper-base") */
  model: string;
  /** Processing status */
  status: 'pending' | 'processing' | 'completed' | 'error';
  /** Error message if processing failed */
  error?: string;
}

export interface EditDecisionListEntry {
  /** Original time range */
  originalStartMs: number;
  originalEndMs: number;
  /** New time range after editing */
  newStartMs: number;
  newEndMs: number;
  /** Type of edit operation */
  operation: 'keep' | 'cut' | 'move';
}

export interface EditDecisionList {
  /** Array of edit decisions */
  entries: EditDecisionListEntry[];
  /** Associated video or segment ID */
  videoId: string;
  /** Original duration before edits */
  originalDurationMs: number;
  /** New duration after edits */
  newDurationMs: number;
}

export interface RetimingResult {
  /** Original transcript */
  originalTranscript: VideoTranscript;
  /** Retimed transcript with updated timestamps */
  retimedTranscript: VideoTranscript;
  /** EDL used for retiming */
  edl: EditDecisionList;
}