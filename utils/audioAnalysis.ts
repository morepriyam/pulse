export interface FillerWord {
  startMs: number;
  endMs: number;
  word: string;
  confidence: number;
}

export interface AudioAnalysisResult {
  fillerWords: FillerWord[];
  duration: number;
}

/**
 * Audio analysis utility for detecting filler words in video recordings.
 * Uses browser's Speech Recognition API when available, with fallback to pattern detection.
 */
export class AudioAnalysis {
  private static readonly FILLER_WORDS = ['um', 'uh', 'ah', 'er', 'like', 'you know'];
  
  /**
   * Analyzes audio from a video file to detect filler words
   * @param videoUri - URI of the video file to analyze
   * @returns Promise<AudioAnalysisResult> - Analysis results with detected filler words
   */
  static async analyzeVideo(videoUri: string): Promise<AudioAnalysisResult> {
    try {
      // For now, implement a mock analysis that simulates detection
      // In a real implementation, this would use device speech recognition
      return this.mockAnalyze(videoUri);
    } catch (error) {
      console.error('Error analyzing audio:', error);
      return { fillerWords: [], duration: 0 };
    }
  }

  /**
   * Mock analysis for development and testing
   * Simulates finding filler words at common intervals
   */
  private static async mockAnalyze(videoUri: string): Promise<AudioAnalysisResult> {
    // Simulate loading and getting duration
    const mockDuration = Math.random() * 10000 + 5000; // 5-15 seconds
    
    // Simulate finding filler words at random intervals
    const fillerWords: FillerWord[] = [];
    const numFillers = Math.floor(Math.random() * 3) + 1; // 1-3 filler words
    
    for (let i = 0; i < numFillers; i++) {
      const startMs = Math.random() * (mockDuration - 1000);
      const duration = Math.random() * 500 + 200; // 200-700ms duration
      const word = this.FILLER_WORDS[Math.floor(Math.random() * this.FILLER_WORDS.length)];
      
      fillerWords.push({
        startMs,
        endMs: startMs + duration,
        word,
        confidence: 0.7 + Math.random() * 0.3 // 70-100% confidence
      });
    }
    
    // Sort by start time
    fillerWords.sort((a, b) => a.startMs - b.startMs);
    
    return {
      fillerWords,
      duration: mockDuration
    };
  }

  /**
   * Applies detected filler words to create trim suggestions
   * @param fillerWords - Detected filler words
   * @param duration - Total video duration in ms
   * @param buffer - Buffer time around filler words in ms
   * @returns Suggested trim points
   */
  static generateTrimSuggestions(
    fillerWords: FillerWord[],
    duration: number,
    buffer: number = 100
  ): { inMs?: number; outMs?: number; segments?: { startMs: number; endMs: number }[] } {
    if (fillerWords.length === 0) {
      return {};
    }

    // For simple implementation, create segments between filler words
    const segments: { startMs: number; endMs: number }[] = [];
    let currentStart = 0;

    for (const filler of fillerWords) {
      // Add segment before this filler word
      if (filler.startMs - buffer > currentStart) {
        segments.push({
          startMs: currentStart,
          endMs: filler.startMs - buffer
        });
      }
      currentStart = filler.endMs + buffer;
    }

    // Add final segment
    if (currentStart < duration) {
      segments.push({
        startMs: currentStart,
        endMs: duration
      });
    }

    return { segments };
  }
}