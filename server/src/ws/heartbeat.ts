import type { ServerWebSocket } from '../index.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const PING_TIMEOUT_MS = 10_000;

interface HeartbeatState {
  isAlive: boolean;
  pingTimer?: ReturnType<typeof setTimeout>;
}

const states = new WeakMap<ServerWebSocket, HeartbeatState>();

/**
 * Start heartbeat monitoring for a WebSocket connection.
 * If no pong is received within PING_TIMEOUT_MS, the connection is terminated.
 */
export function startHeartbeat(ws: ServerWebSocket): void {
  const state: HeartbeatState = { isAlive: true };
  states.set(ws, state);

  ws.on('pong', () => {
    state.isAlive = true;
  });
}

/**
 * The interval function that pings all tracked connections.
 * Call this on a setInterval.
 */
export function pingAll(ws: ServerWebSocket): void {
  const state = states.get(ws);
  if (!state) return;

  if (!state.isAlive) {
    ws.terminate();
    states.delete(ws);
    return;
  }

  state.isAlive = false;
  ws.ping();
}

export { HEARTBEAT_INTERVAL_MS };
