import ExpoModulesCore
import AVFoundation

enum VideoConcatError: Error {
    case trackCreationFailed(String)
    case exportSessionFailed
    case exportFailed(String)
}

struct RecordingSegment: Record {
    @Field
    var id: String
    
    @Field
    var duration: Double
    
    @Field
    var uri: String
    
    @Field
    var inMs: Double?
    
    @Field
    var outMs: Double?
}

public class VideoConcatModule: Module {
    
    // Helper function to create video composition that matches preview behavior
    private func createVideoComposition(from composition: AVMutableComposition) -> AVMutableVideoComposition? {
        guard let videoTrack = composition.tracks(withMediaType: .video).first else {
            return nil
        }
        
        let videoComposition = AVMutableVideoComposition()
        videoComposition.frameDuration = CMTime(value: 1, timescale: 30) // 30 FPS
        
        // Use the natural size of the first video as the base, or a reasonable default
        let naturalSize = videoTrack.naturalSize
        let baseSize = naturalSize.width > 0 && naturalSize.height > 0 ? naturalSize : CGSize(width: 1080, height: 1920)
        
        // For mobile video, prefer portrait orientation (9:16)
        // But maintain the aspect ratio of the content
        let targetAspectRatio: CGFloat = 9.0 / 16.0
        let contentAspectRatio = baseSize.width / baseSize.height
        
        let renderSize: CGSize
        if contentAspectRatio > targetAspectRatio {
            // Content is wider than 9:16, fit to width
            renderSize = CGSize(width: 1080, height: 1080 / contentAspectRatio)
        } else {
            // Content is taller than 9:16, fit to height
            renderSize = CGSize(width: 1920 * contentAspectRatio, height: 1920)
        }
        
        videoComposition.renderSize = renderSize
        print("🎬 VideoComposition: Render size set to \(renderSize)")
        
        // Create instruction for the video track
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
        
        let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
        
        // Calculate transform to fill the render size (like contentFit="cover")
        let scaleX = renderSize.width / naturalSize.width
        let scaleY = renderSize.height / naturalSize.height
        let scale = max(scaleX, scaleY) // Use larger scale to fill (cover behavior)
        
        // Center the video
        let scaledWidth = naturalSize.width * scale
        let scaledHeight = naturalSize.height * scale
        let offsetX = (renderSize.width - scaledWidth) / 2
        let offsetY = (renderSize.height - scaledHeight) / 2
        
        var transform = CGAffineTransform(scaleX: scale, y: scale)
        transform = transform.translatedBy(x: offsetX, y: offsetY)
        
        // Apply the original video's preferred transform first, then our scaling
        let originalTransform = videoTrack.preferredTransform
        transform = originalTransform.concatenating(transform)
        
        // Set transform for the entire duration to ensure consistency
        layerInstruction.setTransform(transform, at: .zero)
        
        instruction.layerInstructions = [layerInstruction]
        videoComposition.instructions = [instruction]
        
        return videoComposition
    }
    
    // MARK: - Video Processing
    
    private struct SegmentProcessingConfig {
        let segment: RecordingSegment
        let index: Int
        let totalSegments: Int
        let videoTrack: AVMutableCompositionTrack
        let audioTrack: AVMutableCompositionTrack
        let insertTime: CMTime
    }
    
    private func processVideoSegment(config: SegmentProcessingConfig) async throws -> CMTime {
        print("🎬 VideoConcat: Processing segment \(config.index + 1)/\(config.totalSegments)")
        print("   - ID: \(config.segment.id)")
        print("   - URI: \(config.segment.uri)")
        print("   - Duration: \(config.segment.duration)s")
        print("   - InMs: \(config.segment.inMs ?? 0)")
        print("   - OutMs: \(config.segment.outMs ?? (config.segment.duration * 1000))")
        
        // Report progress
        self.sendEvent("onProgress", [
            "progress": [
                "progress": Float(config.index) / Float(config.totalSegments),
                "currentSegment": config.index,
                "phase": "processing"
            ]
        ])
        
        // Load asset - ensure we have a valid file URL
        guard let fileURL = URL(string: config.segment.uri) else {
            print("   ❌ VideoConcat: Invalid URL: \(config.segment.uri)")
            throw VideoConcatError.exportFailed("Invalid file URL: \(config.segment.uri)")
        }
        
        // Verify the file exists
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            print("   ❌ VideoConcat: File does not exist: \(fileURL.path)")
            throw VideoConcatError.exportFailed("File does not exist: \(fileURL.path)")
        }
        
