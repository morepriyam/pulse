# GitHub Copilot Instructions for Pulse

> **Note**: See [README.md](README.md) for comprehensive project overview, features, and setup instructions.

## Tech Stack & Architecture

- **React Native + Expo + TypeScript** with Hermes engine and New Architecture
- **Native video processing**: iOS uses AVFoundation Swift modules, Android uses Media3 stack
- **Segmented recording** with frame-accurate metadata (`inMs`, `outMs`) for precise trimming

## Development Conventions

### TypeScript Patterns
- Use `strict` mode, avoid `any` types
- Prefer discriminated unions for complex state:
  ```typescript
  type RecordingState = 
    | { status: 'idle' }
    | { status: 'recording'; duration: number; remaining: number }
    | { status: 'processing'; progress: number; phase: string }
    | { status: 'error'; message: string };
  ```
- Exhaustive switch statements with `never` type guards
- Rich interface definitions for all props and data structures

### Error Handling
- Always bubble errors with rich context, never swallow exceptions
- Log errors with relevant metadata (segment count, duration, timestamp)
- Use try/catch with meaningful error messages for user-facing failures

### Code Organization
- Small, pure functions with single responsibilities
- Conventional commit messages (`feat:`, `fix:`, `refactor:`, etc.)
- Keep logging minimal and avoid PII in logs

## Video Processing Standards

### Timing & Precision
- **Input format**: Trim points in milliseconds (`inMs`, `outMs`)
- **Platform conversion**: Convert to CMTime (iOS) or microseconds (Android) at native boundaries
- **Validation**: Always clamp `[inMs, outMs]` within track duration, prevent inversion
- **Accuracy**: Maintain <10ms cumulative drift across multiple segments

### Segment Structure
```typescript
interface RecordingSegment {
  id: string;
  uri: string;
  duration: number;
  inMs?: number;  // Optional start trim point in milliseconds
  outMs?: number; // Optional end trim point in milliseconds
  createdAt: Date;
}
```

### Native Module Integration
For iOS video processing using AVFoundation:
```swift
// Frame-perfect timing with track timescale
let trackTimescale = sourceVideoTrack.timeRange.start.timescale
let startTime = CMTime(
  value: Int64(validatedStartMs * Double(trackTimescale) / 1000),
  timescale: trackTimescale
)
```

## UI/UX Patterns

### Performance Requirements
- **Target**: 60fps animations using React Native Reanimated
- **Memory**: Memoize expensive calculations, optimize re-renders
- **Accessibility**: Use proper `accessibilityRole`, `accessibilityLabel`, and `accessibilityHint`

### Animation Examples
```typescript
// Smooth button interactions
const RecordButton = ({ onPress, isRecording }: Props) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.95, { damping: 15 });
    runOnJS(onPress)();
    scale.value = withSpring(1);
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable onPress={handlePress} />
    </Animated.View>
  );
};
```

### State Management
Use `useDraftManager` hook for recording state with auto-save:
```typescript
const {
  recordingSegments,
  currentDraftId,
  handleUndoSegment,
  addRecordingSegment
} = useDraftManager(draftId, selectedDuration, mode);
```

## Security & Input Validation

### Deep Link Security
```typescript
// UUID validation for draft IDs
const isValidUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// Secure deep link handling
const validateDeepLink = (url: string) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "pulsecam:") return { isValid: false };
  
  const draftId = parsed.searchParams.get("draftId");
  if (draftId && !isValidUUID(draftId)) return { isValid: false };
  
  return { isValid: true, params: Object.fromEntries(parsed.searchParams) };
};
```

## Testing Guidelines

### Unit Tests
- Test pure functions (utilities, reducers, validation)
- Focus on edge cases for trim point validation
- Mock native modules for video processing tests

### Integration Tests  
- Test complete recording flows with mock video files
- Verify draft persistence and restoration
- Test video concatenation with multiple segments

### Example Test Structure
```typescript
describe("validateTrimPoints", () => {
  it("should clamp invalid trim points", () => {
    const segment = { inMs: -100, outMs: 1500, duration: 1000 };
    const result = validateTrimPoints(segment, 1000);
    expect(result).toEqual({ inMs: 0, outMs: 1000 });
  });
});
```

## Performance Targets

- **Video Export**: Sub-millisecond precision trimming
- **Animations**: Consistent 60fps with React Native Reanimated  
- **Output**: 30fps, 9:16 aspect ratio optimization
- **Auto-save**: 1-second throttled draft persistence
- **Memory**: Efficient temporary file management, no leaks

## Common Patterns

**Error Boundaries**: Always provide retry mechanisms for video operations
**Loading States**: Show progress during video processing with phase indicators
**Form Validation**: Validate all user inputs, especially file uploads and deep link parameters
**Accessibility**: Include proper labels and hints for screen readers

---

**Priority**: Focus on smooth video recording/playback experience and reliable state management over feature complexity.