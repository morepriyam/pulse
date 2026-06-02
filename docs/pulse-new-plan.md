# `pulse-new` — Plan & Decisions

> **What this is.** The living design + decision log for **`pulse-new`** (the rebuild). It captures what we're changing vs the original, the libraries/architecture we've chosen, and the layout/UX I want. It is the counterpart to [pulse-original-features.md](docs/pulse-original-features.md) — that doc is a read-only record of the _original_ app; **this** doc is where our forward decisions live. When implementing, read the original for _behavior/spec_, read this for _what we actually do differently_.
>
> **Tags:** ✅ Decided · 🔁 Decided-but-differs-from-original · ❓ Open · ✂️ Dropping · 🔧 Setup/infra implication
>
> **Targets:** Expo **SDK 56**, React Native **0.85**, New Architecture (always-on), React 19.2, Reanimated 4. Per [AGENTS.md](AGENTS.md): verify APIs against the Expo v56 docs before writing code.
>
> **Current state (2026-05-30):** `pulse-new` is **untouched `npx create-expo` boilerplate** — nothing in `src/` has been changed yet. Everything in this doc is **intent/notes**, not work in progress. No deps added, no native dirs, no recording code. We're only capturing decisions; implementation hasn't started.

---

## Build order

**Milestone 0 (first thing we build):** video **recording** + **`react-native-video-trim`**, set up so **all** RNVT features are supported (full native install + development build). It's the foundation — done before drafts, upload, layout, etc. Rationale: it's the riskiest / most native-heavy piece, and everything else (segments, trim, merge, export) sits on top of it — prove it on a dev build first. Details in §1.

**Last:** **onboarding** is built **at the end**, once the core flows work (§5 carry-over).

---

## Decision log

| Date       | Decision                                                                                                                                                                               | Status |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-05-30 | Use **`react-native-video-trim`** for concat **and** trim; drop the original's custom native modules for video. Adopt it early (set up the dev build before building features on top). | 🔁 §1  |
| 2026-05-30 | **Sequencing:** video recording + RNVT (all features enabled) is **milestone 0** — set up first, before any other feature. | 📝 note |
| 2026-05-30 | **Recorder layout:** drop undo/redo; show segments as a bottom thumbnail bar with inline ✕ delete; camera renders above; `→` to proceed. Layout only. | 🔁 §2.1 |
| 2026-05-30 | **Segment-bar gestures:** hold+drag a thumbnail to **reorder**; tap a thumbnail to **view + trim** (per-segment trim entry point). | 🔁 §2.1 |
| 2026-05-30 | **Keep segmented recording** but **drop the red progress bar** ([orig §4.3]) — bottom thumbnail bar is the only segment indicator. | 🔁 §2.1 |
| 2026-05-30 | **Keep + import button** on recorder — add existing device videos as a segment ([orig §4.6]). | 🔁 §2.1 |
| 2026-05-30 | **Maximize expo-camera built-ins** (record, zoom prop, flash, full stabilization modes, quality); keep only thin custom glue for pinch/drag-zoom gestures + tap/hold record button (lib has no gesture support). | 🔁 §2.2 |
| 2026-05-30 | **Camera controls = same set as original** (flash/stabilization/flip/…); build the **control UI from Expo's own native components** — `@expo/ui` (`ContextMenu`/`Picker`/etc.) + `expo-symbols` + `expo-glass-effect` — instead of hand-rolling. | 🔁 §2.2 |
| 2026-05-30 | **Drafts/persistence stack:** `expo-sqlite` + **Drizzle ORM** for metadata, **expo-file-system** new `File`/`Directory`/`Paths` API for media; autosave on segment-complete; reactive draft selector via `useLiveQuery`. | 🔁 §3 |
| 2026-05-30 | **Permissions:** granular / **just-in-time** — request each at point-of-use (camera+mic on recorder open, library on import), not upfront. Drop the original's upfront gate. | 🔁 §2.3 |
| 2026-05-30 | **Onboarding built LAST**, after core flows work. | ⏸️ defer |
| 2026-05-30 | **Upload:** keep TUS but via **`tus-js-client` v4** (native RN-TUS wrapper is abandoned); custom SQLite `urlStorage` + `fileReader` for true resume across restart/network-drop; resume UI. | 🔁 §4 |
| 2026-05-30 | **Upload background = pause/resume only:** OK for upload to pause when app closed/backgrounded and resume on reopen; **no native background-transfer** — stick to easy/in-the-box behavior. | ✅ §4 |
| 2026-05-30 | **Trim/edit UX = RNVT `showEditor`** (native editor, use ALL RNVT features; no custom trim screen). Editing is **destructive** per segment → export = just `merge()`. | 🔁 §1 |
| 2026-05-30 | **Audio-focus deferred**; **tap-to-focus skipped** (use autofocus). | ⏸️/✂️ |
| 2026-05-30 | **Non-destructive source model:** keep `originalFilename` + `editedFilename` per segment; `showEditor` always edits the original (no compounding re-encode); merge/thumbnail use edited ?? original. | ✅ §1.4 |
| 2026-05-30 | **Brand:** primary/accent **red** (`#F01E21`); keep Expo default icons/splash as placeholders, rebrand later. | 🔁 §2.4 |

