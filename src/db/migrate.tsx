import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { cleanFiles } from 'react-native-video-trim';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import migrations from '../../drizzle/migrations';
import { db } from './client';
import { runDataMigrations, type DataMigration } from './data-migrations';
import { getResumableDrafts } from './drafts';

/**
 * All one-shot data migrations, in execution order. APPEND new tasks at the end — never
 * remove, rename, or reorder shipped entries (see data-migrations.ts for the task rules).
 *
 * Currently empty: the only shipped task was 'legacy-drafts-import' (drafts from the original
 * Pulse app ≤ 1.2.x, read out of AsyncStorage), retired in 2.x after the replacement rollout
 * (#86) completed. Its id must never be reused — installs that ran it still hold its
 * completion key.
 */
const DATA_MIGRATIONS: readonly DataMigration[] = [];

const centered = { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 } as const;

export function MigrationGate({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrations);

  // One-shot data migrations (file moves, transforms) run after the schema migrations and
  // before the library renders, so an updating user's first frame already reflects them.
  // Completed tasks are skipped instantly.
  const [dataDone, setDataDone] = useState(false);
  useEffect(() => {
    if (!success) return;
    void runDataMigrations(DATA_MIGRATIONS).finally(() => setDataDone(true));
  }, [success]);

  // Sweep RNVT's output cache once on launch — editor outputs are already moved into draft dirs
  // (importTrimmedFile) and merge outputs are produced on-demand at export, so nothing in use is
  // live at startup. Reclaims the copies RNVT leaves behind on every trim/merge. EXCEPTION: a
  // draft killed mid-upload still needs its merged output (the after-kill resume re-uploads the
  // persisted path, which points into this cache) — skip the sweep until that queue drains.
  const swept = useRef(false);
  useEffect(() => {
    if (!success || swept.current) return;
    swept.current = true;
    void getResumableDrafts()
      .then((resumable) => {
        if (resumable.length > 0) return 0;
        return cleanFiles();
      })
      .then((n) => {
        if (__DEV__ && n > 0) console.log(`[cleanup] removed ${n} stale RNVT output file(s)`);
      })
      .catch(() => {});
  }, [success]);

  if (error) {
    return (
      <ThemedView style={centered}>
        <ThemedText>Could not open database</ThemedText>
        <ThemedText themeColor="textSecondary">{error.message}</ThemedText>
      </ThemedView>
    );
  }

  if (!success || !dataDone) {
    return (
      <ThemedView style={centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return <>{children}</>;
}
