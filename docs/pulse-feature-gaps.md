# Pulse (original) → `pulse-new` — Feature Gaps

> Features the **original Pulse** (`mieweb/pulse`, cloned at [tmp/pulse/](../tmp/pulse/)) has that the **current `pulse-new` impl** does not. Derived from a fresh audit of `src/` (2026-06-14) against the original's source. **Excludes deeplinks and uploads** (handled separately). Each item documents *how the original did it* so it can be re-built.
>
> Two buckets: **A. Genuine gaps** (in-scope, just not built yet) and **B. Deliberately dropped** (product decisions per the plan — listed for completeness, not necessarily to port).
>
> `pulse-new` has also *added* features the original lacks (on-device Whisper transcription/captions, physical-lens selector, richer stabilization modes) — out of scope for this doc.

---

## A. Genuine gaps (not yet built)

### A1. Draft transfer — `.pulse` export / import  *(user already flagged)*

**What:** Move drafts between devices. Export selected drafts (multi-select + "Select All") to a single `.pulse` file via the share sheet (AirDrop / Files / iCloud); import one back.

**How the original did it** — [tmp/pulse/utils/draftTransfer.ts](../tmp/pulse/utils/draftTransfer.ts):
- A `.pulse` file is a JSON bundle: `{ version: "1.0", draft, files: { relativePath → base64 } }`. Every segment `.mp4` and the thumbnail is **base64-encoded inline** (`FileSystem.readAsStringAsync(..., { encoding: Base64 })`), so the bundle is fully self-contained.
- `exportSelectedDrafts(ids)` (~:151-227) walks each draft's segments + thumb, base64s them into one `files` map, writes `pulse-backup-{ts}.pulse` (multi) or `pulse-draft-{name}-{ts}.pulse` (single) to cache, then hands to `expo-sharing`.
- `importDraft` / `importAllDrafts` (~:235-332) decode the base64 back to disk under managed storage, and **preserve original `id` / `createdAt` / `lastModified` / `name`**.
- UI: `DraftTransfer` invoked from the drafts list ([tmp/pulse/app/(tabs)/index.tsx](../tmp/pulse/app/%28tabs%29/index.tsx) ~:365-436) — multi-select mode with Select-All; import via `expo-document-picker`.

**For `pulse-new`:** same idea, but adapt to the Drizzle schema (a draft = `projects` row + its `segments` rows incl. `editedFilename`) and the SDK 56 `File`/`Paths` API. Bundle the **effective files** (`edited ?? original`) or both; decide whether edits travel. Deps already implied: `expo-sharing` (present), add `expo-document-picker`.

---

### A2. Audio focus — pause background audio while recording

**What:** When recording starts, pause whatever the user is playing (Spotify / YouTube / podcast) instead of mixing it in; restore on stop. Current `pulse-new` only sets `mute` on `CameraView` (no background-audio ducking).

**How the original did it** — custom native module [tmp/pulse/modules/audio-focus/](../tmp/pulse/modules/audio-focus/), driven by [tmp/pulse/hooks/useAudioSession.ts](../tmp/pulse/hooks/useAudioSession.ts):
- TS surface: `requestAudioFocus()` / `abandonAudioFocus()`.
- **iOS** ([AudioFocusModule.swift](../tmp/pulse/modules/audio-focus/ios/AudioFocusModule.swift)): `AVAudioSession.setActive(true/false, options: .notifyOthersOnDeactivation)` — category itself set by expo-audio.
- **Android** ([AudioFocusModule.kt](../tmp/pulse/modules/audio-focus/android/src/main/java/expo/modules/audiofocus/AudioFocusModule.kt)): `AudioManager` `AUDIOFOCUS_GAIN_TRANSIENT` (O+ `AudioFocusRequest`, legacy stream API below) so other apps pause.
- Tied into the recorder's focus/blur lifecycle (orig §4.7) — the same dance that fixed the "mic dies on segment 2" iOS bug.

**For `pulse-new`:** deferred per the original plan, which suggested trying an **`expo-audio` audio-mode** (`shouldDuckAndroid` / `interruptionMode`) before re-porting a native module. Worth checking whether expo-audio alone gets it on SDK 56; fall back to the tiny native module if not. **Re-validate the segment-2 mic bug regardless** — it's the original's most fragile behavior.

---

### A3. Onboarding / first-run tour

**What:** First-launch-only feature tour; "Get Started" sets a flag and never shows again.