---

## 1. Video pipeline — `react-native-video-trim` 🔁

**Decision:** Replace the original's custom `video-concat` AVFoundation/Media3 module **and** the `react-native-video-trimmer-ui` scrubber with a single library: **[`react-native-video-trim`](https://github.com/maitrungduc1410/react-native-video-trim)** (maitrungduc1410). It does both concat and trim, FFmpeg under the hood, hardware-encoded (`h264_videotoolbox` iOS / `h264_mediacodec` Android).
https://docs.expo.dev/versions/v56.0.0/sdk/camera/

> Original pipeline being replaced: see [pulse-original-features.md §7.1](docs/pulse-original-features.md) (the custom modules) and §6.6 (the trim screen). The original's `audio-focus` module (§7.2) is **separate** — **deferred for later** in `pulse-new` (§5 table), not part of this.

### 1.1 APIs we'll use

- `merge(urls: string[], options?): Promise<MergeResult>` — **headless concat**. Normalizes every clip to the **first clip's resolution + fps (capped at 30 fps)**, auto scale/pad/letterbox; output bitrate = highest input. **Local file paths only** (no remote URLs — FFmpegKit build lacks OpenSSL). Fine for our on-device segments.
- `trim(url, options): Promise<TrimResult>` — **headless** per-clip trim (start/end, precision, audio-removal, speed).
- `showEditor(videoPath, config?)` — **native editor UI — ✅ CHOSEN as our trim/edit UX** (user decision 2026-05-30: "use all that RNVT provides", no custom trim screen). Exposes RNVT's **full editor**: trim + flip / rotate / crop (with undo-redo), mute/speed, etc. Returns the edited output file via its finish event.

### 1.2 Behavioral changes from the original (these are spec changes)

1. **Re-encode, not lossless stream-copy.** Original did sample-copy concat assuming uniform segments + a hand-tuned ±1-frame CMTime trim buffer. `merge()` **re-encodes** →
   - ✅ Upside: heterogeneous inputs (imported library clips with different res/fps/codec) "just work" — no manual normalization.
   - ⚠️ Cost: some quality loss, slower export, CPU/heat, larger files, **30 fps cap**. Trim precision is FFmpeg's, not the custom frame math.
2. **Editing model changed by the `showEditor` choice → destructive per-segment edits.** Because we use `showEditor` (not headless `trim()`), editing a segment **produces a new edited file**. Flow: tap thumbnail → `showEditor` → on save, RNVT returns an edited output → **replace that segment's working file** with it. So editing is **baked per segment**, and **export = just `merge()` the (already-edited) segment files** — no separate trim-then-merge pass. Single segment → skip merge. _(This supersedes the original's non-destructive in/out-point model, [orig §2.1](docs/pulse-original-features.md)/[§6.4](docs/pulse-original-features.md).)_ **Keep the original recording alongside the edited file** so the user can re-edit/reset without compounding re-encode quality loss (✅ decided, §1.4).

### 1.3 Setup implications — "support from early on" 🔧

