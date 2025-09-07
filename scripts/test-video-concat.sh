#!/bin/bash
echo "🎬 Testing VideoConcat Module"
echo "============================"

# Change to the project root directory
cd "$(dirname "$0")/.."

# Check if test videos exist
if [ ! -f "test/video/recording1.mov" ] || [ ! -f "test/video/recording2.mov" ]; then
    echo "❌ Test videos not found. Please run: git lfs pull"
    exit 1
fi

echo "✅ Test videos found"
echo "🧪 Running VideoConcat Module Tests..."
echo ""

# Run the tests
swift -I modules/video-concat/ios modules/video-concat/ios/VideoConcatTests.swift --run-tests

echo ""
echo "✅ Test execution completed!"