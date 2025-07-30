import { RecordingSegment } from '@/components/RecordingProgressBar';
import { VideoConcat } from '@/video/VideoConcat';
import { useState } from 'react';

export const useVideoProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportedVideoPath, setExportedVideoPath] = useState<string | null>(null);

  const processDraft = async (segments: RecordingSegment[]): Promise<string | null> => {
    if (segments.length === 0) {
      console.log('📱 No segments to process');
      return null;
    }

    setIsProcessing(true);
    setProgress(0);
    setExportedVideoPath(null);

    try {
      console.log(`🎬 Processing ${segments.length} segments...`);
      
      // Extract URIs from your existing RecordingSegment format
      const segmentUris = segments.map(segment => segment.uri);
      
      // Show progress (fake for now, we'll add real progress later)
      setProgress(25);
      
      const result = await VideoConcat.concatenateSegments(segmentUris, {
        quality: 'high'
      });
      
      setProgress(100);
      
      if (result.success && result.outputPath) {
        console.log('✅ Video processed successfully:', result.outputPath);
        setExportedVideoPath(result.outputPath);
        return result.outputPath;
      } else {
        console.error('❌ Video processing failed:', result.error);
        return null;
      }
    } catch (error) {
      console.error('❌ Video processing error:', error);
      return null;
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const resetExport = () => {
    setExportedVideoPath(null);
    setProgress(0);
  };

  return { 
    processDraft, 
    isProcessing, 
    progress,
    exportedVideoPath,
    resetExport
  };
}; 