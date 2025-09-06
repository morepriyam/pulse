#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Function declarations
extern int helloworld_av_write(const char* output_filename);
extern int ffmpeg_execute(const char* command_line);
extern int create_test_video_cli(const char* output_filename);

void print_usage(const char* program_name) {
    printf("Usage: %s <mode> <output_file>\n", program_name);
    printf("Modes:\n");
    printf("  native  - Use FFmpeg native API\n");
    printf("  cli     - Use embedded FFmpeg CLI\n");
    printf("\nExamples:\n");
    printf("  %s native helloworld.mp4\n", program_name);
    printf("  %s cli helloworld_cli.mp4\n", program_name);
}

int main(int argc, char* argv[]) {
    if (argc != 3) {
        print_usage(argv[0]);
        return 1;
    }
    
    const char* mode = argv[1];
    const char* output_file = argv[2];
    
    printf("FFmpeg Hello World Test - macOS\n");
    printf("Mode: %s\n", mode);
    printf("Output: %s\n", output_file);
    printf("=====================================\n");
    
    int result;
    
    if (strcmp(mode, "native") == 0) {
        printf("Using FFmpeg native API...\n");
        result = helloworld_av_write(output_file);
    } else if (strcmp(mode, "cli") == 0) {
        printf("Using embedded FFmpeg CLI...\n");
        result = create_test_video_cli(output_file);
    } else {
        fprintf(stderr, "Error: Unknown mode '%s'\n", mode);
        print_usage(argv[0]);
        return 1;
    }
    
    if (result == 0) {
        printf("✅ Success: Created %s using %s method\n", output_file, mode);
    } else {
        printf("❌ Failed: Error %d creating %s\n", result, output_file);
    }
    
    return result;
}