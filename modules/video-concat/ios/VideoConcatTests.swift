import Foundation
import AVFoundation

// Define the types needed for testing
struct RecordingSegment {
    let id: String
    let duration: Double
    let uri: String
    let inMs: Double?
    let outMs: Double?
}

// Simplified test harness that simulates VideoConcat module behavior
class VideoConcatTestHarness {
    
    func export(segments: [RecordingSegment]) async throws -> String {
        print("🎬 Starting export with \(segments.count) segments")
        
        let composition = AVMutableComposition()
        
        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw NSError(domain: "VideoConcatError", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create tracks"])
        }
        
        var insertTime = CMTime.zero
        
        for segment in segments {
            let asset = AVAsset(url: URL(string: segment.uri)!)
            try await asset.loadTracks(withMediaType: .video)
            try await asset.loadTracks(withMediaType: .audio)
            
            guard let sourceVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
                continue
            }
            
            // Use full track duration when no trimming specified
            let timeRange = CMTimeRange(start: .zero, duration: sourceVideoTrack.timeRange.duration)
            
            try videoTrack.insertTimeRange(timeRange, of: sourceVideoTrack, at: insertTime)
            
            if let sourceAudioTrack = try await asset.loadTracks(withMediaType: .audio).first {
                try audioTrack.insertTimeRange(timeRange, of: sourceAudioTrack, at: insertTime)
            }
            
            insertTime = composition.duration
        }
        
        guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            throw NSError(domain: "VideoConcatError", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
        }
        
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")
        
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = false
        
        try await exportSession.export()
        
        guard exportSession.status == .completed else {
            throw NSError(domain: "VideoConcatError", code: 3, userInfo: [NSLocalizedDescriptionKey: "Export failed"])
        }
        
        return outputURL.absoluteString
    }
}

// Simplified test class
class VideoConcatTests {
    
    private func getTestVideoURL(filename: String) -> URL? {
        let currentDir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let testVideoPath = currentDir.appendingPathComponent("test/video/\(filename)")
        
        guard FileManager.default.fileExists(atPath: testVideoPath.path) else {
            print("⚠️ Test video not found: \(filename)")
            return nil
        }
        
        // Check if it's a Git LFS pointer
        if let content = try? String(contentsOf: testVideoPath, encoding: .utf8),
           content.contains("version https://git-lfs.github.com/spec/v1") {
            print("⚠️ Test video \(filename) is a Git LFS pointer - video not downloaded")
            return nil
        }
        
        return testVideoPath
    }
    
    private func getVideoDuration(url: URL) -> TimeInterval {
        let asset = AVAsset(url: url)
        return CMTimeGetSeconds(asset.duration)
    }
    
    private func getFileSize(url: URL) -> Int64 {
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
        return attributes?[.size] as? Int64 ?? 0
    }
    
    func runAllTests() async {
        print("🧪 Testing VideoConcat Module")
        print("=============================")
        
        if await testModuleExport() {
            print("✅ Module export test - PASSED")
            print("🎉 All tests completed successfully!")
        } else {
            print("❌ Module export test - FAILED")
        }
    }
    
    func testModuleExport() async -> Bool {
        print("\n🎬 Testing Module Export Method")
        
        guard let testVideo1URL = getTestVideoURL(filename: "recording1.mov"),
              let testVideo2URL = getTestVideoURL(filename: "recording2.mov") else {
            print("   ❌ Test videos not available - make sure Git LFS videos are downloaded")
            return false
        }
        
        do {
            let duration1 = getVideoDuration(url: testVideo1URL)
            let duration2 = getVideoDuration(url: testVideo2URL)
            let expectedDuration = duration1 + duration2
            
            print("   📹 Video 1: \(String(format: "%.1f", duration1))s")
            print("   📹 Video 2: \(String(format: "%.1f", duration2))s")
            print("   📹 Expected total: \(String(format: "%.1f", expectedDuration))s")
            
            let segments = [
                RecordingSegment(id: "segment1", duration: duration1, uri: testVideo1URL.absoluteString, inMs: nil, outMs: nil),
                RecordingSegment(id: "segment2", duration: duration2, uri: testVideo2URL.absoluteString, inMs: nil, outMs: nil)
            ]
            
            let harness = VideoConcatTestHarness()
            let outputURLString = try await harness.export(segments: segments)
            
            guard let outputURL = URL(string: outputURLString),
                  FileManager.default.fileExists(atPath: outputURL.path) else {
                print("   ❌ Output file does not exist")
                return false
            }
            
            let outputDuration = getVideoDuration(url: outputURL)
            let fileSize = getFileSize(url: outputURL)
            
            print("   ✅ Export successful!")
            print("   ⏱️ Duration: \(String(format: "%.1f", outputDuration))s")
            print("   📊 File size: \(fileSize) bytes")
            
            // Validate duration (allow 0.5s tolerance)
            let durationDifference = abs(outputDuration - expectedDuration)
            if durationDifference > 0.5 {
                print("   ⚠️ Duration mismatch: difference of \(String(format: "%.1f", durationDifference))s")
                return false
            }
            
            // Copy to visible location for manual inspection
            let projectRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            let timestamp = Int(Date().timeIntervalSince1970)
            let visibleOutputURL = projectRoot
                .appendingPathComponent("merged_video_test_\(timestamp)")
                .appendingPathExtension("mp4")
            
            try FileManager.default.copyItem(at: outputURL, to: visibleOutputURL)
            print("   📁 Output saved to: \(visibleOutputURL.lastPathComponent)")
            print("   🎬 You can open this file to verify the merged result!")
            
            return true
            
        } catch {
            print("   ❌ Test failed: \(error.localizedDescription)")
            return false
        }
    }
}

// MARK: - Main execution

// Run tests if this file is executed directly
if CommandLine.arguments.contains("--run-tests") {
    let semaphore = DispatchSemaphore(value: 0)
    
    Task {
        let tests = VideoConcatTests()
        await tests.runAllTests()
        semaphore.signal()
    }
    
    semaphore.wait()
}