# Whisper.cpp Integration Guide

This document describes how the Whisper.cpp integration works in the Pulse app using `whisper.rn`.

## Overview

The app now uses real Whisper.cpp models for speech-to-text transcription instead of mock data. The integration includes:

- Automatic model downloading (ggml-tiny.en.bin)
- Real-time transcription with timestamps
- Fallback to demo mode during development
- Cross-platform support (iOS/Android)

## Implementation Details

### Model Management

The app automatically downloads the `ggml-tiny.en.bin` model (~40MB) from Hugging Face:
- **URL**: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin`
- **Storage**: Device's document directory
- **Size**: ~40MB (tiny model, English only)

### Transcription Flow

1. **Initialization**: Download model if not present
2. **Context Creation**: Initialize Whisper context with the model
3. **Transcription**: Process audio/video file
4. **Conversion**: Convert results to app's transcript format
5. **Storage**: Save transcript with timestamps and metadata

### Platform Configuration

#### iOS Setup

1. **Pods Installation**: Run `npx pod-install` after npm install
2. **Permissions**: Add microphone permission to `Info.plist` if using realtime transcription:
   ```xml
   <key>NSMicrophoneUsageDescription</key>
   <string>This app requires microphone access for voice transcription</string>
   ```
3. **Extended Virtual Addressing**: For larger models, enable in Xcode project capabilities

#### Android Setup

1. **ProGuard**: Add rule to `android/app/proguard-rules.pro`:
   ```proguard
   # whisper.rn
   -keep class com.rnwhisper.** { *; }
   ```
2. **Permissions**: Add to `AndroidManifest.xml` for realtime transcription:
   ```xml
   <uses-permission android:name="android.permission.RECORD_AUDIO" />
   ```

## Usage

### Basic Transcription

```typescript
import { useTranscription } from '../hooks/useTranscription';

const { transcript, isTranscribing, transcribeVideo } = useTranscription(draftId);

// Start transcription
await transcribeVideo(videoUri, 'en');
```

### Supported Languages

The implementation supports all Whisper languages including:
- English (en) - default
- Spanish (es), French (fr), German (de)
- Chinese (zh), Japanese (ja), Korean (ko)
- And many more...

### Error Handling

The implementation includes graceful error handling:

1. **Model Download Failures**: Network connectivity issues
2. **Transcription Errors**: Unsupported formats, processing failures
3. **Fallback Mode**: Demo transcripts in development environment

## Performance Notes

### Model Size vs Quality Trade-offs

- **tiny.en** (~40MB): Fast, English-only, good quality for most use cases
- **base** (~150MB): Better accuracy, multilingual
- **small** (~500MB): Higher accuracy, slower processing
- **medium/large**: Require Extended Virtual Addressing on iOS

### Optimization Settings

The implementation uses optimized settings:
- **Temperature**: 0.0 (deterministic results)
- **Beam Size**: 5 (quality vs speed balance)
- **Thread Count**: Platform-optimized (iOS: 4, Android: 2)

## Development vs Production

### Development Mode
- Always reports as "supported"
- Falls back to demo transcripts on errors
- Includes [DEMO] prefix in results
- Detailed console logging

### Production Mode
- Strict support checking
- Real error propagation
- No fallback transcripts
- Minimal logging

## Troubleshooting

### Common Issues

1. **Model Download Fails**
   - Check internet connectivity
   - Verify storage permissions
   - Try clearing app data and retry

2. **Transcription Returns Empty Results**
   - Ensure audio/video file is valid
   - Check if file format is supported
   - Verify file isn't corrupted

3. **iOS Build Issues**
   - Run `npx pod-install`
   - Clean build folder in Xcode
   - Ensure correct iOS deployment target

4. **Android Build Issues**
   - Check NDK version in gradle
   - Verify ProGuard rules are applied
   - Clear gradle cache

### Performance Issues

1. **Slow Transcription**
   - Consider using smaller model (tiny vs base)
   - Reduce thread count on lower-end devices
   - Optimize audio file length

2. **Memory Issues**
   - Release Whisper context when not needed
   - Use smaller models
   - Process shorter audio segments

## Future Enhancements

Potential improvements for the integration:

1. **Model Selection**: Allow users to choose model size
2. **Audio Extraction**: Direct video-to-audio conversion
3. **Streaming Transcription**: Real-time transcription during recording
4. **Custom Models**: Support for fine-tuned models
5. **Background Processing**: Transcribe while app is backgrounded

## Dependencies

- `whisper.rn@^0.4.3`: React Native Whisper.cpp bindings
- `expo-file-system`: File operations for model storage
- `@react-native-async-storage/async-storage`: Transcript storage

## References

- [whisper.rn GitHub](https://github.com/mybigday/whisper.rn)
- [Whisper.cpp Models](https://huggingface.co/ggerganov/whisper.cpp)
- [OpenAI Whisper](https://github.com/openai/whisper)