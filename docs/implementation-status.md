# `pulse-new` — Implementation Status & Next Steps

> **What this is.** A snapshot of where the build actually stands vs. the design docs, the gaps that matter, and a phased plan to continue. Pick this up later as the working checklist. Reconcile against the decisions in [pulse-new-plan.md](pulse-new-plan.md) (forward decisions) and [pulse-original-features.md](pulse-original-features.md) (behavior spec).
>
> **Captured:** 2026-06-04, branch `feat/foundation-home`. Update as phases land.

---

## 1. What's built so far

### Committed — storage layer + app shell ✅

| Piece | File | Status |
| --- | --- | --- |
| Drizzle schema (`projects` + `segments`) | [src/db/schema.ts](../src/db/schema.ts) | ✅ encodes §1.0c non-destructive model: `originalFilename` never mutated; `trimStartMs`/`trimEndMs` as metadata; split = 2nd row sharing the same file |
| DB connection | [src/db/client.ts](../src/db/client.ts) | ✅ single conn, `enableChangeListener` (powers `useLiveQuery`), `foreign_keys = ON` for segment→project cascade |
| Reactive drafts query | [src/db/drafts.ts](../src/db/drafts.ts) | ✅ `draftListQuery` with trim-aware effective duration `coalesce(trimEnd - trimStart, duration)` (§3) |
| Migration gate | [src/db/migrate.tsx](../src/db/migrate.tsx) | ✅ blocks app start until schema ready |
| Home / Drafts (screen #1) | [src/app/index.tsx](../src/app/index.tsx) | ✅ reactive `useLiveQuery`, draft cards, FAB, empty state, dev seed/clear (§2.0) |
| Theme (light/dark + red accent) | [src/constants/theme.ts](../src/constants/theme.ts) | ✅ §2.4 |

### Uncommitted — recorder + dev-build infra (current working diff) 🚧

| Piece | File | Status |
| --- | --- | --- |
| Deps added | [package.json](../package.json) | `expo-camera`, `expo-file-system`, `expo-video` |
| Config: permissions, package id, plugins | [app.json](../app.json) | Android camera/record perms, `expo-camera` plugin + permission strings, `expo-video` plugin, custom prebuild plugin |
| Prebuild plugin: disable script sandboxing | [plugins/with-disable-script-sandboxing.js](../plugins/with-disable-script-sandboxing.js) | ✅ lets bundle phase write dev-server `ip.txt` on device builds |
| Routes registered as full-screen modals | [src/app/_layout.tsx](../src/app/_layout.tsx) | ✅ `recorder` + `timeline` (§2.0) |
| Recorder screen (#2) | [src/app/recorder.tsx](../src/app/recorder.tsx) | 🚧 partial — see gaps below |
| Timeline screen (#3) | [src/app/timeline.tsx](../src/app/timeline.tsx) | 🚧 **stub placeholder only** |

**Recorder — what works:** `CameraView`, JIT camera+mic permission gate with Settings fallback (§2.3 ✅), tap-to-record start/stop, bottom segment bar with inline ✕ delete, `→` to `/timeline` (§2.1 layout ✅).

---

## 2. Gaps that matter (code vs. docs)

### ⚠️ Gap A — Build-order inversion
- **Docs say:** the **timeline editor is Milestone 0** ("editing leads, recording follows," §Build order, 2026-06-02), built on a `DEV_SEED_SEGMENTS` flag + bundled fixtures so it's **emulator-testable with no camera**. The riskiest piece is the native trim/concat module + timeline (§1.0).
- **Reality:** recorder was built first; timeline is a stub; the native module doesn't exist; the dev-seed path that was meant to de-risk the editor on a simulator isn't real — [`devSeedDraft`](../src/db/drafts.ts) inserts DB rows pointing at non-existent `dev/a.mp4` / `dev/b.mp4` files (no clips in `assets/`).
- **Not a mistake to undo** — just means the de-risking the docs planned hasn't happened yet.

### ⚠️ Gap B — Recorder doesn't go through the draft model
This is the architectural seam to close first; both screens depend on it.
- [recorder.tsx](../src/app/recorder.tsx) holds segments in React state (`LocalSegment[]`) only — **nothing is persisted**.
- Per §1.0b the editor must read segments from the **draft/state layer**; per §3 autosave fires **on segment-complete**. Neither happens.
- Recorded `video.uri` stays in **cache** — no move into `documentDirectory/drafts/{id}/segments/`, no relative-path storage (violates the §2.2 invariant).
- Tapping a draft card does `router.push('/recorder')` with **no `draftId`** → no resume of the specific draft.
- Segment-bar thumbnails are a placeholder `video.fill` icon, not a real first frame.

### Other missing recorder pieces (§2.1 / §2.2)
hold-to-record · `+` import (`expo-image-picker`) · hold+drag reorder · tap-to-preview · camera controls (flip/flash/stabilize/zoom) via `@expo/ui` + `expo-symbols` + `expo-glass-effect` · pinch/drag-zoom gesture glue.

### Unused-yet deps
`expo-video` (for preview/playback) and `expo-file-system` are installed but not used yet.

---

## 3. Plan — phased, doc-consistent

Sequenced to reconcile the recorder-first start with the docs' editor-first intent: **close the persistence seam first** (both screens need it), then do the native module + timeline (the real Milestone 0 risk).

### Phase A — Wire the recorder into the draft model (close the seam) ← **do this first**
Goal: recorded/imported clips become real persisted segments; both screens talk only through the DB (§1.0b).
- [ ] **File-store util** (`src/utils/file-store.ts`) — new `expo-file-system` `File`/`Directory`/`Paths` API: move recorded clip from cache → `Paths.document/drafts/{draftId}/segments/{segmentId}.mp4`; store **relative** paths, absolutize at runtime (§2.2).
- [ ] **Draft mutations** (`src/db/drafts.ts`) — `createDraft`, `addSegment`, `deleteSegment`, `reorderSegments`, `renameDraft`, `deleteDraft`. Autosave = row write on segment-complete (§3).
- [ ] **Thumbnails** — `expo-video-thumbnails` first frame at in-point; persist relative path; render in segment bar + draft cards (replace `video.fill` placeholder).
- [ ] **Recorder rewrite** — on mount create-or-load a draft (accept `draftId` param so a Home card resumes the right one); persist each clip; drive the bar off a `useLiveQuery` of that draft's segments.

### Phase B — Real Milestone 0: timeline editor on dev-seeded clips
Goal: the doc's actual Milestone 0, now testable because Phase A made segments real DB rows.
- [ ] **Dev-seed fixtures** — add 2–3 short clips with **deliberately mismatched res/fps/codec** (§1.0b note) under `assets/dev/`; make `DEV_SEED_SEGMENTS` copy them into a draft dir and route straight into `/timeline`. (Current `devSeedDraft` points at files that don't exist — make them real.)
- [ ] **Timeline editor UI** ([timeline.tsx](../src/app/timeline.tsx)) — clips end-to-end, playhead, `expo-video` preview, **trim** (drag edge → `trimStartMs`/`trimEndMs`), **split** (new row sharing `originalFilename`), Reset. All non-destructive metadata writes (§1.0a/§1.0c).

### Phase C — Native export module (the rebuild risk, §1.0)
- [ ] **Custom Expo native module** over AVFoundation (`AVMutableComposition`) / Media3 (`Transformer`): `export(segments)` composing each in/out window → one mp4 in `Paths.cache`; `getDuration()`. **Single biggest risk** — prove `export` on the dev-seeded mismatched clips early.
- [ ] **Editor `Done`** → run export → navigate to Upload with the merged file.

### Phase D — Upload (§4) and the rest
- [ ] Upload screen (#4): inline merged preview (tap→fullscreen via `expo-video`), `tus-js-client` v4 + SQLite `urlStorage`/`fileReader` (§4), per-draft destination picker (#5), pause/resume UI.
- [ ] Recorder polish (§2.1/2.2): hold-to-record, `+` import, hold+drag reorder, tap-to-preview, camera controls (`@expo/ui` + `expo-symbols` + `expo-glass-effect`), pinch/drag zoom glue.
- [ ] Deferred to the end per docs: `.pulse` transfer (§9), onboarding (§5), rebrand (§2.4).

---

## 4. Key recommendation

**Do Phase A before more timeline work.** It's the architectural seam the docs designed around (everything flows through the draft model, §1.0b), and it unblocks the dev-seed path that makes the real Milestone 0 testable on a simulator.

## 5. Invariants to honor (don't regress these)
- **Relative-path storage** for segment/thumb URIs; absolutize only at runtime (§2.2).
- **Non-destructive edits** — never mutate `originalFilename`; trims/splits are metadata; a file is written only at export (§1.0c).
- **Trust native duration**, not JS timers, for segment length (orig §4.2 / §11).
- **Autosave on segment-complete** (+ delete/reorder/trim/rename) as single-row writes (§3).
- **Recorder and editor communicate only through the draft model**, never a live session object (§1.0b).
