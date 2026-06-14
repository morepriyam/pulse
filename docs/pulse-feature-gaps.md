# Pulse (original) → `pulse-new` — Feature Gaps

> Features the **original Pulse** (`mieweb/pulse`, cloned at [tmp/pulse/](../tmp/pulse/)) has that the **current `pulse-new` impl** does not. Derived from a fresh audit of `src/` (2026-06-14) against the original's source. **Excludes deeplinks and uploads** (handled separately). Each item documents *how the original did it* so it can be re-built.
>
> Two buckets: **A. Genuine gaps** (in-scope, just not built yet) and **B. Deliberately dropped** (product decisions per the plan — listed for completeness, not necessarily to port).
>
> `pulse-new` has also *added* features the original lacks (on-device Whisper transcription/captions, physical-lens selector, richer stabilization modes) — out of scope for this doc.

---

## A. Genuine gaps (not yet built)

### A1. Draft transfer — `.pulse` export / import — ✅ RESOLVED (2026-06-14)

**What:** Move drafts between devices. Export selected drafts (multi-select + "Select All") to a single `.pulse` file via the share sheet (AirDrop / Files / iCloud); import one back.

**Resolved in `pulse-new` — rebuilt, not ported.** The original's base64-in-JSON bundle was the part to improve: it inflates payload ~33% and `JSON.stringify`s a multi-hundred-MB string (OOM risk). Instead a `.pulse` file is now a **ZIP archive** (`fflate`, STORE mode — the clips are already H.264) holding `manifest.json` + the raw `media/*.mp4` files. Thumbnails aren't shipped (deterministic derivatives — regenerated on import); transcripts, DB ids, and the per-device upload destination are omitted.
- **Format** — [src/features/draft-transfer/manifest.ts](../src/features/draft-transfer/manifest.ts): Drizzle-shaped (`projects` + `segments`), carries `name`/`createdAt`/durations and the original↔edited relationship. **Full edit fidelity**: an edited clip ships both its pristine original *and* its edited cut, so the recipient gets an identical draft and can still Reset.
- **Export** — [pack.ts](../src/features/draft-transfer/pack.ts): `exportDrafts(ids, now)` reads each effective clip's bytes (new SDK 56 `File.bytes()`), `zipSync`s into one `.pulse` in cache, returns its uri for `expo-sharing`. Single draft → `pulse-draft-<name>-<ts>.pulse`, multi → `pulse-backup-<ts>.pulse`.
- **Import** — [unpack.ts](../src/features/draft-transfer/unpack.ts): `importPulseFile(uri)` validates the manifest, writes clips back under a **fresh draft id** (never the source's — so import can't clobber a local draft and a bundle re-imports cleanly; correctness fix vs. the original's id-preserving import), regenerates thumbnails, then commits rows in a transaction (`insertImportedDraft`). Each draft is independent — a bad one is rolled back and skipped. `createdAt` preserved; `lastModified = now` so imports surface at the top.
- **UI** — [src/app/index.tsx](../src/app/index.tsx) + [draft-card.tsx](../src/features/home/draft-card.tsx): a Share button enters multi-select (checkboxes + "Select All", count in the header, Share FAB); an import button (`square.and.arrow.down`) opens `expo-document-picker`. Busy state via [use-draft-transfer.ts](../src/features/draft-transfer/use-draft-transfer.ts).
- **Deps:** added `fflate` (pure-JS zip, no rebuild) + `expo-document-picker` (native — needs `pod install` + rebuild; done).
- **Fast-follow (not built):** register a `.pulse` document type + inbound `expo-linking` handler so AirDrop offers "Open in Pulse" directly (today an AirDropped bundle is saved to Files, then imported via the picker — all three transports work).

**How the original did it** — [tmp/pulse/utils/draftTransfer.ts](../tmp/pulse/utils/draftTransfer.ts):

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

### A4. Persisted camera preferences — ✅ RESOLVED (2026-06-14)

**What:** Remember the user's camera choices across launches.

**How the original did it** — small AsyncStorage-backed hooks:
- [tmp/pulse/hooks/useCameraFacing.ts](../tmp/pulse/hooks/useCameraFacing.ts) — persists `cameraFacing` `"front"|"back"`.
- [tmp/pulse/hooks/useVideoStabilization.ts](../tmp/pulse/hooks/useVideoStabilization.ts) — persists `videoStabilizationMode` `"on"|"off"`.
- (Also `deleteDraftAfterUpload` via [useDeleteDraftPreference.ts](../tmp/pulse/hooks/useDeleteDraftPreference.ts) — upload-coupled, out of scope here.)

**Resolved in `pulse-new`:** **facing**, **stabilization**, and **mic/mute** now persist app-wide via the `settings` key/value table. `getRecorderPrefs`/`setSetting` in [src/db/settings.ts](../src/db/settings.ts); the recorder hydrates on mount and writes each pref on change in [src/features/recorder/use-recorder.ts](../src/features/recorder/use-recorder.ts), holding the camera render until prefs load ([src/app/recorder.tsx](../src/app/recorder.tsx)) so there's no back→front flash. `torch` stays session-only and `lens` stays per-facing (unpersisted) by design.

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
| `.pulse` draft export/import | ✅ done | `utils/draftTransfer.ts` + drafts list | ✅ ZIP bundle (`features/draft-transfer/*`) + multi-select |
| Audio focus (pause bg audio) | A — gap | `modules/audio-focus/*` + `useAudioSession` | ✗ (only `mute`) |
| Onboarding tour | A — gap | `app/onboarding.tsx` + `useFirstTimeOpen` | ✗ (planned last) |
| Persisted camera facing/stabilization/mute | ✅ done | `useCameraFacing` / `useVideoStabilization` | ✅ `settings` table + `use-recorder` hydrate/persist |
| Duration presets + max-length cap | B — dropped | `TimeSelectorButton` + `RecordingProgressBar` | ✗ (no cap, by choice) |
| Undo / redo segments | B — dropped | `Undo/RedoSegmentButton` + `useDraftManager` | ✗ (by choice) |

*Excluded by request: deeplinks (`pulsecam://` upload-chooser) and the TUS upload subsystem.*
