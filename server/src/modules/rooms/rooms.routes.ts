import { Hono } from 'hono';
import { authGuard } from '../auth/auth.guard.js';

export const roomRoutes = new Hono();
roomRoutes.use('*', authGuard);

// POST /api/rooms — create a new room
roomRoutes.post('/', (c) => {
  return c.json({ message: 'Not yet implemented' }, 501);
});

// GET /api/rooms/:pin — get room info (also for players to check before joining)
// Note: player check does NOT need auth
roomRoutes.get('/:pin', (c) => {
  return c.json({ message: 'Not yet implemented' }, 501);
});

// DELETE /api/rooms/:pin — dissolve room
roomRoutes.delete('/:pin', (c) => {
  return c.json({ message: 'Not yet implemented' }, 501);
});

// POST /api/rooms/:pin/lock — toggle room lock
roomRoutes.post('/:pin/lock', (c) => {
  return c.json({ message: 'Not yet implemented' }, 501);
});

// POST /api/rooms/:pin/kick/:sessionToken — kick player
roomRoutes.post('/:pin/kick/:sessionToken', (c) => {
  return c.json({ message: 'Not yet implemented' }, 501);
});
