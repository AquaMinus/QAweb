import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/connection.js';
import { questionSets, questions, options } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import type { QuestionSetData, QuestionData, QuestionOption, ScoringMode, OptionColor } from '../../shared/types.js';

// ── Question Set CRUD ──

export function listSets(hostId: string): QuestionSetData[] {
  const sets = db.select().from(questionSets).where(eq(questionSets.hostId, hostId)).all();
  return sets.map(s => ({
    ...s,
    questionCount: countQuestions(s.id),
  }));
}

export function getSet(id: string, hostId: string): QuestionSetData | null {
  const set = db.select().from(questionSets)
    .where(and(eq(questionSets.id, id), eq(questionSets.hostId, hostId)))
    .get();
  if (!set) return null;
  return { ...set, questionCount: countQuestions(set.id) };
}

export function getSetById(id: string): QuestionSetData | null {
  const set = db.select().from(questionSets).where(eq(questionSets.id, id)).get();
  if (!set) return null;
  return { ...set, questionCount: countQuestions(set.id) };
}

export function createSet(hostId: string, title: string, description?: string, coverImageUrl?: string): QuestionSetData {
  const id = uuidv4();
  const now = Date.now();
  db.insert(questionSets).values({
    id,
    hostId,
    title: title.trim(),
    description: description?.trim() || '',
    coverImageUrl: coverImageUrl?.trim() || null,
    createdAt: now,
    updatedAt: now,
  }).run();
  return { id, hostId, title: title.trim(), description: description?.trim() || '', coverImageUrl: coverImageUrl?.trim() || null, createdAt: now, updatedAt: now, questionCount: 0 };
}

export function updateSet(id: string, hostId: string, data: { title?: string; description?: string; coverImageUrl?: string | null }): QuestionSetData | null {
  const set = getSet(id, hostId);
  if (!set) return null;

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (data.title !== undefined) updates.title = data.title.trim();
  if (data.description !== undefined) updates.description = data.description.trim();
  if (data.coverImageUrl !== undefined) updates.coverImageUrl = data.coverImageUrl?.trim() || null;

  db.update(questionSets).set(updates).where(eq(questionSets.id, id)).run();
  return getSet(id, hostId);
}

export function deleteSet(id: string, hostId: string): boolean {
  const set = getSet(id, hostId);
  if (!set) return false;
  db.delete(questionSets).where(eq(questionSets.id, id)).run();
  return true;
}

export function copySet(id: string, hostId: string): QuestionSetData | null {
  const original = getSet(id, hostId);
  if (!original) return null;

  // Create new set
  const newSet = createSet(hostId, `📋 ${original.title} (副本)`, original.description, original.coverImageUrl);

  // Copy all questions
  const qs = getQuestions(original.id);
  for (const q of qs) {
    addQuestion(newSet.id, {
      text: q.text,
      timeLimitSec: q.timeLimitSec,
      maxPoints: q.maxPoints,
      scoringMode: q.scoringMode,
      orderIndex: q.orderIndex,
      imageUrl: q.imageUrl,
      options: q.options.map(o => ({
        text: o.text,
        isCorrect: o.isCorrect,
        color: o.color,
        orderIndex: o.orderIndex,
      })),
    });
  }

  return getSet(newSet.id, hostId);
}

// ── Question CRUD ──

export function getQuestions(setId: string): QuestionData[] {
  const qs = db.select().from(questions)
    .where(eq(questions.questionSetId, setId))
    .orderBy(questions.orderIndex)
    .all();

  return qs.map(q => ({
    ...q,
    options: getOptions(q.id),
  }));
}

export function getQuestion(questionId: string): QuestionData | null {
  const q = db.select().from(questions).where(eq(questions.id, questionId)).get();
  if (!q) return null;
  return { ...q, options: getOptions(q.id) };
}

