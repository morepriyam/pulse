# App Size Research & Findings

_Investigation into the production app size (≈84 MB reported on TestFlight) and what can
be done to reduce it. Covers both iOS and Android, with measured before/after results._

Date: 2026-06-16

---

## TL;DR

- **Android: a one-line R8/minify change cut the per-device install by ~32 MB (−29%)** — from
  ~110 MB to ~78 MB. This is verified by a real release build. **Banked.**
- **iOS: no free win.** The 81 MB `.app` is mostly load-bearing native features (FFmpeg,
  React, Hermes, Whisper). The `disable-libdav1d` flag is a no-op here because the project
  uses precompiled Expo modules (AVIF is baked into the prebuilt `ExpoImage.xcframework`).
- The TestFlight number is the **uncompressed install size**. The actual App Store
  **download** is LZFSE-compressed and ~40–55% smaller.
- QR / barcode scanning was deliberately **kept** (needed for a future feature).

---

## How sizes were measured

- **iOS:** `xcodebuild ... archive` → inspect `Pulse.app` inside the archive:
  `du -sh` on the binary, `Frameworks/`, `main.jsbundle`, `Assets.car`, and per-framework.
- **Android:** `./gradlew :app:assembleRelease` → `unzip -l` the release APK and sum
  `lib/<abi>/*.so` per architecture and `classes*.dex`.
- Models (Whisper speech + Silero VAD) were confirmed to **download at runtime**, not
  bundled — so they do not contribute to binary size.
- The 31 MB of `assets/dev/` test videos are **not** bundled (nothing `require()`s them);
  they bloat the repo only, not the app.

---

## iOS findings (release archive)

`Pulse.app` = **81 MB** uncompressed (≈ the 84 MB TestFlight install size).

| Bucket | Size | Notes |
|---|---|---|
| Frameworks | 51 MB | see below |
| Main executable (`Pulse`) | 17 MB | app native code + **Skia (statically linked, dead-stripped)** + reanimated |
| JS bundle (`main.jsbundle`, Hermes) | 7.2 MB | app JS as bytecode |
| Images / fonts (`assets` + `Assets.car`) | ~6 MB | icons, fonts, bundled images |

### Frameworks by contribution

| Framework group | Size | Removable? |
|---|---|---|
| **FFmpeg** (avcodec/avfilter/avformat/avutil/swscale/swresample/avdevice/ffmpegkit) | **17 MB** | load-bearing (speed/crop/fallback) |
| React.framework | 11 MB | core |
| hermesvm | 5.7 MB | core |
| Image codecs (libavif 3.8 MB + WebP/SVG/AVIF SDWebImage coders) | 4.6 MB | baked into precompiled ExpoImage |
| ExpoModulesCore | 3.5 MB | core |
| rnwhisper | 2.6 MB | feature (on-device transcription) |
| Barcode (ZXingObjC + ExpoCameraBarcodeScanning) | 1.6 MB | **kept** — needed for QR |

### Key correction
An early hypothesis blamed Skia (its iOS static libs total ~78 MB on disk). The build
**disproved this**: Skia is statically linked into the 17 MB main binary and the linker
dead-strips unused symbols hard. It is *not* a separate 20–40 MB chunk. Not worth a rewrite.

---

## Android findings (release APK)

Universal APK = 209 MB (post-R8), but that bundles all 4 CPU architectures. A Play Store
user (AAB) downloads **one** ABI. Per-device (arm64) ≈ **78 MB** uncompressed (post-R8).

### Top native libs (arm64, unaffected by R8)

| Lib | Size | Removable? |
|---|---|---|
| librnskia.so | 10.8 MB | real shared lib (not dead-stripped like iOS) |
| FFmpeg (avcodec 7.7 + avfilter 2.7 + avformat 2.0 …) | ~13 MB | load-bearing |
| libreactnative.so | 6.5 MB | core |
| libbarhopper_v3.so (ML Kit barcode) | 4.7 MB | **kept** — needed for QR |
| librnwhisper* (3 variants) | 4.5 MB | feature |
| libavif_android.so | 0.9 MB | likely |

---

## Changes applied & measured results

| Change | Platform | File | Result |
|---|---|---|---|
| **R8 / minify in release** | Android | `android/gradle.properties` (`android.enableMinifyInReleaseBuilds=true`) | **dex 54.0 → 20.9 MB** |
| **Resource shrinking** | Android | `android/gradle.properties` (`android.enableShrinkResourcesInReleaseBuilds=true`) | included above |
| **Disable libdav1d (AVIF)** | iOS | `ios/Podfile.properties.json` (`expo-image.disable-libdav1d=true`) | **no-op** (precompiled ExpoImage bundles AVIF) |
| ~~Disable barcode/QR scanner~~ | both | reverted | **kept** — QR needed later |

### Before / after

| Platform | Before | After | Saved |
|---|---|---|---|
| Android (per-device, arm64: native + dex) | ~110 MB | **~78 MB** | **−32 MB (−29%)** |
| Android universal APK (on disk) | 221 MB | 209 MB | −12 MB |
| iOS (`.app` uncompressed) | 81 MB | 81 MB | 0 MB |

> ⚠️ **R8 runtime caveat:** R8 passed at build time, but minification can surface
> reflection issues only at *runtime*. Smoke-test a release build on device (camera,
> transcription, video trim, QR) before shipping. Fix any breakage with targeted `-keep`
> rules in `android/app/proguard-rules.pro`, not by disabling R8.

---

## Recommendations (by payoff / risk)

### Tier 1 — done / low risk
1. **Android R8 + resource shrinking** — done. ~32 MB per device. Verify on device.
2. **Ship via AAB (Play) / App Store thinning** so users get one architecture, not four.

### Tier 2 — easy, low risk
3. Drop emulator-only ABIs (`x86`, `x86_64`) for directly-distributed APKs:
   `reactNativeArchitectures=arm64-v8a,armeabi-v7a`.

### Tier 3 — high payoff, real engineering
4. **FFmpeg → AVFoundation (iOS) / MediaCodec (Android)** for speed/crop, dropping
   ffmpeg-kit entirely → ~13–17 MB. The video-trim module currently needs FFmpeg for
   speed (`atempo`), crop, rotation, and as the passthrough fallback.
5. **Skia (10.8 MB Android)** — rewrite the karaoke caption overlay
   (`src/features/transcription/caption-overlay.tsx`, the only Skia consumer) in plain RN +
   Reanimated to drop react-native-skia. Worth it mainly for Android; on iOS it's already
   dead-stripped into the main binary.
6. **iOS AVIF** — only removable by building ExpoImage from source
   (`EXPO_USE_PRECOMPILED_MODULES=false`), which makes iOS builds much slower for ~3.8 MB.
   Marginal.

### Not worth it
- Dropping Skia for iOS size (already dead-stripped).
- The `disable-libdav1d` flag while precompiled modules are on (no-op).
