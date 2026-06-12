# Android Parity — RNVT engine + app features

> **What this is.** The working checklist for bringing Android to parity with everything built on the RNVT fork: the iOS AVFoundation perf engine (passthrough trim + 3-path merge), the editor/export features that consume it, and the app-side platform assumptions that have only ever been validated on iOS. Pick this up when an emulator/Android device is available. Companion docs: [rnvt-fork-and-release.md](rnvt-fork-and-release.md) (submodule mechanics), [implementation-status.md](implementation-status.md) (overall build state).
>
> **Captured:** 2026-06-11 (from a full audit of the fork's `ios/` vs `android/` sources and every app call site). Nothing here is implemented on Android yet — the fork's Android module is untouched upstream FFmpeg code.

---

## 1. Where things stand

The fork ([modules/react-native-video-trim](../modules/react-native-video-trim), commit `b95ce34` "feat(ios): AVFoundation passthrough engine for merge and trim") changed **iOS only** (+634/−207 in `ios/VideoTrim.swift`). Android (`android/src/main/java/com/videotrim/BaseVideoTrimModule.kt`) is still entirely FFmpeg-based:

| Capability | iOS (fork) | Android (today) |
| --- | --- | --- |
| Trim, pure cut | `passthroughTrim` — AVMutableComposition edit lists, frame-accurate, zero re-encode, ms-fast | FFmpeg `-c copy` — **keyframe-aligned only** (drifting cuts), or full re-encode with `enablePreciseTrimming` |
| Trim result flag | `usedPassthrough: true/false` | field never set |
| Merge, uniform clips | passthrough join (`usedFastPath: true`), zero re-encode, + duration-drift verification | always concat-filter **full re-encode of every clip** |
| Merge, mixed clips | selective conform (`selective: true`) — re-encode outliers only, re-probe verify, then passthrough join | same full re-encode |
| Merge fallback | legacy concat-filter (`mergeWithFilter`) | this IS the only path |
| Clip probing | `probe()` → `ClipInfo` (codec, coded WxH, rotation, fps, audio sig) | none — first clip's metadata assumed for all |
| Escape hatches | `disableFastConcat`, `disablePassthroughTrim` option flags | ignored (harmless) |
| Hardware encode | `h264_videotoolbox` / `hevc_videotoolbox` | `h264_mediacodec` → software fallback chain (exists, commit `46795bb`) |

Realistic perf gap: a uniform 10-clip merge is ~1–2s on iOS vs ~30–60s re-encode on Android; a pure-cut trim is ~0.5s vs seconds-to-minutes.

### Key iOS source map (the reference implementation)

All in [modules/react-native-video-trim/ios/VideoTrim.swift](../modules/react-native-video-trim/ios/VideoTrim.swift):

- `ClipInfo` + `probe()` (~line 1525): codec fourCC, coded geometry, **pure** rotation (0/90/180/270 only — mirrored/scaled transforms are rejected from fast paths), fps, audio codec/rate/channels; `sig` is the copy-compatibility key.
- `buildComposition` / `passthroughExport` (~1600): composition assembly + `AVAssetExportPresetPassthrough`.
- `joinWithComposition` (~1648): passthrough join **with duration verification** — output duration must match input sum within max(0.5s, 1%) or the path is rejected and falls back.
- `passthroughTrim` (~1667): eligibility = pure cut (no transform/crop/speed/mute-edge-cases), video, mp4/mov out.
- `merge` (~1683): probe all → uniform ⇒ fast path; mixed ⇒ `mergeSelective` (~1768) + `conform` (~1841, scale/pad/setsar/fps/format + transpose pre-rotation, re-probe verification, abort-to-fallback on mismatch); else `mergeWithFilter` (~1880).

---

## 2. The port plan (fork `android/`)

Ordered so each phase ships value alone. The Android analog of AVMutableComposition+passthrough is **Media3 Transformer** (`androidx.media3:media3-transformer`) — `EditedMediaItemSequence` + transmux (no re-encode) covers both join and trim-by-clipping. Do NOT attempt ffmpeg concat-demuxer bitstream joins: that exact approach was tried and abandoned on iOS for two host-reproduced silent-failure modes (see §5 gotchas).

### Phase 0 — result-shape parity (trivial, do first)

Make Android emit the same result fields so the TS types and app logging behave identically:

- `trim()` result ([BaseVideoTrimModule.kt](../modules/react-native-video-trim/android/src/main/java/com/videotrim/BaseVideoTrimModule.kt) ~line 641): add `usedPassthrough: false`.
- `merge()` result (~line 1073): add `usedFastPath: false`, `selective: false`.
- Honor (or at least read-and-ignore cleanly) `disableFastConcat` / `disablePassthroughTrim` so options objects are portable.

### Phase 1 — `probe()` on Android

Port `ClipInfo`/`sig`. `MediaExtractor` + `MediaFormat` is the right tool (NOT `MediaMetadataRetriever`, which can't give codec/audio detail reliably): video mime → codec, `KEY_WIDTH/HEIGHT` (coded), `KEY_ROTATION`, `KEY_FRAME_RATE`; audio track mime/sample-rate/channel-count. Mirror the iOS rule: anything that isn't a pure 0/90/180/270 rotation is ineligible for fast paths.

### Phase 2 — uniform merge fast path (Media3 transmux)

- Probe all inputs; if all `sig`s match and output is mp4 → build `EditedMediaItemSequence` of the clips, export with Transformer configured to **transmux** (no `setVideoMimeType`/effects ⇒ no re-encode).
- Port the **duration-drift verification** from `joinWithComposition` verbatim (tolerance max(0.5s, 1%)); on drift or any Transformer error, fall back to the existing concat-filter and return `usedFastPath: false`.
- Return `usedFastPath: true` on success.

### Phase 3 — passthrough trim (Media3 clipping transmux)

- Same eligibility test as iOS `passthroughTrim` (pure cut, video, mp4/mov out, no speed/crop/transform).
- `MediaItem.ClippingConfiguration(startMs, endMs)` + transmux. Note Media3 clipping is keyframe-snapped by default — measure how far that lands from iOS's frame-accuracy; if unacceptable, `enablePreciseTrimming` keeps routing to the FFmpeg re-encode path (current behavior), and passthrough remains the fast non-precise path. Decide and document the chosen semantics for `enablePreciseTrimming` on Android.
- Wire into BOTH the editor flow and the headless `trim()` (iOS has the same dual wiring: `handleEditorTrimSuccess` / `handleHeadlessTrimSuccess`). Return `usedPassthrough: true/false`.

### Phase 4 — selective conform

Port `mergeSelective` + `conform`:

1. Dominant `sig` by frequency; outliers re-encoded with FFmpeg to the target's **coded** form: `scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=N,format=yuv420p` + pre-rotation transpose (target 90° ⇒ `transpose=2`, 270° ⇒ `transpose=1`, 180° ⇒ `hflip,vflip`) so the output carries **no rotation tag**.
2. Encoder: `hevc_mediacodec` / `h264_mediacodec` matching the target codec, with the existing software-fallback chain; bitrate = max input bitrate.
3. **Re-probe every conform output** and verify coded geometry/rotation/audio matches target exactly; any mismatch aborts selective and falls back to full concat-filter (never ship a half-verified join).
4. Join uniform originals + conformed outliers via the Phase-2 transmux path. Return `selective: true`.

### Phase 5 — module plumbing checks

- Android's new-arch module is `android/src/newarch/VideoTrimModule.kt` delegating to `BaseVideoTrimModule` — no iOS-style `.mm` field-copy gotcha (ReadableMap is dynamic), but any **new TS option** still needs the iOS `.mm` explicit dict copy or it never reaches Swift (memory: that bit us before).
- Events (`onFinishTrimming`, `onStatistics`, `onLog`, `onError`, …) already route on both platforms; new fast paths must emit the same completion events the FFmpeg paths do (on iOS the unified handlers do this — mirror that).
- ffmpeg-kit Android package is set in the fork's `android/build.gradle` (~line 98, `io.github.maitrungduc1410:ffmpeg-kit-*`); confirm the chosen package includes mediacodec encoders.

---

## 3. App-side work and verifications

Every RNVT call site in the app, and what to check on Android for each:

| Call | Where | Android check |
| --- | --- | --- |
| `showEditor(path, config)` | [use-video-trim.ts:64](../src/features/recorder/use-video-trim.ts) — `enablePreciseTrimming: true`, dark theme, no dialogs | Editor opens, theming options apply, `onFinishTrimming` fires with `{outputPath, duration}`; `importTrimmedFile` move works with the returned path format |
| `merge(urls, { outputExt: 'mp4' })` | [use-export.ts:45](../src/features/export/use-export.ts) | Multi-clip merge completes; once Phase 2 lands, `usedFastPath` true for all-recorded drafts; rotation of output is portrait (see below) |
| `saveToPhoto(outputPath)` | [export.tsx:38](../src/app/export.tsx) | Lands in the device gallery; Android 13+ media permission flow |
| `share(outputPath)` | [export.tsx:52](../src/app/export.tsx) | Share sheet works into Gmail/WhatsApp/Drive — depends on the FileProvider from [plugins/with-video-trim.js](../plugins/with-video-trim.js) (`${applicationId}.provider`, `@xml/file_paths`); verify prebuild injects it |
| `getDurationMs` (expo-video probe) | [src/utils/video.ts](../src/utils/video.ts) | Returns sane values for camera + RNVT outputs |

### Recording format pinning — the load-bearing assumption

The whole zero-re-encode export story rests on every recorded segment being format-identical. iOS pins this via `videoQuality="1080p"` + `recordAsync({ codec: 'hvc1' })` ([use-recorder.ts](../src/features/recorder/use-recorder.ts)) → HEVC 1080p/30 mono-AAC.

On Android, **`recordAsync`'s `codec` option is iOS-only in expo-camera** — Android records whatever CameraX/device defaults give (typically H.264, resolution per `videoQuality` mapping). To do:

1. On first device run, record 2–3 clips and probe them (`ffprobe` the pulled files): codec, coded WxH, rotation tag, fps, audio. This defines Android's "uniform" signature.
2. Decide the Android pin: most likely accept H.264-whatever-the-device-gives and rely on per-device uniformity (same device ⇒ same format ⇒ fast path still hits). Cross-platform drafts (iOS HEVC + Android H.264 clips in one draft) will exercise the selective path by design.
3. Gate the `codec: 'hvc1'` option with `Platform.OS === 'ios'` if Android throws on it (verify — it may just be ignored; the versioned docs at https://docs.expo.dev/versions/v56.0.0/sdk/camera/ mark `codec` iOS-only).
4. Re-check the recorder's zoom mapping on Android: `zoom` 0–1 semantics differ per platform/device max — the constants in [use-recorder-gestures.ts](../src/features/recorder/use-recorder-gestures.ts) (`MAX_ZOOM`, `DRAG_FULL_RANGE_PX`, `PINCH_RANGE`) were tuned on an iPhone 17 Pro Max and will need an Android tuning pass.

### Camera `active` prop — broken on Android

The recorder relies on `CameraView`'s `active` prop to pause the session ([recorder.tsx](../src/app/recorder.tsx): `active={!previewing && focused}`) — it drops the camera while a clip preview is open and while the Export screen covers the recorder, and it's also the backstop that resolves a live `recordAsync` on navigation. **This does not work on Android** — go over it: verify what `active={false}` actually does there (session keeps running? recording keeps going?), and if it's a no-op, replace/augment with an Android path (e.g. unmount the CameraView when inactive, or explicitly `stopRecording()` + lifecycle handling) without reintroducing remount-during-gesture races. Recheck every place that leans on `active`: preview-open during idle, export-screen focus loss, and the unmount backstop in [use-recorder.ts](../src/features/recorder/use-recorder.ts).

### Rotation

iOS camera files are coded landscape (1920×1080) + rotation −90 tag; the engine's whole probe/conform design assumes tag-based rotation. Verify on Android: (a) camera output carries a rotation tag (CameraX does), (b) [preview-modal.tsx](../src/features/recorder/preview-modal.tsx)'s expo-video `contentFit="contain"` honors it, (c) merged output stays portrait — pull the file and `ffprobe`/play it. A merge that silently drops the tag ⇒ sideways exports.

### Paths & permissions

- App files: relative paths in DB absolutized via `Paths.document` ([file-store.ts](../src/utils/file-store.ts)) — works on Android, but log what RNVT returns (`file://` vs bare `/data/...`); [export.tsx:161](../src/app/export.tsx) already prefixes bare paths for expo-video.
- [app.json](../app.json) has `CAMERA`, `RECORD_AUDIO`, `WRITE_EXTERNAL_STORAGE`. For Android 13+ check whether `saveToPhoto` needs `READ_MEDIA_VIDEO` (or uses MediaStore insert, which needs none); add to `android.permissions` if RNVT requests it.
- The permission gate ([use-recorder-permissions.ts](../src/features/recorder/use-recorder-permissions.ts)) and its "blocked → open settings" flow needs an Android pass (settings deep-link differs).

### Build

- `newArchEnabled=true`, Hermes on; the fork supports both archs via sourceSets. First `expo run:android` will surface codegen issues if any — the codegen spec is shared (`NativeVideoTrim.ts`), so Android `VideoTrimSpec` regenerates from the same source as iOS.
- Submodule rule from [rnvt-fork-and-release.md](rnvt-fork-and-release.md) applies to Android builds too: the submodule must NOT keep its own `node_modules` during app builds.

---

## 4. Verification checklist (run with emulator/device)

Static first: `npx tsc --noEmit`, then `expo prebuild` and confirm `with-video-trim` injected the FileProvider into the generated manifest.

1. **Recorder**: tap-record, hold-record, hold+drag zoom, pinch zoom (expect zoom feel to need retuning), flip, torch, stabilization modes (Android support differs — buttons may need capability gating).
2. **Camera `active` prop**: open a clip preview and the export screen — confirm the camera session actually pauses (torch/indicator off, no battery drain), and that navigating away mid-recording still resolves `recordAsync`. Expected broken on Android — see §3.
3. **Format probe**: pull 3 recorded clips, `ffprobe` them, record the Android uniform signature in this doc.
4. **Trim**: editor opens, pure cut completes, output plays, duration in DB matches; after Phase 3, check `usedPassthrough` and time it.
5. **Merge uniform**: 3 recorded clips → export; verify duration ≈ sum, portrait orientation, plays in gallery. After Phase 2: `usedFastPath: true` and seconds-not-minutes.
6. **Merge mixed**: 2 recorded + 1 trimmed/imported clip; after Phase 4: `selective: true`, only the outlier re-encoded (watch `onStatistics` time).
7. **Save + share**: gallery save, share into 2–3 real apps.
8. **Stress**: 10+ clip draft; editor cancel mid-trim; backgrounding during merge; low-storage behavior.
9. **Cross-platform draft** (later): clips from both phones in one draft → selective path, plays correctly on both.

---

## 5. Gotchas to carry over (learned the hard way on iOS)

- **Never bitstream-concat with ffmpeg's concat demuxer.** Two silent rc=0 failures, host-reproduced: (1) mp4 tracks get ONE sample description — cross-encoder segments decode as garbage ("No ref lists in SPS"); (2) the demuxer doesn't rescale timestamps across track timescales (camera tbn 600 vs ffmpeg 15360 → 5s merge reported as 136s). Composition/Transformer-level joins handle both natively. Always verify output duration.
- **Rotation semantics**: rotation lives as a container tag, as pre-rotated pixels, or both. The conform path must pre-rotate pixels into the target's coded orientation and emit NO tag — and the transpose direction is empirical (iOS: preferredTransform +90 ⇔ ffprobe −90 ⇔ `transpose=2`). Re-derive on Android with a real file; don't trust the mapping.
- **Re-probe everything you conform.** The selective path only stays safe because every conformed output is re-probed and the whole path aborts to full re-encode on any mismatch.
- **New TS options need explicit plumbing on iOS** (`VideoTrim.mm` copies codegen-struct fields into the dict one by one) — adding Android-side options is not enough; keep both bridges in sync.
- **Validation technique that worked**: host-side ffmpeg/ffprobe experiments on real device clips BEFORE writing native code; verify orientation by extracting frames as PNGs and looking at them.