**How the original did it** — [tmp/pulse/app/onboarding.tsx](../tmp/pulse/app/onboarding.tsx):
- Pulsing logo (Reanimated), 5 feature cards, "Get Started" writes `onboardingComplete` to AsyncStorage and routes to tabs.
- Gated by [tmp/pulse/hooks/useFirstTimeOpen.ts](../tmp/pulse/hooks/useFirstTimeOpen.ts) (reads the flag) in the tabs layout — first run redirects to `/onboarding`.

**For `pulse-new`:** explicitly planned to be built **last** (per the original build order). Store the flag in the `settings` table (already exists) rather than AsyncStorage, gate at the root layout.

---

### A4. Persisted camera preferences

**What:** Remember the user's camera choices across launches. `pulse-new` resets **facing** (→ back) and **stabilization** (→ off) on every cold start.

**How the original did it** — small AsyncStorage-backed hooks:
- [tmp/pulse/hooks/useCameraFacing.ts](../tmp/pulse/hooks/useCameraFacing.ts) — persists `cameraFacing` `"front"|"back"`.
- [tmp/pulse/hooks/useVideoStabilization.ts](../tmp/pulse/hooks/useVideoStabilization.ts) — persists `videoStabilizationMode` `"on"|"off"`.
- (Also `deleteDraftAfterUpload` via [useDeleteDraftPreference.ts](../tmp/pulse/hooks/useDeleteDraftPreference.ts) — upload-coupled, out of scope here.)

**For `pulse-new`:** trivial — persist the recorder's `facing` / stabilization-mode / `selectedLens` state to the `settings` table on change, hydrate on mount. Low effort, real UX win.

---

## B. Deliberately dropped (product decisions — port only if you've changed your mind)

### B1. Duration presets (15 / 30 / 60 / 180s) + max-duration limit enforcement

**Status:** intentionally removed — `pulse-new` decided **"no cap, record freely"** (2026-06-02 decision).

**How the original did it:** preset picker [tmp/pulse/components/TimeSelectorButton.tsx](../tmp/pulse/components/TimeSelectorButton.tsx) (modal of 15/30/60/180); enforcement in `shorts.tsx` computes **trim-aware "effective duration"** per segment and rejects a new clip that would exceed the limit with an alert; the **red segmented progress bar** [tmp/pulse/components/RecordingProgressBar.tsx](../tmp/pulse/components/RecordingProgressBar.tsx) visualized remaining budget with per-segment dividers. `maxDurationLimitSeconds` lived on the draft.

**Note:** revisit only if you want a length cap; the segment bar replaced the progress bar by design.

---

### B2. Undo / redo of segments

**Status:** intentionally dropped — managed via the inline segment bar instead.

**How the original did it** — [tmp/pulse/components/UndoSegmentButton.tsx](../tmp/pulse/components/UndoSegmentButton.tsx) / [RedoSegmentButton.tsx](../tmp/pulse/components/RedoSegmentButton.tsx) + logic in `hooks/useDraftManager.ts` (~:415-574): undo moves the last segment to a `redo_stack` **persisted in AsyncStorage** (survives sessions); emptying all segments metadata-deletes the draft but **keeps the files**; redo restores (recreating the draft with its original id if needed).

**Note:** the destructive-edit model + per-row DB writes in `pulse-new` make a redo-stack more involved than the original's blob approach; only build if users ask.

---

## Quick gap table

| Feature | Bucket | Original source | `pulse-new` |
| --- | --- | --- | --- |
| `.pulse` draft export/import | A — gap | `utils/draftTransfer.ts` + drafts list | ✗ |
| Audio focus (pause bg audio) | A — gap | `modules/audio-focus/*` + `useAudioSession` | ✗ (only `mute`) |
| Onboarding tour | A — gap | `app/onboarding.tsx` + `useFirstTimeOpen` | ✗ (planned last) |
| Persisted camera facing/stabilization | A — gap | `useCameraFacing` / `useVideoStabilization` | ✗ (resets) |
| Duration presets + max-length cap | B — dropped | `TimeSelectorButton` + `RecordingProgressBar` | ✗ (no cap, by choice) |
| Undo / redo segments | B — dropped | `Undo/RedoSegmentButton` + `useDraftManager` | ✗ (by choice) |

*Excluded by request: deeplinks (`pulsecam://` upload-chooser) and the TUS upload subsystem.*
