# Copilot Guide for Pulse

**Stack & Targets**

- React Native + Expo + TypeScript; Hermes + New Architecture enabled.
- Native video concat: iOS uses AVFoundation via Swift module; Android uses platform media stack.
- Segmented recording with metadata (`inMs`, `outMs`) and frame-accurate exports.

**Key Directories**

- `app/` — screens/routes (editor, camera, upload)
- `components/` — reusable UI
- `utils/` — helpers (time, id, platform)
- `hooks/` — stateful logic (recording/drafts)
- `ios/` — native Swift module for export/concat
- `android/` — Android config/media integration

**Conventions**

- TypeScript: `strict`, no `any`. Prefer discriminated unions for state.
- Small, pure functions; exhaustive `switch` on variants.
- Error handling: bubble with rich context; never swallow.
- Logging: keep minimal; no PII.
- Commits: Conventional (`feat:`, `fix:`, etc).

**Video/Timing Requirements**

- Treat trim points as **ms**, convert to CMTime (iOS) / microseconds (Android) at boundaries.
- Always clamp `[inMs, outMs]` within track duration and prevent inversion.
- Keep cumulative export drift < 10ms across N segments (assert in tests).

**UI/UX**

- 60fps animations (Reanimated), accessible touch targets, haptics where appropriate.

**Security/Privacy**

- No secrets in repo.
- Validate inputs from deep links and uploads; enforce UUIDv4 for draft IDs.

**Definition of Done**

- Lint, typecheck, tests pass.
- Unit tests for reducers/utilities; at least one integration test per feature (see `test/video/`).
- Minimal docs in `README.md` section + changelog note.

**If unsure**

- Leave `// OPEN QUESTION:` comments near the code, and post a short plan as a PR comment before large diffs.

---

## Detailed Architecture

### **Project Structure**

```
pulse/
├── app/                    # Expo Router screens
│   ├── (camera)/          # Camera recording flows
│   │   ├── shorts.tsx     # Main recording screen
│   │   ├── post.tsx       # Post creation
│   │   └── drafts.tsx     # Draft management
│   ├── (tabs)/            # Tab navigation
│   │   ├── index.tsx      # Home feed
│   │   ├── profile.tsx    # User profile
│   │   └── subscriptions.tsx
│   ├── preview.tsx        # Video preview/editing
│   ├── upload.tsx         # Upload flow
│   └── onboarding.tsx     # First-time setup
├── components/            # Reusable UI components
│   ├── RecordButton.tsx   # Core recording component
│   ├── CameraControls.tsx # Camera UI controls
│   ├── UploadCloseButton.tsx # Upload flow controls
│   ├── RecordingProgressBar.tsx # Progress visualization
│   ├── TimeSelectorButton.tsx # Duration selection
│   └── ui/               # Base UI components
├── hooks/                 # Custom React hooks
│   ├── useDraftManager.ts    # Draft state management
│   ├── useFirstTimeOpen.ts   # Onboarding state
│   └── useColorScheme.ts     # Theme management
├── utils/                 # Utility functions
│   ├── draftStorage.ts       # AsyncStorage helpers
│   └── videoThumbnails.ts    # Thumbnail generation
├── constants/             # App configuration
│   └── Colors.ts
├── ios/                   # iOS native code
│   └── pulse/            # Swift implementation
├── android/               # Android native code
└── assets/               # Images and fonts
```

### **TypeScript Conventions**

#### **Strict Type Safety**

```typescript
// ✅ Good - Discriminated unions for state
type RecordingState =
  | { status: 'idle' }
  | { status: 'recording'; duration: number; remaining: number }
  | { status: 'processing'; progress: number; phase: 'concat' | 'export' }
  | { status: 'error'; message: string };

// ✅ Good - Interface for object shapes
interface RecordingSegment {
  id: string;
  uri: string;
  duration: number;
  inMs?: number;  // Optional start trim point
  outMs?: number; // Optional end trim point
  createdAt: Date;
}

// ❌ Avoid - any types
const segment: any = { ... };
```

#### **Error Handling Patterns**

```typescript
// ✅ Good - Rich error context
try {
  await VideoConcat.export(segments, {
    onProgress: (progress) => setProgress(progress),
  });
} catch (error) {
  console.error("Video export failed:", {
    segmentCount: segments.length,
    totalDuration: segments.reduce((sum, s) => sum + s.duration, 0),
    error: error.message,
    timestamp: new Date().toISOString(),
  });
  throw new Error(`Failed to export video: ${error.message}`);
}

// ✅ Good - Exhaustive switch statements
const handleRecordingState = (state: RecordingState) => {
  switch (state.status) {
    case "idle":
      return <IdleView />;
    case "recording":
      return (
        <RecordingView duration={state.duration} remaining={state.remaining} />
      );
    case "processing":
      return <ProcessingView progress={state.progress} phase={state.phase} />;
    case "error":
      return <ErrorView message={state.message} />;
    default:
      // TypeScript will ensure this is exhaustive
      const _exhaustive: never = state;
      return null;
  }
};
```

