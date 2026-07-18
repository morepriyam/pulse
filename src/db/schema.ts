import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch('subsec') * 1000)`;

/** Which artifact a draft's `uploadArtifactId` anchors: the merged export video itself, or the
 * session that every segment/manifest/captions artifact declares via `relatedTo`. */
type UploadUnit = 'segment' | 'merged';

/** Lifecycle of a single upload (video or captions), tracked independently per artifact. */
type UploadStatus = 'idle' | 'uploading' | 'uploaded' | 'failed';

/** A draft project — an ordered set of segments, plus its upload destination. */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name'),
  mode: text('mode', { enum: ['camera', 'upload'] })
    .notNull()
    .default('camera'),
  // Reserved cover frame; currently thumbnails are derived at runtime from the first clip.
  thumbnail: text('thumbnail'),
  // Per-draft upload destination (§4). `uploadArtifactId` is the session-anchor artifact id
  // from the pairing deep link, used as the TUS artifactId directly (merged) or as `relatedTo`
  // (segment). `uploadUnit` is resolved once from the server's `/capabilities` at pairing time and
  // cached here so later upload runs don't re-fetch it.
  uploadServer: text('upload_server'),
  // The bearer token itself is NOT stored here — it's a live capability credential, kept in
  // expo-secure-store instead (`db/secure-token.ts`), not in this plaintext-at-rest table.
  uploadArtifactId: text('upload_artifact_id'),
  uploadUnit: text('upload_unit', { enum: ['segment', 'merged'] }).$type<UploadUnit>(),
  // The TUS resource URL (the `Location` from the initial create) for the
  // merged-video upload, persisted so a relaunch can `HEAD` it to learn the
  // true offset and resume rather than restarting from byte 0.
  uploadResourceUrl: text('upload_resource_url'),
  uploadStatus: text('upload_status', {
    enum: ['idle', 'uploading', 'uploaded', 'failed'],
  }).$type<UploadStatus>(),
  captionsUploadStatus: text('captions_upload_status', {
    enum: ['idle', 'uploading', 'uploaded', 'failed'],
  }).$type<UploadStatus>(),
  // The merged export output the background upload manager uploads. Persisted at enqueue so an
  // upload interrupted by an app kill can be re-driven from launch without the export screen —
  // the one piece of a merged run not otherwise recoverable from the DB (the path is a native
  // merge output, the duration feeds the beat manifest). Null for segment-unit drafts.
  uploadMergedPath: text('upload_merged_path'),
  uploadMergedDurationMs: integer('upload_merged_duration_ms'),
  createdAt: integer('created_at').notNull().default(now),
  lastModified: integer('last_modified').notNull().default(now),
});

/**
 * A clip on the timeline. The `originalFilename` recording/import is never mutated.
 * Editing is DESTRUCTIVE via react-native-video-trim: the editor (trim + transforms)
 * writes a new re-encoded file, stored as `editedFilename`. Re-editing always re-opens
 * the pristine original (no compounding loss); reset = delete the edited file + null
 * the edited columns. The effective file is `editedFilename ?? originalFilename` and the
 * effective duration is `editedDurationMs ?? durationMs`.
 */
export const segments = sqliteTable('segments', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  order: integer('sort_order').notNull(),
  // Pristine source clip (relative path) — never mutated.
  originalFilename: text('original_filename').notNull(),
  durationMs: integer('duration_ms').notNull(),
  // Re-encoded editor output (relative path) + its duration; null until edited.
  editedFilename: text('edited_filename'),
  editedDurationMs: integer('edited_duration_ms'),
  // Dead under the destructive model (kept to avoid a destructive drop migration).
  trimStartMs: integer('trim_start_ms'),
  trimEndMs: integer('trim_end_ms'),
  // Reserved; thumbnails are derived at runtime from the clip file.
  thumbnail: text('thumbnail'),
});

/**
 * On-device speech-to-text for a draft's MERGED video (whisper.rn). One row per draft (project),
 * produced once at export time from the concatenated timeline — NOT per segment. `signature`
 * is the effective-file signature of the segment set the transcript was cut against
 * (`segments.map(effFile).join('|')`, the same string `useExport` keys its merge on); when the
 * clip set changes the merged timeline moves, so a mismatching signature marks BOTH `lines` and
 * `editedLines` stale and triggers a re-transcribe on the next export. `lines` is JSON of
 * `Array<{ text, t0, t1, words? }>` with t0/t1 in centiseconds on the merged timeline (0-based,
 * no stitching). `editedLines` holds the user's hand-edited captions (same JSON shape); when
 * present AND same-signature it is the effective transcript. `durationMs` is the true merged
 * duration this transcript was cut against (used to reconcile the beat manifest timecodes).
 */
export const draftTranscripts = sqliteTable('draft_transcripts', {
  projectId: text('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  // Effective-file signature of the segment set this transcript was produced from. A change
  // (add/remove/reorder/destructive-edit) invalidates the merged transcript incl. hand-edits.
  signature: text('signature').notNull(),
  // The Whisper model id that produced (or is producing) this transcript.
  model: text('model'),
  status: text('status', { enum: ['processing', 'done', 'error'] })
    .notNull()
    .default('processing'),
  language: text('language'),
  text: text('text'),
  lines: text('lines'),
  // User-edited captions (JSON, same shape as `lines`). Null = no manual edit. Effective only
  // while `signature` still matches the current segment set; a change clears it (timings stale).
  editedLines: text('edited_lines'),
  editedAt: integer('edited_at'),
  // True merged duration (ms) this transcript was cut against — from the native MergeResult.
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at').notNull().default(now),
});

/** App-wide key/value settings (e.g. the selected transcription model). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

/**
 * A sub-artifact within an upload session, keyed so a retry can look up and resume the SAME
 * server-side artifact instead of minting a fresh UUID and re-uploading from scratch.
 * `localKey` is one of the merged-mode session's `"captions"`, `"manifest"` (beat manifest) or
 * `"thumbnail"`, or `` `${segmentId}:video` `` for a segmented-mode clip.
 */
export const uploadArtifacts = sqliteTable('upload_artifacts', {
  id: text('id').primaryKey(), // `${projectId}:${localKey}`
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  localKey: text('local_key').notNull(),
  artifactId: text('artifact_id').notNull(),
  // Null until the first PATCH round succeeds — see `tus-client.ts`'s `createUpload`.
  resourceUrl: text('resource_url'),
});

/**
 * The pool of upload destinations the device has paired with (via `pulsecam://` deep links)
 * but not yet consumed. Unlike a draft's `projects.upload*` columns (which record where a
 * specific draft is being/has been sent), this is a device-wide list any draft can pick from
 * at upload time. Each row is single-use — its server-minted `artifactId` anchors exactly one
 * upload session, so the row is deleted once that upload finishes (or the user deletes it).
 * The bearer token is NOT stored here (live capability credential) — it lives in
 * expo-secure-store keyed by `id`, same policy as the per-draft token above.
 */
export const uploadDestinations = sqliteTable('upload_destinations', {
  id: text('id').primaryKey(), // local uuid (Crypto.randomUUID), also the secure-store token key
  server: text('server').notNull(),
  artifactId: text('artifact_id').notNull(),
  uploadUnit: text('upload_unit', { enum: ['segment', 'merged'] })
    .$type<UploadUnit>()
    .notNull(),
  createdAt: integer('created_at').notNull().default(now),
});

export type Project = typeof projects.$inferSelect;
export type Segment = typeof segments.$inferSelect;
export type DraftTranscript = typeof draftTranscripts.$inferSelect;
export type UploadArtifact = typeof uploadArtifacts.$inferSelect;
export type UploadDestination = typeof uploadDestinations.$inferSelect;
