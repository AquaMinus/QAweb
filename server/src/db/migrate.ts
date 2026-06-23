// Simple migration: creates tables if they don't exist (Drizzle push)
import { sqlite } from './connection.js';

console.log('Creating tables...');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS hosts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS question_sets (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover_image_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    question_set_id TEXT NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    time_limit_sec INTEGER NOT NULL DEFAULT 20,
    max_points INTEGER NOT NULL DEFAULT 1000,
    scoring_mode TEXT NOT NULL DEFAULT 'fixed',
    order_index INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS options (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS share_tokens (
    id TEXT PRIMARY KEY,
    question_set_id TEXT NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_rooms (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    question_set_id TEXT NOT NULL,
    question_set_title TEXT NOT NULL,
    pin TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    question_count INTEGER NOT NULL,
    player_count INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_player_results (
    id TEXT PRIMARY KEY,
    game_room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    session_token TEXT NOT NULL,
    total_score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    unanswered_count INTEGER NOT NULL DEFAULT 0,
    final_rank INTEGER NOT NULL,
    max_streak INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS game_answer_records (
    id TEXT PRIMARY KEY,
    game_room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    player_token TEXT NOT NULL,
    player_name TEXT NOT NULL,
    option_id TEXT,
    option_text TEXT,
    option_color TEXT,
    is_correct INTEGER NOT NULL DEFAULT 0,
    score_earned INTEGER NOT NULL DEFAULT 0,
    answer_time_ms INTEGER
  );
`);

// ── Migrate existing hosts: add username column if missing ──
const cols = sqlite.prepare('PRAGMA table_info(hosts)').all() as Array<{ name: string }>;
const hasUsername = cols.some(c => c.name === 'username');

if (!hasUsername) {
  console.log('Adding username column to hosts...');
  sqlite.exec(`
    ALTER TABLE hosts ADD COLUMN username TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hosts_username ON hosts(username);
  `);
  // Backfill: set username = email for existing rows
  sqlite.exec(`UPDATE hosts SET username = email WHERE username IS NULL OR username = ''`);
  console.log('Username column added and backfilled.');
}

// ── Ensure unique index on username exists ──
sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_hosts_username ON hosts(username)`);

console.log('Tables created successfully.');
