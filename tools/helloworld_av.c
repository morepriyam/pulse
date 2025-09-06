#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libswscale/swscale.h>
#include <libswresample/swresample.h>
#include <libavutil/opt.h>
#include <libavutil/imgutils.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

/**
 * Generate a simple test video using FFmpeg native API
 * Creates a 2-second MP4 with synthetic video and audio
 */
int helloworld_av_write(const char* output_filename) {
    AVFormatContext *oc = NULL;
    AVStream *video_stream = NULL, *audio_stream = NULL;
    AVCodecContext *video_codec_ctx = NULL, *audio_codec_ctx = NULL;
    const AVCodec *video_codec = NULL, *audio_codec = NULL;
    AVFrame *video_frame = NULL, *audio_frame = NULL;
    AVPacket pkt = {0};
    struct SwsContext *sws_ctx = NULL;
    struct SwrContext *swr_ctx = NULL;
    
    int ret;
    int video_frame_count = 0;
    int audio_frame_count = 0;
    const int duration_seconds = 2;
    const int fps = 30;
    const int total_frames = duration_seconds * fps;
    const int sample_rate = 48000;
    const int audio_samples_per_frame = 1024;
    
    // Initialize FFmpeg
    av_log_set_level(AV_LOG_ERROR);
    
    // Create output format context
    ret = avformat_alloc_output_context2(&oc, NULL, "mp4", output_filename);
    if (ret < 0) {
        fprintf(stderr, "Could not create output context\n");
        return -1;
    }
    
    // Find video encoder (prefer hardware if available, fallback to software)
#ifdef __APPLE__
    video_codec = avcodec_find_encoder_by_name("h264_videotoolbox");
    if (!video_codec) {
        video_codec = avcodec_find_encoder_by_name("libx264");
    }
    if (!video_codec) {
        video_codec = avcodec_find_encoder(AV_CODEC_ID_H264);
    }
#else
    video_codec = avcodec_find_encoder_by_name("libx264");
    if (!video_codec) {
        video_codec = avcodec_find_encoder(AV_CODEC_ID_MPEG4);
    }
#endif
    
    if (!video_codec) {
        fprintf(stderr, "Could not find video encoder\n");
        goto cleanup;
    }
    
    // Find audio encoder
    audio_codec = avcodec_find_encoder(AV_CODEC_ID_AAC);
    if (!audio_codec) {
        fprintf(stderr, "Could not find audio encoder\n");
        goto cleanup;
    }
    
    // Create video stream
    video_stream = avformat_new_stream(oc, video_codec);
    if (!video_stream) {
        fprintf(stderr, "Could not create video stream\n");
        goto cleanup;
    }
    
    // Setup video codec context
    video_codec_ctx = avcodec_alloc_context3(video_codec);
    video_codec_ctx->width = 320;
    video_codec_ctx->height = 240;
    video_codec_ctx->time_base = (AVRational){1, fps};
    video_codec_ctx->framerate = (AVRational){fps, 1};
    video_codec_ctx->pix_fmt = AV_PIX_FMT_YUV420P;
    video_codec_ctx->bit_rate = 400000;
    
    if (oc->oformat->flags & AVFMT_GLOBALHEADER) {
        video_codec_ctx->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
    }
    
    // Open video codec
    ret = avcodec_open2(video_codec_ctx, video_codec, NULL);
    if (ret < 0) {
        fprintf(stderr, "Could not open video codec\n");
        goto cleanup;
    }
    
    // Copy codec parameters to stream
    avcodec_parameters_from_context(video_stream->codecpar, video_codec_ctx);
    video_stream->time_base = video_codec_ctx->time_base;
    
    // Create audio stream
    audio_stream = avformat_new_stream(oc, audio_codec);
    if (!audio_stream) {
        fprintf(stderr, "Could not create audio stream\n");
        goto cleanup;
    }
    
    // Setup audio codec context
    audio_codec_ctx = avcodec_alloc_context3(audio_codec);
    audio_codec_ctx->sample_fmt = AV_SAMPLE_FMT_FLTP;
    audio_codec_ctx->bit_rate = 64000;
    audio_codec_ctx->sample_rate = sample_rate;
    audio_codec_ctx->channel_layout = AV_CH_LAYOUT_MONO;
    audio_codec_ctx->channels = 1;
    audio_codec_ctx->frame_size = audio_samples_per_frame;
    
    if (oc->oformat->flags & AVFMT_GLOBALHEADER) {
        audio_codec_ctx->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
    }
    
    // Open audio codec
    ret = avcodec_open2(audio_codec_ctx, audio_codec, NULL);
    if (ret < 0) {
        fprintf(stderr, "Could not open audio codec\n");
        goto cleanup;
    }
    
    // Copy codec parameters to stream
    avcodec_parameters_from_context(audio_stream->codecpar, audio_codec_ctx);
    audio_stream->time_base = (AVRational){1, sample_rate};
    
    // Open output file
    if (!(oc->oformat->flags & AVFMT_NOFILE)) {
        ret = avio_open(&oc->pb, output_filename, AVIO_FLAG_WRITE);
        if (ret < 0) {
            fprintf(stderr, "Could not open output file '%s'\n", output_filename);
            goto cleanup;
        }
    }
    
    // Write header
    ret = avformat_write_header(oc, NULL);
    if (ret < 0) {
        fprintf(stderr, "Error occurred when opening output file\n");
        goto cleanup;
    }
    
    // Allocate frames
    video_frame = av_frame_alloc();
    video_frame->format = video_codec_ctx->pix_fmt;
    video_frame->width = video_codec_ctx->width;
    video_frame->height = video_codec_ctx->height;
    av_frame_get_buffer(video_frame, 0);
    
    audio_frame = av_frame_alloc();
    audio_frame->format = audio_codec_ctx->sample_fmt;
    audio_frame->channel_layout = audio_codec_ctx->channel_layout;
    audio_frame->sample_rate = audio_codec_ctx->sample_rate;
    audio_frame->nb_samples = audio_samples_per_frame;
    av_frame_get_buffer(audio_frame, 0);
    
    // Encoding loop
    while (video_frame_count < total_frames) {
        // Generate video frame (simple animated pattern)
        av_frame_make_writable(video_frame);
        
        // Fill Y plane with moving pattern
        for (int y = 0; y < video_codec_ctx->height; y++) {
            for (int x = 0; x < video_codec_ctx->width; x++) {
                video_frame->data[0][y * video_frame->linesize[0] + x] = 
                    (x + y + video_frame_count) & 0xFF;
            }
        }
        
        // Fill U and V planes
        for (int y = 0; y < video_codec_ctx->height/2; y++) {
            for (int x = 0; x < video_codec_ctx->width/2; x++) {
                video_frame->data[1][y * video_frame->linesize[1] + x] = 128;
                video_frame->data[2][y * video_frame->linesize[2] + x] = 128;
            }
        }
        
        video_frame->pts = video_frame_count;
        
        // Encode video frame
        ret = avcodec_send_frame(video_codec_ctx, video_frame);
        if (ret < 0) break;
        
        while (ret >= 0) {
            ret = avcodec_receive_packet(video_codec_ctx, &pkt);
            if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) break;
            if (ret < 0) goto cleanup;
            
            av_packet_rescale_ts(&pkt, video_codec_ctx->time_base, video_stream->time_base);
            pkt.stream_index = video_stream->index;
            av_interleaved_write_frame(oc, &pkt);
            av_packet_unref(&pkt);
        }
        
        video_frame_count++;
    }
    
    // Generate some audio frames
    const int total_audio_frames = (duration_seconds * sample_rate) / audio_samples_per_frame;
    
    for (int i = 0; i < total_audio_frames; i++) {
        av_frame_make_writable(audio_frame);
        
        float *samples = (float*)audio_frame->data[0];
        for (int j = 0; j < audio_samples_per_frame; j++) {
            samples[j] = sin(2 * M_PI * 440.0 * (audio_frame_count * audio_samples_per_frame + j) / sample_rate) * 0.1;
        }
        
        audio_frame->pts = audio_frame_count * audio_samples_per_frame;
        
        // Encode audio frame
        ret = avcodec_send_frame(audio_codec_ctx, audio_frame);
        if (ret < 0) break;
        
        while (ret >= 0) {
            ret = avcodec_receive_packet(audio_codec_ctx, &pkt);
            if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) break;
            if (ret < 0) goto cleanup;
            
            av_packet_rescale_ts(&pkt, audio_codec_ctx->time_base, audio_stream->time_base);
            pkt.stream_index = audio_stream->index;
            av_interleaved_write_frame(oc, &pkt);
            av_packet_unref(&pkt);
        }
        
        audio_frame_count++;
    }
    
    // Flush encoders
    avcodec_send_frame(video_codec_ctx, NULL);
    while (avcodec_receive_packet(video_codec_ctx, &pkt) >= 0) {
        av_packet_rescale_ts(&pkt, video_codec_ctx->time_base, video_stream->time_base);
        pkt.stream_index = video_stream->index;
        av_interleaved_write_frame(oc, &pkt);
        av_packet_unref(&pkt);
    }
    
    avcodec_send_frame(audio_codec_ctx, NULL);
    while (avcodec_receive_packet(audio_codec_ctx, &pkt) >= 0) {
        av_packet_rescale_ts(&pkt, audio_codec_ctx->time_base, audio_stream->time_base);
        pkt.stream_index = audio_stream->index;
        av_interleaved_write_frame(oc, &pkt);
        av_packet_unref(&pkt);
    }
    
    // Write trailer
    av_write_trailer(oc);
    
    ret = 0;
    printf("Successfully created: %s\n", output_filename);
    
cleanup:
    if (video_frame) av_frame_free(&video_frame);
    if (audio_frame) av_frame_free(&audio_frame);
    if (video_codec_ctx) avcodec_free_context(&video_codec_ctx);
    if (audio_codec_ctx) avcodec_free_context(&audio_codec_ctx);
    if (oc && !(oc->oformat->flags & AVFMT_NOFILE)) avio_closep(&oc->pb);
    if (oc) avformat_free_context(oc);
    
    return ret;
}