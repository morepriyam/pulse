import Foundation
import AVFoundation
import React

@objc(RNVideoConcat)
class RNVideoConcat: NSObject {
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  @objc(concatenate:options:resolve:reject:)
  func concatenate(
    segmentPaths: [String],
    options: [String: Any],
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    
    // Run on background queue to avoid blocking UI
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        print("🎬 Starting concatenation of \(segmentPaths.count) segments")
        let outputPath = try self.concatenateVideos(segmentPaths: segmentPaths, options: options)
        
        DispatchQueue.main.async {
          print("✅ Concatenation successful: \(outputPath)")
          resolve([
            "success": true,
            "outputPath": outputPath
          ])
        }
      } catch {
        DispatchQueue.main.async {
          print("❌ Concatenation failed: \(error.localizedDescription)")
          reject("CONCAT_ERROR", error.localizedDescription, error)
        }
      }
    }
  }
  
  private func concatenateVideos(segmentPaths: [String], options: [String: Any]) throws -> String {
    print("🔧 Creating composition...")
    let composition = AVMutableComposition()
    
    // Create video and audio tracks
    guard let videoTrack = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw NSError(domain: "VideoConcat", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create video track"])
    }
    
    guard let audioTrack = composition.addMutableTrack(
      withMediaType: .audio, 
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw NSError(domain: "VideoConcat", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create audio track"])
    }
    
    var currentTime = CMTime.zero
    
    // Process each segment
    for (index, segmentPath) in segmentPaths.enumerated() {
      print("📹 Processing segment \(index + 1)/\(segmentPaths.count): \(segmentPath)")
      
      let asset = AVAsset(url: URL(fileURLWithPath: segmentPath))
      
      // Wait for asset to load
      let semaphore = DispatchSemaphore(value: 0)
      var loadError: Error?
      
      asset.loadValuesAsynchronously(forKeys: ["tracks", "duration"]) {
        loadError = asset.error
        semaphore.signal()
      }
      
      semaphore.wait()
      
      if let error = loadError {
        throw error
      }
      
      // Add video track
      if let assetVideoTrack = asset.tracks(withMediaType: .video).first {
        try videoTrack.insertTimeRange(
          CMTimeRange(start: .zero, duration: asset.duration),
          of: assetVideoTrack,
          at: currentTime
        )
      }
      
      // Add audio track if exists
      if let assetAudioTrack = asset.tracks(withMediaType: .audio).first {
        try audioTrack.insertTimeRange(
          CMTimeRange(start: .zero, duration: asset.duration),
          of: assetAudioTrack,
          at: currentTime
        )
      }
      
      currentTime = CMTimeAdd(currentTime, asset.duration)
    }
    
    // Export the final video
    return try self.exportComposition(composition: composition)
  }
  
  private func exportComposition(composition: AVMutableComposition) throws -> String {
    print("💾 Exporting final video...")
    
    let outputURL = self.generateOutputURL()
    
    // Remove existing file if it exists
    if FileManager.default.fileExists(atPath: outputURL.path) {
      try FileManager.default.removeItem(at: outputURL)
    }
    
    guard let exportSession = AVAssetExportSession(
      asset: composition,
      presetName: AVAssetExportPresetHighestQuality
    ) else {
      throw NSError(domain: "VideoConcat", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
    }
    
    exportSession.outputURL = outputURL
    exportSession.outputFileType = .mp4
    
    let semaphore = DispatchSemaphore(value: 0)
    var exportError: Error?
    
    exportSession.exportAsynchronously {
      exportError = exportSession.error
      semaphore.signal()
    }
    
    semaphore.wait()
    
    if let error = exportError {
      throw error
    }
    
    print("🎉 Export completed successfully!")
    return outputURL.path
  }
  
  private func generateOutputURL() -> URL {
    let documentsPath = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)[0]
    let timestamp = Int(Date().timeIntervalSince1970)
    let outputPath = "\(documentsPath)/pulse_export_\(timestamp).mp4"
    return URL(fileURLWithPath: outputPath)
  }
} 