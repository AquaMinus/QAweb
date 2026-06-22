import type { WSMessage } from '../shared/types.js';

/**
 * Parse and validate an incoming WebSocket message.
 */
export function parseMessage(data: string): WSMessage | null {
  try {
    const msg = JSON.parse(data);
    if (!msg || typeof msg.type !== 'string') return null;
    return {
      type: msg.type,
      payload: msg.payload ?? {},
      ts: msg.ts ?? Date.now(),
      seq: msg.seq,
    };
  } catch {
    return null;
  }
}

/**
 * Create an outbound server message.
 */
export function createMessage(type: string, payload: unknown, seq?: number): WSMessage {
  return {
    type,
    payload,
    ts: Date.now(),
    seq,
  };
}

/**
 * Serialize a message for sending over WebSocket.
 */
export function stringify(msg: WSMessage): string {
  return JSON.stringify(msg);
}