Adopting this now (not later) forces these, so we do them up front:

- **Development build required — no Expo Go.** `pulse-new` is currently a managed app (no `ios/`/`android/`). This commits us to `expo prebuild` + dev-client / EAS builds from the start.
- **No Expo config plugin ships with the lib.** The native config must survive `prebuild`, so we author a small **custom config plugin** (or `app.json` plugin entries) for:
  - iOS: `NSPhotoLibraryUsageDescription`.
  - Android: `WRITE_EXTERNAL_STORAGE` + FileProvider + `file_paths.xml`.
  - FFmpeg HTTPS binaries: Android gradle `VideoTrim_ffmpeg_package = 'https'`; iOS `FFMPEGKIT_PACKAGE=https`.
- **FFmpegKit is retired upstream (Apr 2025).** The lib works via the maintainer's **self-hosted** FFmpegKit binaries → build-time dependency on their hosting. Mitigate: **pin the version**; optionally mirror/self-host the binaries for resilience.
- **Bleeding-edge RN risk.** RN 0.85 / New Arch / SDK 56 is very new; the lib claims New Arch support but states no min RN. **First action before building features: smoke-test** install → `expo prebuild` → dev build → trivial `merge()` + `trim()` on a real device.

### 1.4 Open sub-decisions ❓

- **Trim UX:** ✅ **decided — use RNVT's native `showEditor`** (no custom screen); expose **all** RNVT editor features (trim + crop/rotate/flip + undo-redo + mute/speed). [user decision 2026-05-30]
- **Re-edit / reset:** ✅ **decided** — keep `originalUri` (raw recording/import, never mutated) + `editedUri` (`showEditor` output, null until edited). `showEditor` **always runs on `originalUri`** → exactly one re-encode from pristine source, no compounding loss + full reset. Thumbnail + `merge()` use **`editedUri ?? originalUri`**; reset clears `editedUri`. Duplication only for edited segments; whole draft dir is cleaned on delete/after upload. [user decision 2026-05-30]
- Output target (resolution/bitrate/fps) defaults for `merge()` — TBD once we smoke-test quality.

---

## 2. Layout / UX

> Screen-by-screen layout decisions, how they differ from the original's navigation ([orig §3](docs/pulse-original-features.md)). Filled in as the user describes them.

### 2.1 Recorder screen — segments shown inline (✂️ drop undo/redo) 🔁

**Decision (layout only):** segments are managed **directly on the recorder screen**, not in a separate reorder screen and not via undo/redo.

