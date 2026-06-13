#!/bin/bash
# Regenerate the SPEED-TEST fixture clips in assets/dev/speed/ (§1.0b, speed drafts).
#
# Purpose: short (~6s) clips used to seed two large drafts that stress merge SPEED at a
# realistic scale (~20 segments / ~2 min), without bloating the bundle. The seed references
# each bundled clip multiple times (every segment is copied to its own file on disk), so this
# script only needs to emit ONE clip per distinct format:
#
#   - "Dev sample 2 (uniform)"  → 20× `portrait-h264` → all one signature → lossless passthrough
#     join (the production fast path). Measures how the fast path scales to a real 2-min draft.
#   - "Dev sample 3 (mixed)"    → 14× `portrait-h264` (dominant) + 6 outliers (hevc/60/4K/land)
#     → selective conform: only the outliers re-encode, then passthrough-join. Real-world cost.
#
# Same iPhone-accurate portrait handling as scripts/make-dev-fixtures.sh: portrait is a
# coded-landscape buffer + a 90° rotation matrix in a QuickTime container (not baked pixels).
#
# Requires: ffmpeg with libx264 + libx265 (brew install ffmpeg).
# Usage: bash scripts/make-speed-fixtures.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/dev/speed"
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

# name | orient(portrait|land) | display geom | fps | codec | container | start | dur
#   one clip per distinct format; the seed repeats them to build the 20-segment drafts.
ROWS=(
  "portrait-h264|portrait|crop=ih*9/16:ih,scale=1080:1920|30|h264|mov|200|6"   # recorder match — the dominant
  "portrait-hevc|portrait|crop=ih*9/16:ih,scale=1080:1920|30|hevc|mov|60|6"    # iPhone default (HEVC)
  "portrait-60|portrait|crop=ih*9/16:ih,scale=1080:1920|60|hevc|mov|300|6"     # 1080p60 portrait
  "portrait-4k|portrait|crop=ih*9/16:ih,scale=2160:3840|60|hevc|mov|360|6"     # 4K60 portrait
  "landscape-1080|land|scale=1920:1080|30|h264|mp4|15|6"                       # shared/downloaded .mp4
  "landscape-4k|land|scale=3840:2160:flags=lanczos|30|hevc|mov|480|6"          # 4K landscape from Photos
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
    ffmpeg -hide_banner -loglevel error -y -ss "$start" -t "$dur" -i "$SRC" \
      -vf "${vf},transpose=1" $(encode_args "$codec") -c:a aac -b:a 128k "$TMP/$name.tmp.mov"
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
