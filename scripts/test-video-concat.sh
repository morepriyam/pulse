#!/bin/bash
echo "🎬 Testing VideoConcat Module"
echo "============================"

# Get absolute path to project root
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Check if test videos exist
if [ ! -f "$PROJECT_ROOT/test/video/recording1.mov" ] || [ ! -f "$PROJECT_ROOT/test/video/recording2.mov" ]; then
    echo "❌ Test videos not found. Please run: git lfs pull"
    exit 1
fi

echo "✅ Test videos found"
echo "🧪 Running VideoConcat Module Tests..."
echo ""

# Run the Swift test file directly
cd "$PROJECT_ROOT/modules/video-concat/ios"
VIDEOS_DIR="$PROJECT_ROOT/test/video" swift VideoConcatTests.swift --run-tests

# Check if test succeeded
if [ $? -eq 0 ]; then
    echo "✅ Tests passed successfully!"
else
    echo "❌ Tests failed"
    exit 1
fi

echo ""
echo "✅ Test execution completed!"