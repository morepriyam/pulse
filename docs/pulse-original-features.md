# Pulse (original) — Feature Reference for `pulse-new`

> **Purpose of this doc.** This is a complete, code-pointed inventory of the **original Pulse app** (cloned into [pulse/](pulse/)). We are rebuilding it as **`pulse-new`** — keeping most features but redoing the layout/UX and changing some decisions. Use this as the reference when implementing `pulse-new` step by step: each feature below has file:line pointers into the original so you can read the real implementation before re-writing it (better) in the new app.
>
> **How to read it.** Every `[file.tsx:NN](path#LNN)` link opens the original source. "✅ Keep / 🔁 Rebuild / ❓ Decide / ✂️ Drop" tags are placeholders — the user will annotate which features carry over and how the layout changes. Don't treat the original's structure as prescriptive for `pulse-new`; treat its *behavior* as the spec.
>
> **Original stack:** Expo SDK 53, React Native 0.79.6, expo-router 5, React 19, TypeScript 5.8. (`pulse-new` targets Expo **v56** per [AGENTS.md](AGENTS.md) — APIs will differ; verify against the v56 docs before porting.)

---

## 0. What Pulse is (one paragraph)

Pulse is a **short-form institutional-video** recorder/editor. You record multiple clips ("segments") that concatenate into one seamless vertical (9:16) video, edit them on-device (reorder, per-segment trim, undo/redo), and upload the finished video over the **resumable TUS protocol** to a self-hosted [`@mieweb/pulsevault`](https://github.com/mieweb/pulsevault) Fastify server. Drafts auto-save on-device and can be exported/imported (AirDrop/Files). A `pulsecam://` deep link lets an external tool (e.g. a QR code from the server) open the app pre-targeted at a specific upload destination.

---

## 1. Tech stack & key dependencies

From [pulse/package.json](pulse/package.json):

| Area | Library | Notes |
|---|---|---|
| Framework | `expo` ~53, `expo-router` ~5 | File-based routing, New Architecture + Hermes |
| Camera | `expo-camera` ~16.1 | `CameraView` in video mode |
| Video playback | `expo-video` ~2.2, `react-native-video` ^6.18 | `useVideoPlayer` / `VideoView` |
| Trim UI | `react-native-video-trimmer-ui` (github fork) | Scrubber for per-segment trim |
| Thumbnails | `expo-video-thumbnails` ~9.1 | Frame extraction |
| Reorder | `react-native-sortables` ^1.9 | Drag-and-drop grid |
| Gestures/anim | `react-native-gesture-handler` ~2.24, `react-native-reanimated` ~3.17 | Pinch/pan zoom, button animations |
| Storage | `@react-native-async-storage/async-storage` 2.1, `expo-file-system` ~18.1 | Metadata in AsyncStorage, media on disk |
| Media import | `expo-image-picker` ~16.1 | Import existing clips |
| Sharing/transfer | `expo-sharing` ~13.1, `expo-document-picker` ~13.1 | Export/import drafts |
| Audio | `expo-audio` ~0.4 + custom `audio-focus` native module | Pause background audio while recording |
| Haptics | `expo-haptics` ~14.1 | Tab + button feedback |
| Native modules (custom) | `modules/video-concat`, `modules/audio-focus` | AVFoundation (iOS) + Media3 (Android) |

**Two custom native modules** live in [pulse/modules/](pulse/modules/) — these are the technical heart and must be re-created (or replaced) in `pulse-new`. See §7.

---

## 2. Data model & persistence (read this first)

Everything else is built on this model. Source: [pulse/utils/draftStorage.ts](pulse/utils/draftStorage.ts), [pulse/utils/fileStore.ts](pulse/utils/fileStore.ts).

### 2.1 Core types

```ts
type DraftMode = "camera" | "upload";

interface RecordingSegment {
  id: string;                     // unique segment id
  uri: string;                    // RELATIVE in storage, ABSOLUTE at runtime
  recordedDurationSeconds: number;
  trimStartTimeMs?: number;       // optional in-point (ms)
  trimEndTimeMs?: number;         // optional out-point (ms)
}

interface DraftUploadConfig { server: string; token: string; }

interface Draft {
  id: string;
  mode: DraftMode;                // "camera" (normal) | "upload" (came from QR)
  segments: RecordingSegment[];
  maxDurationLimitSeconds: number;// 15 | 30 | 60 | 180
  createdAt: Date;
  lastModified: Date;
  thumbnail?: string;             // relative path to first-frame thumb
  name?: string;                  // user-set, max 20 chars
  uploadConfig?: DraftUploadConfig;
}
```
[draftStorage.ts:1-39](pulse/utils/draftStorage.ts#L1-L39)

### 2.2 On-disk layout (persistent — `documentDirectory`)

```
<documentDirectory>/pulse/drafts/{draftId}/
  ├── segments/{segmentId}.mp4      # collision → {segmentId}_{timestamp}.mp4
  └── thumbs/thumb.jpg
<cacheDirectory>/                    # exports + merged output (ephemeral)
  ├── {draftId}.mp4                  # concat output (Android cacheDir; iOS /tmp)
  ├── pulse-draft-{name}-{ts}.pulse  # single-draft export
  └── pulse-backup-{ts}.pulse        # multi-draft export
```
File ops, move-vs-copy fallback, collision handling, relative↔absolute path conversion: [fileStore.ts](pulse/utils/fileStore.ts) (`importSegment` [:55-76](pulse/utils/fileStore.ts#L55-L76), `toAbsolutePath`/`toRelativePath` [:31-42](pulse/utils/fileStore.ts#L31-L42), `convertSegmentsToAbsolute`).

> **Key invariant:** segment URIs are stored **relative** (survives app updates / container path changes) and converted to **absolute** only at runtime. Honor this in `pulse-new`.

### 2.3 AsyncStorage keys

| Key | Purpose | Written by |
|---|---|---|
| `recording_drafts` | array of `Draft` metadata | [draftStorage.ts:32](pulse/utils/draftStorage.ts#L32) |
| `redo_stack` | `{ draftId?, segments, draftName? }` for undo/redo | [useDraftManager.ts:8](pulse/hooks/useDraftManager.ts#L8) |
| `upload_config_{draftId}` | per-draft `{ server, token? }` | [uploadConfig.ts:3](pulse/utils/uploadConfig.ts#L3) |
| `deleteDraftAfterUpload` | `"true"`/`"false"` | [useDeleteDraftPreference.ts:4](pulse/hooks/useDeleteDraftPreference.ts#L4) |
| `onboardingComplete` | onboarding done flag | [useFirstTimeOpen.ts:10](pulse/hooks/useFirstTimeOpen.ts#L10) |
| `videoStabilizationMode` | `"on"`/`"off"` | [useVideoStabilization.ts:5](pulse/hooks/useVideoStabilization.ts#L5) |
| `cameraFacing` | `"front"`/`"back"` | [useCameraFacing.ts:5](pulse/hooks/useCameraFacing.ts#L5) |
| `thumbnail_{cacheKey}` | cached thumb URI | [videoThumbnails.ts](pulse/utils/videoThumbnails.ts) |

### 2.4 DraftStorage API
[draftStorage.ts:40-427](pulse/utils/draftStorage.ts#L40-L427) — `saveDraft`, `updateDraft`, `getDraftById`, `getAllDrafts`, `getLastModifiedDraft`, `deleteDraft({keepFiles})`, `updateDraftMode`, `updateDraftName`.
- Generates the thumbnail from segment 0 on first save ([:58-95](pulse/utils/draftStorage.ts#L58-L95)).
- Validates segment files exist on load, prunes missing, deletes draft if empty ([:298-330](pulse/utils/draftStorage.ts#L298-L330)).
- Back-compat migration: `duration`→`recordedDurationSeconds`, `totalDuration`→`maxDurationLimitSeconds` ([:221-259](pulse/utils/draftStorage.ts#L221-L259)).
- `deleteDraft({keepFiles:true})` = metadata-only delete (files kept for undo/redo) ([:343-374](pulse/utils/draftStorage.ts#L343-L374)).

---

## 3. Navigation map

Router config + deep-link handling: [pulse/app/_layout.tsx](pulse/app/_layout.tsx). All screens are `fullScreenModal`.

```
/_layout (deep-link handler, fonts, gesture root, PermissionMonitor)
├── / (index)               → redirect router (tabs OR upload-chooser)
├── /onboarding             → first-run feature tour
├── /(tabs)
│   ├── index               → Drafts list (home)
│   └── dummy-create        → "+" button → pushes /(camera)/shorts
│       (shorts, subscriptions tabs exist but are hidden placeholders)
├── /(camera)
│   ├── shorts              → ★ MAIN CAMERA / recording screen
│   └── post                → placeholder
├── /preview-new            → auto-merge + review merged video
├── /reordersegments        → drag reorder + delete + enter trim
├── /trim-segment           → per-segment in/out trim
├── /merged-video           → upload (TUS) / share / save
└── /upload-chooser         → from QR: pick existing draft or record new
```

| Screen | Route | Reached from | Doc |
|---|---|---|---|
| Root layout | `/` | app launch | §8.3 deep links |
| Index redirect | `/` | launch | [app/index.tsx](pulse/app/index.tsx) |
| Onboarding | `/onboarding` | first run | §6.1 |
| Drafts list | `/(tabs)` | default home | §6.2 |
| Camera | `/(camera)/shorts` | "+" / tap draft / QR | §5 |
| Preview | `/preview-new` | camera ✓ | §6.4 |
| Reorder | `/reordersegments` | camera edit btn | §6.5 |
| Trim | `/trim-segment` | reorder long-press | §6.6 |
| Merged/upload | `/merged-video` | preview "Finalize" | §8 |
| Upload chooser | `/upload-chooser` | QR deep link | §8.3 |

---

## 4. Recording subsystem — the core feature

Main screen: [pulse/app/(camera)/shorts.tsx](pulse/app/(camera)/shorts.tsx) (~800 lines). This is the most important file to study.

### 4.1 Params accepted
[shorts.tsx:59-65](pulse/app/(camera)/shorts.tsx#L59-L65): `draftId`, `mode` (`"camera"`|`"upload"`), `server`, `token`, `videoid`.

### 4.2 Segmented recording
- **Tap to record** = start/stop toggle of one clip. **Hold to record** = record while finger held, stop on release. Hold engages after a delay (~300ms in screen, `holdDelay` prop default 500ms in button).
- Each finished clip → a `RecordingSegment` with native-measured duration. Lifecycle: `handleRecordingStart` / `handleRecordingProgress` / `handleRecordingComplete` ([shorts.tsx:203-266](pulse/app/(camera)/shorts.tsx#L203-L266)).
- Native duration read via `VideoConcatModule.getDuration()` ([:240-246](pulse/app/(camera)/shorts.tsx#L240-L246)) — don't trust timer-based duration.
- The button itself owns the record/hold state machine + animations: [components/RecordButton.tsx](pulse/components/RecordButton.tsx) (tap logic [:293-304](pulse/components/RecordButton.tsx#L293-L304), hold pulsing feedback [:219-255](pulse/components/RecordButton.tsx#L219-L255), 100ms progress tick + auto-stop at limit [:127-156](pulse/components/RecordButton.tsx#L127-L156)).

### 4.3 Duration presets & limit enforcement
- Presets **15s / 30s / 1m / 3m** via [components/TimeSelectorButton.tsx](pulse/components/TimeSelectorButton.tsx) (modal popup, options at [:21-26](pulse/components/TimeSelectorButton.tsx#L21-L26)).
- "Effective duration" respects trim points: `(trimEndTimeMs - trimStartTimeMs)/1000`, else `recordedDurationSeconds` ([shorts.tsx:181-193](pulse/app/(camera)/shorts.tsx#L181-L193)). A new segment that would exceed the limit is rejected with an alert ([:382-403](pulse/app/(camera)/shorts.tsx#L382-L403)).
- Progress bar with per-segment dividers: [components/RecordingProgressBar.tsx](pulse/components/RecordingProgressBar.tsx) (progress calc [:38-47](pulse/components/RecordingProgressBar.tsx#L38-L47), dividers [:56-76](pulse/components/RecordingProgressBar.tsx#L56-L76)).

### 4.4 Camera controls
[components/CameraControls.tsx](pulse/components/CameraControls.tsx): flip (front/back), torch/flash (back only), video stabilization (iOS only), reorder-segments entry.
- **Zoom — pinch:** asymmetric sensitivity (in 0.4×, out 0.7×) [shorts.tsx:631-650](pulse/app/(camera)/shorts.tsx#L631-L650).
- **Zoom — drag-to-zoom during hold-record:** while holding to record, drag up/down adjusts zoom (in 0.0013/px, out 0.0023/px, 10px activation threshold) [shorts.tsx:473-521](pulse/app/(camera)/shorts.tsx#L473-L521). Pan+pinch composed to run simultaneously ([:653](pulse/app/(camera)/shorts.tsx#L653)).
- **Flip:** resets zoom, disables torch on front, 300ms debounce ([:405-422](pulse/app/(camera)/shorts.tsx#L405-L422)).
- Facing persisted via [useCameraFacing.ts](pulse/hooks/useCameraFacing.ts); stabilization via [useVideoStabilization.ts](pulse/hooks/useVideoStabilization.ts) + [components/VideoStabilizationControl.tsx](pulse/components/VideoStabilizationControl.tsx).

### 4.5 Video stabilization (simplified to on/off)
[constants/camera.ts:29-66](pulse/constants/camera.ts#L29-L66): cross-platform enum is just `off`/`on`. iOS maps `on`→`'cinematic'`; Android always `off` (UI hides the control). `getSupportedVideoStabilizationModes()` drives whether the toggle renders. (README mentions richer iOS modes — the shipped code collapsed them.)

### 4.6 Import existing clips
"+" button launches `expo-image-picker`, reads native duration, validates against remaining limit, adds as a segment ([shorts.tsx:534-628](pulse/app/(camera)/shorts.tsx#L534-L628)).

### 4.7 Audio-session correctness (important gotcha)
iOS `AVAudioSession` flipping between record/playback kills the mic on segment 2+. Fixes:
- Separate audio-session lifecycle from draft-state changes; activate on focus, deactivate on blur ([shorts.tsx:296-324](pulse/app/(camera)/shorts.tsx#L296-L324)).
- **Force camera remount** after returning from a video player screen via `needsCameraRemountRef` so the mic re-attaches ([:113, :339-342, :438](pulse/app/(camera)/shorts.tsx#L339-L342)).
- `AppState` listener remounts on background/foreground ([:307-316](pulse/app/(camera)/shorts.tsx#L307-L316)).
- Audio focus (pause Spotify/YouTube) via [useAudioSession.ts](pulse/hooks/useAudioSession.ts) → custom `audio-focus` native module (§7.2).

### 4.8 Undo / redo
Buttons [components/UndoSegmentButton.tsx](pulse/components/UndoSegmentButton.tsx) / [RedoSegmentButton.tsx](pulse/components/RedoSegmentButton.tsx). Logic in [useDraftManager.ts:415-574](pulse/hooks/useDraftManager.ts#L415-L574): undo moves last segment to a redo stack persisted in AsyncStorage; if all segments removed the draft is metadata-deleted but **files kept**; redo restores (recreating the draft with original id if needed). Persists across sessions.

---

## 5. Draft management hook

[pulse/hooks/useDraftManager.ts](pulse/hooks/useDraftManager.ts) (`useDraftManager(draftId?, maxDurationLimitSeconds=60, mode="camera")`) is the brain of the camera screen. State + actions interfaces at [:25-55](pulse/hooks/useDraftManager.ts#L25-L55).

Key behaviors:
- **Auto-load** draft on mount if `draftId` given, else fresh ([:92-174](pulse/hooks/useDraftManager.ts#L92-L174)).
- **Auto-save** = 1s debounce on segment changes; creates draft on first save, updates after ([:188-237](pulse/hooks/useDraftManager.ts#L188-L237)).
- `handleStartOver` vs `handleStartNew` ([:291-310](pulse/hooks/useDraftManager.ts#L291-L310)).
- `updateSegmentsAfterRecording` imports the new file into managed storage, clears redo, persists ([:576-665](pulse/hooks/useDraftManager.ts#L576-L665)).
- `handleClose` cleanup deletes empty drafts + orphan redo files ([:358-413](pulse/hooks/useDraftManager.ts#L358-L413)).

---

## 6. Other screens

### 6.1 Onboarding — [app/onboarding.tsx](pulse/app/onboarding.tsx)
First-run only (gated by `useFirstTimeOpen` in [(tabs)/_layout.tsx:14-20](pulse/app/(tabs)/_layout.tsx#L14-L20)). Pulsing logo (Reanimated [:19-37](pulse/app/onboarding.tsx#L19-L37)), 5 feature cards ([:61-119](pulse/app/onboarding.tsx#L61-L119)), "Get Started" sets `onboardingComplete` and routes to tabs.

### 6.2 Drafts list (home) — [app/(tabs)/index.tsx](pulse/app/(tabs)/index.tsx)
- Reload on focus, sorted by `lastModified` desc ([:41-60](pulse/app/(tabs)/index.tsx#L41-L60)).
- Each row: thumbnail, name, segment count + effective/limit duration, relative date ("Today, 2:30pm"), upload destination chip.
- **Tap** → continue in camera; **long-press** → inline rename ([:317-324](pulse/app/(tabs)/index.tsx#L317-L324)); **delete** with file+redo cleanup ([:266-315](pulse/app/(tabs)/index.tsx#L266-L315)).
- **Import / Export** drafts (multi-select, "Select All") via `DraftTransfer` ([:365-436](pulse/app/(tabs)/index.tsx#L365-L436)). See §9.
- Effective duration helper [:444-454](pulse/app/(tabs)/index.tsx#L444-L454).

### 6.3 Tab bar — [app/(tabs)/_layout.tsx](pulse/app/(tabs)/_layout.tsx)
Center "+" uses a `tabBarButton` override to `router.push("/(camera)/shorts")` instead of showing a screen ([:94-100](pulse/app/(tabs)/_layout.tsx#L94-L100)). iOS blur tab background ([components/ui/TabBarBackground.ios.tsx](pulse/components/ui/TabBarBackground.ios.tsx)); haptic taps ([components/HapticTab.tsx](pulse/components/HapticTab.tsx)). `shorts`/`subscriptions` tabs are hidden placeholders.

### 6.4 Preview — [app/preview-new.tsx](pulse/app/preview-new.tsx)
Auto-merges on mount: multiple segments → merge; single segment **with** trim → still run through merge to apply trim; single **without** trim → use directly ([:53-99](pulse/app/preview-new.tsx#L53-L99)). Calls `VideoConcatModule.export(segments, draftId)` with an `onProgress` listener showing "Processing segment x/n" / "Finalizing" ([:114-165](pulse/app/preview-new.tsx#L114-L165)). "Finalize" → `/merged-video`.

### 6.5 Reorder — [app/reordersegments.tsx](pulse/app/reordersegments.tsx)
Hosts [components/SegmentReorderListVertical.tsx](pulse/components/SegmentReorderListVertical.tsx): `react-native-sortables` grid, drag to reorder (auto-save on drop), delete (with file deletion + relative-path re-save [:86-129](pulse/app/reordersegments.tsx#L86-L129)), long-press/scissors → trim screen. Thumbnails generated per item ([SegmentReorderListVertical.tsx:62-79](pulse/components/SegmentReorderListVertical.tsx#L62-L79)). Reloads on focus (after returning from trim).

### 6.6 Trim — [app/trim-segment.tsx](pulse/app/trim-segment.tsx)
`VideoTrimmerUI` (`react-native-video-trimmer-ui`) scrubber, loops playback, red tint, `minDuration` 0.1s ([:166-176](pulse/app/trim-segment.tsx#L166-L176)). Save converts seconds→ms, writes `trimStartTimeMs`/`trimEndTimeMs` onto the matching segment, `router.replace` back to reorder (triggers reload) ([:64-120](pulse/app/trim-segment.tsx#L64-L120)).

---

## 7. Native modules (the technical heart)

Both under [pulse/modules/](pulse/modules/), registered via `expo-module.config.json`, iOS min 15.1, Android minSDK 21/target 34.

### 7.1 `video-concat` — concat + trim
[modules/video-concat/](pulse/modules/video-concat/). TS API ([VideoConcatModule.ts](pulse/modules/video-concat/src/VideoConcatModule.ts)):
```ts
getDuration(uri: string): Promise<number>          // SECONDS
export(segments: RecordingSegment[], draftId): Promise<string>  // → output mp4 uri
cancelExport(): Promise<void>                       // declared, not implemented
```
Emits `onProgress { progress, currentSegment, phase: 'preparing'|'processing'|'finalizing' }`. Bridged segment shape: `{ uri, trimStartTimeMs?, trimEndTimeMs? }`.

**iOS (AVFoundation)** — [VideoConcatModule.swift](pulse/modules/video-concat/ios/VideoConcatModule.swift):
- `AVMutableComposition`, insert each segment's trimmed range at running `currentTime`, audio handled as a separate track with its own timescale ([:46-193](pulse/modules/video-concat/ios/VideoConcatModule.swift#L46-L193)).
- Trim math `calculateTimeRange` ([:202-248](pulse/modules/video-concat/ios/VideoConcatModule.swift#L202-L248)): ms→seconds, **±0.033s (one 30fps frame) buffer** around in/out, `timescale 60000` for frame accuracy, clamp within track bounds, ensure start<end.
- Orientation preserved via first segment's `preferredTransform`. Export: `AVAssetExportPresetHighestQuality`, `.mp4`, `shouldOptimizeForNetworkUse=false`.
- Error codes 1-6 (export/track/trim) and 10-11 (getDuration).

**Android (Media3 / MediaExtractor+MediaMuxer)** — [VideoConcatModule.kt](pulse/modules/video-concat/android/src/main/java/expo/modules/videoconcat/VideoConcatModule.kt):
- Two-pass mux: add tracks from segment 0 (+ rotation hint), then extract/mux all samples ([:28-232](pulse/modules/video-concat/android/src/main/java/expo/modules/videoconcat/VideoConcatModule.kt#L28-L232)).
- Trim = ms→µs, `seekTo(SEEK_TO_PREVIOUS_SYNC)` then sample-filter to in/out ([:109-131](pulse/modules/video-concat/android/src/main/java/expo/modules/videoconcat/VideoConcatModule.kt#L109-L131)).
- Concat = adjust presentation time per sample: `segmentStart + (pts - firstSamplePts)`, tracked independently for audio/video ([:134-144](pulse/modules/video-concat/android/src/main/java/expo/modules/videoconcat/VideoConcatModule.kt#L134-L144)). No transcode — codec copied from segment 0.

> `pulse-new` decision needed: re-port these modules as-is, or replace with a different pipeline (e.g. a maintained Expo video module / FFmpeg). They are the riskiest part to rebuild. See §11.

### 7.2 `audio-focus` — pause background audio while recording
[modules/audio-focus/](pulse/modules/audio-focus/). TS API: `requestAudioFocus()` / `abandonAudioFocus()`.
- **iOS** ([AudioFocusModule.swift](pulse/modules/audio-focus/ios/AudioFocusModule.swift)): `AVAudioSession.setActive(true/false, .notifyOthersOnDeactivation)` — category set by expo-audio.
- **Android** ([AudioFocusModule.kt](pulse/modules/audio-focus/android/src/main/java/expo/modules/audiofocus/AudioFocusModule.kt)): `AudioManager` `AUDIOFOCUS_GAIN_TRANSIENT` (O+ `AudioFocusRequest`, legacy stream API) so Spotify/podcasts pause.

---

## 8. Upload subsystem (TUS) + deep links

### 8.1 Merged/upload screen — [app/merged-video.tsx](pulse/app/merged-video.tsx)
Looks up per-draft upload config; if present shows "Upload to Cloud" + server chip, else "Not linked to a server" ([:103-110](pulse/app/merged-video.tsx#L103-L110)). Thumbnail + tap-to-fullscreen player, upload progress bar, success modal with watch URL (`{server}/{videoId}?token=…`), optional "delete draft after upload" ([useDeleteDraftPreference](pulse/hooks/useDeleteDraftPreference.ts)), and "Save to Device" via `expo-sharing`.

### 8.2 TUS resumable upload — [utils/tusUpload.ts](pulse/utils/tusUpload.ts)
`uploadVideo(videoUri, filename, onProgress?, draftId?, preAssignedVideoid?)` → `{ videoId, status, size }`. Flow ([:85-332](pulse/utils/tusUpload.ts#L85-L332)):
1. **`POST /reserve`** (with `Authorization: Bearer {token}` if set) → `{ videoid }`. *(Server-side, not part of the pulsevault plugin — the host app implements auth/DB/quota and returns the id.)*
2. **`POST /upload`** TUS create: `Upload-Length`, `Tus-Resumable: 1.0.0`, `Upload-Metadata: videoid …,filename …` → `Location` header.
3. **`PATCH {uploadUrl}`** 1 MB chunks: `Content-Type: application/offset+octet-stream`, `Upload-Offset`, 3 retries/chunk with backoff.
- Localhost-on-device detection + auto-fix via `expo-constants` debugger host ([:49-65](pulse/utils/tusUpload.ts#L49-L65)).

### 8.3 Per-draft destinations & deep links
- `upload_config_{draftId}` store: [utils/uploadConfig.ts](pulse/utils/uploadConfig.ts) (`store/get/getMany/clear`).
- **Deep link** `pulsecam://…?mode=upload&videoid={uuid}&server={url}&token={opt}` handled in [app/_layout.tsx:32-68](pulse/app/_layout.tsx#L32-L68): validates `videoid` as **UUID v4** → routes to `/upload-chooser`; invalid → home with error flag. UUID regex also in [.copilot/instructions.md:113-116](pulse/.copilot/instructions.md#L113-L116).
- **Upload chooser** — [app/upload-chooser.tsx](pulse/app/upload-chooser.tsx): "Record new" vs existing drafts; selecting stores the upload config on that draft, switches mode to `upload`, opens camera pre-targeted ([:100-116](pulse/app/upload-chooser.tsx#L100-L116)). Shows "will rebind from {old-server}" if already targeted elsewhere.
- App scheme `pulsecam` declared in [pulse/app.json:8](pulse/app.json#L8).

---

## 9. Draft transfer (export/import)

[utils/draftTransfer.ts](pulse/utils/draftTransfer.ts). `.pulse` files are JSON bundles: `{ version:"1.0", draft, files: { relPath → base64 } }`.
- `exportSelectedDrafts(ids)` → base64-encodes every segment + thumb into one file ([:151-227](pulse/utils/draftTransfer.ts#L151-L227)).
- `importDraft` / `importAllDrafts` decode, write to managed storage, preserve original `createdAt`/`lastModified`/`name`/id ([:235-332](pulse/utils/draftTransfer.ts#L235-L332)).
- Surfaced through Files / AirDrop / iCloud via `expo-sharing` + `expo-document-picker`. Enables device migration.

---

## 10. Components, hooks, constants — quick index

**Components** ([pulse/components/](pulse/components/)):
| Component | Role |
|---|---|
| [RecordButton](pulse/components/RecordButton.tsx) | tap/hold record state machine + animations |
| [RecordingProgressBar](pulse/components/RecordingProgressBar.tsx) | segmented progress, trim-aware |
| [CameraControls](pulse/components/CameraControls.tsx) | flip/flash/stabilize/reorder stack |
| [TimeSelectorButton](pulse/components/TimeSelectorButton.tsx) | duration preset modal |
| [VideoStabilizationControl](pulse/components/VideoStabilizationControl.tsx) | on/off toggle (iOS) |
| [SegmentReorderListVertical](pulse/components/SegmentReorderListVertical.tsx) | drag reorder + delete + trim entry |
| [Undo](pulse/components/UndoSegmentButton.tsx)/[RedoSegmentButton](pulse/components/RedoSegmentButton.tsx) | undo/redo |
| [Close](pulse/components/CloseButton.tsx)/[UploadCloseButton](pulse/components/UploadCloseButton.tsx) | dismiss |
| [PermissionMonitor](pulse/components/PermissionMonitor.tsx) | camera/mic/library gate + Settings deep link |
| [HapticTab](pulse/components/HapticTab.tsx) | iOS haptic tab button |
| [ThemedText](pulse/components/ThemedText.tsx)/[ThemedView](pulse/components/ThemedView.tsx) | theme primitives |
| [ui/IconSymbol.ios](pulse/components/ui/IconSymbol.ios.tsx), [ui/TabBarBackground*](pulse/components/ui/TabBarBackground.ios.tsx) | iOS SF Symbols / blur bg |

**Hooks** ([pulse/hooks/](pulse/hooks/)): [useDraftManager](pulse/hooks/useDraftManager.ts) (core), [useAudioSession](pulse/hooks/useAudioSession.ts), [useCameraFacing](pulse/hooks/useCameraFacing.ts), [useVideoStabilization](pulse/hooks/useVideoStabilization.ts), [useDeleteDraftPreference](pulse/hooks/useDeleteDraftPreference.ts), [useFirstTimeOpen](pulse/hooks/useFirstTimeOpen.ts), [useColorScheme](pulse/hooks/useColorScheme.ts)/[.web](pulse/hooks/useColorScheme.web.ts), [useThemeColor](pulse/hooks/useThemeColor.ts).

**Constants** ([pulse/constants/](pulse/constants/)): [camera.ts](pulse/constants/camera.ts) (`DRAFT_NAME_LENGTH=20`, `VideoStabilization` enum, stabilization mapping); [Colors.ts](pulse/constants/Colors.ts) (light/dark, brand red `appPrimary #F01E21`).

**Recording config defaults** (README §Configuration): `maxIndividualDuration 60`, `holdDelay 500ms`, `progressUpdateInterval 100ms`; presets `15/30/60/180`.

---

## 11. Known quirks / gotchas to carry forward (or fix) in `pulse-new`

1. **Audio session / mic-on-segment-2** — needs the focus-lifecycle + camera-remount dance (§4.7). The single most fragile behavior. Re-validate on Expo v56 + new `expo-camera`/`expo-audio`.
2. **Relative-path storage** — keep segment URIs relative; only absolutize at runtime (§2.2).
3. **Trust native duration**, not JS timers, for segment length (§4.2).
4. **Trim ±1-frame buffer** (iOS 0.033s, timescale 60000) prevents black frames at cuts (§7.1).
5. **`/reserve` is the host server's responsibility**, not the pulsevault plugin — `pulse-new` upload still assumes reserve→upload→stream (§8.2).
6. **`cancelExport` is unimplemented** — wire it up if you keep a long merge.
7. **Stabilization** is effectively iOS-only on/off; Android hides it (§4.5).
8. **Native modules are the rebuild risk** — decide port-as-is vs replace early (§7.1).

---

## 12. Decisions for `pulse-new` (fill in as we go)

> This section is the working agreement between us. As you ("the user") tell me the new layout and changed decisions, I'll record them here so future steps stay consistent. Tag each feature **✅ Keep / 🔁 Rebuild-changed / ❓ Open / ✂️ Drop**.

| Area | Original behavior | `pulse-new` decision | Status |
|---|---|---|---|
| Navigation/layout | tab bar + fullscreen modals | _TBD — user is redesigning layout_ | ❓ |
| Recording (tap/hold, presets) | §4 | | ❓ |
| Segment trim/reorder/undo | §4.8, §6.5, §6.6 | | ❓ |
| Native concat (video-concat) | §7.1 | _port vs replace?_ | ❓ |
| Audio focus module | §7.2 | | ❓ |
| Upload (TUS + per-draft dest) | §8 | | ❓ |
| Deep links (`pulsecam://`) | §8.3 | _new scheme?_ | ❓ |
| Draft transfer (.pulse) | §9 | | ❓ |
| Onboarding | §6.1 | | ❓ |
| Theming/brand | §10 | | ❓ |

---

*Generated from the cloned original at [pulse/](pulse/). Update the pointers if the clone is moved or removed.*
