#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>

// Forward declaration of ffmpeg_main from the CLI library
extern int ffmpeg_main(int argc, char **argv);

/**
 * Execute FFmpeg CLI command by parsing a command string and calling ffmpeg_main
 * @param command_line The FFmpeg command line (without "ffmpeg" prefix)
 * @return 0 on success, non-zero on failure
 */
int ffmpeg_execute(const char* command_line) {
    if (!command_line) {
        fprintf(stderr, "Error: command_line is NULL\n");
        return -1;
    }
    
    // Count arguments by counting spaces + 1, plus "ffmpeg" prefix
    int argc = 2; // Start with "ffmpeg" + first arg
    const char* p = command_line;
    while (*p) {
        if (*p == ' ' && *(p+1) != ' ' && *(p+1) != '\0') {
            argc++;
        }
        p++;
    }
    
    // Allocate argv array
    char** argv = malloc(sizeof(char*) * (argc + 1));
    if (!argv) {
        fprintf(stderr, "Error: Could not allocate memory for argv\n");
        return -1;
    }
    
    // Set program name
    argv[0] = strdup("ffmpeg");
    
    // Parse command line into arguments
    int arg_index = 1;
    char* cmd_copy = strdup(command_line);
    char* token = strtok(cmd_copy, " ");
    
    while (token && arg_index < argc) {
        argv[arg_index] = strdup(token);
        arg_index++;
        token = strtok(NULL, " ");
    }
    argv[argc] = NULL;
    
    printf("Executing FFmpeg command with %d arguments:\n", argc);
    for (int i = 0; i < argc; i++) {
        printf("  argv[%d] = '%s'\n", i, argv[i]);
    }
    
    // Call the FFmpeg main function
    int result = ffmpeg_main(argc, argv);
    
    // Cleanup
    for (int i = 0; i < argc; i++) {
        free(argv[i]);
    }
    free(argv);
    free(cmd_copy);
    
    return result;
}

/**
 * Helper function to create a test video using FFmpeg CLI
 * Uses lavfi (libavfilter) test sources to generate synthetic content
 */
int create_test_video_cli(const char* output_filename) {
    char command[1024];
    
    // Build FFmpeg command for generating test video
    // Uses lavfi test sources: testsrc for video, anullsrc for audio
#ifdef __APPLE__
    // On Apple platforms, prefer VideoToolbox encoder
    snprintf(command, sizeof(command),
        "-hide_banner -f lavfi -i testsrc=size=320x240:rate=30 "
        "-f lavfi -i anullsrc=channel_layout=mono:sample_rate=48000 "
        "-t 2 -shortest -c:v h264_videotoolbox -c:a aac -y %s",
        output_filename);
#else
    // On other platforms, use software encoder or MediaCodec on Android
    snprintf(command, sizeof(command),
        "-hide_banner -f lavfi -i testsrc=size=320x240:rate=30 "
        "-f lavfi -i anullsrc=channel_layout=mono:sample_rate=48000 "
        "-t 2 -shortest -c:v mpeg4 -q:v 5 -c:a aac -y %s",
        output_filename);
#endif
    
    printf("Creating test video using FFmpeg CLI: %s\n", output_filename);
    printf("Command: %s\n", command);
    
    return ffmpeg_execute(command);
}