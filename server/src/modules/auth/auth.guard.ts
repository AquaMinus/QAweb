import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import config from '../../config.js';
import type { HostInfo } from '../../shared/types.js';

// Extend Hono's context to include host info
declare module 'hono' {
  interface ContextVariableMap {
    host: HostInfo;
  }
}

/**
 * Hono middleware that validates the JWT from Authorization header.
 * Sets `c.var.host` on success, returns 401 on failure.
 */
export async function authGuard(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verify(token, config.jwtSecret, 'HS256');
    if (!payload || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      return c.json({ error: 'UNAUTHORIZED', message: 'Invalid token payload' }, 401);
    }

    c.set('host', {
      id: payload.sub,
      email: payload.email as string,
      displayName: (payload.displayName as string) || '',
    });

    await next();
  } catch {
    return c.json({ error: 'UNAUTHORIZED', message: 'Token is invalid or expired' }, 401);
  }
}
