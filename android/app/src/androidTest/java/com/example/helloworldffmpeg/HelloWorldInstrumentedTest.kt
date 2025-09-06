package com.example.helloworldffmpeg

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Assert.*
import java.io.File

/**
 * Instrumentation test for HelloWorld FFmpeg functionality.
 *
 * See [testing documentation](http://d.android.com/tools/testing).
 */
@RunWith(AndroidJUnit4::class)
class HelloWorldInstrumentedTest {
    
    private val ffmpeg = HelloWorldFFmpeg()
    
    @Test
    fun testNativeAPI() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        val outputFile = File(appContext.cacheDir, "helloworld.android.mp4")
        
        // Remove existing file if it exists
        if (outputFile.exists()) {
            outputFile.delete()
        }
        
        // Test native API
        val result = ffmpeg.nativeAPITest(outputFile.absolutePath)
        
        assertEquals("Native API should succeed", 0, result)
        assertTrue("Output file should exist", outputFile.exists())
        assertTrue("Output file should not be empty", outputFile.length() > 0)
        
        println("✅ Native API test completed: ${outputFile.absolutePath}")
        println("File size: ${outputFile.length()} bytes")
    }
    
    @Test
    fun testEmbeddedCLI() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        val outputFile = File(appContext.cacheDir, "helloworld_cli.android.mp4")
        
        // Remove existing file if it exists
        if (outputFile.exists()) {
            outputFile.delete()
        }
        
        // Test embedded CLI
        val result = ffmpeg.embeddedCLITest(outputFile.absolutePath)
        
        assertEquals("Embedded CLI should succeed", 0, result)
        assertTrue("Output file should exist", outputFile.exists())
        assertTrue("Output file should not be empty", outputFile.length() > 0)
        
        println("✅ Embedded CLI test completed: ${outputFile.absolutePath}")
        println("File size: ${outputFile.length()} bytes")
    }
    
    @Test
    fun testFFmpegVersion() {
        val version = ffmpeg.getFFmpegVersion()
        assertNotNull("Version should not be null", version)
        assertTrue("Version should not be empty", version.isNotEmpty())
        
        println("FFmpeg version: $version")
    }
}