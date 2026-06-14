// The `.pulse` bundle format — a self-contained, cross-device draft transfer.
//
// A `.pulse` file is a ZIP archive (STORE/no recompression — the media is already
// H.264) holding this `manifest.json` at the root plus the raw clip files under `media/`.
// We ship the *files*, not base64-in-JSON: no ~33% inflation and no giant string held in
// memory. Thumbnails are NOT bundled — they're deterministic derivatives, regenerated on
// import. Transcripts are omitted too (re-derived on-device by the background engine), as
// are DB ids and the per-device upload destination.

export const MANIFEST_NAME = 'manifest.json';
export const MEDIA_DIR = 'media';
export const PULSE_FORMAT = 'pulse-draft-bundle';
export const PULSE_VERSION = 1;

/** One clip. Media is referenced by archive-relative path (e.g. `media/d0-s2.mp4`). */
export type BundleSegment = {
  order: number;
  durationMs: number;
  /** Archive path of the pristine original clip (always present). */
  original: string;
  /** Archive path of the destructive-edit output, or null if the clip was never edited. */
  edited: string | null;
  /** Effective duration of the edited file; null when not edited (mirrors the DB column). */
  editedDurationMs: number | null;
};

/** One draft. Carries display metadata but no DB id — the importer mints a fresh one. */
export type BundleDraft = {
  name: string | null;
  mode: 'camera' | 'upload';
  createdAt: number;
  segments: BundleSegment[];
};

export type PulseManifest = {
  format: typeof PULSE_FORMAT;
  version: number;
  /** When the bundle was written (ms epoch); informational. */
  exportedAt: number;
  drafts: BundleDraft[];
};

/** Structural validation of a parsed manifest — guards against malformed/foreign files. */
export function isPulseManifest(value: unknown): value is PulseManifest {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  if (m.format !== PULSE_FORMAT) return false;
  if (typeof m.version !== 'number') return false;
  if (!Array.isArray(m.drafts)) return false;
  return m.drafts.every((d) => {
    if (typeof d !== 'object' || d === null) return false;
    const draft = d as Record<string, unknown>;
    if (!Array.isArray(draft.segments)) return false;
    return draft.segments.every((s) => {
      const seg = s as Record<string, unknown>;
      return typeof seg?.original === 'string' && typeof seg?.durationMs === 'number';
    });
  });
}
