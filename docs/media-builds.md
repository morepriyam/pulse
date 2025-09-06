# Media Builds Documentation

This document explains how to build and test FFmpeg libraries for multiple platforms using the integrated submodule build system.

## Overview

The project includes a git submodule at `third_party/ffmpeg-build/` that provides cross-platform FFmpeg builds for:

- **macOS** (x86_64)
- **iOS** (arm64 device + x86_64 simulator, universal libraries)
- **Android** (arm64-v8a, armeabi-v7a, x86_64)

Each platform supports both:
1. **Native API** - Direct use of libav* libraries
2. **Embedded CLI** - FFmpeg command-line interface compiled as a library function

## Quick Start

### Prerequisites

**macOS/iOS:**
- Xcode (latest stable version)
- Command Line Tools: `xcode-select --install`

**Android:**
- Android SDK with NDK (version 25.x recommended)
- Set environment variables:
  ```bash
  export ANDROID_HOME=/path/to/android/sdk
  export ANDROID_NDK_ROOT=/path/to/android/ndk
  ```

**All Platforms:**
- Git with submodule support
- Build tools (make, clang)

### Initialize Submodules

```bash
# Clone with submodules
git clone --recursive https://github.com/mieweb/pulse.git

# Or if already cloned, initialize submodules
git submodule update --init --recursive
```

### Run Platform Tests

```bash
# Test all platforms (requires all prerequisites)
./scripts/test_macos.sh
./scripts/test_ios.sh
./scripts/test_android.sh

# Or run via CI workflow locally
gh workflow run ffmpeg-matrix.yml
```

## Detailed Build Process

### FFmpeg Configuration

The FFmpeg builds use a minimal configuration optimized for video generation:

**Enabled Features:**
- Container formats: MP4 (muxer/demuxer)
- Video codecs: H.264 (encode/decode), MPEG4 (encode/decode)
- Audio codecs: AAC (encode/decode)
- Protocols: file
- Utilities: libswscale, libswresample, libavutil

**Platform-specific Encoders:**
- **macOS/iOS**: `h264_videotoolbox` (hardware-accelerated)
- **Android**: `mpeg4` (software) or `h264_mediacodec` (hardware)

### Build Scripts

#### `build-macos.sh`
Builds static libraries for macOS x86_64:
- Output: `third_party/ffmpeg-build/out/macos/lib/libav*.a`
- Headers: `third_party/ffmpeg-build/out/include/`

#### `build-ios.sh`
Builds universal static libraries for iOS:
- Device (arm64) and Simulator (x86_64)
- Output: `third_party/ffmpeg-build/out/ios/universal/lib/libav*.a`
- Creates fat libraries with `lipo`

#### `build-android.sh`
Builds shared libraries for Android ABIs:
- arm64-v8a, armeabi-v7a, x86_64
- Output: `third_party/ffmpeg-build/out/android/{abi}/lib/libav*.so`

#### `build-ffmpeg-cli-lib.sh`
Compiles FFmpeg CLI tools into static library:
- Exposes `ffmpeg_main(int argc, char **argv)` function
- Platform-specific: `libffmpeg_cli.a`

## Test Applications

### Native API Test (`helloworld_av.c`)

Generates a 2-second MP4 using FFmpeg libraries directly:

```c
int helloworld_av_write(const char* output_filename);
```

- **Video**: 320x240, 30fps, animated test pattern
- **Audio**: 48kHz mono, 440Hz sine wave
- **Duration**: 2 seconds

### Embedded CLI Test (`ffmpeg_execute.c`)

Wraps FFmpeg CLI as a library function:

```c
int ffmpeg_execute(const char* command_line);
```

Uses lavfi test sources:
```bash
# macOS/iOS
-f lavfi -i testsrc=size=320x240:rate=30 \
-f lavfi -i anullsrc=channel_layout=mono:sample_rate=48000 \
-t 2 -shortest -c:v h264_videotoolbox -c:a aac

# Android  
-f lavfi -i testsrc=size=320x240:rate=30 \
-f lavfi -i anullsrc=channel_layout=mono:sample_rate=48000 \
-t 2 -shortest -c:v mpeg4 -q:v 5 -c:a aac
```

### Platform-specific Entrypoints

**macOS**: `hello_main_macos.c`
- CLI application supporting both test modes
- Usage: `./hello_native_macos native output.mp4`

**iOS**: `HelloWorldFFmpegTests.swift`
- XCTest suite calling both native API and CLI
- Outputs saved to Documents directory

**Android**: `HelloWorldInstrumentedTest.kt`
- Instrumentation test with JNI calls
- Outputs saved to app cache directory

## CI Integration

### GitHub Actions Workflow

The `.github/workflows/ffmpeg-matrix.yml` workflow:

