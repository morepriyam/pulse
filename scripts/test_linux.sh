#!/bin/bash

set -e

echo "🐧 Testing FFmpeg builds on Linux (demo)..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
FFMPEG_BUILD_DIR="$PROJECT_ROOT/third_party/ffmpeg-build"

# Create build directory
mkdir -p "$BUILD_DIR"

echo "📦 Building FFmpeg for Linux..."
cd "$FFMPEG_BUILD_DIR"
./build-linux.sh

echo "🔨 Compiling test programs..."

# Set up include and library paths
INCLUDE_DIR="$FFMPEG_BUILD_DIR/out/include"
LIB_DIR="$FFMPEG_BUILD_DIR/out/linux"

# Common compiler flags
CFLAGS="-I$INCLUDE_DIR -std=c99"
LDFLAGS="-L$LIB_DIR/lib"

# Libraries needed for linking (Linux)
FFMPEG_LIBS="-lavformat -lavcodec -lavutil -lswscale -lswresample"
SYSTEM_LIBS="-lm -lz"

# Compile native API test
echo "Compiling native API test..."
clang $CFLAGS \
    "$PROJECT_ROOT/tools/helloworld_av.c" \
    "$PROJECT_ROOT/tools/hello_simple.c" \
    -o "$BUILD_DIR/hello_native_linux" \
    $LDFLAGS $FFMPEG_LIBS $SYSTEM_LIBS

echo "🎬 Running native API test..."

# Test native API
echo "Testing native API..."
if "$BUILD_DIR/hello_native_linux" "$BUILD_DIR/helloworld.linux.mp4"; then
    echo "✅ Native API test succeeded"
    ls -la "$BUILD_DIR/helloworld.linux.mp4"
else
    echo "❌ Native API test failed"
    exit 1
fi

echo "🎉 Linux demo test completed successfully!"
echo "📁 Artifacts created:"
echo "  - $BUILD_DIR/helloworld.linux.mp4 (native API)"

# Show file info
if command -v file >/dev/null 2>&1; then
    echo "📊 File information:"
    file "$BUILD_DIR/helloworld.linux.mp4"
fi