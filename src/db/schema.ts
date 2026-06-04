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
  // Relative path to the first-frame thumbnail (absolutized at runtime).
  thumbnail: text('thumbnail'),
  // Per-draft upload destination (§4).
  uploadServer: text('upload_server'),
  uploadToken: text('upload_token'),
  createdAt: integer('created_at').notNull().default(now),
  lastModified: integer('last_modified').notNull().default(now),
});

/**
 * A clip on the timeline. The original media is never mutated; trims/splits are
 * non-destructive metadata over it (§1.0c). A split is a second row pointing at
 * the same `originalFilename` with a different in/out window.
 */
export const segments = sqliteTable('segments', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  order: integer('sort_order').notNull(),
  originalFilename: text('original_filename').notNull(),
  trimStartMs: integer('trim_start_ms'),
  trimEndMs: integer('trim_end_ms'),
  durationMs: integer('duration_ms').notNull(),
  thumbnail: text('thumbnail'),
});

export type Project = typeof projects.$inferSelect;
export type Segment = typeof segments.$inferSelect;
