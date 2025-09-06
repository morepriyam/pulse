#include <stdio.h>
#include <stdlib.h>

// Function declaration
extern int helloworld_av_write(const char* output_filename);

int main(int argc, char* argv[]) {
    if (argc != 2) {
        printf("Usage: %s <output_file>\n", argv[0]);
        return 1;
    }
    
    const char* output_file = argv[1];
    
    printf("FFmpeg Hello World Test - Linux Demo\n");
    printf("Output: %s\n", output_file);
    printf("=====================================\n");
    
    printf("Using FFmpeg native API...\n");
    int result = helloworld_av_write(output_file);
    
    if (result == 0) {
        printf("✅ Success: Created %s using native API\n", output_file);
    } else {
        printf("❌ Failed: Error %d creating %s\n", result, output_file);
    }
    
    return result;
}