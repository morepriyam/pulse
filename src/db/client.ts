import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

const expoDb = openDatabaseSync('pulse.db', { enableChangeListener: true }); // enables useLiveQuery
expoDb.execSync('PRAGMA foreign_keys = ON;'); // per-connection; required for cascade deletes

export const db = drizzle(expoDb, { schema });
