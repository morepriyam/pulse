package com.example.helloworldffmpeg;

public class HelloWorldFFmpeg {
    
    // Load native library
    static {
        System.loadLibrary("helloworldffmpeg");
    }
    
    /**
     * Test FFmpeg native API
     * @param outputPath Path where to save the generated video
     * @return 0 on success, non-zero on failure
     */
    public native int nativeAPITest(String outputPath);
    
    /**
     * Test embedded FFmpeg CLI
     * @param outputPath Path where to save the generated video
     * @return 0 on success, non-zero on failure
     */
    public native int embeddedCLITest(String outputPath);
    
    /**
     * Get FFmpeg version information
     * @return Version string
     */
    public native String getFFmpegVersion();
}