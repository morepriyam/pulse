# Dev fixture clips (§1.0b)

Sample video clips for the **dev seed** — bundled into the app so the timeline editor is
testable on a simulator/emulator with no camera. Dev-only; never shipped in production.

## Current clips

Chosen to match the **video surfaces the app actually meets**, so the seed exercises the real
ingest / normalization path. Derived from [Big Buck Bunny](https://peach.blender.org/) (Blender
Foundation, CC-BY 3.0), a different scene per clip. Each has a burned-in **progress bar + playhead**
(this ffmpeg has no freetype, so a sweeping bar stands in for a timecode) so position is visible
while trimming.

**Portrait** is the primary surface (short-form — the recorder & iPhone Camera). iPhone stores
portrait as a **coded-landscape buffer + 90° rotation matrix** in a **QuickTime** container, _not_
baked-portrait pixels — these fixtures replicate that exactly (so the rotation/normalization path is
actually tested). The **landscape** clips stand in for video added later from the Photos app that
must be normalized into the portrait timeline.

| file                             | display   | coded     | rot | fps | codec | container | len |
| -------------------------------- | --------- | --------- | --- | --- | ----- | --------- | --- |
| `portrait-1080p-30fps-h264.mp4`  | 1080×1920 | 1920×1080 | 90° | 30  | H.264 | QuickTime | 24s |
| `portrait-1080p-30fps-hevc.mp4`  | 1080×1920 | 1920×1080 | 90° | 30  | HEVC  | QuickTime | 22s |
| `portrait-1080p-60fps-hevc.mp4`  | 1080×1920 | 1920×1080 | 90° | 60  | HEVC  | QuickTime | 20s |
| `portrait-4k-60fps-hevc.mp4`     | 2160×3840 | 3840×2160 | 90° | 60  | HEVC  | QuickTime | 12s |
| `landscape-1080p-30fps-h264.mp4` | 1920×1080 | 1920×1080 | —   | 30  | H.264 | MP4       | 24s |
| `landscape-4k-30fps-hevc.mp4`    | 3840×2160 | 3840×2160 | —   | 30  | HEVC  | QuickTime | 14s |

The `portrait-1080p-30fps-h264` clip mirrors **this recorder's exact output** (H.264/AAC 1080p30
portrait, QuickTime bytes named `.mp4`). All have AAC audio and are ~12–24s so there's room to trim.
Regenerate with [`scripts/make-dev-fixtures.sh`](../../scripts/make-dev-fixtures.sh).

## How to add / change clips

1. Drop short `.mp4` files in this folder.
2. List each one in [`src/dev/seed.ts`](../../src/dev/seed.ts) `FIXTURES` (a static `require()` per
   file, in the order they should appear on the timeline).
3. In a dev build, tap **`+ seed`** on Home → a single `Dev sample` draft is created with these
   clips as segments. The button is idempotent — pressing it again is a no-op (`clear` resets it).

## What clips to pick

Mirror the **real video surfaces the app meets**, and span enough variety to stress normalization:

- **Orientation:** mostly **portrait (9:16)** — the short-form primary; plus some **landscape (16:9)**
  to normalize in. iPhone portrait is a coded-landscape buffer + a 90° rotation matrix, so include
  rotation-tagged clips (the script does this), not just baked-portrait pixels.
- **Resolution:** mix 1080p and 4K. **Frame rate:** mix 30fps and 60fps.
- **Codec:** mix H.264 and HEVC. **Container:** mix QuickTime (camera) and plain MP4 (shared).
- **Length:** ~12–24s so there's room to trim.

## Size / git

The clips (~25 MB total) are **committed directly** so `+ seed` works straight after a clone with no
extra tooling. They rarely change; regenerate with the script rather than hand-editing. If this set
grows much larger, move it to Git LFS (`git lfs track "assets/dev/*.mp4"`) to keep history lean.
