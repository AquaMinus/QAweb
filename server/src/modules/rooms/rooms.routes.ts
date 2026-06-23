import { Hono } from 'hono';
import { authGuard } from '../auth/auth.guard.js';
import * as svc from './rooms.service.js';
import { engine } from '../quiz/quiz.engine.js';
import { getRoomHistory, getRoomDetail, exportRoomExcel } from './rooms.persistence.js';

export const roomRoutes = new Hono();
roomRoutes.use('*', authGuard);

// Create room
roomRoutes.post('/', async (c) => {
  const host = c.var.host;
  const { questionSetId, settings } = await c.req.json();
  if (!questionSetId) {
    return c.json({ error: 'VALIDATION', message: '请选择题库' }, 400);
  }

  try {
    const room = svc.createRoom(host.id, questionSetId, settings || {});
    return c.json({ room }, 201);
  } catch (err: any) {
    if (err.message === 'EMPTY_QUESTION_SET') {
      return c.json({ error: 'EMPTY', message: '题库为空，请先添加题目' }, 400);
    }
    throw err;
  }
});

// List host's active rooms
roomRoutes.get('/mine', (c) => {
  const host = c.var.host;
  const pins = engine.getHostRooms(host.id);
  const rooms = pins.map(p => engine.getRoom(p)).filter(Boolean).map(r => ({
    pin: r!.pin,
    phase: r!.phase,
    playerCount: r!.players.size,
    questionCount: r!.questions.length,
    locked: r!.locked,
    createdAt: r!.createdAt,
  }));
  return c.json({ rooms });
});

// ── History routes (must be before /:pin to avoid conflict) ──

// List game history
roomRoutes.get('/history', (c) => {
  const host = c.var.host;
  const rooms = getRoomHistory(host.id);
  return c.json({ rooms });
});

// Get single game detail
roomRoutes.get('/history/:gameRoomId', (c) => {
  const detail = getRoomDetail(c.req.param('gameRoomId'));
  if (!detail) return c.json({ error: 'NOT_FOUND', message: '记录不存在' }, 404);
  return c.json(detail);
});

// Export game to Excel
roomRoutes.get('/history/:gameRoomId/export', (c) => {
  const buf = exportRoomExcel(c.req.param('gameRoomId'));
  if (!buf) return c.json({ error: 'NOT_FOUND', message: '记录不存在' }, 404);
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="qaweb-history-${c.req.param('gameRoomId').slice(0, 8)}.xlsx"`,
    },
  });
});

// Get room info (also used by players to check before joining)
roomRoutes.get('/:pin', (c) => {
  const pin = c.req.param('pin');
  const room = engine.getRoom(pin);
  if (!room) {
    return c.json({ error: 'NOT_FOUND', message: '房间不存在或已关闭' }, 404);
  }

  const info = svc.getRoomInfo(pin);
  return c.json({ room: info });
});

// Check room status (public — for player join validation)
roomRoutes.get('/:pin/check', (c) => {
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

// Dissolve room
roomRoutes.delete('/:pin', (c) => {
  const host = c.var.host;
  const pin = c.req.param('pin');
  const ok = svc.dissolveRoom(pin, host.id);
  if (!ok) return c.json({ error: 'NOT_FOUND', message: '房间不存在' }, 404);
  return c.json({ success: true });
});

// Lock/unlock room
roomRoutes.post('/:pin/lock', async (c) => {
  const host = c.var.host;
  const pin = c.req.param('pin');
  const { locked } = await c.req.json();
  engine.lockRoom(pin, host.id, !!locked);
  return c.json({ success: true, locked: !!locked });
});

// Kick player
roomRoutes.post('/:pin/kick/:token', (c) => {
  const host = c.var.host;
  const { pin, token } = c.req.param();
  engine.kickPlayer(pin, host.id, token);
  return c.json({ success: true });
});
