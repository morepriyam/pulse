import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

// Single connection for the app. enableChangeListener powers useLiveQuery.
const expoDb = openDatabaseSync('pulse.db', { enableChangeListener: true });
expoDb.execSync('PRAGMA foreign_keys = ON;'); // honor segment → project cascade

export const db = drizzle(expoDb, { schema });
