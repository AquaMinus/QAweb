import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ── Host accounts ──
export const hosts = sqliteTable('hosts', {
  id: text('id').primaryKey(),           // UUID v4
  username: text('username').notNull().unique(),
  email: text('email').notNull().default(''),  // optional, email-based login deprecated
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(),   // Unix ms
  updatedAt: integer('updated_at').notNull(),
});

// ── Password reset tokens ──
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: text('id').primaryKey(),
  hostId: text('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  used: integer('used').notNull().default(0),  // 0 = unused, 1 = used
});

// ── Question sets ──
export const questionSets = sqliteTable('question_sets', {
  id: text('id').primaryKey(),
  hostId: text('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  coverImageUrl: text('cover_image_url'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// ── Questions ──
export const questions = sqliteTable('questions', {
  id: text('id').primaryKey(),
  questionSetId: text('question_set_id').notNull().references(() => questionSets.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  timeLimitSec: integer('time_limit_sec').notNull().default(20),
  maxPoints: integer('max_points').notNull().default(1000),
  scoringMode: text('scoring_mode').notNull().default('fixed'), // 'fixed' | 'time_decay'
  orderIndex: integer('order_index').notNull().default(0),
  imageUrl: text('image_url'),
  createdAt: integer('created_at').notNull(),
});

// ── Answer options (up to 4 per question) ──
export const options = sqliteTable('options', {
  id: text('id').primaryKey(),
  questionId: text('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  isCorrect: integer('is_correct').notNull().default(0),
  color: text('color').notNull(),  // 'red' | 'blue' | 'yellow' | 'green'
  orderIndex: integer('order_index').notNull().default(0),
});

// ── Share tokens for question sets ──
export const shareTokens = sqliteTable('share_tokens', {
  id: text('id').primaryKey(),
  questionSetId: text('question_set_id').notNull().references(() => questionSets.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

// ── Game room history (persisted after game ends) ──
export const gameRooms = sqliteTable('game_rooms', {
  id: text('id').primaryKey(),
  hostId: text('host_id').notNull().references(() => hosts.id, { onDelete: 'cascade' }),
  questionSetId: text('question_set_id').notNull(),
  questionSetTitle: text('question_set_title').notNull(),
  pin: text('pin').notNull(),
  settingsJson: text('settings_json').notNull(),
  questionCount: integer('question_count').notNull(),
  playerCount: integer('player_count').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

// ── Player results per game ──
export const gamePlayerResults = sqliteTable('game_player_results', {
  id: text('id').primaryKey(),
  gameRoomId: text('game_room_id').notNull().references(() => gameRooms.id, { onDelete: 'cascade' }),
  playerName: text('player_name').notNull(),
  sessionToken: text('session_token').notNull(),
  totalScore: integer('total_score').notNull().default(0),
  correctCount: integer('correct_count').notNull().default(0),
  wrongCount: integer('wrong_count').notNull().default(0),
  unansweredCount: integer('unanswered_count').notNull().default(0),
  finalRank: integer('final_rank').notNull(),
  maxStreak: integer('max_streak').notNull().default(0),
});

// ── Per-question answer records ──
export const gameAnswerRecords = sqliteTable('game_answer_records', {
  id: text('id').primaryKey(),
  gameRoomId: text('game_room_id').notNull().references(() => gameRooms.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull(),
  questionText: text('question_text').notNull(),
  playerToken: text('player_token').notNull(),
  playerName: text('player_name').notNull(),
  optionId: text('option_id'),
  optionText: text('option_text'),
  optionColor: text('option_color'),
  isCorrect: integer('is_correct').notNull().default(0),
  scoreEarned: integer('score_earned').notNull().default(0),
  answerTimeMs: integer('answer_time_ms'),
});
