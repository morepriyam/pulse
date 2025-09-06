<div align="center">

# Pulse

##### Secure institutional knowledge sharing through short-form video content.

[![React Native](https://img.shields.io/badge/React%20Native-0.79.4-blue.svg?style=for-the-badge&logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-53.0.12-white.svg?style=for-the-badge&logo=expo&logoColor=black)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![AVFoundation](https://img.shields.io/badge/AVFoundation-Hardware%20Accelerated-green.svg?style=for-the-badge&logo=apple)](https://developer.apple.com/av-foundation/)
[![Media3](https://img.shields.io/badge/Media3-Android%20Video-orange.svg?style=for-the-badge&logo=android)](https://developer.android.com/guide/topics/media/media3)
[![Native Modules](https://img.shields.io/badge/Native%20Modules-Swift%20%7C%20Kotlin-blue.svg?style=for-the-badge&logo=swift)](https://reactnative.dev/docs/native-modules-intro)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Stream-orange.svg?style=for-the-badge&logo=cloudflare)](https://www.cloudflare.com/products/stream/)

<img alt="Pulse Logo" height="280" src="./assets/images/pulse-logo.png" />
</div>

## ⇁ TOC

- [The Problems](#-The-Problems)
- [The Solutions](#-The-Solutions)
- [Features](#-Features)
- [Installation](#-Installation)
- [Getting Started](#-Getting-Started)

- [Configuration](#-Configuration)
- [Development](#-Development)
- [Contributing](#-Contributing)

## ⇁ The Problems

1. **Cross-Platform Camera Compatibility**: Building camera functionality that works consistently across iOS and Android presents significant challenges. Previous attempts with Meteor and Cordova revealed iOS compatibility issues with camera preview plugins, forcing platform-specific workarounds and limiting functionality.

2. **Complex Institutional Knowledge Sharing**: MIE requires a secure, internal platform for sharing institutional knowledge through short-form videos, similar to YouTube Shorts but tailored for sensitive institutional content and charter documentation.

3. **Fragmented Development Approaches**: Multiple technology stacks (Meteor, Tauri, React Native) were explored, each with trade-offs. Meteor faced cross-platform camera limitations, while Tauri required complex native integrations for optimal camera performance.

4. **Segmented Recording Complexity**: Implementing hold-to-record functionality with seamless segment management, real-time progress tracking, and automatic time limit enforcement proved technically challenging across different platforms and frameworks.

5. **Permission Management**: Camera, microphone, and media library permissions needed granular handling with smooth onboarding experiences, especially critical for iOS where permission denial could break core functionality.

6. **Video Processing Performance**: Traditional approaches using FFmpeg or web-based video processing proved too slow and resource-intensive for mobile devices, requiring native module development for optimal performance.

## ⇁ The Solutions

1. **React Native Excellence**: After extensive evaluation of Meteor, Tauri, and React Native approaches, React Native with Expo proved optimal for cross-platform camera functionality, providing native performance with consistent APIs across iOS and Android.

2. **Segmented Recording Architecture**: Built a sophisticated state management system that tracks recording segments in arrays, calculates remaining time dynamically, and provides real-time visual feedback through progress bars and time selectors.

3. **Dual Recording Modes**: Implemented both tap-to-record and hold-to-record modes with smooth animations, preventing duplicate recordings and ensuring consistent user experience across different interaction patterns.

4. **Smart Progress Management**: Created intelligent time tracking that passes remaining duration to recording methods, automatically stops when limits are reached, and provides visual segment indicators for intuitive content creation.

5. **Comprehensive Permission Flow**: Developed robust permission management with clear onboarding screens, graceful error handling, and user-friendly guidance for camera, microphone, and storage access across platforms.

6. **Native Video Processing**: Built custom Swift modules for iOS video concatenation using AVFoundation, providing frame-perfect timing, quality preservation, and real-time progress tracking without the overhead of external libraries like FFmpeg.

## ⇁ Features

### 🎥 **Core Recording Engine**

- **Segmented Recording** - Record multiple clips that combine seamlessly
- **Time Selection** - Choose from 15s, 30s, 1m, or 3m recording durations
- **Progress Visualization** - Real-time progress bar with segment indicators
- **Dual Recording Modes** - Both tap and hold recording with smooth transitions
- **Auto-Stop** - Automatic recording termination when time limit is reached

### 🚀 **Hardware-Accelerated Video Processing**

- **Native Video Concatenation** - High-performance video merging with custom Swift modules
- **AVFoundation Integration** - Direct iOS hardware acceleration for video processing
- **Frame-Perfect Timing** - Sub-millisecond precision using track timescale accuracy
- **Quality Preservation** - Highest quality export with aspect ratio handling
- **Memory Efficient** - Optimized processing without external library overhead

### ✂️ **Advanced Metadata & Trimming**

- **Precise Trimming** - Frame-accurate video trimming with metadata support (inMs/outMs)
- **Track Timescale Conversion** - Native precision for frame-perfect cuts
- **Validation System** - Automatic trim point validation against actual track duration
- **Metadata Persistence** - Trim points preserved across app sessions

### 🔗 **Deep Linking & Navigation**

- **Custom URL Scheme** - `pulsecam://` for direct app access
- **Universal Links** - iOS universal links support for seamless sharing
- **UUID Validation** - Secure draft ID validation for deep link access
- **Route Protection** - Automatic redirects based on app state and permissions

### 📱 **Cross-Platform Excellence**

- **React Native New Architecture** - TurboModules and Fabric renderer enabled
- **Hermes Engine** - Optimized JavaScript execution
- **Edge-to-Edge UI** - Modern Android edge-to-edge display
- **Portrait Lock** - Consistent mobile-first orientation

### 🔄 **Real-Time Systems**

- **Live Progress Tracking** - Real-time progress updates during video processing
- **Auto-Save System** - Intelligent draft persistence with 1-second intervals
- **Undo/Redo Stack** - Persistent undo/redo functionality with AsyncStorage
- **State Management** - Sophisticated draft lifecycle management

### 🎨 **Modern UI/UX**

- **Gesture Handling** - React Native Gesture Handler for smooth interactions
- **Haptic Feedback** - Tactile feedback for recording actions
- **Smooth Animations** - React Native Reanimated for 60fps animations
- **Theme System** - Dynamic light/dark theme support

## ⇁ Installation

### Prerequisites

- Node.js 18+
- Expo CLI
- iOS Simulator (for iOS development) or Android Studio (for Android development)

### Clone and Install

```bash
git clone https://github.com/yourusername/pulse.git
cd pulse
npm install
```

### Development Setup

```bash
# Start the development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on web
npm run web
```

## ⇁ Getting Started

### Permissions

The app requires the following permissions:

- **Camera Access**: To record videos
- **Microphone Access**: To record audio
- **Storage Access**: To save recorded videos

## ⇁ Configuration

### Recording Settings

```typescript
const defaultSettings = {
  maxIndividualDuration: 60, // Maximum duration for a single recording segment
  holdDelay: 500, // Delay before hold recording starts (ms)
  progressUpdateInterval: 100, // Progress update frequency (ms)
};
```

### Time Options

```typescript
const timeOptions = [
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "3m", value: 180 },
];
```

### Video Concatenation Module

The app includes a custom native module for high-performance video concatenation:

#### iOS Implementation (Swift)

- **AVFoundation Integration**: Uses native iOS video processing APIs
- **Frame-Perfect Timing**: Precise video trimming with track timescale accuracy
- **Quality Preservation**: Highest quality export with aspect ratio handling
- **Real-time Progress**: Live progress updates during processing
- **Metadata Support**: Handles inMs/outMs trimming parameters

#### TypeScript Interface

```typescript
interface RecordingSegment {
  id: string;
  duration: number;
  uri: string;
  inMs?: number; // Optional start trim point
  outMs?: number; // Optional end trim point
}

// Usage
const outputUri = await VideoConcatModule.export(segments);
```

#### Key Features

- **Sub-millisecond precision** for video trimming
- **Aspect ratio preservation** with smart scaling
- **Progress tracking** with phase indicators
- **Error handling** with comprehensive logging
- **Memory efficient** processing

## ⇁ Technical Architecture

### 🏗️ **Native Module Architecture**

#### iOS Video Processing (Swift + AVFoundation)

```swift
// Hardware-accelerated video concatenation
public class VideoConcatModule: Module {
    // Frame-perfect timing with track timescale
    let trackTimescale = sourceVideoTrack.timeRange.start.timescale
    let startTime = CMTime(value: Int64(validatedStartMs * Double(trackTimescale) / 1000),
                          timescale: trackTimescale)

    // Quality preservation with custom composition
    let videoComposition = AVMutableVideoComposition()
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30) // 30 FPS

    // Hardware-accelerated export
    let exportSession = AVAssetExportSession(
        asset: composition,
        presetName: AVAssetExportPresetHighestQuality
    )
}
```

### 🔗 **Deep Linking System**

#### URL Scheme Configuration

```json
{
  "expo": {
    "scheme": "pulsecam",
    "ios": {
      "bundleIdentifier": "com.mieweb.pulse"
    },
    "android": {
      "package": "com.mieweb.pulse"
    }
  }
}
```

#### Deep Link Handling

```typescript
// Secure UUID validation for draft access
const isUUIDv4 = uuidValidate(uuid) && uuidVersion(uuid) === 4;

// Route protection and validation
if (params.mode === "upload" && params.draftId && isUUIDv4(params.draftId)) {
  return <Redirect href={`/upload?draftId=${params.draftId}`} />;
}
```

### 💾 **Advanced State Management**

#### Draft Storage System

```typescript
export class DraftStorage {
  // Auto-save with intelligent throttling
  static async saveDraft(
    segments: RecordingSegment[],
    totalDuration: number
  ): Promise<string> {
    // Automatic thumbnail generation
    const thumbnailUri = await generateVideoThumbnail(segments[0].uri);

    // Metadata persistence
    const draft: Draft = {
      id: customId || Date.now().toString(),
      mode: "camera" | "upload",
      segments,
      totalDuration,
      createdAt: new Date(),
      lastModified: new Date(),
      thumbnail: thumbnailUri,
    };
  }
}
```

#### Undo/Redo System

```typescript
// Persistent undo/redo stack with AsyncStorage
const REDO_STACK_KEY = "redo_stack";

// Auto-save with 1-second intervals
useEffect(() => {
  const autoSave = async () => {
    if (recordingSegments.length > 0) {
      await DraftStorage.updateDraft(
        currentDraftId,
        recordingSegments,
        selectedDuration
      );
    }
  };
  const timeoutId = setTimeout(autoSave, 1000);
  return () => clearTimeout(timeoutId);
}, [recordingSegments]);
```

### ⚡ **Performance Optimizations**

#### React Native New Architecture

```json
{
  "expo": {
    "newArchEnabled": true,
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

#### Android Optimizations

```properties
# Gradle performance tuning
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
hermesEnabled=true
newArchEnabled=true

# Multi-architecture support
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64
```

#### Memory Management

```swift
// Efficient video processing without memory leaks
let outputURL = FileManager.default.temporaryDirectory
    .appendingPathComponent(UUID().uuidString)
    .appendingPathExtension("mp4")

// Quality optimization without network overhead
exportSession.shouldOptimizeForNetworkUse = false
exportSession.outputFileType = .mp4
```

### 🎯 **Key Performance Metrics**

- **Video Processing**: Sub-millisecond precision trimming
- **Memory Usage**: Optimized with temporary file management
- **Export Quality**: AVAssetExportPresetHighestQuality
- **Frame Rate**: Consistent 30 FPS output
- **Aspect Ratio**: Smart 9:16 mobile optimization
- **Auto-Save**: 1-second intelligent throttling
- **Deep Links**: <100ms UUID validation

## ⇁ Development

### CodeQL Configuration

This project includes automated CodeQL security analysis for Swift/iOS code. The CodeQL workflow is configured to build the React Native iOS project with the following settings:

- **Workspace**: `ios/pulse.xcworkspace`
- **Scheme**: `pulse`
- **SDK**: iPhone Simulator SDK
- **Configuration**: Debug build with code signing disabled

#### Updating Xcode Configuration

If you need to update the workspace name or scheme used by CodeQL:

1. **Workspace Changes**: If you rename the Xcode workspace file, update the `-workspace` parameter in `.github/workflows/codeql.yml`:
   ```bash
   -workspace YourNewWorkspace.xcworkspace \
   ```

2. **Scheme Changes**: If you rename the app scheme, update the `-scheme` parameter in `.github/workflows/codeql.yml`:
   ```bash
   -scheme YourNewScheme \
   ```

3. **Target Changes**: If you add new Swift files or targets, ensure they are included in the main app scheme for CodeQL analysis.

The CodeQL analysis requires:
- CocoaPods dependencies installed (`pod install`)
- Code signing disabled (`CODE_SIGNING_ALLOWED=NO`)
- Metro bundler skipped (`RCT_NO_LAUNCH_PACKAGER=1`, `SKIP_BUNDLING=1`)
- iPhone simulator build target

### Project Structure

```
pulse/
├── app/                    # App router screens
│   ├── (camera)/          # Camera functionality
│   ├── (tabs)/            # Main navigation
│   ├── preview.tsx        # Video preview and concatenation
│   └── onboarding.tsx     # First-time setup
├── components/            # Reusable UI components
│   ├── RecordButton.tsx   # Recording functionality
│   ├── RecordingProgressBar.tsx
│   ├── TimeSelectorButton.tsx
│   └── ui/                # Base UI components
├── modules/               # Native modules
│   └── video-concat/      # Video concatenation module
│       ├── ios/           # Swift implementation
│       └── src/           # TypeScript interface
├── assets/                # Images and fonts
├── hooks/                 # Custom React hooks
├── constants/             # App configuration
├── android/               # Android build
├── ios/                   # iOS build
└── package.json           # Dependencies
```

### Running Tests

```bash
# Run linting
npm run lint

# Type checking
npx tsc --noEmit
```

### Building for Production

```bash
# Create production build locally
expo build:android
expo build:ios

# Or use EAS CLI for cloud builds
eas build --platform ios --profile production
eas build --platform android --profile production
```

### TestFlight Deployment

The app includes an automated GitHub Actions workflow for deploying iOS builds to TestFlight. The workflow can be triggered in several ways:

#### Manual Deployment

1. Go to the [Actions tab](../../actions) in the GitHub repository
2. Select "Deploy to TestFlight" workflow
3. Click "Run workflow"
4. Choose the environment (production/staging)
5. Optionally skip the build step if you have a recent build

#### Version Tag Deployment

Create and push a version tag to automatically trigger a TestFlight deployment:

```bash
# Create a new version tag
git tag v1.0.0
git push origin v1.0.0
```

#### Release-based Deployment

Create a new release on GitHub to trigger a TestFlight deployment:

1. Go to the [Releases page](../../releases)
2. Click "Create a new release"
3. Choose or create a tag (e.g., v1.0.0)
4. Fill in release notes and publish

#### Required Secrets

Before using the TestFlight deployment workflow, ensure the following secrets are configured in your GitHub repository settings:

- `EXPO_TOKEN`: Your Expo access token for authentication
- `APPLE_ID`: Your Apple ID email address
- `APPLE_ID_PASSWORD`: App-specific password for your Apple ID
- `APPLE_TEAM_ID`: Your Apple Developer Team ID
- `ASC_APP_ID`: Your App Store Connect application ID

#### EAS Configuration

The project includes an `eas.json` configuration file that defines build profiles for development, preview, and production environments. The production profile is used for TestFlight deployments.

## ⇁ Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and ensure they follow our coding standards
4. **Test thoroughly** on both iOS and Android
5. **Commit your changes**: `git commit -m 'feat: add amazing feature'`
6. **Push to your branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Use TypeScript for all new code
- Follow the existing component structure and naming conventions
- Ensure your code works on both iOS and Android
- Add appropriate error handling and loading states
- Test recording functionality thoroughly before submitting

### Code Style

- Use meaningful component and function names
- Keep components focused and single-purpose
- Add proper TypeScript interfaces for all props
- Follow React Native and Expo best practices

## ⇁ Acknowledgments

Special thanks to [**Medical Informatics Engineering, Inc.**](https://github.com/mieweb) and [**Doug Horner**](https://github.com/horner) for supporting this project. Doug's passion for short-form content and knowledge sharing directly inspired the development of secure institutional video capabilities that make complex information accessible and engaging.

---

<div align="center">
Made with ❤️ for content creators everywhere
</div>