1. **Parallel Jobs**: macOS, iOS, Android
2. **Script-only**: Each job calls platform script
3. **Artifact Upload**: Collects generated MP4 files
4. **Matrix Results**: Summary of all platform outcomes

### Expected Artifacts

Each successful CI run generates:

```
build/
├── helloworld.macos.mp4          # macOS native API
├── helloworld_cli.macos.mp4      # macOS embedded CLI
├── helloworld.ios.mp4            # iOS native API  
├── helloworld_cli.ios.mp4        # iOS embedded CLI
├── helloworld.android.mp4        # Android native API
└── helloworld_cli.android.mp4    # Android embedded CLI
```

All files should be:
- **Playable** MP4 containers
- **~2 seconds** duration
- **320x240** resolution
- **Valid** audio/video streams

## Licensing Considerations

### Current Configuration (LGPL)

The default build uses LGPL-compatible components:

- **FFmpeg**: LGPL 2.1+ configuration
- **Video Encoding**: Platform native encoders (VideoToolbox, MediaCodec)
- **Audio Encoding**: Built-in AAC encoder
- **No GPL Dependencies**: x264 not included by default

### Switching to GPL (Optional)

To enable GPL features like libx264:

1. **Modify build scripts**:
   ```bash
   # Add to configure flags
   --enable-gpl --enable-libx264
   ```

2. **Update submodule**:
   ```bash
   cd third_party/ffmpeg-build
   git submodule update --init x264
   ```

3. **Licensing Impact**:
   - Entire application becomes GPL
   - Distribution restrictions apply
   - Commercial use requires GPL compliance

### Platform-specific Notes

**macOS/iOS**: 
- VideoToolbox encoder is LGPL-compatible
- No additional licensing concerns

**Android**:
- MediaCodec encoder is LGPL-compatible  
- MPEG4 fallback for compatibility
- Consider hardware encoder availability

## Troubleshooting

### Common Build Issues

**Submodule Initialization Fails**:
```bash
# Network issues with x264 repo
cd third_party/ffmpeg-build
git submodule deinit x264
# Continue with FFmpeg-only build
```

**macOS Build Fails**:
```bash
# Install missing dependencies
brew install yasm nasm
# Ensure Xcode tools are current
xcode-select --install
```

**iOS Simulator Issues**:
```bash
# Reset simulator
xcrun simctl erase all
# List available simulators
xcrun simctl list devices available
```

**Android NDK Not Found**:
```bash
# Set NDK path explicitly
export ANDROID_NDK_ROOT=/path/to/android/ndk/25.2.9519653
# Or install via SDK manager
sdkmanager "ndk;25.2.9519653"
```

### Debugging Failed Tests

**Enable Verbose Logging**:
```bash
# Add to FFmpeg configure
--enable-debug --disable-optimizations

# Set log level in test code
av_log_set_level(AV_LOG_DEBUG);
```

**Check Output Files**:
```bash
# Verify MP4 structure
ffprobe build/helloworld.macos.mp4

# Play test files
ffplay build/helloworld.macos.mp4
```

**Platform-specific Debugging**:

*macOS*: Use Instruments for profiling
*iOS*: Check Xcode console for simulator logs  
*Android*: Use `adb logcat` for native logs

## Local Development

### Building Individual Platforms

```bash
# Build only macOS
cd third_party/ffmpeg-build
./build-macos.sh
./build-ffmpeg-cli-lib.sh macos

# Build only iOS
./build-ios.sh  
./build-ffmpeg-cli-lib.sh ios

# Build only Android
./build-android.sh
./build-ffmpeg-cli-lib.sh android arm64-v8a
```

### Incremental Builds

The build scripts support incremental compilation:

```bash
# Clean previous builds
rm -rf third_party/ffmpeg-build/build/
rm -rf third_party/ffmpeg-build/out/

# Rebuild from scratch
./scripts/test_macos.sh
```

### Custom Configurations

Modify `third_party/ffmpeg-build/configureOptions.sh` for different FFmpeg features:

```bash
# Example: Add more codecs
FF_CONFIGURE_FLAGS="--enable-libvpx --enable-libopus"

# Example: Enable GPL features  
FF_CONFIGURE_FLAGS="--enable-gpl --enable-libx264"
```

## Contributing

When contributing to the media build system:

1. **Test all platforms** before submitting
2. **Update documentation** for new features
3. **Verify CI passes** with changes
4. **Consider licensing** implications of new dependencies
5. **Maintain script idempotency** for reliable builds

## Support

For issues with the FFmpeg build system:

1. Check this documentation first
2. Review CI logs for build failures
3. Test locally with verbose logging
4. Report issues with full environment details
5. Include platform-specific error messages