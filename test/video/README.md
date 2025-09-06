# Video Concatenation Tests

This directory contains comprehensive unit tests for the video concatenation functionality in the Pulse app.

## Overview

The video concatenation feature allows the app to combine multiple video segments recorded by users into a single continuous video file. This is a core feature for creating seamless video content.

## Test Structure

### Files

- `VideoConcat.test.ts` - Main test suite for video concatenation functionality
- `mockVideoData.ts` - Mock data and video file paths for testing
- `README.md` - This documentation

### Test Coverage

The test suite covers:

1. **Basic Functionality**
   - Empty segment arrays (should return error)
   - Single segment (should return as-is without concatenation)
   - Multiple segments (should concatenate properly)

2. **Platform Support**
   - iOS native implementation testing
   - Unsupported platform handling (Android)

3. **Configuration Options**
   - Custom output paths
   - Quality settings (low, medium, high)
   - Default configuration handling

4. **Error Handling**
   - Native module errors
   - Unknown error types
   - Platform compatibility errors

5. **Integration Testing**
   - Recording segment interface compatibility
   - Segment order preservation
   - Trimming parameter support (inMs, outMs)

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run with coverage
```bash
npm test -- --coverage
```

## Test Data

The tests use mock video file paths and recording segments that mirror the actual app's data structure:

```typescript
interface RecordingSegment {
  id: string;
  duration: number;
  uri: string;
  inMs?: number; // Optional start trim point
  outMs?: number; // Optional end trim point
}
```

## Implementation Details

### Mocking Strategy

The tests mock React Native's `NativeModules` to simulate the iOS video concatenation native module without requiring actual video files or device-specific functionality.

### Platform Testing

- **iOS**: Tests the complete concatenation flow through the native module
- **Android**: Tests the "not implemented" error path (Android support is planned)

### Error Scenarios

The tests verify proper error handling for:
- Network/file access issues
- Memory constraints
- Invalid video formats
- Platform incompatibilities

## Maintenance

When adding new video concatenation features:

1. Add corresponding test cases to `VideoConcat.test.ts`
2. Update mock data in `mockVideoData.ts` if needed
3. Ensure error handling paths are tested
4. Update this README if test structure changes

## Integration with CI/CD

These tests are designed to run in CI/CD environments and don't require:
- Actual video files
- Device emulators
- Native module compilation

The tests focus on the TypeScript/JavaScript logic and interface contracts.