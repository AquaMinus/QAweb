import { browser } from '$app/environment';
import type { WSMessage } from './types';

type MessageHandler = (msg: WSMessage) => void;

interface WSState {
  ws: WebSocket | null;
  pin: string;
  sessionToken: string;
  handlers: Map<string, Set<MessageHandler>>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
  intentionalClose: boolean;
}

const state: WSState = {
  ws: null,
  pin: '',
  sessionToken: '',
  handlers: new Map(),
  reconnectTimer: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 20,
  reconnectDelayMs: 1000,
  intentionalClose: false,
};

/** Get or create a session token stored in sessionStorage. */
export function getSessionToken(): string {
  if (state.sessionToken) return state.sessionToken;
  if (browser) {
    let token = sessionStorage.getItem('qaweb_session');
    if (!token) {
      token = crypto.randomUUID();
      sessionStorage.setItem('qaweb_session', token);
    }
    state.sessionToken = token;
  }
  return state.sessionToken;
}

/** Connect to the WebSocket server for a given room. */
export function connect(pin: string): void {
  if (!browser) return;

  state.pin = pin;
  state.intentionalClose = false;
  const token = getSessionToken();

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}&pin=${encodeURIComponent(pin)}`;

  state.ws = new WebSocket(url);

  state.ws.onopen = () => {
    console.log('[WS] Connected');
    state.reconnectAttempts = 0;
    state.reconnectDelayMs = 1000;

    // If reconnect, send reconnect message instead of join
    if (state.reconnectAttempts === 0) {
      // First connection — the server already has our token/pin from URL params
      // The actual join message will be sent by the app logic
    }
  };

  state.ws.onmessage = (event) => {
    try {
      const msg: WSMessage = JSON.parse(event.data);
      dispatch(msg.type, msg);
    } catch (e) {
      console.error('[WS] Failed to parse message:', e);
    }
  };

  state.ws.onclose = (event) => {
    console.log(`[WS] Disconnected (code: ${event.code})`);
    state.ws = null;

    if (!state.intentionalClose) {
      scheduleReconnect();
    }
  };

  state.ws.onerror = (err) => {
    console.error('[WS] Error:', err);
  };
}

/** Disconnect intentionally (no reconnect). */
export function disconnect(): void {
  state.intentionalClose = true;
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
}

/** Send a message to the server. */
export function send(type: string, payload: unknown = {}): void {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    console.warn('[WS] Cannot send — not connected');
    return;
  }
  const msg: WSMessage = { type, payload, ts: Date.now() };
  state.ws.send(JSON.stringify(msg));
}

/** Register a handler for a specific message type. */
export function on(type: string, handler: MessageHandler): () => void {
  if (!state.handlers.has(type)) {
    state.handlers.set(type, new Set());
  }
  state.handlers.get(type)!.add(handler);

  // Return unsubscribe function
  return () => {
    state.handlers.get(type)?.delete(handler);
  };
}

/** Remove all handlers. */
export function offAll(): void {
  state.handlers.clear();
}

// ── Private helpers ──

function dispatch(type: string, msg: WSMessage): void {
  // Also dispatch to '*' catch-all handlers
  const handlers = [
    ...(state.handlers.get(type) ?? []),
    ...(state.handlers.get('*') ?? []),
  ];
  for (const handler of handlers) {
    try {
      handler(msg);
    } catch (e) {
      console.error(`[WS] Handler error for ${type}:`, e);
    }
  }
}

function scheduleReconnect(): void {
  if (state.reconnectAttempts >= state.maxReconnectAttempts) {
    console.log('[WS] Max reconnect attempts reached');
    dispatch('ws:reconnect_failed', { type: 'ws:reconnect_failed', payload: {}, ts: Date.now() });
    return;
  }

  const delay = Math.min(state.reconnectDelayMs * Math.pow(1.5, state.reconnectAttempts), 10000);
  state.reconnectAttempts++;

  console.log(`[WS] Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts}/${state.maxReconnectAttempts})`);

  state.reconnectTimer = setTimeout(() => {
    if (state.pin) {
      connect(state.pin);
      // After reconnection, send reconnect message
      const origOpen = state.ws?.onopen;
      if (state.ws) {
        const ws = state.ws;
        state.ws.onopen = (ev) => {
          send('player:reconnect', { pin: state.pin, session_token: getSessionToken() });
          if (origOpen) origOpen.call(ws, ev);
        };
      }
    }
  }, delay);
}
