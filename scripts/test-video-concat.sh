#!/bin/bash

# Print each command for debugging
set -x

# Change to project root
cd "$(dirname "$0")/.."

# Set test videos directory
export VIDEOS_DIR="$PWD/test/video"

# Print test info
echo "🎬 Testing VideoConcat Module"
echo "============================"

# Check if test videos exist
if [ -f "$VIDEOS_DIR/recording1.mov" ] && [ -f "$VIDEOS_DIR/recording2.mov" ]; then
    echo "✅ Test videos found"
else
    echo "❌ Test videos not found in $VIDEOS_DIR"
    exit 1
fi

echo "🧪 Running VideoConcat Module Tests..."
echo

# Run the test
swift "$PWD/test/video/RunTests.swift"

# Check exit code
if [ $? -eq 0 ]; then
    echo "✅ Tests passed successfully!"
else
    echo "❌ Tests failed"
    exit 1
fi

echo
echo "✅ Test execution completed!"