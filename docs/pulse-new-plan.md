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

**Milestone 0 (first thing we build) — _revised 2026-06-02_:** the **custom timeline editor** (splits + trims, §1.0a) running on **dev-seeded segments** (§1.0b), driving the **native AVFoundation / Media3 trim+split ops** (§1.0) — all **testable in an emulator** with no camera. Recording is **decoupled and built after**. Rationale: editing is now the riskiest/most native-heavy piece (we own the trim/split/concat module — there's no library doing it for us), and the dev-seed flag lets us prove it on a simulator before the recorder or a physical device exists. Details in §1.0–§1.0b.

> _Previously (2026-05-30): milestone 0 was recording + `react-native-video-trim` with all RNVT features. Superseded — RNVT is dropped (§1.0) and editing now leads (§1.0a/§1.0b)._

**Last:** **onboarding** is built **at the end**, once the core flows work (§5 carry-over).

---

## Decision log

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Status                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 2026-05-30 | Use **`react-native-video-trim`** for concat **and** trim; drop the original's custom native modules for video. Adopt it early (set up the dev build before building features on top).                                                                                                                                                                                                                                                                                        | 🔁 §1                 |
| 2026-05-30 | **Sequencing:** video recording + RNVT (all features enabled) is **milestone 0** — set up first, before any other feature.                                                                                                                                                                                                                                                                                                                                                    | 📝 note               |
| 2026-05-30 | **Recorder layout:** drop undo/redo; show segments as a bottom thumbnail bar with inline ✕ delete; camera renders above; `→` to proceed. Layout only.                                                                                                                                                                                                                                                                                                                         | 🔁 §2.1               |
| 2026-05-30 | **Segment-bar gestures:** hold+drag a thumbnail to **reorder**; tap a thumbnail to ~~view + trim~~ **preview** _(tap-to-trim removed 2026-06-03 — trimming is on the timeline, §1.0a)_.                                                                                                                                                                                                                                                                                       | 🔁 §2.1               |
| 2026-05-30 | **Keep segmented recording** but **drop the red progress bar** ([orig §4.3]) — bottom thumbnail bar is the only segment indicator.                                                                                                                                                                                                                                                                                                                                            | 🔁 §2.1               |
| 2026-05-30 | **Keep + import button** on recorder — add existing device videos as a segment ([orig §4.6]).                                                                                                                                                                                                                                                                                                                                                                                 | 🔁 §2.1               |
| 2026-05-30 | **Maximize expo-camera built-ins** (record, zoom prop, flash, full stabilization modes, quality); keep only thin custom glue for pinch/drag-zoom gestures + tap/hold record button (lib has no gesture support).                                                                                                                                                                                                                                                              | 🔁 §2.2               |
| 2026-05-30 | **Camera controls = same set as original** (flash/stabilization/flip/…); build the **control UI from Expo's own native components** — `@expo/ui` (`ContextMenu`/`Picker`/etc.) + `expo-symbols` + `expo-glass-effect` — instead of hand-rolling.                                                                                                                                                                                                                              | 🔁 §2.2               |
| 2026-05-30 | **Drafts/persistence stack:** `expo-sqlite` + **Drizzle ORM** for metadata, **expo-file-system** new `File`/`Directory`/`Paths` API for media; autosave on segment-complete; reactive draft selector via `useLiveQuery`.                                                                                                                                                                                                                                                      | 🔁 §3                 |
| 2026-05-30 | **Permissions:** granular / **just-in-time** — request each at point-of-use (camera+mic on recorder open, library on import), not upfront. Drop the original's upfront gate.                                                                                                                                                                                                                                                                                                  | 🔁 §2.3               |
| 2026-05-30 | **Onboarding built LAST**, after core flows work.                                                                                                                                                                                                                                                                                                                                                                                                                             | ⏸️ defer              |
| 2026-05-30 | **Upload:** keep TUS but via **`tus-js-client` v4** (native RN-TUS wrapper is abandoned); custom SQLite `urlStorage` + `fileReader` for true resume across restart/network-drop; resume UI.                                                                                                                                                                                                                                                                                   | 🔁 §4                 |
| 2026-05-30 | **Upload background = pause/resume only:** OK for upload to pause when app closed/backgrounded and resume on reopen; **no native background-transfer** — stick to easy/in-the-box behavior.                                                                                                                                                                                                                                                                                   | ✅ §4                 |
| 2026-05-30 | ~~**Trim/edit UX = RNVT `showEditor`** (native editor, use ALL RNVT features; no custom trim screen). Editing is **destructive** per segment → export = just `merge()`.~~                                                                                                                                                                                                                                                                                                     | ❌ superseded → §1.0a |
| 2026-05-30 | **Audio-focus deferred**; **tap-to-focus skipped** (use autofocus).                                                                                                                                                                                                                                                                                                                                                                                                           | ⏸️/✂️                 |
| 2026-05-30 | ~~**Non-destructive source model:** keep `originalFilename` + `editedFilename` per segment; `showEditor` always edits the original (no compounding re-encode); merge/thumbnail use edited ?? original.~~ _(RNVT-driven — the separate `editedFilename` file existed only to avoid `showEditor` re-encode loss.)_                                                                                                                                                              | ❌ superseded → §1.0c |
| 2026-05-30 | **Brand:** primary/accent **red** (`#F01E21`); keep Expo default icons/splash as placeholders, rebrand later.                                                                                                                                                                                                                                                                                                                                                                 | 🔁 §2.4               |
| 2026-06-02 | **Reversal — drop `react-native-video-trim` entirely.** Build the trim/concat/edit pipeline on **native platform frameworks only**: **AVFoundation** (iOS) + **Media3 / `androidx.media3.transformer`** (Android). No FFmpeg, no RNVT `showEditor`/`merge`/`trim`. **Supersedes** the 2026-05-30 RNVT rows below (the RNVT concat+trim row, the milestone-0 "all RNVT features" row, the `showEditor` trim-UX row, and the `showEditor`-driven destructive-edit row). See §1. | 🔁 §1                 |
| 2026-06-02 | **Edit UX = custom timeline editor, scoped to splits + trims.** Build our own timeline/scrubber editor (RN UI over the §1.0 native ops). **In scope:** trim (set in/out per clip) and split (cut one clip into two at the playhead). **Out of scope for now:** crop / rotate / flip / speed / mute / effects (the rest of the old `showEditor` feature set — deferred, not dropped forever).                                                                                  | 🔁 §1.0a              |
| 2026-06-02 | **Edit model = non-destructive metadata; keep originals, drop the per-edit `editedUri` file.** Trims/splits are in/out points over the never-mutated original; a new file is written only at export (§1.0). Reframes the RNVT-driven former-§1.4 "original + edited file" decision (its `showEditor` re-encoded each edit).                                                                                                                                                   | 🔁 §1.0c              |
| 2026-06-02 | **Decouple recording from editing via a dev flag** (e.g. `DEV_SEED_SEGMENTS === true`). When on, seed a draft with **bundled sample video segments** (fixtures in `assets/`) so the timeline editor opens straight onto real clips — **testable in an emulator** with no camera/recorder. Editor must run standalone on seeded segments; off in production.                                                                                                                   | 🔧 §1.0b              |
| 2026-06-02 | **Re-sequence milestone 0 → editing leads, recording follows.** Build the timeline editor (§1.0a) on dev-seeded segments (§1.0b) + native split/trim ops (§1.0) **first** (emulator-testable); build recording **after**. **Supersedes** the 2026-05-30 "recording + RNVT is milestone 0" row.                                                                                                                                                                                | 🔁 Build order        |
| 2026-06-02 | **Future scope (not now):** add **voiceover**, **manual subtitles/captions**, and **AI-generated subtitles** over the videos — layered on the timeline editor (§1.0a). Direction noted only; design deferred.                                                                                                                                                                                                                                                                 | 🔮 §7                 |
| 2026-06-02 | **Recording length = no cap.** No max-duration limit or duration presets; record freely. Segment bar + on-device storage are the only practical limits.                                                                                                                                                                                                                                                                                                                       | ✅ §2.1               |
| 2026-06-02 | **Upload = per-draft destinations.** Each draft targets its own upload destination (carries over the original's model, [orig §8.3](docs/pulse-original-features.md)); needs a destination-selection UX (TBD).                                                                                                                                                                                                                                                                 | 🔁 §4                 |
| 2026-06-02 | **Keep `.pulse` draft transfer (export/import).** Port the original's portable-draft feature ([orig §9](docs/pulse-original-features.md)) so drafts move between devices. In scope; design TBD.                                                                                                                                                                                                                                                                               | 🔁 §9                 |
| 2026-06-03 | **Theme = follow system (light + dark).** Support both, OS-driven; design every screen in light + dark against the red accent. (Resolves Q20.)                                                                                                                                                                                                                                                                                                                                | ✅ §2.4               |
| 2026-06-03 | **App name / slug / deep-link scheme deferred to rebrand.** Park with the icon/splash rebrand; scaffold stays `pulse-new` / `pulsenew://` until then. (Resolves Q21 + the §5 deep-links row for now.)                                                                                                                                                                                                                                                                         | ⏸️ §2.4               |
| 2026-06-03 | **Editor = single full-timeline surface; remove per-segment tap-to-trim.** All trim/split happens on one timeline (clips end-to-end), reached via the recorder's **→**; tapping a recorder thumbnail now only previews. The timeline doubles as the assemble/preview surface (export from here). **Supersedes** the §2.1 "tap thumbnail → trim" entry point. Screen map added (§2.0).                                                                                          | 🔁 §1.0a/§2.0         |
| 2026-06-03 | **No separate Export/Preview screen — merged preview lives on the Upload page.** Editor `Done` merges → goes straight to Upload; Upload hosts the inline merged-video preview with **tap → fullscreen**. Drops the original's `preview-new` ([orig §6.4](docs/pulse-original-features.md)).                                                                                                                                                                                  | 🔁 §4/§2.0            |
| 2026-06-10 | **⏪ REVERSAL — re-adopt `react-native-video-trim` (RNVT) for editing.** Editing = RNVT's **full-screen native editor** via `showEditor` (tap a clip → trim **+ crop/rotate/flip/mute/speed**, `enableEditTools` on). **Supersedes the entire 2026-06-02 reversal** (drop-RNVT / native-AVFoundation+Media3-only / custom timeline editor) AND the 2026-06-03 "single timeline surface" + the 2026-06-10 in-recorder-preview direction. The custom AVFoundation/Media3 export module is **not being built**; RNVT ships a maintained FFmpegKit fork (`min`). No Expo plugin → custom `plugins/with-video-trim.js` (Android FileProvider + `file_paths.xml`) + `ios.infoPlist`. Dev build only. **Landed + simulator-verified.** _(Export: RNVT `merge()` was wired + proven on-sim but **removed for being too slow** — `→` is a placeholder again; the real export path is TBD. RNVT stays only for `showEditor`.)_ | ⏪ §1 |
| 2026-06-10 | **Editing is now DESTRUCTIVE — originals kept, edited file stored separately.** RNVT re-encodes on save, so a segment gains `editedFilename`/`editedDurationMs` (migration `0001`); `originalFilename` stays pristine and re-editing always re-opens it (no compounding loss); `resetEdit` clears the edit. Effective file/duration = `edited ?? original`. **Supersedes §1.0c non-destructive metadata** (revives the spirit of the original 2026-05-30 `editedFilename` row). `trimStartMs`/`trimEndMs` columns are now dead. | 🔁 §1.0c |
| 2026-06-10 | **In-recorder preview KEPT; trim is a ✂ button in the preview modal.** Tap a thumb → the in-recorder preview (sequential playback of each clip's **effective** file + draggable playhead on the bar, `use-preview`/`preview-modal`/`playhead-cursor` retained and re-pointed at `editedFilename ?? originalFilename`). The preview modal carries **✕ close (left), ✂ edit + 🗑 delete (right)**; ✂ opens the RNVT editor for the **active previewed clip** (RNVT is single-file — **no multi-clip timeline, no split**). Thumbnails stay tap-to-preview + ✕-delete only. Reverses the earlier same-day "remove the preview" note. | 🔁 §1.0a/§2.1 |

---

## 1. Video pipeline — `react-native-video-trim` (RNVT) 🔁

> **⏪⏪ OUTDATED (reversed 2026-06-10) — read the decision log first.** This entire §1 (and §1.0–§1.0c) describes the **2026-06-02 native-only / non-destructive** plan, which was **reversed on 2026-06-10**: RNVT is **re-adopted** for both editing (`showEditor`, destructive, all edit tools) and export (`merge()`). The destructive `editedFilename` model replaces §1.0c; the custom AVFoundation/Media3 module of §1.0 is **not being built**; the custom timeline editor of §1.0a is replaced by RNVT's full-screen modal (no split). See the three **2026-06-10** decision-log rows and [implementation-status.md](docs/implementation-status.md) §3 Phase B/C. The native-only prose below is kept for history pending a fuller rewrite.
>
> **⛔ (historical) `react-native-video-trim` was dropped 2026-06-02.** The pipeline below is **§1.0–§1.0c** (native AVFoundation / Media3, non-destructive edits) — itself now superseded by the 2026-06-10 reversal above. The earlier RNVT plan and the consequence-decisions it forced — `merge`/`trim`/`showEditor`, FFmpegKit setup, the 30 fps cap, the destructive edit model — have been **removed**; only a short historical note remains at the end of this section.
>
> **Why the reversal:** avoid a heavyweight FFmpeg dependency and its retired/self-hosted FFmpegKit binaries, drop the forced re-encode + 30 fps cap, and remove the bleeding-edge-RN native-lib risk. Use the platforms' own, first-party, hardware-accelerated media frameworks instead.

### 1.0 Current decision — native frameworks only ✅ (2026-06-02)

**Decision:** Build the entire video pipeline (concat / trim / any edit transforms) on **native platform media frameworks only**, with no third-party video library and no FFmpeg:

- **iOS → AVFoundation.** `AVMutableComposition` + `AVAssetExportSession` (and/or `AVAssetWriter`/`AVAssetReader` where finer control is needed) for trim and concat; `AVVideoComposition` for any transform (rotate/crop/scale). Hardware-accelerated via VideoToolbox under the hood.
- **Android → Media3.** `androidx.media3.transformer` (`Transformer`, `EditedMediaItem`, `Composition`, `Effects`) for trim/concat/transform; hardware-accelerated via MediaCodec.
- **Bridge:** a small **custom Expo native module** (Expo Modules API) exposing a thin, shared JS surface over the two native implementations. This effectively **revives the original's custom `video-concat` AVFoundation/Media3 module direction** ([orig §7.1](docs/pulse-original-features.md)) rather than replacing it with a library.

**Implications (replacing the old RNVT plan):**

- **Trim/edit UX is now custom** — there is no `showEditor` native UI to fall back on. We build the trim/scrubber screen ourselves (RN UI driving the native trim op). Edits are **non-destructive metadata over the kept originals** (§1.0c) — originals are never mutated.
- **No forced full re-encode / no 30 fps cap** — native frameworks can stream-copy/pass-through compatible segments and only transcode when inputs genuinely differ; export quality/fps is ours to choose.
- **Still requires a development build / prebuild** (custom native module) — "no Expo Go, dev-client/EAS from the start" remains true, but for **our** module, not for RNVT's FFmpegKit.
- **Heterogeneous import normalization** (mismatched res/fps/codec from imported clips) is now **our responsibility** to handle explicitly in the composition (scale/pad/letterbox via `AVVideoComposition` / Media3 `Effects`), rather than getting it "for free" from a library `merge()`.

### 1.0a Edit UX — custom timeline editor (splits + trims) ✅ (2026-06-02)

**Decision:** The edit experience is a **single full-timeline editor** we build ourselves (RN UI driving the §1.0 native AVFoundation / Media3 ops) — **all segments laid end-to-end on one timeline**, where the user assembles, splits, and trims. **There is no per-segment trim entry point** — you do **not** tap one clip to edit it in isolation (that entry point is removed, 2026-06-03; see §2.1). **Initial scope is deliberately narrow — basic splits and trims only.**

**In scope (now):**

- **Trim** — drag a clip's edge on the timeline to set its in/out point (non-destructive metadata, no re-encode until export, §1.0c).
- **Split** — cut the clip at the playhead into two segments, producing two independently-trimmable clips that share the same source file (§1.0c).
- **Reorder** is also available on the recorder's segment bar (hold+drag, §2.1); whether the timeline additionally supports drag-reorder is a minor open detail.

**Out of scope for now (deferred, not permanently dropped):** crop, rotate, flip, speed, mute, effects — the remainder of the old RNVT `showEditor` feature set. Revisit once split + trim are solid on a dev build.

**Entry & role:** reached from the recorder via the **→** button (and, in dev, the seed flag §1.0b jumps straight here). This **one surface is the assemble step** — its **`Done` action runs the merge (export) and goes straight to Upload**. There is **no separate preview/merge screen** (the original's `preview-new` is dropped); the merged-video **preview lives on the Upload page** (tap → fullscreen, §4/§2.0).

**Why custom:** dropping RNVT (§1.0) removes its native `showEditor` UI, so there is no built-in editor to lean on — and a purpose-built timeline gives us the multi-segment split/trim/reorder model we actually want, instead of RNVT's single-file editor.

> Supersedes the former "Trim UX = RNVT `showEditor`" sub-decision **and** the per-segment "tap thumbnail → edit that clip" entry point (§2.1): there is no per-clip editor — **all trimming/splitting happens on the one timeline**, reached via the recorder's **→**.

### 1.0b Dev flag — decouple recording from editing (emulator-testable) 🔧 (2026-06-02)

**Decision:** **Recording and editing are decoupled** so the timeline editor (§1.0a) can be built and tested **without the recorder** — critically, **in an emulator/simulator that has no usable camera.** A **dev flag** seeds ready-made segments to edit.

**How it works:**

- **Dev flag** — a build-time constant, e.g. `DEV_SEED_SEGMENTS` (gate behind `__DEV__` so it can never ship on in production). When `true`:
  - On app/editor launch, **seed a draft** with a few **bundled sample video clips** (fixtures committed under `assets/`, e.g. `assets/dev/sample-1.mp4` …) copied into the draft dir as segments, each with its `originalUri` set (no trims yet, §1.0c).
  - The app can **route straight into the timeline editor** on that seeded draft, bypassing the camera/recorder screen entirely.
- **When `false` (production):** no seeding, normal record-then-edit flow; fixtures excluded from / inert in the production build.
- **Decoupling requirement:** the editor must take its segments from the **draft/state layer**, not from a live recording session — so it runs identically whether segments came from the recorder or from the dev seed. (Good architecture regardless: recorder and editor talk only through the draft model, §3.)

**Why:** lets the timeline editor (split/trim) be developed and exercised on a simulator/emulator immediately, before the native recording module or a physical device is in the loop — and keeps a fast, deterministic edit-only test path afterward.

> **Fixtures TBD:** a small number of short sample clips with **deliberately mismatched res/fps/codec** would also exercise the §1.0 normalization path. Need to add them under `assets/` (kept small; consider `.gitignore`/Git LFS if large).

### 1.0c Source & edit model — non-destructive, originals kept ✅ (2026-06-02)

**Decision:** Recorded/imported clips are the **single source of truth and are never mutated**. Splits and trims are stored as **non-destructive metadata** (in/out points) against the original — **no per-edit re-encoded file**. A new media file is produced **only at export/merge** (§1.0).

- **Per segment we keep one media file** = `originalUri` (raw recording/import), never modified.
- **Trim** = `trimStartMs` / `trimEndMs` on the segment — just numbers; editing or resetting a trim never touches the file.
- **Split** = a second segment row pointing at the **same `originalUri`** with a different in/out window — so splitting is free and lossless too (no copy, no re-encode).
- **Thumbnails** are generated from `originalUri` at the in-point.
- **Export** = the native module composes every segment's in/out window into one output (the only re-encode, §1.0).
- **Reset** = clear the trim points / drop the split row — back to pristine instantly.

**Why this changed (the RNVT-driven decision we removed):** the old "keep `originalUri` **+ a separate `editedUri` file**" model (former §1.4) existed because RNVT's `showEditor` **re-encoded** every edit, so we kept the pristine original to avoid _compounding_ quality loss. Native trimming is non-destructive by nature, so we keep originals **and** drop the per-edit file entirely — same "keep the OG videos for trims" intent, no duplication, instant reset. _(A rendered `editedUri` only becomes necessary if/when destructive transforms — crop/rotate/effects — land; deferred, §1.0a.)_

### Historical — `react-native-video-trim` (dropped 2026-06-02)

We originally planned the whole pipeline on **`react-native-video-trim`** (RNVT: `merge` / `trim` / `showEditor`, FFmpeg/FFmpegKit). It was reversed — see the 2026-06-02 rows in the decision log and §1.0. The RNVT-specific consequence-decisions it forced are **dropped and intentionally not reproduced here**:

- ✂️ **Re-encode-only concat + 30 fps cap** (FFmpeg `merge()`) → native can pass-through/stream-copy, fps is ours (§1.0).
- ✂️ **Destructive per-segment editing** (each `showEditor` save baked a new file) → non-destructive metadata model (§1.0c).
- ✂️ **FFmpegKit setup** (retired/self-hosted HTTPS binaries, `FFMPEGKIT_PACKAGE`, gradle config, `WRITE_EXTERNAL_STORAGE`/FileProvider for the lib) → gone; we ship our own native module.
- ✂️ **"Smoke-test RNVT `merge()`/`trim()` first"** → replaced by building/proving our native split/trim/concat module.

_(The one decision that survived — keeping pristine originals — is reframed for native in §1.0c. Dev-build/prebuild is still required, but now because **we** ship a native module, not for RNVT.)_

---

## 2. Layout / UX

> Screen-by-screen layout decisions, how they differ from the original's navigation ([orig §3](docs/pulse-original-features.md)). Filled in as the user describes them.

### 2.0 Screen map / inventory 🗺️ (rough — 2026-06-03)

A first cut of **every screen**, derived from the decisions in this doc + the original's nav map ([orig §3](docs/pulse-original-features.md)). Modal-vs-stack details TBD; this is the inventory + flow, not final layout.

| # | Screen | Purpose | Reached from | Status |
| - | ------ | ------- | ------------ | ------ |
| 0 | **Root layout** | infra: deep-link handler, **system light/dark theme** (§2.4), gesture root, SQLite provider | app launch | infra |
| 1 | **Home / Drafts** | list drafts (thumb, name, seg count + duration, modified) + **New (+)** | launch (default) | core (§3) |
| 2 | **Recorder** | capture segments; bottom segment bar (inline ✕ / hold-drag reorder / tap=preview), import, camera controls | Home **+** / tap draft | core (§2.1–2.2) |
| 3 | **Timeline editor** | assemble + **split + trim** all segments on one timeline; playback. **`Done` exports (merges) and goes straight to Upload** — no separate preview screen | Recorder **→** / dev-seed | **core — Milestone 0** (§1.0a) |
| 4 | **Upload** | **shows the merged-video preview (tap → fullscreen)**; TUS upload, progress, pause/resume, save-to-device, success modal (watch URL) | Editor **Done** / Home draft | core (§4) |
| 5 | **Destination picker** | choose/enter the **per-draft** upload destination | Upload (sheet) | core (§4) |
| 6 | **Upload chooser** | deep-link/QR entry: pick existing draft or record new → upload | deep link | secondary (orig §8.3) |
| 7 | **Onboarding** | first-run feature tour | first launch | ⏸️ deferred — built **LAST** (§5) |

_No standalone Export/Preview screen — the original's `preview-new` ([orig §6.4](docs/pulse-original-features.md)) is **dropped**: assembly happens in the editor (#3), the merged preview lives on Upload (#4)._

**Not custom screens (OS/native UI):** image-picker (import), share sheet (`.pulse` export + save-to-device), JIT permission dialogs. **Dev-only:** `DEV_SEED_SEGMENTS` (§1.0b) routes straight into **#3**.

```
Launch
  └─(first run?)─► Onboarding ─┐
                              ▼
                        Home / Drafts ◄───────────────────────────────┐
                          │  ├─ New (+) ───► Recorder                   │
                          │  └─ tap draft ─► Recorder (resume segments) │
                          ▼                                             │
   Recorder ──[→]──► Timeline editor ──[Done = merge]──► Upload ──(success)─┘
                     (split + trim)                      (preview+tap-fullscreen,
                                                          TUS + per-draft dest)

  deep link (QR) ─► Upload chooser ─► pick draft / record ─► Upload
  dev flag ───────► Timeline editor (seeded segments)
```

**Rough wireframes** (recorder is in §2.1; key new/changed screens below):

```
Home / Drafts                      Timeline editor (Milestone 0)
┌───────────────────────────┐      ┌───────────────────────────┐
│  Pulse                     │      │ ✕                    ✓ Done│
│ ┌─────────┐ ┌─────────┐    │      │       VIDEO PREVIEW        │
│ │ ▷ thumb │ │ ▷ thumb │    │      │          ▷ ⏸             │
│ │ Draft A │ │ Draft B │    │      │ ◀━━━━━●━━━━━━━━━━━━━━▶     │  playhead
│ └─────────┘ └─────────┘    │      │ ┌──┬────┬──────┬───┐       │  clips end-to-end
│ ┌─────────┐                │      │ │c1│ c2 │  c3  │c4 │       │  drag edge = trim
│ │ ▷ thumb │   …            │      │ └──┴────┴──────┴───┘       │
│ └─────────┘                │      │   [✂ Split]   [⟲ Reset]    │  split @ playhead
│                  ( + New ) │      └───────────────────────────┘
└───────────────────────────┘

Upload
┌───────────────────────────┐
│ ✕  Upload                  │
│   ┌───────────────────┐    │
│   │   ▷ merged video  │    │  tap = fullscreen
│   └───────────────────┘    │
│  Destination: [ Server ▾ ] │  per-draft dest (picker sheet)
│  ▓▓▓▓▓▓░░░░░  62%   ⏸      │  progress + pause/resume
│  ( Upload )                │
│  ☐ Delete draft after      │
│  ( Save to device )        │
└───────────────────────────┘
```

> **Open layout details (not blocking):** whether the timeline also supports drag-reorder; Home grid-vs-list; Destination picker as sheet-vs-screen. _(Resolved 2026-06-03: no separate Export/Preview screen — editor `Done` merges → Upload, which hosts the preview.)_

### 2.1 Recorder screen — segments shown inline (✂️ drop undo/redo) 🔁

**Decision (layout only):** segments are managed **directly on the recorder screen**, not in a separate reorder screen and not via undo/redo.

- ✂️ **Drop the undo/redo feature + UI entirely** (the original's Undo/Redo buttons + AsyncStorage redo-stack, [orig §4.8](docs/pulse-original-features.md)). Not ported.
- **Bottom segment bar:** a horizontal strip of **thumbnails, one per recorded segment**, pinned to the bottom of the recorder.
- **Inline delete:** each thumbnail has its own **✕** to delete that segment right there (replaces the original's delete-in-reorder-screen flow, [orig §6.5](docs/pulse-original-features.md)).
- **Hold + drag to reorder:** long-press a thumbnail and drag to reorder segments within the bar (no separate reorder screen, replaces [orig §6.5](docs/pulse-original-features.md)).
- **Tap to preview (no trim here):** tapping a thumbnail just **previews/plays** that clip. **Trimming and splitting are not done on the recorder** — they happen in the **full-timeline editor** (§1.0a), reached via the **→** button. _(Removed 2026-06-03: the earlier "tap thumbnail → trim that segment" entry point — all editing now lives on the timeline, not per-clip.)_
- **Camera + record controls render ABOVE the segment bar** (preview fills the area above; controls overlay the preview).
- **Proceed/next (→):** a circular button at the right end of the segment bar advances to the **timeline editor** (§1.0a) — where the user assembles, splits, and trims all segments; the editor's **`Done`** then merges and goes straight to **Upload** (no separate preview screen).
- The bar appears only once ≥1 segment exists (empty state = no bar, like screenshot 2).
- **Recording stays segmented** (tap/hold → multiple clips, as discussed), but the original's **red segmented progress bar is removed** ([orig §4.3](docs/pulse-original-features.md), `RecordingProgressBar`). The **bottom thumbnail bar is now the only segment indicator** — each completed clip = one thumbnail. _(How the in-flight clip's live progress/remaining-time is shown during recording is still open — see §6.)_
- **+ Import button (keep):** a **+** control on the recorder lets the user pick an **existing device video** and add it as a segment (like [orig §4.6](docs/pulse-original-features.md), via `expo-image-picker`). Imported clips appear as thumbnails in the bottom bar like any recorded segment; mismatched res/fps/codec is normalized **explicitly in our native composition** (`AVVideoComposition` / Media3 `Effects`, §1.0) — no longer free from a library `merge()`.

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

> Gestures summary: **tap** thumbnail → preview · **hold+drag** thumbnail → reorder · **✕** → delete · **→** → timeline editor (all trim/split there).

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
- **Light/dark:** ✅ **decided (2026-06-03) — follow system (support both light + dark).** Theme driven by the OS setting; every screen needs light + dark variants designed against the red accent.
- **App name / slug / scheme:** ⏸️ **deferred to rebrand (2026-06-03)** — park name + scheme with the icon/splash rebrand work; **do not touch until then.** Scaffold stays `pulse-new` / scheme `pulsenew://` in the meantime. _(Resolves Q21 + the §5 deep-links row for now: no change until rebrand.)_

---

## 3. Drafts, autosave & persistence ✅ (storage stack decided)

**Goal:** work on multiple drafts/projects; each **autosaves the moment a segment finishes recording** (and on delete / reorder / trim / rename); survives app close; reopen from a **draft-selector** screen.

**Storage stack — Expo-standard for SDK 56 (verified against the [filesystem](https://docs.expo.dev/versions/v56.0.0/sdk/filesystem/) + [sqlite](https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/) docs):**

- **Metadata → `expo-sqlite` + Drizzle ORM.** Relational + typed. Rough schema: `projects` (id, name, maxDurationSeconds, mode, createdAt, lastModified, thumbnail, upload config) and `segments` (id, projectId, **order**, `originalFilename`, `trimStartMs`/`trimEndMs` — non-destructive trim window over the original (§1.0c); split = a second row sharing the same `originalFilename` with a different window; thumbnail/concat read the original through that window — `durationMs`). **Why this over `kv-store`:** the data is naturally relational (project 1—\* ordered segments) with frequent **partial** updates — autosave one segment, reorder one, delete one, set trim on one — each becomes a single-row op instead of read-modify-write of a whole JSON blob. Drizzle adds typed schema + migrations (`drizzle-kit` + `useMigrations`), and `SQLiteProvider` / `useSQLiteContext` + drizzle's `useLiveQuery` make the **draft-selector list reactive** with little code. Expo officially documents the Drizzle ↔ `expo-sqlite` integration.
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

**Merged-video preview on this page (decision 2026-06-03):** the Upload page **hosts the merged-video preview inline**, and **tapping it opens fullscreen playback**. There is **no separate Export/Preview screen** — the timeline editor's `Done` merges and lands here directly (§1.0a/§2.0). So this page shows: inline preview (tap → fullscreen), destination chip (§5 per-draft picker), progress/pause/resume, "save to device" (share sheet), and "delete draft after upload".

**Server contract unchanged:** keep `POST /reserve` → `videoid` (host server's responsibility, not the pulsevault plugin), then TUS create/upload with `Upload-Metadata` (videoid, filename) ([orig §8.2](docs/pulse-original-features.md)). Pre-reserving the `videoid` also gives idempotency on resume.

> Per-draft upload destinations and the `pulsecam://` → `pulsenew://` deep-link entry are related but separate decisions (still ❓ in §5 table).

---

## 5. Carry-over from original — to confirm ❓

Quick triage of original features (from [pulse-original-features.md](docs/pulse-original-features.md)) — mark each as we go:

| Feature                                | Original ref                 | `pulse-new`                                                                                                               | Status   |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| Segmented record (tap/hold)            | orig §4                      | **keep** — segments via tap/hold §2.1; **no max-duration cap** (record freely; segment bar + storage are the only limits) | 🔁 §2.1  |
| Recording progress bar (red)           | orig §4.3                    | **dropped** — replaced by bottom segment bar §2.1                                                                         | ✂️       |
| Import clips from library              | orig §4.6                    | **keep** — **+** button on recorder §2. 1                                                                                 | 🔁 §2.1  |
| Pinch + drag-to-zoom                   | orig §4.4                    | **keep** — expo-camera `zoom` prop + thin gesture glue §2.2                                                               | 🔁 §2.2  |
| Camera controls (flip/flash/stabilize) | orig §4.4–4.5                | **same set as original**; expo-camera props + **@expo/ui** UI + expo-symbols/glass-effect §2.2                            | 🔁 §2.2  |
| Undo / redo                            | orig §4.8                    | **dropped** — manage via inline segment bar §2.1                                                                          | ✂️       |
| Segment delete                         | orig §6.5                    | **inline** in recorder bottom bar §2.1                                                                                    | 🔁 §2.1  |
| Segment reorder                        | orig §6.5                    | **hold+drag** in the bottom bar §2.1                                                                                      | 🔁 §2.1  |
| Per-segment edit (trim/crop/rotate)    | orig §6.6                    | **full-timeline editor** (splits + trims on one timeline, **→** from recorder; no per-clip trim; crop/rotate deferred) §1.0a | 🔁 §1.0a |
| Tap-to-focus                           | —                            | **skipped** (use expo-camera autofocus) §2.2                                                                              | ✂️       |
| Concat                                 | orig §7.1                    | **native** AVFoundation (`AVMutableComposition`) / Media3 (`Transformer`) §1.0                                            | 🔁 §1.0  |
| Audio-focus (pause bg audio)           | orig §7.2                    | **deferred** — revisit later (likely via `expo-audio` mode, no native module)                                             | ⏸️ defer |
| Draft model + on-disk storage          | orig §2                      | **expo-sqlite + Drizzle** (meta) + **expo-file-system** new API (media) §3                                                | 🔁 §3    |
| Auto-save drafts                       | orig §5                      | **on segment-complete** (+ edits), SQLite row writes §3                                                                   | 🔁 §3    |
| Draft selector / reopen                | orig §6.2                    | list screen, reactive via `useLiveQuery` §3 (layout TBD)                                                                  | 🔁 §3    |
| TUS resumable upload                   | orig §8.1–8.2                | **keep** — `tus-js-client` v4 + SQLite urlStorage + resume UI §4                                                          | 🔁 §4    |
| Per-draft upload destinations          | orig §8.3                    | **keep — per-draft destinations** (each draft targets its own); needs selection UX (storage via §3)                       | 🔁 §4    |
| Deep links (`pulsecam://`)             | orig §8.3                    | scheme stays `pulsenew://` for now — **name/scheme deferred to rebrand** (§2.4)                                           | ⏸️ §2.4  |
| Draft transfer (.pulse export/import)  | orig §9                      | **keep in scope** — port .pulse export/import (drafts portable between devices)                                           | 🔁 §9    |
| Permissions                            | orig §10 (PermissionMonitor) | **granular / just-in-time** at point-of-use §2.3                                                                          | 🔁 §2.3  |
| Onboarding                             | orig §6.1                    | **keep, built LAST** (end of build order)                                                                                 | ⏸️ defer |
| Theming / brand                        | orig §10                     | **primary red** (`#F01E21`); Expo default icons/splash as placeholders, rebrand later §2.4                                | 🔁 §2.4  |

---

## 6. Open questions

1. ~~Trim UX~~ → **decided (revised 2026-06-02):** **custom timeline editor**, splits + trims only (§1.0a) over **native** AVFoundation/Media3 ops (§1.0); **originals kept untouched, trims/splits are non-destructive metadata** (§1.0c/§2.1/§3). _(Was RNVT `showEditor` — superseded; RNVT dropped.)_
2. ~~Reorder~~ → **decided:** hold+drag in the bottom bar (§2.1).
3. ~~Trim entry point~~ → **decided:** tap a thumbnail (§2.1).
4. **In-flight recording progress** — with the red progress bar gone (§2.1), how is the currently-recording clip's elapsed/remaining time shown? ⏸️ **Deferred to late in implementation** (decide once the recorder is built, to keep it clean).
5. _(add as they come up)_

---

## 7. Future scope 🔮

> Direction we intend to head **after** the core record → edit (splits + trims) → merge → upload flow is solid. **Captured for intent only — no design or build commitment yet.** Each lands as a layer on top of the custom timeline editor (§1.0a) and the native AVFoundation / Media3 pipeline (§1.0).

- **🔮 Voiceover.** Record an audio track over the assembled timeline and mix it into the export. Native fit: an extra audio track in the `AVMutableComposition` (iOS) / a Media3 audio track + mixing (Android); needs mic capture during playback, per-track volume/ducking, and a waveform/▶ control on the timeline. _Open: replace vs. duck original audio; trim/offset of the VO track._
- **🔮 Manual subtitles / captions.** User-authored caption cues placed on the timeline, burned into the video on export (and/or kept as a sidecar track). Native fit: text overlay via `AVVideoComposition` Core Animation layer (iOS) / Media3 `OverlayEffect` text (Android). _Open: styling/positioning, per-cue timing UI, burn-in vs. soft subtitles._
- **🔮 AI-generated subtitles.** Auto-transcribe segment audio → time-coded cues that feed the same caption layer above (user can then edit). _Open: on-device (e.g. Apple Speech / `SFSpeechRecognizer`, Android `SpeechRecognizer`) vs. cloud transcription; language support; cost/latency/privacy; accuracy editing UX. Likely shares the manual-caption rendering path — build that first._

**Sequencing note:** these are **post-core**; they do not affect milestone 0 (§1.0a/§1.0b) and are not in the splits-and-trims initial scope.

**Agreed approach (2026-06-02):** build the **caption rendering/overlay path once**, then drive it from **both** manual entry and AI transcription — i.e. **manual subtitles first as the foundation, AI subtitles layered on top** (AI just produces editable cues that feed the same render path). Voiceover is an independent audio-track addition and can come in either order relative to captions.
