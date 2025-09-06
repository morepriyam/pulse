// Simple validation script for auto-edit functionality
// Run with: node test/autoEdit.test.js

const { AudioAnalysis } = require('../utils/audioAnalysis.ts');
const { AutoEditProcessor } = require('../utils/autoEditProcessor.ts');

// Mock RecordingSegment for testing
const mockSegment = {
  id: 'test-segment-1',
  duration: 10, // 10 seconds
  uri: 'file://test-video.mp4'
};

async function runTests() {
  console.log('🧪 Running Auto-Edit Tests');
  console.log('==========================');

  let passed = 0;
  let failed = 0;

  function test(name, testFn) {
    try {
      const result = testFn();
      if (result instanceof Promise) {
        return result.then(() => {
          console.log(`✅ ${name}`);
          passed++;
        }).catch(error => {
          console.log(`❌ ${name}: ${error.message}`);
          failed++;
        });
      } else {
        console.log(`✅ ${name}`);
        passed++;
      }
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      failed++;
    }
  }

  console.log('\n🔍 AudioAnalysis Tests');
  await test('analyzeVideo returns analysis result', async () => {
    const result = await AudioAnalysis.analyzeVideo(mockSegment.uri);
    
    if (!result.hasOwnProperty('fillerWords')) throw new Error('Missing fillerWords property');
    if (!result.hasOwnProperty('duration')) throw new Error('Missing duration property');
    if (!Array.isArray(result.fillerWords)) throw new Error('fillerWords should be array');
    if (typeof result.duration !== 'number') throw new Error('duration should be number');
  });

  await test('generateTrimSuggestions creates segments', async () => {
    const mockFillerWords = [
      { startMs: 1000, endMs: 1500, word: 'um', confidence: 0.8 },
      { startMs: 5000, endMs: 5300, word: 'ah', confidence: 0.9 }
    ];

    const suggestions = AudioAnalysis.generateTrimSuggestions(
      mockFillerWords,
      10000, // 10 seconds
      100    // 100ms buffer
    );

    if (!suggestions.hasOwnProperty('segments')) throw new Error('Missing segments property');
    if (!suggestions.segments) throw new Error('segments should be defined');
    if (suggestions.segments.length === 0) throw new Error('Should create segments');
    
    suggestions.segments.forEach(segment => {
      if (segment.startMs >= segment.endMs) throw new Error('Invalid segment timing');
    });
  });

  console.log('\n🎬 AutoEditProcessor Tests');
  await test('processSegment handles segment with default options', async () => {
    const result = await AutoEditProcessor.processSegment(mockSegment);
    
    if (!result.hasOwnProperty('originalSegment')) throw new Error('Missing originalSegment');
    if (!result.hasOwnProperty('editedSegment')) throw new Error('Missing editedSegment');
    if (!result.hasOwnProperty('fillerWordsDetected')) throw new Error('Missing fillerWordsDetected');
    if (!result.hasOwnProperty('timeSaved')) throw new Error('Missing timeSaved');

    if (result.originalSegment.id !== mockSegment.id) throw new Error('Original segment mismatch');
    if (!Array.isArray(result.fillerWordsDetected)) throw new Error('fillerWordsDetected should be array');
    if (typeof result.timeSaved !== 'number') throw new Error('timeSaved should be number');
  });

  await test('processSegment with disabled auto-edit returns original segment', async () => {
    const options = { enabled: false, confidence: 0.7, buffer: 100, minSegmentLength: 500 };
    const result = await AutoEditProcessor.processSegment(mockSegment, options);
    
    if (result.editedSegment.id !== mockSegment.id) throw new Error('Should return original segment');
    if (result.fillerWordsDetected.length !== 0) throw new Error('Should have no filler words');
    if (result.timeSaved !== 0) throw new Error('Should have no time saved');
  });

  await test('processSegments handles multiple segments', async () => {
    const segments = [mockSegment, { ...mockSegment, id: 'test-segment-2' }];
    const results = await AutoEditProcessor.processSegments(segments);
    
    if (results.length !== 2) throw new Error('Should process all segments');
    results.forEach(result => {
      if (!result.hasOwnProperty('originalSegment')) throw new Error('Missing originalSegment');
      if (!result.hasOwnProperty('editedSegment')) throw new Error('Missing editedSegment');
    });
  });

  await test('getSummary provides accurate statistics', async () => {
    const segments = [mockSegment];
    const results = await AutoEditProcessor.processSegments(segments);
    const summary = AutoEditProcessor.getSummary(results);
    
    if (!summary.hasOwnProperty('totalSegments')) throw new Error('Missing totalSegments');
    if (!summary.hasOwnProperty('editedSegments')) throw new Error('Missing editedSegments');
    if (!summary.hasOwnProperty('totalFillerWords')) throw new Error('Missing totalFillerWords');
    if (!summary.hasOwnProperty('totalTimeSaved')) throw new Error('Missing totalTimeSaved');
    if (!summary.hasOwnProperty('averageConfidence')) throw new Error('Missing averageConfidence');

    if (summary.totalSegments !== 1) throw new Error('Incorrect total segments count');
    if (typeof summary.editedSegments !== 'number') throw new Error('editedSegments should be number');
    if (typeof summary.totalFillerWords !== 'number') throw new Error('totalFillerWords should be number');
    if (typeof summary.totalTimeSaved !== 'number') throw new Error('totalTimeSaved should be number');
    if (typeof summary.averageConfidence !== 'number') throw new Error('averageConfidence should be number');
  });

  console.log('\n📊 Test Results');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Auto-edit functionality is working correctly.');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Please review the implementation.`);
  }
}

runTests().catch(console.error);