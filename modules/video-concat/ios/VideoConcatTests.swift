import Foundation
import AVFoundation

// Simple test class to merge videos
class VideoConcatTests {
    
    private func getTestVideoURL(filename: String) -> URL? {
        // Get videos directory from environment variable or use current directory
        let videosDir = ProcessInfo.processInfo.environment["VIDEOS_DIR"] ?? FileManager.default.currentDirectoryPath
        let testVideoPath = URL(fileURLWithPath: videosDir).appendingPathComponent(filename)
        
        guard FileManager.default.fileExists(atPath: testVideoPath.path) else {
            print("⚠️ Test video not found: \(filename)")
            return nil
        }
        
        return testVideoPath
    }
    
    func runAllTests() async {
        print("🧪 Testing VideoConcat Module")
        print("=============================")
        
        if await testMergeVideos() {
            print("✅ Merge test - PASSED")
            print("🎉 All tests completed successfully!")
        } else {
            print("❌ Merge test - FAILED")
        }
    }
    
    func testMergeVideos() async -> Bool {
        print("\n🎬 Testing Video Merge")
        
        // Get test video paths
        guard let video1URL = getTestVideoURL(filename: "recording1.mov"),
              let video2URL = getTestVideoURL(filename: "recording2.mov") else {
            print("   ❌ Test videos not available - make sure videos exist in test/video/")
            return false
        }
        
        do {
            // Create composition
            let composition = AVMutableComposition()
            
            // Create video and audio tracks
            guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
                  let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
                print("   ❌ Failed to create tracks")
                return false
            }
            
            // Process videos
            let videos = [video1URL, video2URL]
            var insertTime = CMTime.zero
            
            for videoURL in videos {
                // Create asset and load tracks
                let asset = AVURLAsset(url: videoURL)
                let videoTracks = try await asset.loadTracks(withMediaType: .video)
                
                guard let sourceVideoTrack = videoTracks.first else {
                    print("   ⚠️ No video track in \(videoURL.lastPathComponent)")
                    continue
                }
                
                // Get track duration
                let timeRange = CMTimeRange(start: .zero, duration: sourceVideoTrack.timeRange.duration)
                
                // Insert video
                try videoTrack.insertTimeRange(timeRange, of: sourceVideoTrack, at: insertTime)
                
                // Insert audio if available
                let audioTracks = try await asset.loadTracks(withMediaType: .audio)
                if let sourceAudioTrack = audioTracks.first {
                    try audioTrack.insertTimeRange(timeRange, of: sourceAudioTrack, at: insertTime)
                }
                
                insertTime = composition.duration
            }
            
            // Get output directory from environment
            let outputDir = ProcessInfo.processInfo.environment["VIDEOS_DIR"] ?? FileManager.default.currentDirectoryPath
            let outputURL = URL(fileURLWithPath: outputDir).appendingPathComponent("merged_test_video.mp4")
            
            // Remove existing file if any
            if FileManager.default.fileExists(atPath: outputURL.path) {
                try FileManager.default.removeItem(at: outputURL)
            }
            
            // Create export session
            guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
                print("   ❌ Failed to create export session")
                return false
            }
            
            // Configure export
            exportSession.outputURL = outputURL
            exportSession.outputFileType = .mp4
            exportSession.shouldOptimizeForNetworkUse = false
            
            // Export
            try await exportSession.export()
            print("   ✅ Export successful!")
            print("   📁 Output saved to: \(outputURL.path)")
            return true
            
        } catch {
            print("   ❌ Test failed: \(error.localizedDescription)")
            return false
        }
    }
}

// Test runner class to handle command line execution
class VideoConcatTestRunner {
    static func runTests() {
        guard CommandLine.arguments.contains("--run-tests") else { return }
        
        Task {
            let tests = VideoConcatTests()
            await tests.runAllTests()
            exit(0)
        }
        
        // Keep the main thread running while async tasks complete
        RunLoop.main.run()
    }
}

#if DEBUG
#else
    // Initialize tests when running as standalone
    let _ = VideoConcatTestRunner.runTests()
#endif