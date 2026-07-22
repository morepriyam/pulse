#!/bin/bash
# Regenerate the dev-seed fixture clips in assets/dev/ (§1.0b).
#
# Goal: clips that match the video surfaces the app actually meets, so the dev seed exercises
# the real ingest/normalization path on a simulator with no camera.
#
#   - SHORT-FORM PORTRAIT is the primary surface (the recorder + iPhone Camera output).
#     iPhone stores portrait as a CODED-LANDSCAPE buffer + a 90 rotation matrix (not baked
#     portrait pixels). The recorder writes a true MP4 container (fileType 'mp4'); the iPhone
#     Camera app writes QuickTime (.mov), which reaches the app via Photos imports. Portrait
#     fixtures keep QuickTime bytes under a .mp4 name so that import surface stays covered —
#     the container is not part of the merge signature, only the streams are.
#   - LANDSCAPE clips stand in for video added later from the Photos app (HEVC .mov from the
#     camera, or a plain H.264 .mp4 shared/downloaded) that must be normalized into the
#     portrait timeline.
#
# Source: Big Buck Bunny (Blender Foundation, CC-BY 3.0), a different scene per clip.
# Each clip has a burned-in progress bar + playhead (this ffmpeg has no freetype) so position
# is visible while trimming.
#
# Requires: ffmpeg with libx264 + libx265 (brew install ffmpeg).
# Usage: bash scripts/make-dev-fixtures.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/dev"
# Master lives in the repo at fixtures/bbb_master.mov via Git LFS, but is excluded from normal
# clones (.lfsconfig) since it's 400+ MB. Fetch on demand: git lfs pull --include "fixtures/*.mov"
# Override the path with BBB_MASTER=/path.
SRC="${BBB_MASTER:-$ROOT/fixtures/bbb_master.mov}"
MASTER_URL="https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_720p_h264.mov"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)"; exit 1; }
mkdir -p "$OUT"
rm -f "$OUT"/*.mp4
# Resolve the master. On a fresh clone the LFS-tracked file is a small pointer (fetchexclude),
# so pull it on demand; if it's still not a real video, download it.
is_real_video() { [ -f "$1" ] && [ "$(wc -c <"$1")" -gt 1000000 ]; }
if ! is_real_video "$SRC"; then
  if [ -f "$SRC" ] && command -v git >/dev/null && git -C "$ROOT" rev-parse >/dev/null 2>&1; then
    echo ">>> fetching master from Git LFS"; git -C "$ROOT" lfs pull --include "fixtures/*.mov" || true
  fi
  if ! is_real_video "$SRC"; then
    echo ">>> downloading master to $SRC"; mkdir -p "$(dirname "$SRC")"; curl -L --fail -o "$SRC" "$MASTER_URL"
  fi
fi

# name | orient(portrait|land) | display geom | fps | codec | container | start | dur
#   portrait geom scales to the UPRIGHT display size (WxH, H>W); the script transposes it into a
#   coded-landscape buffer and stamps a 90 rotation matrix -> iPhone-accurate portrait.
ROWS=(
  # --- primary surface: short-form portrait (iPhone / this recorder) ---
  "portrait-1080p-30fps-h264|portrait|crop=ih*9/16:ih,scale=1080:1920|30|h264|mov|200|24"  # EXACT recorder match
  "portrait-1080p-30fps-hevc|portrait|crop=ih*9/16:ih,scale=1080:1920|30|hevc|mov|60|22"   # iPhone default (HEVC)
  "portrait-1080p-60fps-hevc|portrait|crop=ih*9/16:ih,scale=1080:1920|60|hevc|mov|300|20"  # 1080p60 portrait
  "portrait-4k-60fps-hevc|portrait|crop=ih*9/16:ih,scale=2160:3840|60|hevc|mov|360|12"     # 4K60 portrait
  # --- added later from Photos / shared: landscape to normalize into portrait ---
  "landscape-1080p-30fps-h264|land|scale=1920:1080|30|h264|mp4|15|24"                      # shared/downloaded .mp4
  "landscape-4k-30fps-hevc|land|scale=3840:2160:flags=lanczos|30|hevc|mov|480|14"          # 4K landscape from Photos
)

encode_args() { # $1 codec -> echoes encoder flags
  if [ "$1" = "h264" ]; then echo "-c:v libx264 -preset veryfast -crf 24 -profile:v high -pix_fmt yuv420p"
  else echo "-c:v libx265 -preset veryfast -crf 28 -pix_fmt yuv420p -tag:v hvc1"; fi
}

for row in "${ROWS[@]}"; do
  IFS='|' read -r name orient geom fps codec container start dur <<< "$row"
  out="$OUT/$name.mp4"

  # overlays drawn in DISPLAY orientation (before any transpose): filling bar + red playhead
  vf="${geom},fps=${fps},setpts=PTS-STARTPTS"
  vf="${vf},drawbox=x=0:y=ih-18:w='iw*t/${dur}':h=18:color=yellow@0.85:thickness=fill"
  vf="${vf},drawbox=x='iw*t/${dur}-2':y=0:w=4:h=ih:color=red@0.9:thickness=fill"

  echo ">>> $name ($codec, $container, ${dur}s, $orient)"
  if [ "$orient" = "portrait" ]; then
    # step 1: transpose display->coded-landscape, encode to temp
    ffmpeg -hide_banner -loglevel error -y -ss "$start" -t "$dur" -i "$SRC" \
      -vf "${vf},transpose=1" $(encode_args "$codec") -c:a aac -b:a 128k "$TMP/$name.tmp.mov"
    # step 2: stamp a 90 rotation matrix via stream copy (iPhone-style display matrix)
    ffmpeg -hide_banner -loglevel error -y -display_rotation 90 -i "$TMP/$name.tmp.mov" \
      -c copy -tag:v hvc1 -f "$container" -movflags +faststart "$out" 2>/dev/null \
      || ffmpeg -hide_banner -loglevel error -y -display_rotation 90 -i "$TMP/$name.tmp.mov" \
           -c copy -f "$container" -movflags +faststart "$out"
  else
    ffmpeg -hide_banner -loglevel error -y -ss "$start" -t "$dur" -i "$SRC" \
      -vf "$vf" $(encode_args "$codec") -c:a aac -b:a 128k \
      -f "$container" -movflags +faststart "$out"
  fi
done

echo "ALL DONE"
ls -la "$OUT"/*.mp4