- ✂️ **Drop the undo/redo feature + UI entirely** (the original's Undo/Redo buttons + AsyncStorage redo-stack, [orig §4.8](docs/pulse-original-features.md)). Not ported.
- **Bottom segment bar:** a horizontal strip of **thumbnails, one per recorded segment**, pinned to the bottom of the recorder.
- **Inline delete:** each thumbnail has its own **✕** to delete that segment right there (replaces the original's delete-in-reorder-screen flow, [orig §6.5](docs/pulse-original-features.md)).
- **Hold + drag to reorder:** long-press a thumbnail and drag to reorder segments within the bar (no separate reorder screen, replaces [orig §6.5](docs/pulse-original-features.md)).
- **Tap to edit:** tapping a thumbnail opens that segment in **RNVT's native `showEditor`** (full editor: trim + crop/rotate/flip + undo-redo) — replaces the original's long-press-in-reorder → trim screen ([orig §6.6](docs/pulse-original-features.md)). On save, the edited output replaces the segment (destructive, §1.2).
- **Camera + record controls render ABOVE the segment bar** (preview fills the area above; controls overlay the preview).
- **Proceed/next (→):** a circular button at the right end of the segment bar advances to preview/merge.
- The bar appears only once ≥1 segment exists (empty state = no bar, like screenshot 2).
- **Recording stays segmented** (tap/hold → multiple clips, as discussed), but the original's **red segmented progress bar is removed** ([orig §4.3](docs/pulse-original-features.md), `RecordingProgressBar`). The **bottom thumbnail bar is now the only segment indicator** — each completed clip = one thumbnail. _(How the in-flight clip's live progress/remaining-time is shown during recording is still open — see §6.)_
- **+ Import button (keep):** a **+** control on the recorder lets the user pick an **existing device video** and add it as a segment (like [orig §4.6](docs/pulse-original-features.md), via `expo-image-picker`). Imported clips appear as thumbnails in the bottom bar like any recorded segment, and benefit from RNVT `merge()`'s auto-normalization of mismatched res/fps/codec (§1.2).

```
┌───────────────────────────┐
│ ✕                         │  ← close (top-left)
│                           │
│      CAMERA PREVIEW        │  ← live preview + control overlays
│      (record controls,     │
│       zoom arc, etc.)       │
│                           │
│         ( ● record )       │
├───────────────────────────┤
│ [▢✕][▢✕][▢✕] …      ( → ) │  ← segment thumbnails + per-item delete, next btn
└───────────────────────────┘
```

**Visual reference:** the two screenshots the user shared (Snapchat/Reels-style: top-left close, left icon rail, centered red record button, zoom arc `.5x/1.3x/2x/5x`, and the bottom thumbnail strip with ✕ per clip + a `→` on the right). _Scope note: only the **segment-display layout** is decided here — the other rail icons (music, timer, speed `1×`, captions, effects, flash, flip, `HD 30`) are **not** decided yet._

> Gestures summary: **tap** thumbnail → view/trim · **hold+drag** thumbnail → reorder · **✕** → delete · **→** → proceed.

### 2.2 Camera controls & gestures — maximize expo-camera 🔁

**Decision:** Lean on **expo-camera (`CameraView`, SDK 56)** built-ins as much as possible; only hand-write the thin glue it genuinely doesn't provide. This trims a lot of the original's custom camera code ([orig §4.2–4.5](docs/pulse-original-features.md)).

**Use the library directly for (verified against [v56 camera docs](https://docs.expo.dev/versions/v56.0.0/sdk/camera/)):**

- **Recording:** `mode="video"` + `recordAsync({ maxDuration, maxFileSize, codec, mirror })` / `stopRecording()`.
- **Zoom value:** `zoom` prop (`number` 0–1).
- **Flip:** `facing` (`'front'`/`'back'`).
- **Flash / torch:** `flash` (`'off'|'on'|'auto'|'screen'`) + `enableTorch`.
- **Stabilization:** `videoStabilizationMode` (`'off'|'standard'|'cinematic'|'auto'`) — **richer than the original**, which collapsed it to on/off ([orig §4.5](docs/pulse-original-features.md)). Use the full modes.
- **Quality:** `videoQuality` (`'2160p'|'1080p'|'720p'|'480p'`).
- **Also:** `mute`, `autofocus`, `onCameraReady`.

**Still custom — expo-camera does NOT provide these (the unavoidable part):**

- ⚠️ **Pinch-to-zoom & drag-to-zoom gestures.** `CameraView` exposes only a `zoom` _value_, **no gesture**. We wire **RN Gesture Handler + Reanimated → the `zoom` prop** ourselves — but as thin glue, not the original's heavier custom stack ([orig §4.4](docs/pulse-original-features.md)).
- ⚠️ **Tap / hold record button.** The tap-vs-hold UX + button animation is app-level; the library only gives `recordAsync`/`stopRecording` + `maxDuration`. Custom button, library mechanism.
- ✂️ **Tap-to-focus** — **skipped** (user decision 2026-05-30); rely on expo-camera `autofocus`.

**Control set = same as the original** (flash, video stabilization, flip, zoom, etc., [orig §4.4–4.5](docs/pulse-original-features.md)) — just powered by expo-camera props above.

**Controls UI — maximize Expo's own native UI primitives** (don't hand-roll; all already in `pulse-new`'s deps):

- **`@expo/ui`** (native SwiftUI / Jetpack Compose, **stable in SDK 56**): `ContextMenu` (a.k.a. DropdownMenu) for the **stabilization-mode menu** (replaces the original's custom long-press picker, [orig §4.5](docs/pulse-original-features.md)); `Picker` (segmented/wheel) for things like duration presets; `Switch` / `Slider` / `Button`; `BottomSheet` for any control panel. APIs: `@expo/ui/swift-ui` (iOS) + `@expo/ui/jetpack-compose` (Android), or the universal `@expo/ui` entry.
- **`expo-symbols`** for icons (flash / flip / stabilize / etc.).
- **`expo-glass-effect`** for the glassy control backgrounds (matches the screenshot aesthetic).
- _Verify exact exports/variants against the [v56 @expo/ui reference](https://docs.expo.dev/versions/v56.0.0/sdk/ui/) at implementation time (only `Button`/`Host` are confirmed verbatim in the docs so far)._

> Net: maximize Expo for **both capabilities (expo-camera) and control UI (@expo/ui + expo-symbols + expo-glass-effect)**; keep a **minimal** custom layer only for the gestures + record-button expo-camera structurally doesn't expose.

### 2.3 Permissions — granular, just-in-time 🔁

**Decision:** request each permission **at the moment it's needed**, not upfront / not all at once.

- **Camera + microphone** → requested **when the recorder/camera screen opens**.
- **Photo library** → requested **when the user taps + to import** a clip (§2.1).
- Any future permission (notifications, etc.) → only when that feature is first used.

Replaces the original's upfront `PermissionMonitor` gate ([orig §10](docs/pulse-original-features.md)). Use the library hooks at point-of-use — expo-camera `useCameraPermissions()` / `requestCameraPermissionsAsync()` + `requestMicrophonePermissionsAsync()`, expo-image-picker `requestMediaLibraryPermissionsAsync()` — with a graceful "enable in Settings" fallback (via `Linking`) when denied. _(Per-prompt UX/copy TBD.)_

### 2.4 Theming & brand 🔁

- **Primary / accent color = red** — carry the original's Pulse red **`#F01E21`** ([orig §10](docs/pulse-original-features.md)) unless tuned. Used for the record button, primary actions, accents. [user decision 2026-05-30]
- **App icon / logo / splash:** keep the **Expo default `create-expo` assets** as placeholders **for now**; replace with custom branding **later**, following Expo's icon/splash guidance. _(So the scaffold's blue splash/icon stays until rebrand — only the in-app accent is red for now.)_
- **Light/dark:** ❓ open (Q20).
- **App name / slug / scheme:** ❓ open (Q21) — scaffold currently `pulse-new` / scheme `pulsenew`.

---

## 3. Drafts, autosave & persistence ✅ (storage stack decided)

**Goal:** work on multiple drafts/projects; each **autosaves the moment a segment finishes recording** (and on delete / reorder / trim / rename); survives app close; reopen from a **draft-selector** screen.

**Storage stack — Expo-standard for SDK 56 (verified against the [filesystem](https://docs.expo.dev/versions/v56.0.0/sdk/filesystem/) + [sqlite](https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/) docs):**

- **Metadata → `expo-sqlite` + Drizzle ORM.** Relational + typed. Rough schema: `projects` (id, name, maxDurationSeconds, mode, createdAt, lastModified, thumbnail, upload config) and `segments` (id, projectId, **order**, `originalFilename`, `editedFilename?` — `showEditor` output; thumbnail/merge use `editedFilename ?? originalFilename`, §1.4 — `durationMs`). **Why this over `kv-store`:** the data is naturally relational (project 1—\* ordered segments) with frequent **partial** updates — autosave one segment, reorder one, delete one, set trim on one — each becomes a single-row op instead of read-modify-write of a whole JSON blob. Drizzle adds typed schema + migrations (`drizzle-kit` + `useMigrations`), and `SQLiteProvider` / `useSQLiteContext` + drizzle's `useLiveQuery` make the **draft-selector list reactive** with little code. Expo officially documents the Drizzle ↔ `expo-sqlite` integration.
- **Media files → `expo-file-system` new object API** (`File` / `Directory` / `Paths`):
  - Segment `.mp4`s + thumbnails → **`Paths.document`** (persistent — survives close/app updates).
  - Merged / exported output → **`Paths.cache`** (ephemeral — fine to be evicted).
  - Store **relative filenames** in the DB; rebuild `new File(Paths.document, …)` at runtime (same survive-container-moves invariant as [orig §2.2](docs/pulse-original-features.md)).
  - `expo-file-system/legacy` only if a dependency still needs the old string-URI form.

**Autosave behavior:** primary trigger is **segment-complete** (what the user asked for), plus delete / reorder / trim / rename. With the relational DB these are immediate row writes (coalesce rapid edits if needed) — replaces the original's 1 s-debounced AsyncStorage save ([orig §5](docs/pulse-original-features.md)).

**Draft-selector UI:** a list screen — each draft shows thumbnail, name, segment count + duration, last-modified; tap → reopen in the recorder with its segments restored. Mirrors [orig §6.2](docs/pulse-original-features.md) but reactive via `useLiveQuery`. _(Exact layout TBD — only the capability + stack are decided here.)_

> Out of scope of this decision (tracked in §5 table): draft transfer/export (`.pulse`) and per-draft upload-destination storage.

---

## 4. Upload — TUS resumable (real resume + progress UI) 🔁

**Decision:** keep resumable **TUS** upload to PulseVault, but replace the original's hand-rolled fetch implementation ([orig §8.2](docs/pulse-original-features.md)) with the maintained **[`tus-js-client`](https://github.com/tus/tus-js-client) v4** + our own persistence + a real progress/resume UI.

**Why not the alternatives:** `react-native-tus-client` (native TUSKit wrapper) is **abandoned** (last publish 2019, peer RN 0.41) — unusable on RN 0.85. Hand-rolling (like the original) re-implements retry/offset logic we'd otherwise get for free. So: `tus-js-client` (actively maintained, v4.3.1 Jan 2025, RN-supported).

**RN gotcha — the core best-practice work:** `tus-js-client`'s built-in resume storage uses the browser **Web Storage API, which doesn't exist in RN**, so its `fingerprint` / `resume` / `urlStorage` options are no-ops unless we supply our own. We provide:

- a custom **`urlStorage`** backed by our **SQLite/Drizzle** (§3) — persists fingerprint → upload URL so uploads resume **across app restarts / kills**;
- a custom **`fileReader`** that reads chunks from an `expo-file-system` `File` URI;
- an explicit **`chunkSize`** (RN requires it);
- **`retryDelays`** (e.g. `[0, 3000, 5000, 10000, 30000]`) so transient network failures auto-retry.

**Resume semantics (honest per case):**

- ✅ **Network drop → reconnect (foreground):** `retryDelays` retry; client `HEAD`s the upload URL for the server offset and continues.
- ✅ **App reopened after kill:** stored upload URL → recreate `tus.Upload({ uploadUrl })` → `HEAD` for offset → continue from where it stopped.
- ✅ **Return from background:** auto-resumes on foreground.
- ✅ **Uploading _while_ backgrounded/closed:** transfer **pauses** when the app is suspended/closed and **auto-resumes on reopen/foreground** — this is the **accepted, intended behavior** (user decision 2026-05-30). We deliberately **do NOT** pursue OS background-transfer (iOS `URLSession` background / Android `WorkManager`); we stick to what the app supports out of the box and is easy to implement.
- Use **`expo-network`** (or NetInfo) to detect connectivity → pause when offline, show "waiting for connection", auto-resume on reconnect.

**Upload UI (what the user asked for):** a clear status surface — **queued → uploading (live %) → paused/offline → retrying → done** — driven by `onProgress(bytesUploaded, bytesTotal)`, with pause/resume/cancel and a persistent indicator so a backgrounded/reopened upload shows its real state. Replaces the original's basic progress bar ([orig §8.1](docs/pulse-original-features.md)).

**Server contract unchanged:** keep `POST /reserve` → `videoid` (host server's responsibility, not the pulsevault plugin), then TUS create/upload with `Upload-Metadata` (videoid, filename) ([orig §8.2](docs/pulse-original-features.md)). Pre-reserving the `videoid` also gives idempotency on resume.

> Per-draft upload destinations and the `pulsecam://` → `pulsenew://` deep-link entry are related but separate decisions (still ❓ in §5 table).

---

## 5. Carry-over from original — to confirm ❓

Quick triage of original features (from [pulse-original-features.md](docs/pulse-original-features.md)) — mark each as we go:

| Feature                                | Original ref          | `pulse-new`                       | Status |
| -------------------------------------- | --------------------- | --------------------------------- | ------ |
| Segmented record (tap/hold)            | orig §4               | **keep** — segments via tap/hold §2.1 (duration presets TBD) | 🔁 §2.1 |
| Recording progress bar (red)           | orig §4.3             | **dropped** — replaced by bottom segment bar §2.1 | ✂️     |
| Import clips from library               | orig §4.6             | **keep** — **+** button on recorder §2.1 | 🔁 §2.1 |
| Pinch + drag-to-zoom                   | orig §4.4             | **keep** — expo-camera `zoom` prop + thin gesture glue §2.2 | 🔁 §2.2 |
| Camera controls (flip/flash/stabilize) | orig §4.4–4.5         | **same set as original**; expo-camera props + **@expo/ui** UI + expo-symbols/glass-effect §2.2 | 🔁 §2.2 |
| Undo / redo                            | orig §4.8             | **dropped** — manage via inline segment bar §2.1 | ✂️     |
| Segment delete                         | orig §6.5             | **inline** in recorder bottom bar §2.1 | 🔁 §2.1 |
| Segment reorder                        | orig §6.5             | **hold+drag** in the bottom bar §2.1 | 🔁 §2.1 |
| Per-segment edit (trim/crop/rotate)     | orig §6.6             | **tap thumbnail → RNVT `showEditor`** (full editor, destructive) §2.1/§1.2 | 🔁 §1  |
| Tap-to-focus                            | —                     | **skipped** (use expo-camera autofocus) §2.2 | ✂️     |
| Concat                                 | orig §7.1             | `react-native-video-trim` `merge` | 🔁 §1  |
| Audio-focus (pause bg audio)           | orig §7.2             | **deferred** — revisit later (likely via `expo-audio` mode, no native module) | ⏸️ defer |
| Draft model + on-disk storage          | orig §2               | **expo-sqlite + Drizzle** (meta) + **expo-file-system** new API (media) §3 | 🔁 §3  |
| Auto-save drafts                       | orig §5               | **on segment-complete** (+ edits), SQLite row writes §3 | 🔁 §3  |
| Draft selector / reopen                | orig §6.2             | list screen, reactive via `useLiveQuery` §3 (layout TBD) | 🔁 §3  |
| TUS resumable upload                    | orig §8.1–8.2         | **keep** — `tus-js-client` v4 + SQLite urlStorage + resume UI §4 | 🔁 §4  |
| Per-draft upload destinations           | orig §8.3             | keep (storage via §3); entry/UX TBD | ❓     |
| Deep links (`pulsecam://`)             | orig §8.3             | scheme is `pulsenew` now          | ❓     |
| Draft transfer (.pulse export/import)  | orig §9               |                                   | ❓     |
| Permissions                            | orig §10 (PermissionMonitor) | **granular / just-in-time** at point-of-use §2.3 | 🔁 §2.3 |
| Onboarding                             | orig §6.1             | **keep, built LAST** (end of build order) | ⏸️ defer |
| Theming / brand                        | orig §10              | **primary red** (`#F01E21`); Expo default icons/splash as placeholders, rebrand later §2.4 | 🔁 §2.4 |

---

## 6. Open questions

1. ~~Trim UX~~ → **decided:** RNVT native `showEditor`, use all RNVT editor features, no custom screen; **keep `originalFilename` + `editedFilename`**, re-edit/reset from original (§1.1/§1.2/§1.4/§2.1/§3).
2. ~~Reorder~~ → **decided:** hold+drag in the bottom bar (§2.1).
3. ~~Trim entry point~~ → **decided:** tap a thumbnail (§2.1).
4. **In-flight recording progress** — with the red progress bar gone (§2.1), how is the currently-recording clip's elapsed/remaining time shown? ⏸️ **Deferred to late in implementation** (decide once the recorder is built, to keep it clean).
5. _(add as they come up)_
