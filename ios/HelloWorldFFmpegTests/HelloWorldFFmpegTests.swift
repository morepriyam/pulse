import XCTest

class HelloWorldFFmpegTests: XCTestCase {
    
    override func setUpWithError() throws {
        continueAfterFailure = false
    }
    
    func testNativeAPI() throws {
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let outputURL = documentsURL.appendingPathComponent("helloworld.ios.mp4")
        
        // Remove existing file if it exists
        try? FileManager.default.removeItem(at: outputURL)
        
        // Call native API function
        let result = helloworld_av_write(outputURL.path)
        
        XCTAssertEqual(result, 0, "Native API should succeed")
        XCTAssertTrue(FileManager.default.fileExists(atPath: outputURL.path), "Output file should exist")
        
        // Copy to app bundle for easier access
        let bundleURL = Bundle(for: type(of: self)).bundleURL.appendingPathComponent("helloworld.ios.mp4")
        try? FileManager.default.removeItem(at: bundleURL)
        try? FileManager.default.copyItem(at: outputURL, to: bundleURL)
        
        print("✅ Native API test completed: \(outputURL.path)")
    }
    
    func testEmbeddedCLI() throws {
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let outputURL = documentsURL.appendingPathComponent("helloworld_cli.ios.mp4")
        
        // Remove existing file if it exists
        try? FileManager.default.removeItem(at: outputURL)
        
        // Build FFmpeg command for iOS
        let command = "-hide_banner -f lavfi -i testsrc=size=320x240:rate=30 " +
                     "-f lavfi -i anullsrc=channel_layout=mono:sample_rate=48000 " +
                     "-t 2 -shortest -c:v h264_videotoolbox -c:a aac -y \(outputURL.path)"
        
        // Call embedded CLI function
        let result = ffmpeg_execute(command)
        
        XCTAssertEqual(result, 0, "Embedded CLI should succeed")
        XCTAssertTrue(FileManager.default.fileExists(atPath: outputURL.path), "Output file should exist")
        
        // Copy to app bundle for easier access
        let bundleURL = Bundle(for: type(of: self)).bundleURL.appendingPathComponent("helloworld_cli.ios.mp4")
        try? FileManager.default.removeItem(at: bundleURL)
        try? FileManager.default.copyItem(at: outputURL, to: bundleURL)
        
        print("✅ Embedded CLI test completed: \(outputURL.path)")
    }
    
    func testPerformanceExample() throws {
        // Measure performance of native API
        self.measure {
            let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
            let outputURL = documentsURL.appendingPathComponent("perf_test.mp4")
            
            try? FileManager.default.removeItem(at: outputURL)
            let _ = helloworld_av_write(outputURL.path)
        }
    }
}