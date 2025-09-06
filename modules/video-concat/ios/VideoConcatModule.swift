import ExpoModulesCore
import AVFoundation

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
    
    private let videoConcat = VideoConcat()
    
    private func convertToVideoSegments(_ recordings: [RecordingSegment]) throws -> [VideoSegment] {
        return try recordings.map { recording in
            guard let url = URL(string: recording.uri) else {
                throw VideoConcatError.invalidSegment("Invalid URL: \(recording.uri)")
            }
            
            return VideoSegment(
                id: recording.id,
                duration: recording.duration,
                url: url,
                inMs: recording.inMs,
                outMs: recording.outMs
            )
        }
    }
    
  public func definition() -> ModuleDefinition {
    Name("VideoConcat")

        Events("onProgress")
        
        AsyncFunction("export") { (segments: [RecordingSegment]) -> String in
            // Set up progress delegation
            self.videoConcat.progressDelegate = self
            
            // Convert Expo segments to VideoSegment format
            let videoSegments = try self.convertToVideoSegments(segments)
            
            // Generate output URL in the documents directory
            let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
            let outputURL = documentsPath.appendingPathComponent("concatenated_video_\(Date().timeIntervalSince1970).mp4")
            
            // Use the shared VideoConcat logic
            let finalOutputURL = try await self.videoConcat.concatenateVideos(videoSegments, outputURL: outputURL)
            
            return finalOutputURL.absoluteString
        }
        
        AsyncFunction("cancelExport") {
            // TODO: Add cancel implementation
        }
    }
}

// MARK: - VideoConcatProgressDelegate

extension VideoConcatModule: VideoConcatProgressDelegate {
    public func videoConcatDidUpdateProgress(_ progress: Float, currentSegment: Int, phase: String) {
        self.sendEvent("onProgress", [
            "progress": [
                "progress": progress,
                "currentSegment": currentSegment,
                "phase": phase
            ]
        ])
    }
}