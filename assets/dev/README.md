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

## Speed-test clips (`speed/`)

[`speed/`](speed/) holds short (~6s) clips for two **large** drafts used to measure merge
**speed** at a realistic scale (~20 segments / ~2 min). Generate with
[`scripts/make-speed-fixtures.sh`](../../scripts/make-speed-fixtures.sh); seed via the dev
buttons **`+ s2`** / **`+ s3`** on Home (one draft each, idempotent; `clear` resets them).

| draft                    | button | composition                                       | merge path                          |
| ------------------------ | ------ | ------------------------------------------------- | ----------------------------------- |
| `Dev sample 2 (uniform)` | `+ s2` | 20× `portrait-h264` (one signature)               | lossless passthrough join (fast)    |
| `Dev sample 3 (mixed)`   | `+ s3` | 14× `portrait-h264` + 6 outliers (hevc/60/4K/land) | selective conform of outliers only  |

Only one clip per distinct format is bundled (`portrait-h264`, `portrait-hevc`, `portrait-60`,
`portrait-4k`, `landscape-1080`, `landscape-4k`); the seed references them repeatedly and copies a
fresh file per segment, so the bundle stays small (~7 MB) while each draft has 20 segments.

## Wild-import clips (`import/`)

[`import/`](import/) holds one clip per **hostile real-world import format** — the Photos-library
inputs that break naive pipelines. Together with the recorder-adjacent clips above, this is the
**acceptance corpus for import normalization, merge, and upload compression**: every clip must
survive import → (normalize) → merge → upload with no manual intervention. Generate with
[`scripts/make-import-fixtures.sh`](../../scripts/make-import-fixtures.sh); seed via **`+ s4`** on
Home (`Dev sample 4 (wild imports)`, idempotent; `clear` resets it).

Each clip maps to a documented real-world source:

| file                                          | real-world source                              | stresses                                              |
| --------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `hdr-hlg-portrait-1080p-30-hevc10.mp4`        | iPhone 12+ camera default (Dolby Vision 8.4 → HLG base layer) | 10-bit input to 8-bit hardware encoders; HDR tone-map |
| `hdr-pq-landscape-4k-30-hevc10.mp4`           | HDR10 downloads/exports                        | second HDR transfer curve (PQ), 4K                    |
| `slomo-portrait-1080p-120-h264.mp4`           | slo-mo export from Photos                      | fps far beyond the 30 fps pin                         |
| `whatsapp-848x464-30-h264-baseline.mp4`       | WhatsApp/messaging re-encode                   | odd geometry, Baseline profile, 44.1 kHz low-bitrate audio |
| `screenrec-portrait-886x1920-60-h264.mp4`     | iOS screen recording                           | baked portrait (NO rotation matrix), non-mod-16 width, 60 fps |
| `vfr-portrait-1080p-h264.mp4`                 | screen recs / Android cameras                  | variable frame timing (`avg_frame_rate` ≠ `r_frame_rate`) |
| `timelapse-landscape-1080p-30-hevc-noaudio.mp4` | iPhone timelapse / muted exports             | **no audio track** signature branch                   |
| `opus-landscape-1080p-30-h264.mp4`            | yt-dlp-style downloads                         | Opus-in-mp4 audio → must transcode to AAC             |
| `rot270-portrait-1080p-30-hevc.mp4`           | upside-down capture / Android sensor mounts    | rotation matrix 270° (only 90° elsewhere)             |
| `square-720x720-30-h264.mp4`                  | Instagram-style 1:1                            | non-16:9 canvas                                       |
| `ntsc-landscape-1080p-2997-h264.mp4`          | NTSC-fractional content (very common)          | 30000/1001 fps vs exact-30 signature matching         |
| `mono44k-portrait-1080p-30-h264.mp4`          | voice-first apps / front camera                | mono 44.1 kHz audio outlier                           |

The two HDR clips are **HDR-tagged 10-bit encodes** of the SDR master (VUI + `colr` atom carry
bt2020 + HLG/PQ) rather than remastered HDR — which is exactly what trips AVFoundation's
`.containsHDRVideo` and 10-bit encoder failures, i.e. what the corpus tests.

## Size / git (Git LFS)

The clips (~25 MB + ~23 MB `import/`) are stored in **Git LFS** (per-folder globs in
[`.gitattributes`](../../.gitattributes): `assets/dev/*.mp4`, `assets/dev/speed/*.mp4`,
`assets/dev/import/*.mp4` — new fixture subfolders need their own entry) and fetched
on a normal clone, so `+ seed` works out of the box — just have `git lfs` installed. The regen master
(`fixtures/bbb_master.mov`, ~400 MB) is **also** in LFS but **excluded from normal clones** via
[`.lfsconfig`](../../.lfsconfig); fetch it only when regenerating:

```sh
git lfs pull --include "fixtures/*.mov"   # the make-dev-fixtures script does this automatically
```

They rarely change — regenerate with the script rather than hand-editing.
