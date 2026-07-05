<div align="center">

<img src="assets/images/pulse-mark-master.png" alt="Pulse app icon" width="120" />

# Pulse

**Short-form institutional video — record and edit on-device, upload to your own server.**

[![React Native](https://img.shields.io/badge/React%20Native-0.85-61DAFB?logo=react&logoColor=white)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-56-000020?logo=expo&logoColor=white)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Whisper](https://img.shields.io/badge/Whisper-on--device-4B8BBE)](https://github.com/mybigday/whisper.rn)
[![VisionCamera](https://img.shields.io/badge/VisionCamera-v5-FF6B6B)](https://react-native-vision-camera.com)

_Capture knowledge before it walks out the door — training walkthroughs, process demos, handoffs — without sending a single frame to a third-party cloud._

</div>

---

Pulse is a React Native (Expo) app for capturing institutional knowledge as short-form video. Everything happens on the device: segmented recording, trimming, merging, and even speech-to-text captioning run locally. When you're ready to publish, Pulse uploads to a [**PulseVault**](#pulsevault--self-hosted-uploads) server _you_ run — your organization keeps the content on its own infrastructure and owns auth, retention, and quota decisions. No central Pulse service exists.

## Highlights

- 🎬 **Segmented recording** — build a walkthrough from multiple clips, reorder them, re-record the ones you fumbled
- ✂️ **Non-compounding edits** — trims re-encode from the pristine original every time, so re-editing never stacks generation loss
- 🗣️ **On-device captions** — Whisper (whisper.cpp) transcription with word-level timing, no audio ever leaves the phone
- 📡 **Resumable uploads** — TUS v1 protocol; a two-minute capture survives signal drops, app kills, and relaunches
- 🔐 **Self-hosted by design** — pair with your server via QR / deep link; capability tokens live in the device keychain
- 📦 **Local-first drafts** — SQLite-backed library that works fully offline, shareable device-to-device as `.pulse` bundles

## Features

### Recording & camera

- Multi-clip segmented recording with [VisionCamera](https://react-native-vision-camera.com) v5 — segments append to one draft with a live segment bar and drag-to-reorder
- Front/back flip, torch, mic mute, tap-to-focus, pinch-to-zoom, lens selection, and stabilization modes (off / standard / cinematic / auto), all persisted across sessions
- Call-aware capture: a custom native module (CallKit on iOS) gates the microphone during phone/VoIP calls so recordings don't silently freeze
- Import existing videos from Photos instead of recording

### Editing & export

- Per-clip trim and transform via FFmpeg — destructive but safe: re-editing always reopens the untouched original
- Smart merge on export: clips with matching formats are concatenated losslessly (passthrough); mixed resolution/fps/codec/orientation drafts conform only the outlier clips, with a full re-encode fallback
- Save to Photos or Files, share anywhere, or upload — with a live progress ring

### Captions & transcription

- Fully on-device speech-to-text with [whisper.rn](https://github.com/mybigday/whisper.rn) — choose Base (en), Small (en), Small multilingual, or Large-v3-turbo, downloaded on demand
- Silero VAD pre-gate skips silent clips and suppresses Whisper's hallucinated filler on empty audio
- Word-level timestamps reflowed into broadcast-style cues (line-length, duration, and sentence-boundary aware)
- Optimistic caption editor with autosave and undoable edit history — hand-edited cues are protected from being overwritten by re-transcription or model switches
- Captions upload as WebVTT with word-level cue timestamps (karaoke-ready) alongside the video

### Drafts & library

- Local-first draft library on Drizzle ORM + SQLite — create, rename, delete, with live-updating thumbnails
- Device-to-device draft sharing as `.pulse` bundles (zip + manifest, with unpack safety limits)
- First-run onboarding tour

### Upload & pairing

- Pair with a server by scanning a QR / opening a `pulsecam://` deep link — trust-on-first-use confirmation, capability negotiation against the server's `/capabilities` endpoint
- TUS v1 resumable uploads with exponential backoff; interrupted uploads resume from the server's true byte offset, even after an app relaunch
- Two upload strategies, negotiated per server: **merged** (one video + captions + beat-timecode manifest + thumbnail) or **segment** (per-segment clips + an ordering manifest)
- Bearer tokens stored in the secure keychain, never in the database

## How it works

```
┌─────────────────────────── on device ───────────────────────────┐
│                                                                  │
│  Record (VisionCamera) ─▶ Trim/Merge (FFmpeg) ─▶ Draft (SQLite)  │
│                                │                                 │
│                    Whisper + VAD ─▶ captions (VTT)               │
│                                                                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │  pair via pulsecam:// QR / deep link
                               ▼
                 TUS v1 resumable upload (video + VTT)
                               │
                               ▼
                ┌──────────────────────────────┐
                │   PulseVault (self-hosted)   │
                │  your auth · your storage    │
                └──────────────────────────────┘
```

### PulseVault — self-hosted uploads

The server side lives in [`pulsevault-mieweb/`](pulsevault-mieweb/): a Fastify plugin (with a framework-agnostic core for Express, Meteor, or plain Node `http`) that receives Pulse uploads into filesystem-first storage, with `authorize` / `validatePayload` / `onUploadComplete` hooks for wiring in your SSO, audit trail, transcoding, or AI pipeline. The wire contract is documented in [PROTOCOL.md](pulsevault-mieweb/PROTOCOL.md) — an implementation-independent spec (capability discovery, artifact kinds, tokens, TUS) so anyone can build a compatible server.

## Getting started

> **Git LFS required.** The dev-seed video fixtures in `assets/dev/*.mp4` are stored in [Git LFS](https://git-lfs.com). Install it before cloning (or pull after), otherwise those files arrive as tiny pointer stubs and the dev `+ seed` button breaks:
>
> ```bash
> brew install git-lfs && git lfs install   # one-time
> git lfs pull                              # if you cloned before installing
> ```
>
> The ~400 MB fixture-regen master (`fixtures/bbb_master.mov`) is intentionally excluded from normal clones (see `.lfsconfig`); fetch it only when regenerating fixtures: `git lfs pull --include "fixtures/*.mov"`.

```bash
# 1. Install dependencies
npm install

# 2. Run a development build (native modules — Expo Go won't work)
npm run ios       # or: npm run android
```

Pulse uses native modules (VisionCamera, Whisper, FFmpeg), so it needs a **dev build**, not Expo Go.

**No camera? No problem.** In a dev build, the Home screen has `+ seed` / `clear` buttons that create a "Dev sample" draft from the bundled `assets/dev/` clips — including deliberately mismatched resolution/fps/codec/orientation clips that exercise the export-normalization path — so the full editor is drivable on a simulator. See [assets/dev/README.md](assets/dev/README.md).

## Development

### Commands

| Command                           | What it does                 |
| --------------------------------- | ---------------------------- |
| `npm start`                       | Start the Metro dev server   |
| `npm run ios` / `npm run android` | Build & run the dev client   |
| `npm test`                        | Run the Jest unit-test suite |
| `npm run lint`                    | ESLint via `expo lint`       |
| `npm run format`                  | Prettier                     |

### Project structure

```
src/
├── app/            # expo-router screens: home, recorder, subtitles, export, onboarding
├── features/       # recorder, transcription, export, upload, draft-transfer, home, …
├── db/             # Drizzle ORM schema + queries (expo-sqlite)
├── components/     # shared themed UI
└── dev/            # __DEV__-only seed tooling (dead-code-eliminated in release)
modules/            # custom native modules (expo-call-detector)
plugins/            # Expo config plugins
pulsevault-mieweb/  # self-hosted upload server + protocol spec
fixtures/           # fixture-regen sources (Big Buck Bunny, CC-BY)
```

### Testing

Unit tests are co-located with the code and scoped to pure logic — cue reflow, upload/TUS state machines, deep-link parsing, edit history, autosave gating — so they run in a plain Node environment with no native rendering. PulseVault ships its own suite covering the HTTP adapters, capability tokens, and checksum handling.

```bash
npm test
```

## License

See [LICENSE](LICENSE).

---

<div align="center">

Made with ❤️ at [MIE](https://www.mieweb.com) — built on React Native, Expo, whisper.cpp, and FFmpeg.

</div>
