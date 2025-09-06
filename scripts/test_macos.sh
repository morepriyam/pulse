#!/bin/bash

set -e

echo "🍎 Testing FFmpeg builds on macOS..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
FFMPEG_BUILD_DIR="$PROJECT_ROOT/third_party/ffmpeg-build"

# Create build directory
mkdir -p "$BUILD_DIR"

echo "📦 Building FFmpeg for macOS..."
cd "$FFMPEG_BUILD_DIR"
./build-macos.sh

echo "📦 Building FFmpeg CLI library for macOS..."
./build-ffmpeg-cli-lib.sh macos

echo "🔨 Compiling test programs..."

# Set up include and library paths
INCLUDE_DIR="$FFMPEG_BUILD_DIR/out/include"
LIB_DIR="$FFMPEG_BUILD_DIR/out/macos"

# Common compiler flags
CFLAGS="-I$INCLUDE_DIR -std=c99"
LDFLAGS="-L$LIB_DIR"

# Libraries needed for linking
FFMPEG_LIBS="-lavformat -lavcodec -lavutil -lswscale -lswresample"
SYSTEM_LIBS="-framework Foundation -framework VideoToolbox -framework CoreMedia -framework CoreVideo -lbz2 -lz -liconv -lm"

# Compile native API test
echo "Compiling native API test..."
clang $CFLAGS \
    "$PROJECT_ROOT/tools/helloworld_av.c" \
    "$PROJECT_ROOT/tools/hello_main_macos.c" \
    -o "$BUILD_DIR/hello_native_macos" \
    $LDFLAGS $FFMPEG_LIBS $SYSTEM_LIBS

# Compile CLI test  
echo "Compiling CLI test..."
clang $CFLAGS \
    "$PROJECT_ROOT/tools/ffmpeg_execute.c" \
    "$PROJECT_ROOT/tools/hello_main_macos.c" \
    -o "$BUILD_DIR/hello_cli_macos" \
    $LDFLAGS -lffmpeg_cli $FFMPEG_LIBS $SYSTEM_LIBS

echo "🎬 Running tests..."

# Test native API
echo "Testing native API..."
if "$BUILD_DIR/hello_native_macos" native "$BUILD_DIR/helloworld.macos.mp4"; then
    echo "✅ Native API test succeeded"
    ls -la "$BUILD_DIR/helloworld.macos.mp4"
else
    echo "❌ Native API test failed"
    exit 1
fi

# Test CLI
echo "Testing embedded CLI..."
if "$BUILD_DIR/hello_cli_macos" cli "$BUILD_DIR/helloworld_cli.macos.mp4"; then
    echo "✅ CLI test succeeded"
    ls -la "$BUILD_DIR/helloworld_cli.macos.mp4"
else
    echo "❌ CLI test failed"
    exit 1
fi

echo "🎉 All macOS tests completed successfully!"
echo "📁 Artifacts created:"
echo "  - $BUILD_DIR/helloworld.macos.mp4 (native API)"
echo "  - $BUILD_DIR/helloworld_cli.macos.mp4 (embedded CLI)"