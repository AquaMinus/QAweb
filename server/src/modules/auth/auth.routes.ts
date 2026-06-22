import { Hono } from 'hono';
import { sign } from 'hono/jwt';

const JWT_ALG = 'HS256';
import {
  registerHost,
  loginHost,
  getHostById,
  updateDisplayName,
  changePassword,
  createPasswordResetToken,
  resetPassword,
} from './auth.service.js';
import { authGuard } from './auth.guard.js';
import config from '../../config.js';

export const authRoutes = new Hono();

// ── Register ──
authRoutes.post('/register', async (c) => {
  try {
    const { email, password, displayName } = await c.req.json();
    if (!email || !password || !displayName) {
      return c.json({ error: 'VALIDATION', message: 'Email, password, and display name are required' }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: 'VALIDATION', message: 'Password must be at least 6 characters' }, 400);
    }

    const host = registerHost(email, password, displayName);
    const token = await sign(
      { sub: host.id, email: host.email, displayName: host.displayName, exp: expiresIn(config.jwtExpiresIn) },
      config.jwtSecret,
      JWT_ALG,
    );

    return c.json({ host, token }, 201);
  } catch (err: any) {
    if (err.message === 'EMAIL_TAKEN') {
      return c.json({ error: 'EMAIL_TAKEN', message: 'This email is already registered' }, 409);
    }
    throw err;
  }
});

// ── Login ──
authRoutes.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'VALIDATION', message: 'Email and password are required' }, 400);
    }

    const host = loginHost(email, password);
    const token = await sign(
      { sub: host.id, email: host.email, displayName: host.displayName, exp: expiresIn(config.jwtExpiresIn) },
      config.jwtSecret,
      JWT_ALG,
    );

    return c.json({ host, token });
  } catch (err: any) {
    if (err.message === 'INVALID_CREDENTIALS') {
      return c.json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }, 401);
    }
    throw err;
  }
});

// ── Protected routes ──
const protectedRoutes = new Hono();
protectedRoutes.use('*', authGuard);

// Get current host profile
protectedRoutes.get('/me', (c) => {
  const host = c.var.host;
  const full = getHostById(host.id);
  if (!full) return c.json({ error: 'NOT_FOUND', message: 'Host not found' }, 404);
  return c.json({ host: full });
});

// Update display name
protectedRoutes.patch('/profile', async (c) => {
  const host = c.var.host;
  const { displayName } = await c.req.json();
  if (!displayName || !displayName.trim()) {
    return c.json({ error: 'VALIDATION', message: 'Display name is required' }, 400);
  }
  const updated = updateDisplayName(host.id, displayName.trim());
  return c.json({ host: updated });
});

// Change password
protectedRoutes.post('/change-password', async (c) => {
  const host = c.var.host;
  const { oldPassword, newPassword } = await c.req.json();
  if (!oldPassword || !newPassword) {
    return c.json({ error: 'VALIDATION', message: 'Old and new passwords are required' }, 400);
  }
  if (newPassword.length < 6) {
    return c.json({ error: 'VALIDATION', message: 'New password must be at least 6 characters' }, 400);
  }

  try {
    changePassword(host.id, oldPassword, newPassword);
    return c.json({ success: true });
  } catch (err: any) {
    if (err.message === 'WRONG_PASSWORD') {
      return c.json({ error: 'WRONG_PASSWORD', message: 'Current password is incorrect' }, 400);
    }
    throw err;
  }
});

// Request password reset
authRoutes.post('/forgot-password', async (c) => {
  const { email } = await c.req.json();
  if (!email) {
    return c.json({ error: 'VALIDATION', message: 'Email is required' }, 400);
  }

  const token = createPasswordResetToken(email);
  // Always return success to prevent email enumeration
  // In production, send the token via email
  if (token) {
    console.log(`[AUTH] Password reset token for ${email}: ${token}`);
  }
  return c.json({ success: true, message: 'If the email exists, a reset link has been sent' });
});

// Reset password with token
authRoutes.post('/reset-password', async (c) => {
  const { token, newPassword } = await c.req.json();
  if (!token || !newPassword) {
    return c.json({ error: 'VALIDATION', message: 'Token and new password are required' }, 400);
  }
  if (newPassword.length < 6) {
    return c.json({ error: 'VALIDATION', message: 'New password must be at least 6 characters' }, 400);
  }

  try {
    resetPassword(token, newPassword);
    return c.json({ success: true });
  } catch (err: any) {
    if (err.message === 'INVALID_TOKEN') {
      return c.json({ error: 'INVALID_TOKEN', message: 'Invalid or already used token' }, 400);
    }
    if (err.message === 'TOKEN_EXPIRED') {
      return c.json({ error: 'TOKEN_EXPIRED', message: 'Token has expired' }, 400);
    }
    throw err;
  }
});

authRoutes.route('/', protectedRoutes);

// ── Helpers ──
function expiresIn(str: string): number {
  const match = str.match(/^(\d+)([dhms])$/);
  if (!match) return Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // default 7d
  const num = parseInt(match[1]);
  const unit = match[2];
  const seconds: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return Math.floor(Date.now() / 1000) + num * (seconds[unit] || 86400);
}
