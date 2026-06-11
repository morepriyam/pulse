# `pulse-new` — Implementation Status & Next Steps

> **What this is.** A snapshot of where the build actually stands vs. the design docs, the gaps that matter, and a phased plan to continue. Pick this up later as the working checklist. Reconcile against the decisions in [pulse-new-plan.md](pulse-new-plan.md) (forward decisions) and [pulse-original-features.md](pulse-original-features.md) (behavior spec).
>
> **Captured:** 2026-06-04 · **last updated:** 2026-06-10 (**major reversal: `react-native-video-trim` (RNVT) re-adopted — see [pulse-new-plan.md](pulse-new-plan.md) §1.** Editing is now RNVT's full-screen native editor (trim + crop/rotate/flip/mute/speed), and export is RNVT `merge()` (FFmpeg) — the custom AVFoundation/Media3 module is dropped. This **supersedes** the 2026-06-02 "drop RNVT / native-only / non-destructive" direction and the in-recorder custom preview (moved to branch `backup/in-recorder-preview`). Trim is now **destructive** (`editedFilename`), originals kept. Code + config landed and static-verified (tsc/lint/format clean, migration `0001`, prebuild applies plugin); native dev-build runtime test still pending). Update as phases land.

---

## 1. What's built so far

### Committed — storage layer + app shell ✅

| Piece                                    | File                                                | Status                                                                                                                                                 |
| ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drizzle schema (`projects` + `segments`) | [src/db/schema.ts](../src/db/schema.ts)             | ✅ destructive-edit model (migration `0001`): `originalFilename` kept pristine; `editedFilename`/`editedDurationMs` hold RNVT's re-encoded output; effective = `edited ?? original`. `trimStartMs`/`trimEndMs` now dead |
| DB connection                            | [src/db/client.ts](../src/db/client.ts)             | ✅ single conn, `enableChangeListener` (powers `useLiveQuery`), `foreign_keys = ON` for segment→project cascade                                        |
| Reactive drafts query                    | [src/db/drafts.ts](../src/db/drafts.ts)             | ✅ `draftListQuery` with trim-aware effective duration `coalesce(trimEnd - trimStart, duration)` (§3)                                                  |
| Migration gate                           | [src/db/migrate.tsx](../src/db/migrate.tsx)         | ✅ blocks app start until schema ready                                                                                                                 |
| Home / Drafts (screen #1)                | [src/app/index.tsx](../src/app/index.tsx)           | ✅ reactive `useLiveQuery`, draft cards, FAB, empty state, dev seed/clear (§2.0)                                                                       |
| Theme (light/dark + red accent)          | [src/constants/theme.ts](../src/constants/theme.ts) | ✅ §2.4                                                                                                                                                |

### Committed — recorder (Phase A) + dev-build infra ✅

| Piece                                      | File                                                                                      | Status                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Camera/storage deps                        | [package.json](../package.json)                                                           | `expo-camera`, `expo-file-system`, `expo-video` — all now in use                                                  |
| Config: permissions, package id, plugins   | [app.json](../app.json)                                                                   | Android camera/record perms, `expo-camera` plugin + permission strings, `expo-video` plugin, custom prebuild plugin |
| Prebuild plugin: disable script sandboxing | [plugins/with-disable-script-sandboxing.js](../plugins/with-disable-script-sandboxing.js) | ✅ lets bundle phase write dev-server `ip.txt` on device builds                                                    |
| Routes registered as full-screen modals    | [src/app/\_layout.tsx](../src/app/_layout.tsx)                                            | ✅ `recorder` only — the `timeline` route was **removed 2026-06-10** (editing moved into the recorder)             |
| Recorder screen (#2)                       | [src/app/recorder.tsx](../src/app/recorder.tsx) + [src/features/recorder/](../src/features/recorder/) | ✅ **Phase A complete** — draft-backed, persisted, resumable (see §3)                                  |
| In-recorder preview (replaces timeline #3) | [preview-modal.tsx](../src/features/recorder/preview-modal.tsx) · [use-preview.ts](../src/features/recorder/use-preview.ts) · [playhead-cursor.tsx](../src/features/recorder/playhead-cursor.tsx) | ✅ **landed 2026-06-10, simulator-verified** — tap a clip → preview over the camera area; trim-aware sequential playback; draggable playhead. Trim UI next (see §3 Phase B) |
| Dev-seed fixtures + seed/clear             | [src/dev/seed.ts](../src/dev/seed.ts) + [assets/dev/](../assets/dev/)                     | ✅ **real (2026-06-08)** — 6 bundled clips (Git LFS) → one idempotent "Dev sample" draft; verified on simulator (§1.0b) |

**Recorder — what works:** `CameraView`; JIT camera+mic permission gate with Settings fallback (§2.3); tap-to-record start/stop; clips persisted to the document dir + autosaved as `segments` rows; segment bar driven by `useLiveQuery` with inline ✕ delete, hold+drag reorder, and **tap-to-preview**; real first-frame thumbnails (runtime); camera controls (flip / flash / stabilization); lazy draft creation + empty-draft cleanup; resume a draft from Home via `draftId`; `→` is a stub Alert until export (Phase C).

**In-recorder preview — what works (2026-06-10, iOS-simulator-verified on the dev-seed draft):** tapping a segment thumb opens a preview surface covering the camera area only (the bar stays visible and interactive); the camera stays mounted with its session paused (`CameraView active={false}`, iOS-only prop) and record/camera controls hidden; one shared `expo-video` player plays from the tapped clip through all later clips sequentially, honoring each clip's trim window with auto-advance (verified across the 24s→22s boundary); portrait clips render upright and landscape clips letterbox (`contentFit="contain"` honoring the fixtures' rotation matrices); a draggable playhead cursor over the bar tracks playback proportionally (fixed-width thumbs ↔ effective durations) and scrubs across clip boundaries with live frame preview, pausing playback. Two SDK 56 findings baked into [use-preview.ts](../src/features/recorder/use-preview.ts): (1) `timeUpdateEventInterval` defaults to **0 = `timeUpdate` never fires** — must be set explicitly; (2) after `replaceAsync` the time observer can still report the **outgoing** clip's position until the new item is `readyToPlay`, so the auto-advance guard must stay armed until then (clearing it at `replaceAsync` resolution cascades the advance through every shorter clip) and the resume-`play()` must ride `statusChange`, not the promise. Known nuance: tapping a thumb mid-playback switches clips but keeps playing (AVPlayer keeps its rate through the swap) rather than landing paused.

### Code structure & tooling

- **Feature-scoped modules.** The recorder lives in [src/features/recorder/](../src/features/recorder/): `use-recorder` (draft + recording state/actions), `use-recorder-permissions`, and presentational `permission-gate` / `camera-controls` / `segment-bar` / `close-button`. [recorder.tsx](../src/app/recorder.tsx) is a thin orchestrator. Convention going forward: `components/` = shared, `features/<screen>/` = feature-scoped.
- **Media utils.** [src/utils/video.ts](../src/utils/video.ts) (`generateThumbnail` cached by uri, `getDurationMs`) and [src/utils/file-store.ts](../src/utils/file-store.ts) (relative-path clip storage over the SDK 56 `File`/`Directory`/`Paths` API).
- **Formatting/lint.** Prettier configured ([.prettierrc.json](../.prettierrc.json), `npm run format` / `format:check`) and wired into ESLint via `eslint-config-prettier`. Codebase is tsc-, lint-, and Prettier-clean.
- **Dev-seed fixtures (Git LFS).** [src/dev/seed.ts](../src/dev/seed.ts) `seedDraft()`/`clearDrafts()` back the Home `+ seed` / `clear` buttons (`__DEV__`-only). `seedDraft()` copies six bundled clips from [assets/dev/](../assets/dev/) onto disk via [`copyIntoSegments`](../src/utils/file-store.ts) (a **byte copy** that leaves the bundled source intact, vs. the move-based `persistRecording`), reads native duration, and inserts them through the production `addSegment` path. The fixtures **match the surfaces the app meets**: 4 portrait + 2 landscape, mixed H.264/HEVC, 1080p/4K, 30/60fps, QuickTime/MP4 containers — and the portrait clips carry an **iPhone-accurate coded-landscape + 90° rotation matrix** (not baked-portrait pixels), so the ingest/rotation path is genuinely exercised. The clips (~25 MB) and the regen master (`fixtures/bbb_master.mov`, ~400 MB, excluded from clones via [.lfsconfig](../.lfsconfig)) live in **Git LFS** — a clone needs `git lfs` installed. Regenerate with [scripts/make-dev-fixtures.sh](../scripts/make-dev-fixtures.sh). Full matrix + rationale in [assets/dev/README.md](../assets/dev/README.md).
- **Recorder capture profile (reference).** `recordAsync()` is called with no options, so a real capture is iOS AVFoundation defaults: **H.264/AAC, 1080×1080… 1920×1080, ~30fps, portrait, QuickTime (`.mov`) bytes** — then persisted **renamed to `.mp4`** (the on-disk extension is always `.mp4`; bytes are unchanged). The `portrait-1080p-30fps-h264` fixture mirrors this exactly. No import-from-Photos path exists yet (`expo-image-picker` is Phase D); when it lands it must normalize the landscape/HEVC variety the fixtures already include.

---

## 2. Gaps that matter (code vs. docs)

### ⚠️ Gap A — Build-order inversion

- **Docs say:** the **timeline editor is Milestone 0** ("editing leads, recording follows," §Build order, 2026-06-02), built on a `DEV_SEED_SEGMENTS` flag + bundled fixtures so it's **emulator-testable with no camera**. The riskiest piece is the native trim/concat module + timeline (§1.0).
- **Reality:** recorder was built first; the native export module doesn't exist.
- **Progress (2026-06-08):** the dev-seed path is now **real** — [src/dev/seed.ts](../src/dev/seed.ts) `seedDraft()` builds a real "Dev sample" draft from six bundled `assets/dev/` clips (replacing the old fake `devSeedDraft` that pointed at non-existent `dev/a.mp4`/`dev/b.mp4`). Verified end-to-end on the iOS simulator (seed → 6 segments/116 s, rotation handled in thumbnails, clear teardown, idempotent across 3 taps).
- **Direction change (2026-06-10):** the standalone timeline screen is **dropped** — there is no separate editor; editing lives **inside the recorder** (a first full-screen-track implementation was built, reverted, and preserved on local branch `backup/timeline-v1` for reference). The in-recorder **preview half is now landed and simulator-verified** (tap-a-clip modal, trim-aware sequential playback, draggable playhead). What remains of the editor is the **trim UI** (next milestone) — then the native export module (Phase C), still the real Milestone-0 risk.

### ✅ Gap B — Recorder doesn't go through the draft model — **RESOLVED (Phase A, 2026-06-05)**

This was the architectural seam to close first; both screens depend on it. Closed in Phase A (see §3): clips are persisted to `Documents/drafts/{id}/segments/` as relative paths, autosaved on segment-complete, the bar reads from `useLiveQuery`, draft cards resume via `draftId`, and thumbnails are real first frames (generated at runtime). Remaining nuance tracked under "Edge cases to revisit" in §3.

### Other missing recorder pieces (§2.1 / §2.2)

Still to do (polish, Phase D): hold-to-record · `+` import (`expo-image-picker`) · pinch/drag zoom gesture · glass-effect styling on the control rail (`@expo/ui` + `expo-glass-effect`).
Done: flip/flash/stabilization controls, hold+drag reorder, tap-to-preview (2026-06-10).

---

## 3. Plan — phased, doc-consistent

Sequenced to reconcile the recorder-first start with the docs' editor-first intent: **close the persistence seam first** (both screens need it), then do the native module + timeline (the real Milestone 0 risk).

### Phase A — Wire the recorder into the draft model (close the seam) ✅ **LANDED 2026-06-05**

Goal: recorded/imported clips become real persisted segments; both screens talk only through the DB (§1.0b). Tested on device — record-from-`+`, persistence across app kill, resume-from-card, lazy creation, delete, reorder, and duration all verified working. (Timeline plumbing via `→` is planned separately.)

- [x] **File-store util** ([src/utils/file-store.ts](../src/utils/file-store.ts)) — SDK 56 `File`/`Directory`/`Paths` API: `persistRecording` moves clip cache → `Documents/drafts/{draftId}/segments/{segmentId}.mp4`; stores **relative** paths, `absolutize` at runtime (§2.2); `deleteSegmentFile`/`deleteDraftDir`.
- [x] **Draft mutations** ([src/db/drafts.ts](../src/db/drafts.ts)) — `createDraft`, `addSegment`, `deleteSegment`, `reorderSegments`, `renameDraft`, `deleteDraft`, `segmentsForDraft`; each write bumps `lastModified` (§3). `draftListQuery` exposes `firstSegmentFilename` for the cover frame.
- [x] **Thumbnails** ([src/utils/video.ts](../src/utils/video.ts)) — **revised: not persisted.** `expo-video`'s `VideoThumbnail` is a `SharedRef<'image'>` with no file URI, so we generate the first frame at runtime from the persisted clip (cached by uri) in both the segment bar and draft cards. No new dep, no migration; schema `thumbnail` columns left reserved.
- [x] **Recorder rewrite** ([src/app/recorder.tsx](../src/app/recorder.tsx)) — accepts `draftId` param (card resume); **lazy** draft creation on first clip (no empty-draft litter); persists each clip; bar driven by `useLiveQuery(segmentsForDraft(draftId), [draftId])`. Duration from native `getDurationMs`, not a JS timer.

#### Edge cases to revisit later (Phase A correctness/robustness backlog)

Not blocking — recorded here so they aren't forgotten:

- **Orphaned files on crash** — `persistRecording` moves the file _before_ `addSegment` inserts the row. A crash/kill in that window leaves an mp4 on disk with no DB row (storage leak). No reconciliation/GC pass exists yet. _Fix later:_ a startup sweep that deletes `drafts/*/segments/*` files with no matching `segments.originalFilename`.
- **Empty drafts after deleting all clips** — _partially handled (2026-06-05):_ a draft **created this session** that's left with 0 clips is auto-deleted on recorder exit (mirrors lazy creation). **Still open:** a **resumed** draft (opened from a card) whose segments are then all deleted is left intact — deliberately, so the async-loading segment query can't trigger a false delete. Revisit once there's a "loaded" signal or explicit draft-delete UI (`deleteDraft`/`renameDraft` exist, unwired).
- **`getDurationMs` failure → 0** — on a player error the segment is stored with `durationMs: 0` (skews Home total; export may mishandle). No retry/repair. Consider re-reading duration lazily or flagging the row.
- **Thumbnail cache is in-memory only** — lost on cold start, so every relaunch regenerates first frames (one `createVideoPlayer` per draft card on the Home list). Fine for small lists; revisit if the list grows or scroll stutters.
- **Recording-interrupt path** — `recordAsync` rejection is swallowed (clip dropped). Verified no orphan segment is added, but double-check backgrounding mid-record and the audio-session edge (orig §4.2 / SDK 56 mic behavior) on both platforms.
- **`deleteSegment` shared-file guard is untested** — the "delete file only if no sibling references `originalFilename`" branch only matters once the timeline introduces splits (two rows sharing a file). Re-verify when Phase B splits land.
- **Reorder during/after a concurrent write** — `reorderSegments` is transactional and the bar feeds off the live query directly (no local mirror); confirmed stable in manual testing, but worth a look if record-while-dragging ever becomes possible.

### Phase B — Editing via RNVT editor (replaces the custom preview/timeline)

Goal: tap a clip → RNVT's full-screen native editor; save → destructive `editedFilename`. Code landed 2026-06-10; **native dev-build runtime test pending**.

- [x] **Dev-seed fixtures** ✅ **2026-06-08** — six bundled clips under [assets/dev/](../assets/dev/) (Git LFS), portrait-weighted and realistic (mixed res/fps/codec/container, iPhone-accurate rotation metadata). [src/dev/seed.ts](../src/dev/seed.ts) `seedDraft()` copies them into `drafts/dev-seed/segments/` and inserts segments via the production path; `clearDrafts()` tears it down. Idempotent. Wired to Home `+ seed`/`clear`. These mismatched clips are the test set for both the RNVT editor and `merge()`.
- [x] **RNVT editor wiring** (2026-06-10) — [use-video-trim.ts](../src/features/recorder/use-video-trim.ts) mounts RNVT listeners and `openTrim(segment)` → `showEditor(absolutize(original), …)` on the **pristine original**; `onFinishTrimming` → [`importTrimmedFile`](../src/utils/file-store.ts) moves the re-encoded output into the draft as `{segmentId}.edited.mp4` → [`setEdited`](../src/db/drafts.ts). Config: `enablePreciseTrimming: true`, `enableEditTools: true` (crop/rotate/flip/mute/speed), red `trimmerColor`, `saveToPhoto: false`. Launched from a **✂ button in the preview modal** (left of the 🗑 delete) for the active previewed clip; opening it closes the preview so re-opening plays the fresh edit.
- [x] **In-recorder preview kept** — `use-preview`/`preview-modal`/`playhead-cursor` were retained (not removed) and **re-pointed at the effective file** (`editedFilename ?? originalFilename` via `segment-window.effFile`): tap a thumb → sequential playback + draggable playhead; edits show up because playback uses the edited file. Thumbnails are tap-to-preview + ✕-delete only. (`backup/in-recorder-preview` still holds the pre-RNVT snapshot.)
- [x] **Destructive model** — schema gained `editedFilename`/`editedDurationMs` (migration `0001`); originals kept pristine, re-edit re-opens the original, `resetEdit` clears it. Effective file/duration = `edited ?? original` everywhere (thumbnails, `draftListQuery`, export). The old `trimStartMs`/`trimEndMs` columns are now dead.
- [ ] **Runtime test** — pending a native dev build: `showEditor` + transforms on each fixture, `editedFilename`/thumbnail/duration update, re-tap re-opens original, reset restores.
- [ ] **Reset UI** — `resetEdit` mutation exists; a "reset to original" affordance on edited thumbs is unwired.

### Phase C — Export (deferred; RNVT `merge()` tested then removed)

- [x] **`merge()` proven on-device, then removed (2026-06-10).** A simulator run confirmed `merge()` composes all effective files (edited ?? original) into one playable mp4 (`trimmedVideo_merged_*.mp4`, ~39 MB), and the throwaway preview played it. **But it was too slow** (sim software encoder; ~minutes for 6 mixed clips), so per the user the `→` button is **back to a placeholder Alert** ("Export coming soon"), `merge()`/`export-preview.tsx` were removed. The custom AVFoundation/Media3 module remains dropped. `react-native-video-trim` stays installed — used only for `showEditor`.
- [ ] **Real export TBD** — decide the export path later (RNVT `merge()` accepted-but-slow, or revisit). Wire `→` → export → Upload (Phase D) when the Upload screen lands.

### Phase D — Upload (§4) and the rest

- [ ] Upload screen (#4): inline merged preview (tap→fullscreen via `expo-video`), `tus-js-client` v4 + SQLite `urlStorage`/`fileReader` (§4), per-draft destination picker (#5), pause/resume UI.
- [ ] Recorder polish (§2.1/2.2): hold-to-record, `+` import, tap-to-preview, glass-effect control rail (`@expo/ui` + `expo-glass-effect`), pinch/drag zoom glue. (Flip/flash/stabilization + hold+drag reorder already done.)
- [ ] Deferred to the end per docs: `.pulse` transfer (§9), onboarding (§5), rebrand (§2.4).

---

## 4. Key recommendation

**The pipeline pivoted to `react-native-video-trim` for editing; export is deferred.** Editing = RNVT's native `showEditor` (destructive `editedFilename`, originals kept); the custom AVFoundation/Media3 module is dropped. **Fully verified on the iOS simulator (2026-06-10)** via a dev build with FFmpegKit: dev-seed loads, tap→preview plays, **✂→RNVT editor trims** (DB confirmed `edited_filename` + `edited_duration_ms = 15338` exact, original kept), thumbnails/duration update reactively, delete cleans up both files, reorder persists. RNVT `merge()` export was also proven (one ~39 MB mp4, played) **but removed for being too slow** — `→` is a placeholder Alert again; `react-native-video-trim` stays only for `showEditor`. The custom preview's pre-RNVT snapshot lives on `backup/in-recorder-preview`.

## 5. Invariants to honor (don't regress these)

- **Relative-path storage** for segment/thumb URIs; absolutize only at runtime (§2.2).
- **Originals stay pristine** — never mutate `originalFilename`; edits write a separate `editedFilename` (RNVT output), and re-editing always re-opens the original (no compounding re-encode). Effective file/duration = `edited ?? original`.
- **Trust native duration**, not JS timers, for segment length (orig §4.2 / §11).
- **Autosave on segment-complete** (+ delete/reorder/trim/rename) as single-row writes (§3).
- **Recorder and editor communicate only through the draft model**, never a live session object (§1.0b).
