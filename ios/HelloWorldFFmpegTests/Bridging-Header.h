//
//  Bridging-Header.h
//  HelloWorldFFmpegTests
//

#ifndef Bridging_Header_h
#define Bridging_Header_h

#include <stdio.h>

// Function declarations for C functions called from Swift
int helloworld_av_write(const char* output_filename);
int ffmpeg_execute(const char* command_line);

#endif /* Bridging_Header_h */