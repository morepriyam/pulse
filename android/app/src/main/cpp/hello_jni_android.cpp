#include <jni.h>
#include <string>
#include <android/log.h>

// Forward declarations
extern "C" {
    int helloworld_av_write(const char* output_filename);
    int ffmpeg_execute(const char* command_line);
}

#define LOG_TAG "HelloWorldFFmpeg"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C" JNIEXPORT jint JNICALL
Java_com_example_helloworldffmpeg_HelloWorldFFmpeg_nativeAPITest(
        JNIEnv *env,
        jobject /* this */,
        jstring outputPath) {
    
    const char *nativeOutputPath = env->GetStringUTFChars(outputPath, 0);
    
    LOGI("Starting native API test: %s", nativeOutputPath);
    
    int result = helloworld_av_write(nativeOutputPath);
    
    if (result == 0) {
        LOGI("✅ Native API test succeeded");
    } else {
        LOGE("❌ Native API test failed with code: %d", result);
    }
    
    env->ReleaseStringUTFChars(outputPath, nativeOutputPath);
    
    return result;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_example_helloworldffmpeg_HelloWorldFFmpeg_embeddedCLITest(
        JNIEnv *env,
        jobject /* this */,
        jstring outputPath) {
    
    const char *nativeOutputPath = env->GetStringUTFChars(outputPath, 0);
    
    LOGI("Starting embedded CLI test: %s", nativeOutputPath);
    
    // Build FFmpeg command for Android
    std::string command = "-hide_banner -f lavfi -i testsrc=size=320x240:rate=30 "
                         "-f lavfi -i anullsrc=channel_layout=mono:sample_rate=48000 "
                         "-t 2 -shortest -c:v mpeg4 -q:v 5 -c:a aac -y ";
    command += nativeOutputPath;
    
    LOGI("FFmpeg command: %s", command.c_str());
    
    int result = ffmpeg_execute(command.c_str());
    
    if (result == 0) {
        LOGI("✅ Embedded CLI test succeeded");
    } else {
        LOGE("❌ Embedded CLI test failed with code: %d", result);
    }
    
    env->ReleaseStringUTFChars(outputPath, nativeOutputPath);
    
    return result;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_helloworldffmpeg_HelloWorldFFmpeg_getFFmpegVersion(
        JNIEnv *env,
        jobject /* this */) {
    
    // This would normally return the actual FFmpeg version
    // For now, return a static string
    return env->NewStringUTF("FFmpeg 4.3.x with custom build");
}