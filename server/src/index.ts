import { serve } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { createApp } from './app.js';
import config from './config.js';
import { parseMessage, createMessage, stringify } from './ws/protocol.js';
import { startHeartbeat, pingAll, HEARTBEAT_INTERVAL_MS } from './ws/heartbeat.js';
import { handleMessage, handleDisconnect } from './modules/quiz/quiz.ws.js';
import { engine } from './modules/quiz/quiz.engine.js';
import { connectionManager } from './ws/connection-manager.js';
import { decode } from 'hono/jwt';

// Export the WebSocket type for use across modules
export type ServerWebSocket = WebSocket;

const app = createApp();

// Create HTTP server via @hono/node-server
const server = serve({ fetch: app.fetch, port: config.port });

// ── WebSocket server ──
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: ServerWebSocket, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pin = url.searchParams.get('pin') || '';
  const role = url.searchParams.get('role') || '';
  let sessionToken = url.searchParams.get('token') || '';
  let isHost = role === 'host';

  console.log(`[WS] New ${isHost ? 'host' : 'player'} connection — pin: ${pin}`);

  startHeartbeat(ws);

  // ── Host connection: bind to room's hostWs ──
  if (isHost) {
    const hostToken = url.searchParams.get('token') || '';

    // Decode JWT to get the host UUID
    let hostId = '';
    try {
      const decoded = decode(hostToken);
      hostId = (decoded.payload as any).sub || '';
    } catch {
      // If decode fails, fall back to using token as-is (for dev/testing)
      hostId = hostToken;
    }

    const room = engine.getRoom(pin);
    if (!room) {
      ws.send(stringify(createMessage('error', { code: 'ROOM_NOT_FOUND', message: '房间不存在' })));
      ws.close();
      return;
    }

    // Verify hostId matches room creator
    if (room.hostId !== hostId) {
      ws.send(stringify(createMessage('error', { code: 'FORBIDDEN', message: '你不是该房间的主持人' })));
      ws.close();
      return;
    }

    room.hostWs = ws;
    console.log(`[WS] Host ${hostId.slice(0, 8)} bound to room ${pin}`);

    // Build full state snapshot for reconnecting host
    const stateMsg: any = {
      pin,
      phase: room.phase,
      playerCount: room.players.size,
      playerNames: Array.from(room.players.values()).map(p => p.name),
      locked: room.locked,
      advanceMode: room.advanceMode,
    };

    // If question active — include question data
    if (room.phase === 'question') {
      const q = room.questions[room.currentQuestionIndex];
      if (q) stateMsg.question = {
        questionId: q.id, text: q.text, imageUrl: q.imageUrl,
        options: q.options.map(o => ({ id: o.id, text: o.text, color: o.color })),
        timeLimitSec: room.settings.timeLimitSec,
        questionNumber: room.currentQuestionIndex + 1, totalQuestions: room.questions.length,
      };
    }

    // If in result/leaderboard/podium — include result + rankings
    if (room.phase === 'question_result' || room.phase === 'leaderboard' || room.phase === 'podium') {
      const q = room.questions[room.currentQuestionIndex];
      if (q) {
        const correctOption = q.options.find(o => o.isCorrect);
        const dist: any = { red: 0, blue: 0, yellow: 0, green: 0, total: 0 };
        for (const [, p] of room.players) {
          const a = p.answers.get(q.id);
          if (a) {
            const opt = q.options.find(o => o.id === a.optionId);
            if (opt) { dist[opt.color]++; dist.total++; }
          }
        }
        stateMsg.result = { correctOptionId: correctOption?.id, correctColor: correctOption?.color, distribution: dist };
        stateMsg.questionNumber = room.currentQuestionIndex + 1;
        stateMsg.totalQuestions = room.questions.length;
        const sorted = Array.from(room.players.values()).sort((a, b) => b.totalScore - a.totalScore);
        stateMsg.rankings = sorted.map((p, i) => ({ rank: i + 1, name: p.name, score: p.totalScore }));
      }
    }

    if (room.phase === 'podium') {
      const sorted = Array.from(room.players.values()).sort((a, b) => b.totalScore - a.totalScore);
      stateMsg.podium = {
        first: sorted[0] ? { name: sorted[0].name, score: sorted[0].totalScore } : { name: '—', score: 0 },
        second: sorted[1] ? { name: sorted[1].name, score: sorted[1].totalScore } : { name: '—', score: 0 },
        third: sorted[2] ? { name: sorted[2].name, score: sorted[2].totalScore } : { name: '—', score: 0 },
      };
    }

    ws.send(stringify(createMessage('room:host_bound', stateMsg)));

    ws.on('close', () => {
      console.log(`[WS] Host disconnected from room ${pin}`);
      const r = engine.getRoom(pin);
      if (r) r.hostWs = null;
    });

    ws.on('message', (raw) => {
      const msg = parseMessage(raw.toString());
      if (!msg) return;
      handleMessage(ws, msg, pin, hostId);
    });

    ws.on('error', (err) => console.error(`[WS] Host error (${pin}):`, err.message));
    return;
  }

  // ── Player connection ──
  ws.on('message', (raw) => {
    const msg = parseMessage(raw.toString());
    if (!msg) {
      ws.send(stringify(createMessage('error', { code: 'INVALID_MESSAGE', message: 'Invalid message format' })));
      return;
    }

    // For player:join, the server generates a new session token.
    // We need to capture it so subsequent messages from this WS use it.
    if (msg.type === 'player:join') {
      handleMessage(ws, msg, pin, sessionToken);
      // The token is now stored on the ws object by quiz.ws (via connection manager)
      sessionToken = (ws as any)._qaSessionToken || sessionToken;
      return;
    }

    // For reconnect, extract token from payload
    if (msg.type === 'player:reconnect') {
      const p = msg.payload as any;
      if (p?.session_token) sessionToken = p.session_token;
    }

    // Use the updated session token from the ws object if available
    if (!sessionToken) sessionToken = (ws as any)._qaSessionToken || '';

    handleMessage(ws, msg, pin, sessionToken);
  });

  ws.on('close', () => {
    if (sessionToken) handleDisconnect(pin, sessionToken);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Player error (${pin}):`, err.message);
  });
});

// ── Heartbeat interval ──
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => pingAll(ws as ServerWebSocket));
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => {
  clearInterval(heartbeatTimer);
});

// ── Server started by serve() above ──
console.log(`[QAweb] Server running on http://localhost:${config.port}`);
console.log(`[QAweb] WebSocket path: ws://localhost:${config.port}/ws`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[QAweb] Shutting down...');
  wss.close();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  wss.close();
  server.close();
  process.exit(0);
});
