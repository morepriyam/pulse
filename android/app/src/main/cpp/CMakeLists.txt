cmake_minimum_required(VERSION 3.22.1)

project("helloworldffmpeg")

# Set C++ standard
set(CMAKE_CXX_STANDARD 14)

# Find required packages
find_library(log-lib log)
find_library(android-lib android)

# FFmpeg library paths
set(FFMPEG_DIR ${CMAKE_SOURCE_DIR}/../../../../../third_party/ffmpeg-build/out/android/${ANDROID_ABI})
set(FFMPEG_INCLUDE_DIR ${CMAKE_SOURCE_DIR}/../../../../../third_party/ffmpeg-build/out/include)

# Add include directories
include_directories(${FFMPEG_INCLUDE_DIR})

# Add FFmpeg libraries
add_library(avformat SHARED IMPORTED)
set_target_properties(avformat PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libavformat.so)

add_library(avcodec SHARED IMPORTED)
set_target_properties(avcodec PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libavcodec.so)

add_library(avutil SHARED IMPORTED)
set_target_properties(avutil PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libavutil.so)

add_library(swscale SHARED IMPORTED)
set_target_properties(swscale PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libswscale.so)

add_library(swresample SHARED IMPORTED)
set_target_properties(swresample PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libswresample.so)

add_library(ffmpeg_cli STATIC IMPORTED)
set_target_properties(ffmpeg_cli PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/libffmpeg_cli.a)

# Create our native library
add_library(helloworldffmpeg SHARED
        hello_jni_android.cpp
        ../../../../../tools/helloworld_av.c
        ../../../../../tools/ffmpeg_execute.c)

# Link libraries
target_link_libraries(helloworldffmpeg
        ${log-lib}
        ${android-lib}
        ffmpeg_cli
        avformat
        avcodec
        avutil
        swscale
        swresample
        z
        m)