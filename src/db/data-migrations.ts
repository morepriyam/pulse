import { getSetting, setSetting } from './settings';

/**
 * Versioned one-shot DATA migrations — file moves, data transforms, cleanups — as opposed to
 * SCHEMA migrations, which drizzle already handles (drizzle/ + MigrationGate).
 *
 * Each task runs at most once per install, in list order, after the drizzle schema migrations
 * succeed. Completion is recorded per-task in the `settings` table (`dataMigration.{id}`), so a
 * task that throws simply retries on the next launch while completed ones stay skipped.
 *
 * Rules for writing a task:
 *   - IDEMPOTENT: it may re-run after a mid-way crash, so every step must tolerate having
 *     already happened (INSERT ... onConflictDoNothing, skip moves whose dest exists, etc.).
 *   - SELF-CONTAINED: never reach into another task's state; order is the only guarantee.
 *   - APPEND-ONLY: never remove or reorder shipped entries — installs that already ran them
 *     key off the id.
 */
export type DataMigration = {
  /** Stable unique id, e.g. 'legacy-drafts-import'. Never reuse or rename a shipped id. */
  id: string;
  run: () => Promise<void>;
};

const doneKey = (id: string) => `dataMigration.${id}`;

/** Run every not-yet-completed task in order. A task failure aborts the run (and the tasks
 * after it) but is swallowed — the app still starts, and the remainder retries next launch. */
export async function runDataMigrations(migrations: readonly DataMigration[]): Promise<void> {
  for (const migration of migrations) {
    if ((await getSetting(doneKey(migration.id))) === 'true') continue;
    try {
      await migration.run();
      await setSetting(doneKey(migration.id), 'true');
    } catch (e) {
      console.warn(`[data-migration] '${migration.id}' failed, will retry on next launch`, e);
      return;
    }
  }
}
