import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch('subsec') * 1000)`;

/** A draft project — an ordered set of segments, plus its upload destination. */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name'),
  mode: text('mode', { enum: ['camera', 'upload'] })
    .notNull()
    .default('camera'),
  // Reserved cover frame; currently thumbnails are derived at runtime from the first clip.
  thumbnail: text('thumbnail'),
  // Per-draft upload destination (§4).
  uploadServer: text('upload_server'),
  uploadToken: text('upload_token'),
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

export type Project = typeof projects.$inferSelect;
export type Segment = typeof segments.$inferSelect;