        let asset = AVURLAsset(url: fileURL)
        print("   - Loading asset from: \(fileURL.path)")
        
        // Wait for tracks to load
        try await asset.load(.tracks)
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        print("   - Asset tracks loaded")
        
        // Get source tracks
        guard let sourceVideoTrack = videoTracks.first else {
            print("   ⚠️ VideoConcat: No video track found, skipping segment")
            return config.insertTime
        }
        print("   - Found video track")
        
        // Get actual track duration for frame-perfect timing
        let trackTimeRange = try await sourceVideoTrack.load(.timeRange)
        let trackDuration = trackTimeRange.duration
        let trackDurationSeconds = CMTimeGetSeconds(trackDuration)
        print("   - Track duration: \(trackDurationSeconds)s")
        
        // Calculate time range using actual track duration
        let startTimeMs = config.segment.inMs ?? 0
        let endTimeMs = config.segment.outMs ?? (trackDurationSeconds * 1000)
        
        // Validate trim points
        let maxDurationMs = trackDurationSeconds * 1000
        let validatedStartMs = max(0, min(startTimeMs, maxDurationMs))
        let validatedEndMs = max(validatedStartMs, min(endTimeMs, maxDurationMs))
        
        print("   - Validated trim: \(validatedStartMs)ms to \(validatedEndMs)ms")
        
        // Convert to track's timescale for frame accuracy
        let trackTimescale = trackTimeRange.start.timescale
        let startTime = CMTime(value: Int64(validatedStartMs * Double(trackTimescale) / 1000), timescale: trackTimescale)
        let endTime = CMTime(value: Int64(validatedEndMs * Double(trackTimescale) / 1000), timescale: trackTimescale)
        
        // Ensure we don't exceed track duration and have a valid duration
        let actualEndTime = CMTimeMinimum(endTime, trackDuration)
        let timeRange = CMTimeRangeFromTimeToTime(start: startTime, end: actualEndTime)
        
        // Validate the time range has a positive duration
        guard timeRange.duration.isValid && timeRange.duration.seconds > 0 else {
            print("   ⚠️ VideoConcat: Invalid time range duration")
            return config.insertTime
        }
        
        print("   - Time range: \(CMTimeGetSeconds(startTime))s to \(CMTimeGetSeconds(actualEndTime))s")
        print("   - Range duration: \(CMTimeGetSeconds(timeRange.duration))s")
        
        // Insert video track with quality preservation
        try config.videoTrack.insertTimeRange(timeRange, of: sourceVideoTrack, at: config.insertTime)
        print("   - Inserted video track with quality preservation")
        
        // Insert audio if available
        if let sourceAudioTrack = audioTracks.first {
            try config.audioTrack.insertTimeRange(timeRange, of: sourceAudioTrack, at: config.insertTime)
            print("   - Inserted audio track")
        } else {
            print("   - No audio track found")
        }
        
