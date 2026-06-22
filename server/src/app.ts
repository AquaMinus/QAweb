import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './modules/auth/auth.routes.js';
import { questionRoutes } from './modules/questions/questions.routes.js';
import { validateShareToken } from './modules/questions/share-tokens.js';
import { getSetById, getQuestions } from './modules/questions/questions.service.js';
import { exportJSON } from './modules/questions/import-export.js';

export function createApp() {
  const app = new Hono();

  // ── Global middleware ──
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }));

  // ── Health check ──
  app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

  // ── Public: Download via share token (no auth) ──
  app.get('/api/questions/shared/:token', (c) => {
    const token = c.req.param('token');
    const setId = validateShareToken(token);
    if (!setId) return c.json({ error: 'INVALID_TOKEN', message: '链接已过期或无效' }, 410);

    const set = getSetById(setId);
    if (!set) return c.json({ error: 'NOT_FOUND' }, 404);

    const qs = getQuestions(setId);
    const content = exportJSON(qs);
    return new Response(content, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(set.title)}.json"`,
      },
    });
  });

  // ── Route modules ──
  app.route('/api/auth', authRoutes);
  app.route('/api/questions', questionRoutes);

  // TODO: app.route('/api/rooms', roomRoutes);

  return app;
}
