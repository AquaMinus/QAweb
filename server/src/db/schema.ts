import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ── Host accounts ──
export const hosts = sqliteTable('hosts', {
  id: text('id').primaryKey(),           // UUID v4
  email: text('email').notNull().unique(),
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