export function addQuestion(setId: string, data: {
  text: string;
  orderIndex?: number;
  imageUrl?: string | null;
  options: { text: string; isCorrect: boolean; color: OptionColor; orderIndex: number }[];
}): QuestionData {
  const id = uuidv4();
  const now = Date.now();

  db.insert(questions).values({
    id,
    questionSetId: setId,
    text: data.text.trim(),
    timeLimitSec: 20,    // Default — overridden by room settings
    maxPoints: 1000,     // Default — overridden by room settings
    scoringMode: 'fixed', // Default — overridden by room settings
    orderIndex: data.orderIndex ?? nextOrderIndex(setId),
    imageUrl: data.imageUrl?.trim() || null,
    createdAt: now,
  }).run();

  // Insert options
  for (const opt of data.options) {
    db.insert(options).values({
      id: uuidv4(),
      questionId: id,
      text: opt.text.trim(),
      isCorrect: opt.isCorrect ? 1 : 0,
      color: opt.color,
      orderIndex: opt.orderIndex,
    }).run();
  }

  // Update set timestamp
  db.update(questionSets).set({ updatedAt: now }).where(eq(questionSets.id, setId)).run();

  return getQuestion(id)!;
}

export function updateQuestion(questionId: string, data: {
  text?: string;
  orderIndex?: number;
  imageUrl?: string | null;
  options?: { text: string; isCorrect: boolean; color: OptionColor; orderIndex: number }[];
}): QuestionData | null {
  const q = db.select().from(questions).where(eq(questions.id, questionId)).get();
  if (!q) return null;

  const updates: Record<string, unknown> = {};
  if (data.text !== undefined) updates.text = data.text.trim();
  if (data.orderIndex !== undefined) updates.orderIndex = data.orderIndex;
  if (data.imageUrl !== undefined) updates.imageUrl = data.imageUrl?.trim() || null;

  if (Object.keys(updates).length > 0) {
    db.update(questions).set(updates).where(eq(questions.id, questionId)).run();
  }

  // Replace options if provided
  if (data.options && data.options.length >= 2) {
    db.delete(options).where(eq(options.questionId, questionId)).run();
    for (const opt of data.options) {
      db.insert(options).values({
        id: uuidv4(),
        questionId,
        text: opt.text.trim(),
        isCorrect: opt.isCorrect ? 1 : 0,
        color: opt.color,
        orderIndex: opt.orderIndex,
      }).run();
    }
  }

  // Update set timestamp
  db.update(questionSets).set({ updatedAt: Date.now() }).where(eq(questionSets.id, q.questionSetId)).run();

  return getQuestion(questionId);
}

export function deleteQuestion(questionId: string): boolean {
  const q = db.select().from(questions).where(eq(questions.id, questionId)).get();
  if (!q) return false;

  db.delete(options).where(eq(options.questionId, questionId)).run();
  db.delete(questions).where(eq(questions.id, questionId)).run();

  // Update set timestamp
  db.update(questionSets).set({ updatedAt: Date.now() }).where(eq(questionSets.id, q.questionSetId)).run();

  return true;
}

export function reorderQuestions(setId: string, orderedIds: string[]): void {
  for (let i = 0; i < orderedIds.length; i++) {
    db.update(questions).set({ orderIndex: i }).where(eq(questions.id, orderedIds[i])).run();
  }
  db.update(questionSets).set({ updatedAt: Date.now() }).where(eq(questionSets.id, setId)).run();
}

// ── Helpers ──

function getOptions(questionId: string): QuestionOption[] {
  return db.select().from(options)
    .where(eq(options.questionId, questionId))
    .orderBy(options.orderIndex)
    .all()
    .map(o => ({ ...o, isCorrect: o.isCorrect === 1 }));
}

function countQuestions(setId: string): number {
  const result = db.select({ count: sql<number>`count(*)` }).from(questions)
    .where(eq(questions.questionSetId, setId))
    .get();
  return result?.count ?? 0;
}

function nextOrderIndex(setId: string): number {
  const max = db.select({ max: questions.orderIndex }).from(questions)
    .where(eq(questions.questionSetId, setId))
    .get();
  return ((max as any)?.max ?? -1) + 1;
}

// Re-export count for use in routes
export { countQuestions };
