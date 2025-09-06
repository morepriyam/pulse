// Mock video file paths for testing
export const mockVideoFiles = {
  segment1: '/mock/path/segment1.mp4',
  segment2: '/mock/path/segment2.mp4', 
  segment3: '/mock/path/segment3.mp4',
  invalidFile: '/mock/path/invalid.mp4',
  outputPath: '/mock/path/output.mp4',
};

// Mock recording segments that match the app's RecordingSegment interface
export const mockRecordingSegments = [
  {
    id: 'segment-1',
    duration: 3000, // 3 seconds
    uri: mockVideoFiles.segment1,
    inMs: 0,
    outMs: 3000,
  },
  {
    id: 'segment-2', 
    duration: 2500, // 2.5 seconds
    uri: mockVideoFiles.segment2,
    inMs: 500, // Start 0.5s in
    outMs: 3000, // End at 3s (total 2.5s)
  },
  {
    id: 'segment-3',
    duration: 4000, // 4 seconds
    uri: mockVideoFiles.segment3,
  },
];