        return CMTimeAdd(config.insertTime, timeRange.duration)
    }
    
    private func setupExportSession(
        for composition: AVMutableComposition,
        videoComposition: AVMutableVideoComposition?
    ) throws -> (AVAssetExportSession, URL) {
        guard let exportSession = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            print("❌ VideoConcat: Failed to create export session")
            throw VideoConcatError.exportSessionFailed
        }
        print("✅ VideoConcat: Created export session with highest quality preset")
        
        // Configure export settings for maximum quality
        exportSession.shouldOptimizeForNetworkUse = false
        exportSession.outputFileType = .mp4
        
        // Set video composition for better quality
        if let videoComposition = videoComposition {
            exportSession.videoComposition = videoComposition
            print("✅ VideoConcat: Applied video composition for quality optimization")
        }
        
        // Set up export
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")
        
        exportSession.outputURL = outputURL
        print("📁 VideoConcat: Output URL: \(outputURL.absoluteString)")
        
        return (exportSession, outputURL)
    }
    
    // MARK: - Module Definition
    
    public func definition() -> ModuleDefinition {
        Name("VideoConcat")
        Events("onProgress")
        
        AsyncFunction("export") { (segments: [RecordingSegment]) -> String in
            print("🎬 VideoConcat: Starting export with \(segments.count) segments")
            
            // Log segment details for debugging
            for (index, segment) in segments.enumerated() {
                print("   Segment \(index + 1): \(segment.uri)")
            }
            
            // Create composition
            let composition = AVMutableComposition()
            print("🎬 VideoConcat: Created AVMutableComposition")
            
            // Create video and audio tracks
            guard let videoTrack = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else {
                print("❌ VideoConcat: Failed to create video track")
                throw VideoConcatError.trackCreationFailed("video")
            }
            print("✅ VideoConcat: Created video track")
            
            guard let audioTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else {
                print("❌ VideoConcat: Failed to create audio track")
                throw VideoConcatError.trackCreationFailed("audio")
            }
            print("✅ VideoConcat: Created audio track")
            
            // Process each segment
            var insertTime = CMTime.zero
            for (index, segment) in segments.enumerated() {
                let config = SegmentProcessingConfig(
                    segment: segment,
                    index: index,
                    totalSegments: segments.count,
                    videoTrack: videoTrack,
                    audioTrack: audioTrack,
                    insertTime: insertTime
                )
                insertTime = try await processVideoSegment(config: config)
            }
            
            print("🎬 VideoConcat: All segments processed, creating export session")
            
            // Set up export session
            let videoComposition = createVideoComposition(from: composition)
            let (exportSession, outputURL) = try setupExportSession(
                for: composition,
                videoComposition: videoComposition
            )
            
            // Export
            self.sendEvent("onProgress", [
                "progress": [
                    "progress": 0.9,
                    "currentSegment": segments.count - 1,
                    "phase": "finalizing"
                ]
            ])
            
            print("🎬 VideoConcat: Starting export...")
            
            // Export with timeout handling
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                exportSession.exportAsynchronously {
                    switch exportSession.status {
                    case .completed:
                        print("✅ VideoConcat: Export completed")
                        continuation.resume()
                    case .failed:
                        let errorMsg = exportSession.error?.localizedDescription ?? "unknown error"
                        print("❌ VideoConcat: Export failed with status: \(exportSession.status.rawValue)")
                        print("   - Error: \(errorMsg)")
                        continuation.resume(throwing: VideoConcatError.exportFailed(errorMsg))
                    case .cancelled:
                        print("❌ VideoConcat: Export cancelled")
                        continuation.resume(throwing: VideoConcatError.exportFailed("Export was cancelled"))
                    default:
                        print("❌ VideoConcat: Export ended with unexpected status: \(exportSession.status.rawValue)")
                        continuation.resume(throwing: VideoConcatError.exportFailed("Unexpected export status: \(exportSession.status.rawValue)"))
                    }
                }
            }
            
            // Final progress
            self.sendEvent("onProgress", [
                "progress": [
                    "progress": 1.0,
                    "currentSegment": segments.count - 1,
                    "phase": "finalizing"
                ]
            ])
            
            print("✅ VideoConcat: Export successful!")
            print("   - Output file: \(outputURL.absoluteString)")
            print("   - File size: \(try? FileManager.default.attributesOfItem(atPath: outputURL.path)[.size] as? Int64 ?? 0) bytes")
            
            return outputURL.absoluteString
        }
        
        AsyncFunction("cancelExport") {
            // TODO: Add cancel implementation
        }
    }
}
