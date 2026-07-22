#!/bin/bash
# Regenerate the WILD-IMPORT fixture clips in assets/dev/import/ (§1.0b).
#
# Goal: cover the video formats the app actually meets when users add clips from the Photos
# library — the inputs that break naive pipelines — so import normalization, merge and upload
# compression can be exercised on a simulator with no camera. Complements make-dev-fixtures.sh
# (which covers the recorder-adjacent formats); this corpus is the "everything else":
#
#   - HDR 10-bit (HLG + PQ): iPhone 12+ records Dolby Vision profile 8.4 by default, whose
#     base layer is 10-bit HEVC with an HLG transfer function; PQ covers HDR10 downloads.
#     10-bit input famously fails h264_videotoolbox unless the pixel format is normalized.
#   - Slo-mo (120 fps), NTSC-fractional (29.97), and VFR timing: fps outliers vs the 30 fps pin.
#   - Messaging/screen-capture geometry: WhatsApp-style low-bitrate 848x464 baseline H.264,
#     iOS screen-recording-style 886x1920 (true portrait pixels, NO rotation matrix).
#   - Rotation matrix variants beyond 90 (270), square 1:1 aspect.
#   - Audio outliers: no audio track (timelapse), Opus-in-mp4 (yt-dlp style downloads, must be
#     transcoded to AAC for mp4 output), mono 44.1 kHz (voice-first apps).
#
# The HDR clips are HDR-TAGGED 10-bit encodes of the SDR master (VUI + colr atom carry
# bt2020/HLG|PQ), not remastered HDR — that is exactly what trips AVFoundation's
# `.containsHDRVideo` and 10-bit-input encoder failures, which is what the corpus tests.
#
# Source: Big Buck Bunny (Blender Foundation, CC-BY 3.0), a different scene per clip.
# Each clip has a burned-in progress bar + playhead so position is visible while trimming.
#
# Requires: ffmpeg with libx264 + libx265(10-bit) + libopus (brew install ffmpeg).
# Usage: bash scripts/make-import-fixtures.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/dev/import"
# Master lives in the repo at fixtures/bbb_master.mov via Git LFS, but is excluded from normal
# clones (.lfsconfig) since it's 400+ MB. Fetch on demand: git lfs pull --include "fixtures/*.mov"
SRC="${BBB_MASTER:-$ROOT/fixtures/bbb_master.mov}"
MASTER_URL="https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_720p_h264.mov"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)"; exit 1; }
mkdir -p "$OUT"
rm -f "$OUT"/*.mp4

is_real_video() { [ -f "$1" ] && [ "$(wc -c <"$1")" -gt 1000000 ]; }
if ! is_real_video "$SRC"; then
  if [ -f "$SRC" ] && command -v git >/dev/null && git -C "$ROOT" rev-parse >/dev/null 2>&1; then
    echo ">>> fetching master from Git LFS"; git -C "$ROOT" lfs pull --include "fixtures/*.mov" || true
  fi
  if ! is_real_video "$SRC"; then
    echo ">>> downloading master to $SRC"; mkdir -p "$(dirname "$SRC")"; curl -L --fail -o "$SRC" "$MASTER_URL"
  fi
fi

DUR=8

# Progress bar + red playhead, drawn in display orientation (before any transpose).
# NOTE: drawbox evaluates its w/x expressions ONCE at init (t is NaN there -> a static
# full-width box), so the animation must come from the two-input `overlay` filter, whose
# x/y are evaluated per frame (eval=frame is its default). A solid yellow strip slides in
# from the left (fill = W*t/dur) and a red strip tracks the fill edge as the playhead.
# The 4200 px strips cover every fixture geometry (up to 4K); `d=` bounds the color
# sources so the graph reaches EOF with the video track.
overlay() { # $1 duration
  echo "null[__m];color=yellow@0.85:s=4200x18:d=$1[__bar];[__m][__bar]overlay=x='-w+W*t/$1':y=H-18:shortest=0[__m2];color=red@0.9:s=4x4200:d=$1[__ph];[__m2][__ph]overlay=x='W*t/$1-2':y=0:shortest=0"
}

# Scale+overlay chain for a clip cut from the master (the cut itself happens via the
# caller's `ffmpeg -ss/-t` input options). $1 dur  $2 display-geometry filter
base_vf() { echo "$2,setpts=PTS-STARTPTS,$(overlay "$1")"; }

AAC="-c:a aac -b:a 128k -ar 48000 -ac 2"

# Portrait fixtures replicate the iPhone layout exactly: coded-LANDSCAPE buffer (transpose the
# display-portrait pixels) + a rotation display matrix stamped via stream-copy remux.
#   transpose=1 (90 CW) pairs with -display_rotation 90; transpose=2 (90 CCW) with 270.
stamp_rotation() { # $1 tmpfile  $2 rotation  $3 out
  ffmpeg -hide_banner -loglevel error -y -display_rotation "$2" -i "$1" \
    -c copy -movflags +faststart "$3"
}

echo ">>> 1/12 hdr-hlg-portrait-1080p-30-hevc10 (iPhone 12+ HDR default: 10-bit HEVC, HLG, rot 90)"
ffmpeg -hide_banner -loglevel error -y -ss 120 -t $DUR -i "$SRC" \
  -vf "$(base_vf $DUR 'crop=ih*9/16:ih,scale=1080:1920'),fps=30,transpose=1,format=yuv420p10le,setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc" \
  -c:v libx265 -preset veryfast -crf 28 -tag:v hvc1 \
  -x265-params "colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc" \
  -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc \
  $AAC "$TMP/hlg.mp4"
stamp_rotation "$TMP/hlg.mp4" 90 "$OUT/hdr-hlg-portrait-1080p-30-hevc10.mp4"

echo ">>> 2/12 hdr-pq-landscape-4k-30-hevc10 (HDR10/PQ download)"
ffmpeg -hide_banner -loglevel error -y -ss 160 -t $DUR -i "$SRC" \
  -vf "$(base_vf $DUR 'scale=3840:2160:flags=lanczos'),fps=30,format=yuv420p10le,setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc" \
  -c:v libx265 -preset veryfast -crf 30 -tag:v hvc1 \
  -x265-params "colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc" \
  -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc \
  $AAC -movflags +faststart "$OUT/hdr-pq-landscape-4k-30-hevc10.mp4"

echo ">>> 3/12 slomo-portrait-1080p-120-h264 (slo-mo export: 120 fps)"
ffmpeg -hide_banner -loglevel error -y -ss 200 -t $DUR -i "$SRC" \
  -vf "$(base_vf $DUR 'crop=ih*9/16:ih,scale=1080:1920'),fps=120,transpose=1" \
  -c:v libx264 -preset veryfast -crf 26 -profile:v high -pix_fmt yuv420p \
  $AAC "$TMP/slomo.mp4"
stamp_rotation "$TMP/slomo.mp4" 90 "$OUT/slomo-portrait-1080p-120-h264.mp4"

echo ">>> 4/12 whatsapp-848x464-30-h264-baseline (messaging re-encode: low bitrate, 44.1k audio)"
ffmpeg -hide_banner -loglevel error -y -ss 240 -t $DUR -i "$SRC" \
  -vf "$(base_vf $DUR 'scale=848:464'),fps=30" \
  -c:v libx264 -preset veryfast -profile:v baseline -level 3.1 -b:v 700k -pix_fmt yuv420p \
  -c:a aac -b:a 64k -ar 44100 -ac 2 -movflags +faststart \
  "$OUT/whatsapp-848x464-30-h264-baseline.mp4"

echo ">>> 5/12 screenrec-portrait-886x1920-60-h264 (screen recording: baked portrait, no rotation matrix, non-mod-16 width)"
ffmpeg -hide_banner -loglevel error -y -ss 280 -t $DUR -i "$SRC" \
  -vf "$(base_vf $DUR 'crop=ih*886/1920:ih,scale=886:1920'),fps=60" \
  -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p \
  $AAC -movflags +faststart "$OUT/screenrec-portrait-886x1920-60-h264.mp4"

echo ">>> 6/12 vfr-portrait-1080p-h264 (variable frame timing: irregular frame drops + vfr mux)"
# Deterministic irregular drop pattern (keep n%2==0 or n%3==0 -> deltas 2,1,1,2,...) muxed VFR,
# so avg_frame_rate disagrees with r_frame_rate like real screen/Android captures.
ffmpeg -hide_banner -loglevel error -y -ss 320 -t $DUR -i "$SRC" \
  -vf "crop=ih*9/16:ih,scale=1080:1920,setpts=PTS-STARTPTS,$(overlay $DUR),fps=60,select='not(mod(n\,2))+not(mod(n\,3))'" \
  -fps_mode vfr -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p \
  $AAC -movflags +faststart "$OUT/vfr-portrait-1080p-h264.mp4"

echo ">>> 7/12 timelapse-landscape-1080p-30-hevc-noaudio (timelapse: 8x speed, NO audio track)"
ffmpeg -hide_banner -loglevel error -y -ss 360 -t $((DUR * 8)) -i "$SRC" \
  -vf "scale=1920:1080,setpts=(PTS-STARTPTS)/8,fps=30,$(overlay $DUR)" \
  -c:v libx265 -preset veryfast -crf 28 -pix_fmt yuv420p -tag:v hvc1 \
  -an -movflags +faststart "$OUT/timelapse-landscape-1080p-30-hevc-noaudio.mp4"

echo ">>> 8/12 opus-landscape-1080p-30-h264 (download-style: Opus audio in mp4, must transcode to AAC)"
ffmpeg -hide_banner -loglevel error -y -ss 430 -t $DUR -i "$SRC" \
  -vf "$(base_vf $DUR 'scale=1920:1080'),fps=30" \
  -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p \
  -c:a libopus -b:a 96k -ac 2 -strict -2 -movflags +faststart \
  "$OUT/opus-landscape-1080p-30-h264.mp4"

echo ">>> 9/12 rot270-portrait-1080p-30-hevc (rotation matrix 270 instead of 90)"
ffmpeg -hide_banner -loglevel error -y -ss 470 -t $DUR -i "$SRC" \
  -vf "$(base_vf $DUR 'crop=ih*9/16:ih,scale=1080:1920'),fps=30,transpose=2" \
  -c:v libx265 -preset veryfast -crf 28 -pix_fmt yuv420p -tag:v hvc1 \
  $AAC "$TMP/rot270.mp4"
stamp_rotation "$TMP/rot270.mp4" 270 "$OUT/rot270-portrait-1080p-30-hevc.mp4"

echo ">>> 10/12 square-720x720-30-h264 (1:1 aspect)"
ffmpeg -hide_banner -loglevel error -y -ss 510 -t $DUR -i "$SRC" \
  -vf "$(base_vf $DUR 'crop=ih:ih,scale=720:720'),fps=30" \
  -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p \
  $AAC -movflags +faststart "$OUT/square-720x720-30-h264.mp4"

echo ">>> 11/12 ntsc-landscape-1080p-2997-h264 (fractional 30000/1001 fps)"
ffmpeg -hide_banner -loglevel error -y -ss 545 -t $DUR -i "$SRC" \
  -vf "$(base_vf $DUR 'scale=1920:1080'),fps=30000/1001" \
  -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p \
  $AAC -movflags +faststart "$OUT/ntsc-landscape-1080p-2997-h264.mp4"

echo ">>> 12/12 mono44k-portrait-1080p-30-h264 (audio outlier: mono 44.1 kHz)"
ffmpeg -hide_banner -loglevel error -y -ss 570 -t $DUR -i "$SRC" \
  -vf "$(base_vf $DUR 'crop=ih*9/16:ih,scale=1080:1920'),fps=30,transpose=1" \
  -c:v libx264 -preset veryfast -crf 24 -profile:v high -pix_fmt yuv420p \
  -c:a aac -b:a 96k -ar 44100 -ac 1 "$TMP/mono.mp4"
stamp_rotation "$TMP/mono.mp4" 90 "$OUT/mono44k-portrait-1080p-30-h264.mp4"

echo "ALL DONE"
ls -la "$OUT"/*.mp4