### **Video Processing Standards**

#### **Timing Precision**

```typescript
// ✅ Good - Frame-accurate timing validation
const validateTrimPoints = (
  segment: RecordingSegment,
  trackDuration: number
): { inMs: number; outMs: number } => {
  const { inMs = 0, outMs = trackDuration } = segment;

  // Clamp to valid range
  const validatedInMs = Math.max(0, Math.min(inMs, trackDuration));
  const validatedOutMs = Math.max(
    validatedInMs,
    Math.min(outMs, trackDuration)
  );

  if (validatedInMs >= validatedOutMs) {
    throw new Error(
      `Invalid trim points: inMs=${validatedInMs}, outMs=${validatedOutMs}, duration=${trackDuration}`
    );
  }

  return { inMs: validatedInMs, outMs: validatedOutMs };
};

// ✅ Good - Platform-specific time conversion
const convertToPlatformTime = (ms: number, platform: "ios" | "android") => {
  if (platform === "ios") {
    // Convert to CMTime with 30fps timescale
    const timescale = 30;
    return {
      value: Math.round((ms * timescale) / 1000),
      timescale,
    };
  } else {
    // Convert to microseconds for Android Media3
    return ms * 1000;
  }
};
```

#### **Native Module Integration**

```swift
// iOS - AVFoundation integration
public class VideoConcatModule: Module {
    func exportSegments(_ segments: [RecordingSegment]) async throws -> String {
        let composition = AVMutableComposition()

        for segment in segments {
            let asset = AVAsset(url: URL(fileURLWithPath: segment.uri))
            let videoTrack = asset.tracks(withMediaType: .video).first!

            // Frame-perfect timing with track timescale
            let trackTimescale = videoTrack.timeRange.start.timescale
            let startTime = CMTime(
                value: Int64(segment.inMs * Double(trackTimescale) / 1000),
                timescale: trackTimescale
            )
            let duration = CMTime(
                value: Int64((segment.outMs - segment.inMs) * Double(trackTimescale) / 1000),
                timescale: trackTimescale
            )

            // Add to composition with precise timing
            try composition.insertTimeRange(
                CMTimeRange(start: startTime, duration: duration),
                of: videoTrack,
                at: composition.duration
            )
        }

        // Export with highest quality
        let exportSession = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        )

        return try await exportSession.export()
    }
}
```

### **State Management Patterns**

#### **Draft Management Hook**

```typescript
// ✅ Good - Comprehensive state management
export function useDraftManager(
  draftId?: string,
  selectedDuration: number = 60,
  mode: DraftMode = "camera"
) {
  const [recordingSegments, setRecordingSegments] = useState<
    RecordingSegment[]
  >([]);
  const [redoStack, setRedoStack] = useState<RecordingSegment[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  // Auto-save with intelligent throttling
  useEffect(() => {
    const autoSave = async () => {
      if (recordingSegments.length === 0) return;

      try {
        if (currentDraftId) {
          await DraftStorage.updateDraft(
            currentDraftId,
            recordingSegments,
            selectedDuration
          );
        } else {
          const newDraftId = await DraftStorage.saveDraft(
            recordingSegments,
            selectedDuration,
            mode,
            draftId
          );
          setCurrentDraftId(newDraftId);
        }
      } catch (error) {
        console.error("Auto-save failed:", error);
      }
    };

    const timeoutId = setTimeout(autoSave, 1000);
    return () => clearTimeout(timeoutId);
  }, [recordingSegments, selectedDuration, currentDraftId]);

  // Undo/Redo with persistence
  const handleUndoSegment = async (duration: number) => {
    if (recordingSegments.length > 0) {
      const lastSegment = recordingSegments[recordingSegments.length - 1];
      const updatedSegments = recordingSegments.slice(0, -1);

      setRedoStack((prev) => [...prev, lastSegment]);
      setRecordingSegments(updatedSegments);

      if (currentDraftId) {
        if (updatedSegments.length === 0) {
          await DraftStorage.deleteDraft(currentDraftId);
          setCurrentDraftId(null);
        } else {
          await DraftStorage.updateDraft(
            currentDraftId,
            updatedSegments,
            duration
          );
        }
      }
    }
  };

  return {
    recordingSegments,
    redoStack,
    currentDraftId,
    setRecordingSegments,
    handleUndoSegment,
    // ... other actions
  };
}
```

### **UI/UX Standards**

#### **Performance Optimization**

```typescript
// ✅ Good - Memoized expensive calculations
const RecordingProgressBar = ({ segments, totalDuration }: Props) => {
  const progressData = useMemo(() => {
    return segments.map((segment, index) => ({
      id: segment.id,
      width: (segment.duration / totalDuration) * 100,
      color: index % 2 === 0 ? "#007AFF" : "#34C759",
    }));
  }, [segments, totalDuration]);

  return (
    <View style={styles.container}>
      {progressData.map((item) => (
        <Animated.View
          key={item.id}
          style={[
            styles.segment,
            { width: `${item.width}%`, backgroundColor: item.color },
          ]}
        />
      ))}
    </View>
  );
};

// ✅ Good - Smooth animations with Reanimated
const RecordButton = ({ onPress, isRecording }: Props) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.button, isRecording && styles.recording]}
      >
        <Text style={styles.buttonText}>{isRecording ? "Stop" : "Record"}</Text>
      </Pressable>
    </Animated.View>
  );
};
```

