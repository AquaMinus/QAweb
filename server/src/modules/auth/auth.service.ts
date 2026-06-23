import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../../db/connection.js';

const { hashSync, compareSync } = bcrypt;
import { hosts, passwordResetTokens } from '../../db/schema.js';
import { eq, and, or } from 'drizzle-orm';
import type { HostInfo } from '../../shared/types.js';

const BCRYPT_ROUNDS = 12;

// ── Registration ──
export function registerHost(username: string, password: string, email?: string, displayName?: string): HostInfo {
  const trimmedUsername = username.trim();
  const trimmedEmail = email?.toLowerCase()?.trim() || '';
  const trimmedDisplayName = displayName?.trim() || trimmedUsername;

  // Check username uniqueness
  const existing = db.select({ id: hosts.id }).from(hosts).where(eq(hosts.username, trimmedUsername)).get();
  if (existing) {
    throw new Error('USERNAME_TAKEN');
  }

  // Check email uniqueness if provided
  if (trimmedEmail) {
    const emailExist = db.select({ id: hosts.id }).from(hosts).where(eq(hosts.email, trimmedEmail)).get();
    if (emailExist) {
      throw new Error('EMAIL_TAKEN');
    }
  }

  const id = uuidv4();
  const now = Date.now();
  const passwordHash = hashSync(password, BCRYPT_ROUNDS);

  // Use unique placeholder for empty email to avoid UNIQUE constraint violations
  const finalEmail = trimmedEmail || `_noemail_${id}`;

  db.insert(hosts).values({
    id,
    username: trimmedUsername,
    email: finalEmail,
    passwordHash,
    displayName: trimmedDisplayName,
    createdAt: now,
    updatedAt: now,
  }).run();

  return { id, username: trimmedUsername, email: trimmedEmail, displayName: trimmedDisplayName };
}

// ── Login ── (supports both username and email)
export function loginHost(login: string, password: string): HostInfo {
  const trimmedLogin = login.toLowerCase().trim();

  // Try username first, then email
  let host = db.select().from(hosts).where(eq(hosts.username, trimmedLogin)).get();
  if (!host) {
    host = db.select().from(hosts).where(eq(hosts.email, trimmedLogin)).get();
  }
  if (!host) {
    throw new Error('INVALID_CREDENTIALS');
  }

  if (!compareSync(password, host.passwordHash)) {
    throw new Error('INVALID_CREDENTIALS');
  }

  return {
    id: host.id,
    username: host.username,
    email: host.email,
    displayName: host.displayName,
  };
}

// ── Profile ──
export function getHostById(id: string): HostInfo | null {
  const host = db.select().from(hosts).where(eq(hosts.id, id)).get();
  if (!host) return null;
  return { id: host.id, username: host.username, email: host.email, displayName: host.displayName };
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

// ── Password Reset ── (supports both username and email)
export function createPasswordResetToken(login: string): string | null {
  const trimmedLogin = login.toLowerCase().trim();

  // Try username first, then email
  let host = db.select({ id: hosts.id }).from(hosts).where(eq(hosts.username, trimmedLogin)).get();
  if (!host) {
    host = db.select({ id: hosts.id }).from(hosts).where(eq(hosts.email, trimmedLogin)).get();
  }
  if (!host) return null; // Don't reveal if user exists

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
