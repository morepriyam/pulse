# Dev fixture clips (§1.0b)

Sample video clips for the **dev seed** — bundled into the app so the timeline editor is
testable on a simulator/emulator with no camera. Dev-only; never shipped in production.

## How to add clips

1. Drop short `.mp4` files in this folder.
2. List each one in [`src/dev/seed.ts`](../../src/dev/seed.ts) `FIXTURES` (a static `require()` per
   file, in the order they should appear on the timeline).
3. In a dev build, tap **`+ seed`** on Home → a single `Dev sample` draft is created with these
   clips as segments. The button is idempotent — pressing it again is a no-op (`clear` resets it).

## What clips to pick

Choose clips that are **deliberately mismatched** so they stress the export normalization path:

- **Orientation:** at least one portrait (9:16) and one landscape (16:9), plus ideally one square.
- **Resolution:** mix e.g. 720p / 1080p / 4K.
- **Frame rate:** mix e.g. 30fps and 60fps.
- **Codec:** mix H.264 and HEVC if you can.
- **Length:** keep each short (~3–8s) — these are committed to the repo.

## Size / git

Keep the total small (a few MB). If any single clip is large (>~5 MB), prefer Git LFS or
`.gitignore` it and document where to fetch it, rather than bloating the repo history.
