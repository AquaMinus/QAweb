import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './modules/auth/auth.routes.js';
import { questionRoutes } from './modules/questions/questions.routes.js';
import { roomRoutes } from './modules/rooms/rooms.routes.js';
import { validateShareToken } from './modules/questions/share-tokens.js';
import { getSetById, getQuestions } from './modules/questions/questions.service.js';
import { exportJSON } from './modules/questions/import-export.js';
import { engine } from './modules/quiz/quiz.engine.js';
import { existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function createApp() {
  const app = new Hono();

  // ── Global middleware ──
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }));

  // Ensure UTF-8 charset on all JSON responses
  app.use('*', async (c, next) => {
    await next();
    const ct = c.res.headers.get('Content-Type');
    if (ct && ct.includes('application/json') && !ct.includes('charset')) {
      c.res.headers.set('Content-Type', 'application/json; charset=utf-8');
    }
  });

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

  // ── Public: Room check (players check room before joining, no auth needed) ──
  app.get('/api/rooms/:pin/check', (c) => {
    const pin = c.req.param('pin');
    const room = engine.getRoom(pin);
    if (!room) return c.json({ valid: false, reason: '房间不存在' });
    if (room.phase !== 'lobby') return c.json({ valid: false, reason: '游戏已开始' });
    if (room.locked) return c.json({ valid: false, reason: '房间已锁定' });
    return c.json({
      valid: true,
      playerCount: room.players.size,
      settings: {
        timeLimitSec: room.settings.timeLimitSec,
        scoringMode: room.settings.scoringMode,
      },
    });
  });

  // ── Route modules ──
  app.route('/api/auth', authRoutes);
  app.route('/api/questions', questionRoutes);
  app.route('/api/rooms', roomRoutes);

  // ── Static file serving (for production: frontend build copied to public/) ──
  const publicDir = join(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    const MIME: Record<string, string> = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
      '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    };
    // SPA fallback: all non-API routes serve index.html
    app.get('*', (c) => {
      const url = new URL(c.req.url);
      // Don't interfere with API or WS routes
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
        return c.notFound();
      }
      let filePath = join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      if (!existsSync(filePath) || !filePath.startsWith(publicDir)) {
        filePath = join(publicDir, 'index.html');
      }
      const ext = extname(filePath);
      return new Response(readFileSync(filePath), {
        headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' },
      });
    });
  }

  return app;
}

export { createApp };
