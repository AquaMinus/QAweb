import { v4 as uuidv4 } from 'uuid';
import { db, sqlite } from '../../db/connection.js';
import { shareTokens } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

/** Create a share token for a question set with an expiry. */
export function createShareToken(questionSetId: string, expiresInHours: number): { token: string; expiresAt: number } {
  const token = uuidv4();
  const now = Date.now();
  const expiresAt = now + expiresInHours * 60 * 60 * 1000;

  db.insert(shareTokens).values({
    id: uuidv4(),
    questionSetId,
    token,
    expiresAt,
    createdAt: now,
  }).run();

  return { token, expiresAt };
}

/** Validate a share token and return the question set ID if valid. */
export function validateShareToken(token: string): string | null {
  const now = Date.now();
  const record = db.select()
    .from(shareTokens)
    .where(and(eq(shareTokens.token, token)))
    .get();

  if (!record) return null;
  if (now > record.expiresAt) {
    // Clean up expired token
    db.delete(shareTokens).where(eq(shareTokens.id, record.id)).run();
    return null;
  }

  return record.questionSetId;
}

/** Delete all expired share tokens (cleanup). */
export function cleanupExpiredTokens(): number {
  const now = Date.now();
  const result = sqlite.prepare('DELETE FROM share_tokens WHERE expires_at < ?').run(now);
  return result.changes;
}
