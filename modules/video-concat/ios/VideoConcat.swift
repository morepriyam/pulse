import Foundation
import AVFoundation
import CoreMedia

// MARK: - Data Models (from VideoConcat.swift)

public struct VideoSegment {
    public let id: String
    public let duration: Double
    public let url: URL
    public let inMs: Double?
    public let outMs: Double?
    
    public init(id: String, duration: Double, url: URL, inMs: Double? = nil, outMs: Double? = nil) {
        self.id = id
        self.duration = duration
        self.url = url
        self.inMs = inMs
        self.outMs = outMs
    }
}

// MARK: - Error Types (from VideoConcat.swift)

public enum VideoConcatError: Error, LocalizedError {
    case trackCreationFailed(String)
    case exportSessionFailed
    case exportFailed(String)
    case invalidSegment(String)
    
    public var errorDescription: String? {
        switch self {
        case .trackCreationFailed(let type):
            return "Failed to create \(type) track"
        case .exportSessionFailed:
            return "Failed to create export session"
        case .exportFailed(let message):
            return "Export failed: \(message)"
        case .invalidSegment(let message):
            return "Invalid segment: \(message)"
        }
    }
}

// MARK: - Simplified VideoConcat for Testing

public class VideoConcat {
    
    public init() {}
    
    public func TestConcat() async throws -> URL {
        print("🧪 VideoConcat: Starting test concatenation")
        print("========================================")
        
        // Define test video paths (relative to current directory)
        let testVideoDir = "test/video"
        let video1Path = "\(testVideoDir)/recording1.mov"
        let video2Path = "\(testVideoDir)/recording2.mov"
        
        // Check if test videos exist
        guard FileManager.default.fileExists(atPath: video1Path),
              FileManager.default.fileExists(atPath: video2Path) else {
            print("❌ Test videos not found!")
            print("   Expected: \(video1Path)")
            print("   Expected: \(video2Path)")
            throw VideoConcatError.invalidSegment("Test videos not found in \(testVideoDir)")
        }
        
        print("✅ Found test videos:")
        print("   - recording1.mov")
        print("   - recording2.mov")
        
        // Get actual video info
        let asset1 = AVURLAsset(url: URL(fileURLWithPath: video1Path))
        let asset2 = AVURLAsset(url: URL(fileURLWithPath: video2Path))
        
        let duration1 = try await asset1.load(.duration)
        let duration2 = try await asset2.load(.duration)
        
        print("   - recording1.mov duration: \(CMTimeGetSeconds(duration1).rounded(toPlaces: 2))s")
        print("   - recording2.mov duration: \(CMTimeGetSeconds(duration2).rounded(toPlaces: 2))s")
        
        // Create test video segments
        let segments = [
            VideoSegment(
                id: "test_segment_1",
                duration: 3.0,
                url: URL(fileURLWithPath: video1Path),
                inMs: 0,
                outMs: 3000  // First 3 seconds
            ),
            VideoSegment(
                id: "test_segment_2",
                duration: 1.5,
                url: URL(fileURLWithPath: video2Path),
                inMs: 0,
                outMs: 1500  // First 1.5 seconds
            ),
            VideoSegment(
                id: "test_segment_3",
                duration: 2.0,
                url: URL(fileURLWithPath: video1Path),
                inMs: 2000,  // Start at 2 seconds
                outMs: 4000  // End at 4 seconds (2 second duration)
            )
        ]
        
        print("\n🎬 Test segments created:")
        for (index, segment) in segments.enumerated() {
            print("   \(index + 1). \(segment.id)")
            print("      - File: \(segment.url.lastPathComponent)")
            print("      - Trim: \(segment.inMs ?? 0)ms to \(segment.outMs ?? 0)ms")
            print("      - Duration: \(segment.duration)s")
        }
        
        print("\n🚀 Running concatenation...")
        
        // Run the actual concatenation
        let outputURL = try await concatenateVideos(segments)
        
        print("\n🎉 Test concatenation completed successfully!")
        print("📁 Output saved to: \(outputURL.path)")
        
        // Show file size
        if let attributes = try? FileManager.default.attributesOfItem(atPath: outputURL.path),
           let fileSize = attributes[.size] as? Int64 {
            let sizeMB = Double(fileSize) / (1024 * 1024)
            print("📊 File size: \(String(format: "%.2f", sizeMB)) MB")
        }
        
        // Verify output
        let outputAsset = AVURLAsset(url: outputURL)
        let outputDuration = try await outputAsset.load(.duration)
        print("⏱️  Total duration: \(CMTimeGetSeconds(outputDuration).rounded(toPlaces: 2))s")
        
        print("\n🔍 You can play the test video with:")
        print("   open '\(outputURL.path)'")
        
        return outputURL
    }
    
    private func concatenateVideos(_ segments: [VideoSegment]) async throws -> URL {
        // Create composition
        let composition = AVMutableComposition()
        
        // Create video and audio tracks
        guard let videoTrack = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw VideoConcatError.trackCreationFailed("video")
        }
        
        guard let audioTrack = composition.addMutableTrack(
            withMediaType: .audio,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw VideoConcatError.trackCreationFailed("audio")
        }
        
        var insertTime = CMTime.zero
        
        // Process each segment
        for (index, segment) in segments.enumerated() {
            print("   Processing segment \(index + 1)/\(segments.count)...")
            
            let asset = AVURLAsset(url: segment.url)
            let videoTracks = try await asset.loadTracks(withMediaType: .video)
            let audioTracks = try await asset.loadTracks(withMediaType: .audio)
            
            guard let sourceVideoTrack = videoTracks.first else {
                print("   ⚠️ No video track found, skipping")
                continue
            }
            
            // Calculate time range
            let startTime = CMTime(value: Int64((segment.inMs ?? 0) * 30), timescale: 30000) // 30fps
            let endTime = CMTime(value: Int64((segment.outMs ?? (segment.duration * 1000)) * 30), timescale: 30000)
            let timeRange = CMTimeRange(start: startTime, end: endTime)
            
            // Insert video track
            try videoTrack.insertTimeRange(timeRange, of: sourceVideoTrack, at: insertTime)
            
            // Insert audio if available
            if let sourceAudioTrack = audioTracks.first {
                try audioTrack.insertTimeRange(timeRange, of: sourceAudioTrack, at: insertTime)
            }
            
            insertTime = CMTimeAdd(insertTime, timeRange.duration)
            print("     ✅ Added \(CMTimeGetSeconds(timeRange.duration).rounded(toPlaces: 2))s")
        }
        
        // Export
        guard let exportSession = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw VideoConcatError.exportSessionFailed
        }
        
        let outputURL = URL(fileURLWithPath: "test/video/test_concatenated_output.mp4")
        
        // Remove existing file
        try? FileManager.default.removeItem(at: outputURL)
        
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        
        await exportSession.export()
        
        guard exportSession.status == .completed else {
            throw VideoConcatError.exportFailed(exportSession.error?.localizedDescription ?? "Unknown error")
        }
        
        return outputURL
    }
}

extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let divisor = pow(10.0, Double(places))
        return (self * divisor).rounded() / divisor
    }
}

// MARK: - Main execution

Task {
    do {
        let videoConcat = VideoConcat()
        let outputURL = try await videoConcat.TestConcat()
        print("\n🎉 Test completed successfully!")
        print("📁 Final output: \(outputURL.path)")
    } catch {
        print("\n❌ Test failed: \(error.localizedDescription)")
        exit(1)
    }
    exit(0)
}

RunLoop.main.run()
