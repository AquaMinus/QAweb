import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import config from '../config.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Ensure data directory exists
const dbDir = dirname(config.dbPath);
mkdirSync(dbDir, { recursive: true });

const sqlite = new Database(config.dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export { sqlite };
