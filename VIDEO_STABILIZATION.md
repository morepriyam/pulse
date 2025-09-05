# Video Stabilization Implementation

This document describes the implementation of cross-platform video stabilization controls for the Pulse camera app.

## Overview

The implementation adds video stabilization controls to the camera interface, supporting:

- **iOS**: Full range of AVFoundation stabilization modes (`off`, `standard`, `cinematic`, `cinematicExtended`, `auto`)
- **Android**: Simple `on`/`off` control mapped to Camera2 video stabilization
- **Cross-platform**: Unified API with graceful fallbacks

## Files Added/Modified

### New Files

1. **`constants/camera.ts`**
   - `VideoStabilization` enum with all supported modes
   - `getSupportedVideoStabilizationModes()` function for platform detection
   - `mapToNativeVideoStabilization()` helper for expo-camera compatibility

2. **`components/VideoStabilizationControl.tsx`**
   - UI component for video stabilization controls
   - Supports both compact (icon) and expanded (label) modes
   - Platform-aware mode selection with alerts
   - Long-press for mode picker dialog

3. **`utils/testVideoStabilization.ts`**
   - Testing utilities for validation
   - Manual test functions for development

### Modified Files

1. **`components/CameraControls.tsx`**
   - Added video stabilization control to camera controls panel
   - New props: `videoStabilizationMode`, `onVideoStabilizationChange`

2. **`app/(camera)/shorts.tsx`**
   - Added video stabilization state management
   - Integrated with CameraView component
   - Added handler for stabilization mode changes

## API Usage

### Basic Usage

```tsx
import { VideoStabilization } from '@/constants/camera';

// State management
const [videoStabilizationMode, setVideoStabilizationMode] = useState(VideoStabilization.off);

// In CameraView
<CameraView
  videoStabilizationMode={mapToNativeVideoStabilization(videoStabilizationMode)}
  // ... other props
/>

// In controls
<CameraControls
  videoStabilizationMode={videoStabilizationMode}
  onVideoStabilizationChange={setVideoStabilizationMode}
  // ... other props
/>
```

### Platform-Specific Behavior

#### iOS
- Supports all modes: `off`, `on`, `standard`, `cinematic`, `cinematicExtended`, `auto`
- Maps directly to AVFoundation's `preferredVideoStabilizationMode`
- `on` convenience mode maps to `standard`

#### Android
- Supports only: `off`, `on`
- All iOS-specific modes (`standard`, `cinematic`, etc.) map to `on`
- Maps to Camera2's `CONTROL_VIDEO_STABILIZATION_MODE`

## Integration Details

### Component Integration

The video stabilization control is integrated into the existing camera controls panel:

```tsx
<CameraControls>
  <FlipCameraButton />
  <FlashToggleButton />
  <VideoStabilizationControl />  {/* New */}
</CameraControls>
```

### State Management

Video stabilization state is managed alongside other camera states in the main camera component:

```tsx
// Camera control states
const [cameraFacing, setCameraFacing] = useState<CameraType>("back");
const [torchEnabled, setTorchEnabled] = useState(false);
const [videoStabilizationMode, setVideoStabilizationMode] = useState<VideoStabilization>(VideoStabilization.off);
```

### Native Integration

The implementation leverages expo-camera's existing `videoStabilizationMode` prop:

```tsx
<CameraView
  videoStabilizationMode={mapToNativeVideoStabilization(videoStabilizationMode)}
/>
```

## User Interface

### Control Behavior

1. **Tap**: Cycles through supported modes for the current platform
2. **Long Press**: Shows mode picker dialog with all available options
3. **Visual Feedback**: Active state highlighting when stabilization is enabled

### Platform Messages

- Android users see warnings when selecting iOS-only modes
- Unsupported platforms hide the control entirely
- Clear labeling of current mode in dialogs

## Testing

### Manual Validation

Use the test utilities in `utils/testVideoStabilization.ts`:

```tsx
import { testVideoStabilizationImplementation } from '@/utils/testVideoStabilization';

// Run during development
testVideoStabilizationImplementation();
```

### Platform Testing

1. **iOS Device**: Test all stabilization modes, verify mode switching
2. **Android Device**: Test on/off functionality, verify iOS modes map to "on"
3. **Both Platforms**: Verify UI responsiveness and state persistence

## Implementation Notes

### Backward Compatibility

- Default behavior unchanged (stabilization off by default)
- Graceful degradation on unsupported platforms
- No breaking changes to existing camera functionality

### Performance Considerations

- Stabilization impacts memory usage and processing latency
- Users should be made aware of trade-offs
- Some combinations with high frame rates may not be supported

### Future Enhancements

1. **Capability Discovery**: Query actual device capabilities instead of platform assumptions
2. **OIS Integration**: Consider interaction with optical image stabilization
3. **Format Validation**: Validate stabilization modes against selected video formats
4. **Analytics**: Track usage patterns of different stabilization modes

## Error Handling

### Unsupported Modes

- iOS: Falls back to `off` with console warning if mode unsupported by current format
- Android: Maps unsupported modes to `on` with console warning
- Web: Control hidden, no stabilization available

### Device Limitations

- Older devices may not support all modes
- High resolution/frame rate combinations may disable stabilization
- Users receive appropriate feedback through alerts and console logs