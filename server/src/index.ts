import { serve } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { createApp } from './app.js';
import config from './config.js';
import { parseMessage } from './ws/protocol.js';
import { startHeartbeat, pingAll, HEARTBEAT_INTERVAL_MS } from './ws/heartbeat.js';

// Export the WebSocket type for use across modules
export type ServerWebSocket = WebSocket;

const app = createApp();

// Create HTTP server via @hono/node-server (properly adapts Node.js req/res to web-standard Request)
const server = serve({
  fetch: app.fetch,
  port: config.port,
});

// ── WebSocket server ──
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: ServerWebSocket, req) => {
  // Extract query params from the upgrade request
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const sessionToken = url.searchParams.get('token') || '';
  const pin = url.searchParams.get('pin') || '';

  console.log(`[WS] New connection — pin: ${pin}, token: ${sessionToken.slice(0, 8)}...`);

  startHeartbeat(ws);

  ws.on('message', (raw) => {
    const msg = parseMessage(raw.toString());
    if (!msg) {
      ws.send(JSON.stringify({ type: 'error', payload: { code: 'INVALID_MESSAGE', message: 'Invalid message format' }, ts: Date.now() }));
      return;
    }

    console.log(`[WS] Message: ${msg.type} from ${sessionToken.slice(0, 8)}... in room ${pin}`);

    // TODO: Route messages through quiz.ws.ts
    // For now, echo back for testing
    ws.send(JSON.stringify({
      type: 'server:echo',
      payload: { received: msg.type },
      ts: Date.now(),
    }));
  });

  ws.on('close', (code, reason) => {
    console.log(`[WS] Disconnected — pin: ${pin}, token: ${sessionToken.slice(0, 8)}..., code: ${code}`);
    // TODO: Handle disconnection in quiz engine
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${sessionToken.slice(0, 8)}...:`, err.message);
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