#### **Accessibility**

```typescript
// ✅ Good - Accessible components
const TimeSelectorButton = ({ label, value, isSelected, onPress }: Props) => {
  return (
    <Pressable
      onPress={() => onPress(value)}
      style={[styles.button, isSelected && styles.selected]}
      accessibilityRole="button"
      accessibilityLabel={`Select ${label} recording duration`}
      accessibilityHint={`Currently ${
        isSelected ? "selected" : "not selected"
      }`}
      accessibilityState={{ selected: isSelected }}
    >
      <Text style={[styles.text, isSelected && styles.selectedText]}>
        {label}
      </Text>
    </Pressable>
  );
};
```

### **Security & Privacy**

#### **Input Validation**

```typescript
// ✅ Good - Secure UUID validation
const validateDraftId = (id: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// ✅ Good - Deep link validation
const validateDeepLink = (url: string): { isValid: boolean; params?: any } => {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "pulsecam:") {
      return { isValid: false };
    }

    const params = new URLSearchParams(parsed.search);
    const draftId = params.get("draftId");

    if (draftId && !validateDraftId(draftId)) {
      return { isValid: false };
    }

    return { isValid: true, params: Object.fromEntries(params) };
  } catch {
    return { isValid: false };
  }
};
```

### **Testing Requirements**

#### **Unit Tests**

```typescript
// ✅ Good - Test pure functions
describe("validateTrimPoints", () => {
  it("should clamp trim points to valid range", () => {
    const segment: RecordingSegment = {
      id: "1",
      uri: "test.mp4",
      duration: 1000,
      inMs: -100,
      outMs: 1500,
    };

    const result = validateTrimPoints(segment, 1000);
    expect(result.inMs).toBe(0);
    expect(result.outMs).toBe(1000);
  });

  it("should throw error for invalid trim points", () => {
    const segment: RecordingSegment = {
      id: "1",
      uri: "test.mp4",
      duration: 1000,
      inMs: 800,
      outMs: 600,
    };

    expect(() => validateTrimPoints(segment, 1000)).toThrow(
      "Invalid trim points"
    );
  });
});
```

#### **Integration Tests**

```typescript
// ✅ Good - Test video processing flows
describe("Video Concatenation", () => {
  it("should concatenate multiple segments", async () => {
    const segments: RecordingSegment[] = [
      { id: "1", uri: "segment1.mp4", duration: 500 },
      { id: "2", uri: "segment2.mp4", duration: 300 },
    ];

    const result = await VideoConcat.export(segments);
    expect(result.uri).toBeDefined();
    expect(result.duration).toBe(800);
  });

  it("should handle trim points correctly", async () => {
    const segments: RecordingSegment[] = [
      {
        id: "1",
        uri: "segment1.mp4",
        duration: 1000,
        inMs: 100,
        outMs: 900,
      },
    ];

    const result = await VideoConcat.export(segments);
    expect(result.duration).toBe(800); // 900 - 100
  });
});
```

### **Common Patterns**

#### **Error Boundaries**

```typescript
// ✅ Good - Component error handling
const VideoPlayer = ({ uri }: { uri: string }) => {
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load video</Text>
        <Pressable onPress={() => setError(null)} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <VideoView
      uri={uri}
      onError={(error) => setError(error.message)}
      style={styles.video}
    />
  );
};
```

#### **Loading States**

```typescript
// ✅ Good - Comprehensive loading states
const ProcessingView = ({
  progress,
  phase,
}: {
  progress: number;
  phase: string;
}) => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.title}>Processing Video</Text>
      <Text style={styles.phase}>{phase}</Text>
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
    </View>
  );
};
```

### **Performance Metrics**

- **Video Processing**: Sub-millisecond precision trimming
- **Memory Usage**: Optimized with temporary file management
- **Export Quality**: AVAssetExportPresetHighestQuality
- **Frame Rate**: Consistent 30 FPS output
- **Aspect Ratio**: Smart 9:16 mobile optimization
- **Auto-Save**: 1-second intelligent throttling
- **Deep Links**: <100ms UUID validation

### **Resources**

- **Expo Video**: https://docs.expo.dev/versions/latest/sdk/video/
- **React Native Reanimated**: https://docs.swmansion.com/react-native-reanimated/
- **AVFoundation**: https://developer.apple.com/av-foundation/
- **Media3**: https://developer.android.com/guide/topics/media/media3
- **Expo Router**: https://expo.github.io/router/

---

**Remember**: This is a video-first app with high performance requirements. Prioritize smooth user experience and reliable video processing over feature complexity.

**Remember**: This is a video-first app with high performance requirements. Prioritize smooth user experience and reliable video processing over feature complexity.