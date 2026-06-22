import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../../db/connection.js';

const { hashSync, compareSync } = bcrypt;
import { hosts, passwordResetTokens } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { HostInfo } from '../../shared/types.js';

const BCRYPT_ROUNDS = 12;

// ── Registration ──
export function registerHost(email: string, password: string, displayName: string): HostInfo {
  const existing = db.select({ id: hosts.id }).from(hosts).where(eq(hosts.email, email)).get();
  if (existing) {
    throw new Error('EMAIL_TAKEN');
  }

  const id = uuidv4();
  const now = Date.now();
  const passwordHash = hashSync(password, BCRYPT_ROUNDS);

  db.insert(hosts).values({
    id,
    email: email.toLowerCase().trim(),
    passwordHash,
    displayName: displayName.trim(),
    createdAt: now,
    updatedAt: now,
  }).run();

  return { id, email: email.toLowerCase().trim(), displayName: displayName.trim() };
}

// ── Login ──
export function loginHost(email: string, password: string): HostInfo {
  const host = db.select().from(hosts).where(eq(hosts.email, email.toLowerCase().trim())).get();
  if (!host) {
    throw new Error('INVALID_CREDENTIALS');
  }

  if (!compareSync(password, host.passwordHash)) {
    throw new Error('INVALID_CREDENTIALS');
  }

  return {
    id: host.id,
    email: host.email,
    displayName: host.displayName,
  };
}

// ── Profile ──
export function getHostById(id: string): HostInfo | null {
  const host = db.select().from(hosts).where(eq(hosts.id, id)).get();
  if (!host) return null;
  return { id: host.id, email: host.email, displayName: host.displayName };
}

export function updateDisplayName(id: string, displayName: string): HostInfo {
  db.update(hosts)
    .set({ displayName: displayName.trim(), updatedAt: Date.now() })
    .where(eq(hosts.id, id))
    .run();
  return getHostById(id)!;
}

export function changePassword(id: string, oldPassword: string, newPassword: string): void {
  const host = db.select().from(hosts).where(eq(hosts.id, id)).get();
  if (!host) throw new Error('NOT_FOUND');

  if (!compareSync(oldPassword, host.passwordHash)) {
    throw new Error('WRONG_PASSWORD');
  }

  db.update(hosts)
    .set({ passwordHash: hashSync(newPassword, BCRYPT_ROUNDS), updatedAt: Date.now() })
    .where(eq(hosts.id, id))
    .run();
}

// ── Password Reset ──
export function createPasswordResetToken(email: string): string | null {
  const host = db.select({ id: hosts.id }).from(hosts).where(eq(hosts.email, email.toLowerCase().trim())).get();
  if (!host) return null; // Don't reveal if email exists

  const token = uuidv4();
  const now = Date.now();
  const expiresAt = now + 60 * 60 * 1000; // 1 hour

  db.insert(passwordResetTokens).values({
    id: uuidv4(),
    hostId: host.id,
    token,
    expiresAt,
    used: 0,
  }).run();

  return token;
}

export function resetPassword(token: string, newPassword: string): void {
  const now = Date.now();
  const record = db.select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.token, token), eq(passwordResetTokens.used, 0)))
    .get();

  if (!record) throw new Error('INVALID_TOKEN');
  if (now > record.expiresAt) throw new Error('TOKEN_EXPIRED');

  db.update(hosts)
    .set({ passwordHash: hashSync(newPassword, BCRYPT_ROUNDS), updatedAt: now })
    .where(eq(hosts.id, record.hostId))
    .run();

  db.update(passwordResetTokens)
    .set({ used: 1 })
    .where(eq(passwordResetTokens.id, record.id))
    .run();
}
