import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';
import { cleanFiles } from 'react-native-video-trim';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import migrations from '../../drizzle/migrations';
import { db } from './client';

const centered = { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 } as const;

export function MigrationGate({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrations);

  // Sweep RNVT's output cache once on launch — editor outputs are already moved into draft dirs
  // (importTrimmedFile) and merge outputs are produced on-demand at export, so nothing in use is
  // live at startup. Reclaims the copies RNVT leaves behind on every trim/merge.
  const swept = useRef(false);
  useEffect(() => {
    if (!success || swept.current) return;
    swept.current = true;
    void cleanFiles()
      .then((n) => console.log(`[cleanup] removed ${n} stale RNVT output file(s)`))
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

  if (!success) {
    return (
      <ThemedView style={centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return <>{children}</>;
}
